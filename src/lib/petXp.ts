/**
 * Logique métier de l'Optimisation Familier (XP jusqu'au niveau 100).
 *
 * Les ressources du fichier Ressources_XP_familier_lvl100.xlsx donnent le
 * nombre d'XP accordé par objet consommé au familier.
 */

import { getOptimalCost } from './pricing';
import { decodeHtmlEntities } from './stringUtils';
import type { PriceData } from '../context/DofusContext';

/** Ressource du fichier exporté (une ligne de petXpResources.json). */
export interface PetXpResource {
  name: string;
  xp: number;
}

/**
 * Table de conversion Niveau → XP cumulée, indexée par niveau (PET_XP_LEVELS[0]
 * = niveau 0). Respecte la courbe réelle des familiers Dofus : il faut 0 XP
 * au niveau 0 et au niveau 1, puis {MAX_XP} XP au niveau 100, avec une
 * croissance exponentielle ~11 % par niveau (source communautaire
 * dofusgadgets / dofustool).
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
 * XP cumulée nécessaire pour être au niveau donné (0..100), ou 0 hors bornes.
 * Le niveau 100 vaut DEFAULT_MAX_XP. Un familier fraîchement obtenu est au
 * niveau 0 avec 0 XP cumulé ; de Niv.0 à Niv.100 il faut donc tout {DEFAULT_MAX_XP}.
 */
export function xpForLevel(level: number): number {
  const lvl = Math.floor(level);
  if (!Number.isFinite(lvl) || lvl < 0 || lvl > PET_XP_LEVELS.length - 1) return 0;
  return PET_XP_LEVELS[lvl];
}

/** Prix d'un même objet selon 4 lots HDV : x1, x10, x100, x1000. */
export interface PetLots {
  x1: number;
  x10: number;
  x100: number;
  x1000: number;
}

/** Lots vides (aucun lot renseigné). */
export const EMPTY_LOTS: PetLots = { x1: 0, x10: 0, x100: 0, x1000: 0 };

/** Ligne calculée : croise XP ressource + prix HDV + coût. */
export interface PetXpRow {
  name: string;
  /** ID DofusDB (item_key) du prix correspondant, s'il a pu être résolu. */
  itemId: string | null;
  xp: number;
  /** Prix par lot : 4 cases éditables (source du ratio/coût). */
  lots: PetLots;
  /** Prix unitaire le plus économique disponible (min x1, x10/10, x100/100, x1000/1000). 0 si aucun lot. */
  unitPrice: number;
  /** Ratio Kamas par point d'XP (0 si pas de prix ou XP nulle). */
  ratio: number;
  /** Quantité nécessaire pour XPs restantes. */
  quantityNeeded: number | null;
  /** Coût total en Kamas, en décomposant l'achat en lots optimaux (null si aucun lot). */
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

/** Normalise un nom (minuscules, sans accents, entités HTML décodées) pour
 *  comparaison fiable : "DofusDB d&apos;amarrage" == "d'amarrage". */
export function normalizeName(name: string): string {
  return decodeHtmlEntities(name.trim()).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

/** Lots présentant au moins un lot > 0. */
export function hasAnyLot(lots: PetLots | null | undefined): boolean {
  return !!lots && (lots.x1 > 0 || lots.x10 > 0 || lots.x100 > 0 || lots.x1000 > 0);
}

/**
 * Prix unitaire le plus économique parmi les lots disponibles.
 * Retient le plus bas de chaque lot possible (x1, x10/10, x100/100, x1000/1000).
 * Retourne 0 si aucun lot > 0.
 */
export function bestUnitPrice(lots: PetLots | null | undefined): number {
  if (!hasAnyLot(lots)) return 0;
  const cand: number[] = [];
  const l = lots!;
  if (l.x1 > 0) cand.push(l.x1);
  if (l.x10 > 0) cand.push(l.x10 / 10);
  if (l.x100 > 0) cand.push(l.x100 / 100);
  if (l.x1000 > 0) cand.push(l.x1000 / 1000);
  return Math.min(...cand);
}

/**
 * Coût d'achat de `quantity` unités en décomposant au plus en paquets de
 * 1000, 100, 10 puis 1 (réutilise la règle partagée de l'app, `getOptimalCost`,
 * qui compare aussi l'achat d'un lot entier vs l'unité pour le reliquat).
 */
export function decomposeCost(lots: PetLots | null | undefined, quantity: number | null): number | null {
  if (!hasAnyLot(lots) || quantity === null || quantity < 0) return null;
  if (quantity === 0) return 0;
  const priceData: PriceData = {
    x1: lots!.x1,
    x10: lots!.x10,
    x100: lots!.x100,
    x1000: lots!.x1000,
    unitAverage: bestUnitPrice(lots),
  };
  return getOptimalCost(priceData, quantity);
}

/**
 * Calcule la liste de rentabilité pour chaque ressource d'XP.
 * @param priceByKey map nomNormalisé → { itemId, lots } (au moins un lot > 0)
 */
export function computeRows(
  resources: PetXpResource[],
  priceByKey: Map<string, { itemId: string | null; lots: PetLots }>,
  currentXp: number,
  targetXp: number,
): PetXpRow[] {
  const remaining = Math.max(0, targetXp - currentXp);
  return resources.map(r => {
    const key = normalizeName(r.name);
    const matched = priceByKey.get(key);
    const lots = matched?.lots ?? EMPTY_LOTS;
    const hasPrice = hasAnyLot(lots);
    const unitPrice = bestUnitPrice(lots);
    const itemId = matched?.itemId ?? null;
    const ratio = hasPrice && r.xp > 0 ? unitPrice / r.xp : 0;
    const qty = quantityToFeed(remaining, r.xp);
    const totalCost = hasPrice && qty !== null ? decomposeCost(lots, qty) : null;
    return { name: r.name, itemId, xp: r.xp, lots, unitPrice, ratio, quantityNeeded: qty, totalCost, hasPrice };
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