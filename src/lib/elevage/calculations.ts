import { TABLE_XP_MONTURE } from './constants';

export type MontureType = 'muldo' | 'volkorne';

export function probaRune(type: MontureType, level: number): number {
  const multi = type === 'muldo' ? 90 : 100;
  return ((3 * 0.01 * level * multi * 60 / 200) + 1) / 100;
}

export function xpToLevel(level: number): number {
  return TABLE_XP_MONTURE[level] ?? 0;
}

export interface ElevageRow {
  level: number;
  cumulatedXp: number;
  runeProb: number;
  expectedGain: number;
  fuelCostPerMount: number;
  netProfit: number;
  benefitPercent: number;
  totalCycleProfit: number;
  extraitsRequired: number;
  hoursToLevel: number;
}

export function computeTable(
  type: MontureType,
  runePrice: number,
  carburantPrice: number,
  filetPrice: number,
  enclosCount: number,
): ElevageRow[] {
  if (runePrice <= 0 || carburantPrice <= 0 || filetPrice <= 0 || enclosCount <= 0) {
    return [];
  }

  const prixParXP = carburantPrice / 3000;

  const results: ElevageRow[] = [];

  for (let level = 1; level <= 100; level++) {
    const cumulatedXp = xpToLevel(level);
    if (cumulatedXp < 0) continue;

    const runeProb = probaRune(type, level);
    const expectedGain = runeProb * runePrice;
    const fuelCostPerMount = (cumulatedXp * prixParXP) / 10;
    const netProfit = expectedGain - fuelCostPerMount - filetPrice;
    const totalCost = fuelCostPerMount + filetPrice;
    const benefitPercent = totalCost > 0 ? netProfit / totalCost : 0;
    const totalCycleProfit = netProfit * enclosCount * 10;
    const extraitsRequired = cumulatedXp / 3000;
    const hoursToLevel = cumulatedXp / 3600;

    results.push({
      level, cumulatedXp, runeProb, expectedGain,
      fuelCostPerMount, netProfit, benefitPercent,
      totalCycleProfit, extraitsRequired, hoursToLevel,
    });
  }

  return results;
}

export function findOptimalLevel(rows: ElevageRow[]): ElevageRow | null {
  if (rows.length === 0) return null;

  const maxBenefit = Math.max(...rows.map(r => r.benefitPercent));
  const candidates = rows.filter(r => Math.abs(r.benefitPercent - maxBenefit) < 0.0001);

  return candidates.reduce((best, current) => current.level < best.level ? current : best);
}
