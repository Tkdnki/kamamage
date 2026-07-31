/**
 * Formule officielle Dofus (outil XP Métier de dofusdb.fr) :
 *   si jobLevel − 100 > recipeLevel  →  0 XP
 *   base = 20 × recipeLevel / (delta^1.1 / 10 + 1)
 *   xp   = floor(floor(base) × craftXpRatio / 100)
 *
 * où delta = max(0, jobLevel − recipeLevel)
 *
 * Exemple vérifié : recette niveau 150, métier niveau 168 (delta 18),
 * craftXpRatio 10 (Agathe) → 88 XP ; craftXpRatio 50 (Artefact Pandawushu) → 440 XP.
 */

/**
 * Résout le ratio XP de craft effectif d'une recette.
 * Le craftXpRatio vient de l'item produit (ou du type d'item à défaut) :
 * une valeur à −1 ou absente signifie "non renseigné" → défaut 1.
 */
export function getCraftXpRatio(craftXpRatio?: number): number {
  return craftXpRatio !== undefined && craftXpRatio > -1 ? craftXpRatio : 1;
}

export function getCalculatedXp(
  recipeLevel: number,
  jobLevel: number,
  globalBonus: number = 1,
  craftXpRatio?: number,
): number {
  if (jobLevel - 100 > recipeLevel) return 0;
  const delta = Math.max(0, jobLevel - recipeLevel);
  const base = (20 * recipeLevel) / (Math.pow(delta, 1.1) / 10 + 1);
  const ratio = getCraftXpRatio(craftXpRatio) / 100;
  const xp = Math.floor(base * ratio) * globalBonus;
  return Number.isNaN(xp) ? 0 : Math.floor(xp);
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
  costPerCraft: number,
  craftXpRatio?: number,
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

    const xpPerCraft = getCalculatedXp(recipeLevel, level, 1, craftXpRatio);
    if (xpPerCraft <= 0) continue;

    const crafts = Math.ceil(xpNeeded / xpPerCraft);
    const subtotalCost = crafts * costPerCraft;

    details.push({ level, xpNeeded, xpPerCraft, crafts, subtotalCost });
    totalCrafts += crafts;
    totalCost += subtotalCost;
  }

  return { totalCrafts, totalCost, xpPerLevel: details };
}
