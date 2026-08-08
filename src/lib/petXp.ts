/**
 * Logique métier de l'Optimisation Familier (XP jusqu'au niveau 100).
 *
 * Les ressources du fichier Ressources_XP_familier_lvl100.xlsx donnent le
 * nombre d'XP accordé par objet consommé au familier.
 */

/** Ressource du fichier exporté (une ligne de petXpResources.json). */
export interface PetXpResource {
  name: string;
  xp: number;
}

/**
 * Table de conversion Niveau → XP cumulée, indexée par niveau (PET_XP_LEVELS[0]
 * est inutilisé). Respecte la courbe réelle des familiers Dofus : il faut 0 XP
 * au niveau 1 et {MAX_XP} XP au niveau 100, avec une croissance exponentielle
 * ~11 % par niveau (source communautaire dofusgadgets / dofustool).
 */
export const MAX_PET_LEVEL = 100;
export const PET_XP_LEVELS = [
  0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 10,
  12, 14, 16, 18, 21, 24, 27, 31, 35, 40,
  45, 51, 57, 64, 72, 81, 91, 102, 114, 127,
  141, 157, 175, 195, 217, 241, 268, 298, 331, 368,
  409, 455, 506, 562, 624, 693, 770, 855, 950, 1055,
  1171, 1300, 1443, 1602, 1779, 1975, 2193, 2435, 2703, 3001,
  3332, 3699, 4106, 4558, 5060, 5617, 6236, 6923, 7685, 8531,
  9470, 10512, 11669, 12953, 14378, 15960, 17716, 19665, 21829, 24231,
  26897, 29856, 33141, 36787, 40834, 45326, 50313, 55848, 61992, 68812,
  76382, 84785, 94112, 104465, 115957, 128713, 142872, 158589, 176035, 195400,
] as const;

/** XP totale Level 100 d'un familier (valeur cible par défaut). */
export const DEFAULT_MAX_XP = 195400;

/**
 * XP cumulée nécessaire pour être au niveau donné (1..100), ou 0 hors bornes.
 * Le niveau 100 vaut DEFAULT_MAX_XP.
 */
export function xpForLevel(level: number): number {
  const lvl = Math.floor(level);
  if (!Number.isFinite(lvl) || lvl < 1 || lvl > PET_XP_LEVELS.length - 1) return 0;
  return PET_XP_LEVELS[lvl];
}

/** Ligne calculée : croise XP ressource + prix HDV + coût. */
export interface PetXpRow {
  name: string;
  /** ID DofusDB (item_key) du prix correspondant, s'il a pu être résolu. */
  itemId: string | null;
  xp: number;
  /** Prix unitaire HDV (0 si non renseigné / non résolu). */
  unitPrice: number;
  /** Ratio Kamas par point d'XP (0 si pas de prix). */
  ratio: number;
  /** Quantité nécessaire pour XPs restantes (null si pas de prix). */
  quantityNeeded: number | null;
  /** Coût total en Kamas (null si pas de prix). */
  totalCost: number | null;
  hasPrice: boolean;
}

export interface PetXpSummary {
  /** Ressource la plus rentable (meilleur ratio parmi celles avec prix). */
  bestResource: PetXpRow | null;
  /** Quantité totale (autre) nécessaire pour finir au niveau 100. */
  quantity: number | null;
  /** Coût global en Kamas pour finir au niveau 100. */
  totalCost: number | null;
  pricedCount: number;
  totalCount: number;
}

export interface PetXpNameIndexItem {
  /** Identifiant (item_key DofusDB) de l'item dont le nom sert de clé. */
  id: string;
  /** Nom affichable pour l'item (utilisé pour la normalisation et la clé). */
  name: string;
}

/** Normalise un nom (minuscules, sans accents) pour comparaison fiable. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Construit un index nom → id depuis les items connus (customItems + mock).
 * On garde la première occurrence par nom normalisé.
 */
export function buildNameIndex(items: PetXpNameIndexItem[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const it of items) {
    if (!it.name) continue;
    const key = normalizeName(it.name);
    if (!index.has(key)) index.set(key, it.id);
  }
  return index;
}

/**
 * Résout l'ID DofusDB d'un nom de ressource via l'index construit plus haut.
 */
export function resolveItemId(name: string, index: Map<string, string>): string | null {
  return index.get(normalizeName(name)) ?? null;
}

/** Quantité nécessaire pour couvrir `remaining` XP avec l'XP offerte `r.xp`. */
function quantityToFeed(remainingXp: number, xpPerUnit: number): number | null {
  if (!Number.isFinite(xpPerUnit) || xpPerUnit <= 0) return null;
  if (remainingXp <= 0) return 0;
  return Math.ceil(remainingXp / xpPerUnit);
}

/**
 * Calcule la liste de rentabilité pour chaque ressource d'XP.
 * @param priceByKey map nomNormalisé → { itemId, unitPrice } (prix > 0)
 */
export function computeRows(
  resources: PetXpResource[],
  priceByKey: Map<string, { itemId: string; unitPrice: number }>,
  currentXp: number,
  targetXp: number,
): PetXpRow[] {
  const remaining = Math.max(0, targetXp - currentXp);
  return resources.map(r => {
    const key = normalizeName(r.name);
    const matched = priceByKey.get(key);
    const hasPrice = matched !== undefined;
    const unitPrice = matched?.unitPrice ?? 0;
    const itemId = matched?.itemId ?? null;
    const ratio = hasPrice ? unitPrice / r.xp : 0;
    const qty = quantityToFeed(remaining, r.xp);
    const totalCost = hasPrice && qty !== null ? qty * unitPrice : null;
    return { name: r.name, itemId, xp: r.xp, unitPrice, ratio, quantityNeeded: qty, totalCost, hasPrice };
  });
}

/** Résume le calcul : meilleure ressource + coût total minimal (le plus rentable). */
export function summarize(petXpRows: PetXpRow[]): PetXpSummary {
  const priced = petXpRows.filter(r => r.hasPrice && r.totalCost !== null);
  const pricedCount = priced.length;
  let bestResource: PetXpRow | null = null;
  let quantity: number | null = null;
  let totalCost: number | null = null;
  if (priced.length > 0) {
    bestResource = priced.reduce((acc, row) => (row.ratio < acc.ratio ? row : acc), priced[0]);
    quantity = bestResource.quantityNeeded;
    totalCost = bestResource.totalCost;
    if (totalCost === null) { quantity = null; }
  }
  return { bestResource, quantity, totalCost, pricedCount, totalCount: petXpRows.length };
}