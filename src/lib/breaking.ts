import { DOFUS_RUNES } from '../data/mockData';
import type { Rune } from '../data/mockData';

/** Métiers d'équipement (seuls éligibles au brisage) */
export const BREAKING_JOBS = ['Bijoutier', 'Cordonnier', 'Façonneur', 'Forgeron', 'Sculpteur', 'Tailleur'];

export const DOFUSDB_BASE_URL = 'https://api.dofusdb.fr';
export const FETCH_TIMEOUT = 5000;

/** Copie locale de STAT_CONFIG (évite la dépendance cyclique) */
const STAT_CONFIG_LOCAL: Record<number, { name: string; weight: number; unit: string }> = {
  110: { name: 'Soin', weight: 5, unit: '' },
  111: { name: 'PA', weight: 100, unit: '' },
  112: { name: 'Dommages', weight: 5, unit: '' },
  113: { name: 'Portée', weight: 51, unit: '' },
  114: { name: 'Invocations', weight: 30, unit: '' },
  115: { name: 'Critique', weight: 10, unit: '' },
  118: { name: 'Force', weight: 1, unit: '' },
  119: { name: 'Agilité', weight: 1, unit: '' },
  123: { name: 'Chance', weight: 1, unit: '' },
  124: { name: 'Sagesse', weight: 3, unit: '' },
  125: { name: 'Vitalité', weight: 0.25, unit: '' },
  126: { name: 'Intelligence', weight: 1, unit: '' },
  127: { name: 'PM', weight: 90, unit: '' },
  128: { name: 'PM', weight: 90, unit: '' },
  138: { name: 'Puissance', weight: 5, unit: '' },
  160: { name: 'Esquive PA', weight: 4, unit: '' },
  161: { name: 'Esquive PM', weight: 4, unit: '' },
  168: { name: 'Pods', weight: 0.25, unit: '' },
  169: { name: 'Initiative', weight: 0.1, unit: '' },
  174: { name: 'Initiative', weight: 0.1, unit: '' },
  175: { name: 'Initiative', weight: 0.1, unit: '' },
  176: { name: 'Prospection', weight: 3, unit: '' },
  177: { name: 'Prospection', weight: 3, unit: '' },
  178: { name: 'Soins', weight: 5, unit: '' },
  179: { name: 'Soins', weight: 5, unit: '' },
  186: { name: 'Puissance', weight: 5, unit: '' },
  200: { name: 'Résistance Neutre', weight: 6, unit: '%' },
  201: { name: 'Résistance Terre', weight: 6, unit: '%' },
  202: { name: 'Résistance Feu', weight: 6, unit: '%' },
  203: { name: 'Résistance Eau', weight: 6, unit: '%' },
  204: { name: 'Résistance Air', weight: 6, unit: '%' },
  205: { name: 'Résistance Neutre (fixe)', weight: 2, unit: '' },
  206: { name: 'Résistance Terre (fixe)', weight: 2, unit: '' },
  207: { name: 'Résistance Feu (fixe)', weight: 2, unit: '' },
  208: { name: 'Résistance Eau (fixe)', weight: 2, unit: '' },
  209: { name: 'Résistance Air (fixe)', weight: 2, unit: '' },
  752: { name: 'Fuite', weight: 4, unit: '' },
  753: { name: 'Tacle', weight: 4, unit: '' },
  754: { name: 'Fuite', weight: 4, unit: '' },
  755: { name: 'Tacle', weight: 4, unit: '' },
};

export interface DofusDbEffect {
  effectId: number;
  diceNum: number;
  diceSide: number;
}

export interface DofusDbItemFull {
  id: number;
  name: { fr: string };
  type?: { name: { fr: string } };
  level: number;
  img: string;
  possibleEffects: DofusDbEffect[];
}

export function getEffectConfig(effectId: number): { name: string; weight: number; unit: string } {
  return STAT_CONFIG_LOCAL[effectId] ?? { name: `Effet #${effectId}`, weight: 1, unit: '' };
}

