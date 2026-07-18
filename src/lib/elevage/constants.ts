export const TABLE_XP_MONTURE: Record<number, number> = {
  1: 0, 2: 19, 3: 49, 4: 96, 5: 161, 6: 246, 7: 353, 8: 481, 9: 633, 10: 809,
  11: 1011, 12: 1238, 13: 1491, 14: 1772, 15: 2081, 16: 2419, 17: 2786, 18: 3182, 19: 3609, 20: 4067,
  21: 4557, 22: 5078, 23: 5632, 24: 6219, 25: 6839, 26: 7493, 27: 8182, 28: 8905, 29: 9664, 30: 10457,
  31: 11287, 32: 12154, 33: 13057, 34: 13997, 35: 14974, 36: 15990, 37: 17043, 38: 18135, 39: 19266, 40: 20437,
  41: 21646, 42: 22896, 43: 24186, 44: 25516, 45: 26887, 46: 28299, 47: 29753, 48: 31248, 49: 32785, 50: 34365,
  51: 35987, 52: 37652, 53: 39360, 54: 41111, 55: 42906, 56: 44745, 57: 46628, 58: 48555, 59: 50527, 60: 52544,
  61: 54607, 62: 56714, 63: 58868, 64: 61067, 65: 63312, 66: 65604, 67: 67942, 68: 70327, 69: 72760, 70: 75239,
  71: 77766, 72: 80341, 73: 82964, 74: 85635, 75: 88355, 76: 91123, 77: 93940, 78: 96806, 79: 99721, 80: 102685,
  81: 105700, 82: 108764, 83: 111878, 84: 115042, 85: 118257, 86: 121523, 87: 124840, 88: 128207, 89: 131626, 90: 135096,
  91: 138618, 92: 142191, 93: 145817, 94: 149495, 95: 153225, 96: 157008, 97: 160843, 98: 164732, 99: 168673, 100: 172668
};

export const ENCLOS_LEVELS = [
  { level: 1, count: 1, title: 'Débutant' },
  { level: 40, count: 2, title: 'Novice' },
  { level: 80, count: 3, title: 'Apprenti' },
  { level: 120, count: 4, title: 'Initié' },
  { level: 160, count: 5, title: 'Vétéran' },
  { level: 200, count: 6, title: 'Maître' },
] as const;

export const CARBURANT_TYPES = [
  { id: 'extrait', label: 'Extrait', maxFill: 40000 },
  { id: 'philtre', label: 'Philtre', maxFill: 70000 },
  { id: 'potion', label: 'Potion', maxFill: 90000 },
  { id: 'elixir', label: 'Élixir', maxFill: 100000 },
] as const;

export const CARBURANT_TAILLES = [
  { id: 'minuscule', label: 'Minuscule', xp: 1000 },
  { id: 'petit', label: 'Petit', xp: 2000 },
  { id: 'normal', label: 'Normal', xp: 3000 },
  { id: 'grand', label: 'Grand', xp: 4000 },
  { id: 'gigantesque', label: 'Gigantesque', xp: 5000 },
] as const;

const CARBURANT_IDS: Record<string, Record<string, string>> = {
  extrait: {
    minuscule: '33314',
    petit: '33320',
    normal: '33331',
    grand: '33341',
    gigantesque: '33352',
  },
  philtre: {
    minuscule: '33362',
    petit: '33373',
    normal: '33383',
    grand: '33394',
    gigantesque: '33404',
  },
  potion: {
    minuscule: '33415',
    petit: '33425',
    normal: '33436',
    grand: '33446',
    gigantesque: '33457',
  },
  elixir: {
    minuscule: '33467',
    petit: '33476',
    normal: '33485',
    grand: '33494',
    gigantesque: '33503',
  },
};

export const HDV_ITEM_IDS = {
  filet_capture: '32521',
  rune: { muldo: '1558', volkorne: '1557' },
  carburant: (type: string, taille: string) => CARBURANT_IDS[type]?.[taille] ?? '',
} as const;

export function getCarburantDisplayName(typeLabel: string, tailleId: string): string {
  if (tailleId === 'normal') {
    return `${typeLabel} de Mangeoire`;
  }
  const taille = CARBURANT_TAILLES.find(t => t.id === tailleId);
  const prefix = taille?.label ?? '';
  return `${prefix} ${typeLabel} de Mangeoire`;
}
