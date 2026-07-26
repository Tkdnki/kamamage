/**
 * Formule officielle Dofus :
 *   XP = floor(baseXp / (1 + 0.1 × delta^1.1))
 *
 * où delta = max(0, jobLevel − recipeLevel)
 */

const XP_MULTIPLIERS: Record<string, number> = {
  // Métiers de récolte pure
  Chasseur: 2, Paysan: 1, Éleveur: 1,
  // Transformation
  Alchimiste: 4, Bûcheron: 4, Mineur: 6, Pêcheur: 4,
  // Artisanat / équipements
  Bijoutier: 20, Bricoleur: 20, Cordonnier: 20, Façonneur: 20, Forgeron: 20, Sculpteur: 20, Tailleur: 20,
};

/** Exceptions item-level qui surchargent le multiplicateur du métier. */
const ITEM_EXCEPTIONS: Record<string, Record<string, number>> = {
  Paysan: { 'Gâteau Royal': 20 },
  Pêcheur: { 'Anguille Rôtie': 1, 'Anguille Souroche Rôtie': 1, 'Kralamoure Grillé': 1, 'Kralamoure Unique Grillé': 1 },
};

export function getBaseMultiplier(jobName: string, itemName?: string): number {
  if (itemName && ITEM_EXCEPTIONS[jobName]?.[itemName] !== undefined) {
    return ITEM_EXCEPTIONS[jobName][itemName];
  }
  return XP_MULTIPLIERS[jobName] ?? 2;
}

export function getCalculatedXp(
  recipeLevel: number,
  jobLevel: number,
  jobName: string = '',
  globalBonus: number = 1,
  itemName?: string,
): number {
  const baseXp = recipeLevel * getBaseMultiplier(jobName, itemName);
  const delta = Math.max(0, jobLevel - recipeLevel);
  const penalty = 1 + 0.1 * Math.pow(delta, 1.1);
  return Math.floor(baseXp * globalBonus / penalty);
}

export const JOB_XP_LEVELS = [
  0, 0, 20, 40, 120, 200, 300, 420, 560, 720, 900, 1100, 1320, 1560, 1820, 2100, 2400, 2720, 3060, 3420, 3800,
  4200, 4620, 5060, 5520, 6000, 6500, 7020, 7560, 8120, 8700, 9300, 9920, 10560, 11220, 11900, 12600, 13320, 14060, 14820, 15600,
  16400, 17220, 18060, 18920, 19800, 20700, 21620, 22560, 23520, 24500, 25500, 26520, 27560, 28620, 29700, 30800, 31920, 33060, 34220, 35400,
  36600, 37820, 39060, 40320, 41600, 42900, 44220, 45560, 46920, 48300, 49700, 51120, 52560, 54020, 55500, 57000, 58520, 60060, 61620, 63200,
  64800, 66420, 68060, 69720, 71400, 73100, 74820, 76560, 78320, 80100, 81900, 83720, 85560, 87420, 89300, 91200, 93120, 95060, 97020, 99000,
  101000, 103020, 105060, 107120, 109200, 111300, 113420, 115560, 117720, 119900, 122100, 124320, 126560, 128820, 131100, 133400, 135720, 138060, 140420, 142800,
  145200, 147620, 150060, 152520, 155000, 157500, 160020, 162560, 165120, 167700, 170300, 172920, 175560, 178220, 180900, 183600, 186320, 189060, 191820, 194600,
  197400, 200220, 203060, 205920, 208800, 211700, 214620, 217560, 220520, 223500, 226500, 229520, 232560, 235620, 238700, 241800, 244920, 248060, 251220, 254400,
  257600, 260820, 264060, 267320, 270600, 273900, 277220, 280560, 283920, 287300, 290700, 294120, 297560, 301020, 304500, 308000, 311520, 315060, 318620, 322200,
  325800, 329420, 333060, 336720, 340400, 344100, 347820, 351560, 355320, 359100, 362900, 366720, 370560, 374420, 378300, 382200, 386120, 390060, 394020, 398000,
];

export interface LevelGoalResult {
  totalCrafts: number;
  totalCost: number;
  xpPerLevel: { level: number; xpNeeded: number; xpPerCraft: number; crafts: number; subtotalCost: number }[];
}

export function calculateCraftsToTarget(
  recipeLevel: number,
  currentLevel: number,
  targetLevel: number,
  currentXp: number,
  jobName: string,
  itemName: string | undefined,
  costPerCraft: number,
): LevelGoalResult | null {
  if (targetLevel <= currentLevel || recipeLevel > targetLevel) return null;

  const details: LevelGoalResult['xpPerLevel'] = [];
  let totalCrafts = 0;
  let totalCost = 0;

  for (let level = currentLevel; level < targetLevel; level++) {
    let xpNeeded = JOB_XP_LEVELS[level + 1] - JOB_XP_LEVELS[level];
    // Soustraire l'XP déjà acquise pour le niveau actuel
    if (level === currentLevel) xpNeeded = Math.max(0, xpNeeded - currentXp);
    if (xpNeeded <= 0) continue;

    const xpPerCraft = getCalculatedXp(recipeLevel, level, jobName, 1, itemName);
    if (xpPerCraft <= 0) continue;

    const crafts = Math.ceil(xpNeeded / xpPerCraft);
    const subtotalCost = crafts * costPerCraft;

    details.push({ level, xpNeeded, xpPerCraft, crafts, subtotalCost });
    totalCrafts += crafts;
    totalCost += subtotalCost;
  }

  return { totalCrafts, totalCost, xpPerLevel: details };
}
