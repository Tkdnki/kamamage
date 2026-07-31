import { DOFUS_RUNES } from '../data/mockData';
import type { Rune } from '../data/mockData';

export const BREAKING_JOBS = ['Bijoutier', 'Cordonnier', 'Façonneur', 'Forgeron', 'Sculpteur', 'Tailleur'];
export const DOFUSDB_BASE_URL = 'https://api.dofusdb.fr';
export const FETCH_TIMEOUT = 5000;
export const FOCUS_MULTIPLIER = 2;
export const FOCUS_PENALTY = 0.5;

/** Traduction des noms de stats (config → rune) */
const STAT_NAME_TO_RUNE_NAME: Record<string, string> = {
  'Critique': 'Coup Critique',
  'Esquive PM': 'Résistance PM',
};

/** Normalise les écarts (singulier/pluriel, suffixe fixe) entre config et runes */
function normalizeStatName(name: string): string {
  let n = name.replace(/\s*\(fixe\)\s*$/, '').trim();
  n = n.replace(/\s*%\s*$/, '').trim();
  // Inverse les singular/plural connus
  const canonical: Record<string, string> = {
    'Dommage': 'Dommages',
    'Invocations': 'Invocation',
    'Soins': 'Soin',
  };
  return canonical[n] ?? n;
}

