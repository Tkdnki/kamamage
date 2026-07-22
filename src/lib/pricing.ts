import type { PriceData } from '../context/DofusContext';

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