/** Construit une map : nom de stat → runes triées par valeur croissante */
function buildStatRuneMap(): Map<string, Rune[]> {
  const map = new Map<string, Rune[]>();
  for (const rune of DOFUS_RUNES) {
    const match = rune.statEffect.match(/^([+-]\d+(?:\.\d+)?%?)\s(.+)$/);
    if (!match) continue;
    const statName = match[2].trim();
    if (!map.has(statName)) map.set(statName, []);
    map.get(statName)!.push(rune);
  }
  for (const [, runes] of map) runes.sort((a, b) => a.weight - b.weight);
  return map;
}

const STAT_RUNE_MAP = buildStatRuneMap();

export interface BreakingRuneResult {
  rune: Rune;
  quantity: number;
  value: number;
}

export interface BreakingResult {
  itemLevel: number;
  itemName: string;
  itemImg: string;
  runes: BreakingRuneResult[];
  totalValue: number;
  craftCost: number;
  netProfit: number;
  roi: number;
}

/**
 * Calcule le poids de brisage et la quantité de runes pour une ligne de stat.
 */
export function calculateBreakingPdb(
  jet: number,
  runeWeight: number,
  itemLevel: number,
): number {
  return (3 * jet * runeWeight * itemLevel) / 200 + 1;
}

/**
 * Quantité de runes produites pour une ligne de stat.
 */
export function calculateBreakingQuantity(
  pdb: number,
  runeWeight: number,
  coefficient: number,
): number {
  return (pdb / runeWeight) * (coefficient / 100);
}

/**
 * Trouve la rune qui correspond le mieux à une ligne de stat.
 * Ex: stat +10 Force → Ra Fo (weight 10, statEffect "+10 Force").
 */
export function findMatchingRune(statName: string, statValue: number, unit: string): Rune | null {
  // Pour les résistances avec %, le nom dans DOFUS_RUNES n'inclut pas le symbole
  const cleanName = statName.replace(/\s*%\s*$/, '').trim();
  const runes = STAT_RUNE_MAP.get(cleanName);
  if (!runes || runes.length === 0) return null;
  const matchExact = runes.find(r => {
    const v = parseEffectValue(r.statEffect);
    return v !== null && Math.abs(v - statValue) < 0.01;
  });
  if (matchExact) return matchExact;
  const matchByWeight = runes.reduce((best, r) =>
    Math.abs(r.weight - statValue) < Math.abs(best.weight - statValue) ? r : best,
  );
  return matchByWeight;
}

function parseEffectValue(statEffect: string): number | null {
  const match = statEffect.match(/^([+-]?\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Calcule le résultat complet du brisage d'un item.
 */
export function calculateBreaking(
  possibleEffects: DofusDbEffect[],
  itemLevel: number,
  coefficient: number,
  rollMode: 'min' | 'avg' | 'max',
  runePrices: Record<string, number>,
  craftCost: number,
  itemName: string,
  itemImg: string,
): BreakingResult {
  const runes: BreakingRuneResult[] = [];

  for (const effect of possibleEffects) {
    const cfg = getEffectConfig(effect.effectId);
    let jet: number;
    if (rollMode === 'min') {
      jet = Math.min(effect.diceNum, effect.diceSide !== 0 ? effect.diceSide : effect.diceNum);
    } else if (rollMode === 'max') {
      jet = Math.max(effect.diceNum, effect.diceSide !== 0 ? effect.diceSide : effect.diceNum);
    } else {
      jet = (effect.diceNum + (effect.diceSide !== 0 ? effect.diceSide : effect.diceNum)) / 2;
    }

    if (jet <= 0) continue;

    const statName = cfg.name;
    const matched = findMatchingRune(statName, cfg.unit === '%' ? Math.round(jet) : jet, cfg.unit);

    if (!matched) continue;

    const runeWeight = matched.weight;
    const pdb = calculateBreakingPdb(jet, runeWeight, itemLevel);
    const quantity = calculateBreakingQuantity(pdb, runeWeight, coefficient);
    if (quantity <= 0) continue;

    const price = runePrices[matched.code] ?? 0;
    runes.push({
      rune: matched,
      quantity,
      value: quantity * price,
    });
  }

  const totalValue = runes.reduce((s, r) => s + r.value, 0);
  const netProfit = totalValue - craftCost;
  const roi = craftCost > 0 ? (netProfit / craftCost) * 100 : 0;

  return { itemLevel, itemName, itemImg, runes, totalValue, craftCost, netProfit, roi };
}
