import type { PriceData, HdvPrices } from '../context/DofusContext';

/** Seuil de fraîcheur d'un prix HDV : au-delà de 10 jours, il est obsolète. */
export const STALE_PRICE_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * Un prix est obsolète si sa dernière mise à jour date de plus de
 * `daysThreshold` jours (ou si la date est absente/invalide).
 */
export function isPriceOutdated(updatedAt?: string | null, daysThreshold = 10): boolean {
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return true;
  const ageMs = Date.now() - t;
  return ageMs > daysThreshold * 24 * 60 * 60 * 1000;
}

/**
 * Un item/rune nécessite un scan HDV si son prix est nul/manquant
 * OU si sa dernière mise à jour date de plus de `daysThreshold` jours.
 */
export function needsPriceScan(price: number | undefined, updatedAt?: string | null, daysThreshold = 10): boolean {
  if (!price || price <= 0) return true;
  return isPriceOutdated(updatedAt, daysThreshold);
}

/**
 * Résout de façon robuste l'enregistrement de prix HDV d'un item équipement.
 * Une même fiche peut être retrouvée via plusieurs clés (DofusDB utilise un id
 * numérique converti en string) : `expectedId`, `_id`, `id` puis le nom en
 * dernier recours. Partout où on lit un prix d'équipement, on passe par ce
 * résolveur pour garantir que la carte, le badge "à librariser" et le scanner
 * HDV lisent STRICTEMENT la même valeur (pas de décompte à 578 fantôme).
 */
export type HdvPriceLookupItem = {
  expectedId?: string;
  _id?: string;
  id?: string;
  name?: string;
  expectedName?: string;
};

export function getPriceRecord(
  item: string | HdvPriceLookupItem | null | undefined,
  hdvPrices: HdvPrices,
): PriceData | undefined {
  if (!item || !hdvPrices) return undefined;
  if (typeof item === 'string') return hdvPrices[item];
  const keys = [
    item.expectedId,
    item._id,
    item.id,
    item.expectedName,
    item.name,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
  for (const key of keys) {
    const p = hdvPrices[key];
    if (p) return p;
  }
  return undefined;
}

/**
 * Un prix est "à actualiser" (obsolète ou manquant) s'il est absent, sans lot
 * renseigné, sans date de mise à jour, ou plus vieux que STALE_PRICE_MS.
 */
export function isPriceStaleOrMissing(itemId: string, hdvPrices: HdvPrices): boolean {
  const p = hdvPrices[itemId];
  if (!p) return true;
  const hasAnyPrice = p.x1 > 0 || p.x10 > 0 || p.x100 > 0 || p.x1000 > 0 || (p.unitAverage ?? 0) > 0;
  if (!hasAnyPrice) return true;
  return isPriceOutdated(p.updatedAt, 10);
}

interface LotOption {
  size: number;
  totalPrice: number;
  unitPrice: number;
}

function buildLots(p: PriceData): LotOption[] {
  const lots: LotOption[] = [];
  if (p.x1 > 0) lots.push({ size: 1, totalPrice: p.x1, unitPrice: p.x1 });
  if (p.x10 > 0) lots.push({ size: 10, totalPrice: p.x10, unitPrice: p.x10 / 10 });
  if (p.x100 > 0) lots.push({ size: 100, totalPrice: p.x100, unitPrice: p.x100 / 100 });
  if (p.x1000 > 0) lots.push({ size: 1000, totalPrice: p.x1000, unitPrice: p.x1000 / 1000 });
  return lots;
}

/**
 * Calcule le coût optimal pour acheter `quantity` unités d'un ingrédient
 * en combinant intelligemment les lots disponibles (x1, x10, x100, x1000).
 *
 * Stratégie : on achète d'abord le plus de lots possible au meilleur prix
 * unitaire, puis on descend vers les lots plus petits pour le reste.
 * Si le lot le moins cher est plus grand que la quantité restante,
 * on compare l'achat d'un lot entier vs l'achat à l'unité et on prend le
 * meilleur des deux.
 */
export function getOptimalCost(p: PriceData | undefined, quantity: number): number | null {
  if (!p) return null;

  const lots = buildLots(p);
  if (lots.length === 0) return null;

  // Trier du meilleur prix unitaire au plus cher
  lots.sort((a, b) => a.unitPrice - b.unitPrice);

  let remaining = quantity;
  let total = 0;
  let i = 0;

  while (remaining > 0 && i < lots.length) {
    const lot = lots[i];
    const nextLot: LotOption | undefined = lots[i + 1];

    if (lot.size <= remaining) {
      // Acheter des lots entiers tant qu'ils tiennent
      const count = Math.floor(remaining / lot.size);
      total += count * lot.totalPrice;
      remaining -= count * lot.size;
    } else {
      // Le lot est plus grand que le reste.
      // Comparer : 1 lot entier vs prix à l'unité × reste
      const buyWholeLot = lot.totalPrice;
      const buyFragments = lot.unitPrice * remaining;

      // Si le lot suivant existe, comparer aussi avec son prix unitaire
      const bestFragmentPrice = nextLot
        ? Math.min(lot.unitPrice, nextLot.unitPrice)
        : lot.unitPrice;
      const buyFragmentsFromNext = nextLot
        ? nextLot.unitPrice * remaining
        : Infinity;

      const bestExact = Math.min(buyFragments, buyFragmentsFromNext);

      if (buyWholeLot <= bestExact) {
        total += buyWholeLot;
        remaining = 0;
      } else {
        total += bestExact;
        remaining = 0;
      }
    }
    i++;
  }

  // Fallback : prix à l'unité du lot le moins cher
  if (remaining > 0) {
    total += lots[0].unitPrice * remaining;
  }

  return total;
}
