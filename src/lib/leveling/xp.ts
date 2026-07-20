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
