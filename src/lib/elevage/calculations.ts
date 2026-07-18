import { TABLE_XP_MONTURE } from './constants';

export type MontureType = 'muldo' | 'volkorne';

export function probaRune(type: MontureType, level: number): number {
  if (type === 'muldo') {
    return (3 * level * 90 * 60 / 200 / 100 + 1) / 100;
  }
  return (3 * level * 100 * 60 / 200 / 100 + 1) / 100;
}

export function xpToLevel(level: number): number {
  return TABLE_XP_MONTURE[level] ?? 0;
}

export function carburantUnitsNeeded(totalXp: number, xpPerUnit: number): number {
  if (xpPerUnit <= 0) return 0;
  return Math.ceil(totalXp / xpPerUnit);
}

export interface ElevageRow {
  level: number;
  cumulatedXp: number;
  runeProb: number;
  expectedGain: number;
  fuelCostPerMount: number;
  netProfit: number;
}

export function computeTable(
  type: MontureType,
  runePrice: number,
  carburantXp: number,
  carburantPrice: number,
  filetPrice: number,
  mountCount: number
): ElevageRow[] {
  if (runePrice <= 0 || carburantXp <= 0 || carburantPrice <= 0 || filetPrice <= 0 || mountCount <= 0) {
    return [];
  }

  const results: ElevageRow[] = [];

  for (let level = 1; level <= 100; level++) {
    const cumulatedXp = xpToLevel(level);
    if (cumulatedXp < 0) continue;

    const runeProb = probaRune(type, level);
    const expectedGain = runeProb * runePrice;
    const units = carburantUnitsNeeded(cumulatedXp, carburantXp);
    const totalFuelCost = units * carburantPrice;
    const fuelCostPerMount = totalFuelCost / mountCount;
    const netProfit = expectedGain - fuelCostPerMount - filetPrice;

    results.push({ level, cumulatedXp, runeProb, expectedGain, fuelCostPerMount, netProfit });
  }

  return results;
}

export function findOptimalLevel(rows: ElevageRow[]): ElevageRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, current) => current.netProfit > best.netProfit ? current : best);
}