const STAT_CONFIG_LOCAL: Record<number, { name: string; weight: number; unit: string }> = {
  // -- Caractéristiques principales --
  118: { name: 'Force', weight: 1, unit: '' },
  119: { name: 'Agilité', weight: 1, unit: '' },
  123: { name: 'Chance', weight: 1, unit: '' },
  124: { name: 'Sagesse', weight: 3, unit: '' },
  125: { name: 'Vitalité', weight: 0.2, unit: '' },
  126: { name: 'Intelligence', weight: 1, unit: '' },
  // -- PA / PM / PO / Invoc --
  111: { name: 'PA', weight: 100, unit: '' },
  127: { name: 'PM', weight: 90, unit: '' },
  128: { name: 'PM', weight: 90, unit: '' },
  182: { name: 'Invocations', weight: 30, unit: '' },
  // -- Combat --
  115: { name: 'Critique', weight: 10, unit: '' },
  116: { name: 'Portée', weight: 51, unit: '' },
  117: { name: 'Portée', weight: 51, unit: '' },
  138: { name: 'Puissance', weight: 5, unit: '' },
  186: { name: 'Puissance', weight: 5, unit: '' },
  // -- Esquives / Tacle / Fuite --
  160: { name: 'Esquive PA', weight: 4, unit: '' },
  161: { name: 'Esquive PM', weight: 4, unit: '' },
  752: { name: 'Fuite', weight: 4, unit: '' },
  753: { name: 'Tacle', weight: 4, unit: '' },
  754: { name: 'Fuite', weight: 4, unit: '' },
  755: { name: 'Tacle', weight: 4, unit: '' },
  // -- Prospection / Initiative / Pods --
  176: { name: 'Prospection', weight: 3, unit: '' },
  177: { name: 'Prospection', weight: 3, unit: '' },
  158: { name: 'Pods', weight: 0.25, unit: '' },
  168: { name: 'PA', weight: 100, unit: '' },
  169: { name: 'PM', weight: 90, unit: '' },
  174: { name: 'Initiative', weight: 0.1, unit: '' },
  175: { name: 'Initiative', weight: 0.1, unit: '' },
  // -- Soins --
  110: { name: 'Soin', weight: 5, unit: '' },
  178: { name: 'Soins', weight: 5, unit: '' },
  179: { name: 'Soins', weight: 5, unit: '' },
  // -- Retrait --
  410: { name: 'Retrait PA', weight: 7, unit: '' },
  412: { name: 'Retrait PM', weight: 7, unit: '' },
  // -- Dommage Poussée --
  414: { name: 'Dommage Poussée', weight: 5, unit: '' },
  // -- Dommages génériques --
  112: { name: 'Dommages', weight: 5, unit: '' },
  // -- Dommage Critique --
  418: { name: 'Dommage Critique', weight: 5, unit: '' },
  // -- Dommages élémentaires --
  422: { name: 'Dommages Terre', weight: 5, unit: '' },
  424: { name: 'Dommages Feu', weight: 5, unit: '' },
  426: { name: 'Dommages Eau', weight: 5, unit: '' },
  428: { name: 'Dommages Air', weight: 5, unit: '' },
  430: { name: 'Dommages Neutre', weight: 5, unit: '' },
  // -- Dommage Pièges --
  225: { name: 'Dommage Pièges', weight: 5, unit: '' },
  // -- Dommages Renvoyés --
  220: { name: 'Dommages Renvoyés', weight: 5, unit: '' },
  // -- Puissance Pièges --
  226: { name: 'Puissance Pièges', weight: 2, unit: '' },
  // -- Arme de chasse --
  795: { name: 'Chasse', weight: 5, unit: '' },
  // -- Résistances % --
  210: { name: 'Résistance Terre', weight: 6, unit: '%' },
  211: { name: 'Résistance Eau', weight: 6, unit: '%' },
  212: { name: 'Résistance Air', weight: 6, unit: '%' },
  213: { name: 'Résistance Feu', weight: 6, unit: '%' },
  214: { name: 'Résistance Neutre', weight: 6, unit: '%' },
  // -- Résistances fixes --
  240: { name: 'Résistance Terre (fixe)', weight: 2, unit: '' },
  241: { name: 'Résistance Eau (fixe)', weight: 2, unit: '' },
  242: { name: 'Résistance Air (fixe)', weight: 2, unit: '' },
  243: { name: 'Résistance Feu (fixe)', weight: 2, unit: '' },
  244: { name: 'Résistance Neutre (fixe)', weight: 2, unit: '' },
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

export function getEffectConfig(effectId: number): { name: string; weight: number; unit: string } | null {
  return STAT_CONFIG_LOCAL[effectId] ?? null;
}

function buildStatRuneMap(): Map<string, Rune[]> {
  const map = new Map<string, Rune[]>();
  for (const rune of DOFUS_RUNES) {
    const match = rune.statEffect.match(/^([+-]\d+(?:\.\d+)?%?)\s(.+)$/);
    if (!match) continue;
    let statName = match[2].trim();
    statName = normalizeStatName(statName);
    if (!map.has(statName)) map.set(statName, []);
    map.get(statName)!.push(rune);
  }
  for (const [, runes] of map) runes.sort((a, b) => a.weight - b.weight);
  return map;
}

const STAT_RUNE_MAP = buildStatRuneMap();

export interface BreakingLineResult {
  effectIndex: number;
  effectId: number;
  statName: string;
  /** Valeur du jet utilisée (selon rollMode) */
  jet: number;
  jetMin: number;
  jetMax: number;
  /** Poids de la caractéristique (cfg.weight) */
  statWeight: number;
  /** Unité de la caractéristique */
  unit: string;
  rune: Rune;
  pdbStd: number;
  quantityStd: number;
  valueStd: number;
  pdbFocus: number;
  quantityFocus: number;
  valueFocus: number;
  isFocused: boolean;
}

export interface ExoLineResult {
  rune: Rune;
  quantity: number;
  unitPrice: number;
  valueStd: number;
  valueFocus: number;
}

export interface BreakingResult {
  itemLevel: number;
  itemName: string;
  itemImg: string;
  lines: BreakingLineResult[];
  exoLines: ExoLineResult[];
  totalValueStd: number;
  totalValueFocus: number;
  craftCost: number;
  netProfitStd: number;
  netProfitFocus: number;
  roiStd: number;
  roiFocus: number;
}

export interface ExoEntry {
  runeId: string;
  quantity: number;
}

/**
 * Calcule le poids de brisage (Pdb) à partir du jet, du poids de la caractéristique
 * et du niveau de l'item.
 */
export function calculateBreakingPdb(
  jet: number,
  statWeight: number,
  itemLevel: number,
): number {
  return (3 * jet * statWeight * itemLevel) / 200 + 1;
}

/**
 * Convertit le Pdb en quantité de runes produites.
 * runeWeight est le poids de la rune elle-même (ex: 10 pour Ra Vi).
 */
export function calculateBreakingQuantity(
  pdb: number,
  runeWeight: number,
  coefficient: number,
): number {
  return (pdb / Math.max(runeWeight, 1)) * (coefficient / 100);
}

export function findMatchingRune(statName: string, _statValue: number, unit: string): Rune | null {
  let name = statName.replace(/\s*%\s*$/, '').trim();
  name = STAT_NAME_TO_RUNE_NAME[name] ?? name;
  name = normalizeStatName(name);

  const runes = STAT_RUNE_MAP.get(name);
  if (!runes || runes.length === 0) return null;

  if (unit === '%') {
    const pctRune = runes.find(r => r.statEffect.includes('%'));
    if (pctRune) return pctRune;
  }

  return runes[0];
}

function getJet(
  effect: DofusDbEffect,
  rollMode: 'min' | 'avg' | 'max',
): { jet: number; jetMin: number; jetMax: number } {
  if (effect.diceNum === 0 && effect.diceSide === 0) {
    return { jet: 1, jetMin: 0, jetMax: 0 };
  }
  const side = effect.diceSide !== 0 ? effect.diceSide : effect.diceNum;
  const min = Math.min(effect.diceNum, side);
  const max = Math.max(effect.diceNum, side);
  let jet: number;
  if (rollMode === 'min') jet = min;
  else if (rollMode === 'max') jet = max;
  else jet = Math.round((min + max) / 2);
  return { jet, jetMin: min, jetMax: max };
}

/**
 * Calcule le résultat complet du brisage d'un item.
 *
 * Formule Focus :
 *   - Ligne ciblée  : Pdb_focus = Pdb_ciblée + 0,5 × (∑ Pdb_autres_lignes)
 *   - Autres lignes : Pdb_focus = Pdb × 0,5
 *
 * @param focusEffectIndex - index de l'effet sur lequel appliquer le focus (null = pas de focus)
 * @param exos - liste des runes exo ajoutées manuellement
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
  focusEffectIndex: number | null = null,
  exos: ExoEntry[] = [],
): BreakingResult {
  // Phase 1 : collecter toutes les lignes valides avec leur Pdb standard
  type LineData = {
    effectIndex: number;
    effectId: number;
    statName: string;
    jet: number;
    jetMin: number;
    jetMax: number;
    unit: string;
    rune: Rune;
    pdbStd: number;
    price: number;
  };
  const lineData: LineData[] = [];

  for (let i = 0; i < possibleEffects.length; i++) {
    const effect = possibleEffects[i];
    const cfg = getEffectConfig(effect.effectId);
    if (!cfg) continue;

    const { jet, jetMin, jetMax } = getJet(effect, rollMode);
    if (jet <= 0) continue;

    const statName = cfg.name;
    let matched = findMatchingRune(statName, cfg.unit === '%' ? Math.round(jet) : jet, cfg.unit);
    if (!matched) {
      matched = {
        id: `synthetic-${effect.effectId}`,
        name: cfg.name,
        code: cfg.name,
        weight: cfg.weight,
        statEffect: '',
        category: 'Utilitaires',
      };
    }

    const pdbStd = calculateBreakingPdb(jet, cfg.weight, itemLevel);
    const qty = calculateBreakingQuantity(pdbStd, matched.weight, coefficient);
    if (qty <= 0) continue;

    lineData.push({
      effectIndex: i,
      effectId: effect.effectId,
      statName,
      jet,
      jetMin,
      jetMax,
      unit: cfg.unit,
      rune: matched,
      pdbStd,
      price: runePrices[matched.code] ?? 0,
    });
  }

  // Phase 2 : calculer Pdb focus
  const totalPdbStd = lineData.reduce((s, d) => s + d.pdbStd, 0);

  const lines: BreakingLineResult[] = [];
  for (const d of lineData) {
    const isFocused = focusEffectIndex !== null && d.effectIndex === focusEffectIndex;

    let pdbFocus: number;
    if (focusEffectIndex === null) {
      pdbFocus = d.pdbStd;
    } else if (isFocused) {
      // Ligne ciblée : 100% de son Pdb + 50% du Pdb des autres lignes
      const otherSum = totalPdbStd - d.pdbStd;
      pdbFocus = d.pdbStd + FOCUS_PENALTY * otherSum;
    } else {
      // Autres lignes : 50% du Pdb standard
      pdbFocus = d.pdbStd * FOCUS_PENALTY;
    }

    const quantityStd = calculateBreakingQuantity(d.pdbStd, d.rune.weight, coefficient);
    const quantityFocus = calculateBreakingQuantity(pdbFocus, d.rune.weight, coefficient);

    lines.push({
      effectIndex: d.effectIndex,
      effectId: d.effectId,
      statName: d.statName,
      jet: d.jet,
      jetMin: d.jetMin,
      jetMax: d.jetMax,
      statWeight: 0, // unused in display
      unit: d.unit,
      rune: d.rune,
      pdbStd: d.pdbStd,
      quantityStd,
      valueStd: quantityStd * d.price,
      pdbFocus,
      quantityFocus,
      valueFocus: quantityFocus * d.price,
      isFocused,
    });
  }

  // Exos
  const exoLines: ExoLineResult[] = [];
  for (const exo of exos) {
    if (exo.quantity <= 0) continue;
    const rune = DOFUS_RUNES.find(r => r.id === exo.runeId);
    if (!rune) continue;
    const unitPrice = runePrices[rune.code] ?? 0;
    const val = exo.quantity * unitPrice;
    exoLines.push({ rune, quantity: exo.quantity, unitPrice, valueStd: val, valueFocus: val });
  }

  const totalValueStd = lines.reduce((s, l) => s + l.valueStd, 0) + exoLines.reduce((s, l) => s + l.valueStd, 0);
  const totalValueFocus = lines.reduce((s, l) => s + l.valueFocus, 0) + exoLines.reduce((s, l) => s + l.valueFocus, 0);
  const netProfitStd = totalValueStd - craftCost;
  const netProfitFocus = totalValueFocus - craftCost;
  const roiStd = craftCost > 0 ? (netProfitStd / craftCost) * 100 : 0;
  const roiFocus = craftCost > 0 ? (netProfitFocus / craftCost) * 100 : 0;

  return {
    itemLevel, itemName, itemImg,
    lines, exoLines,
    totalValueStd, totalValueFocus,
    craftCost,
    netProfitStd, netProfitFocus,
    roiStd, roiFocus,
  };
}
