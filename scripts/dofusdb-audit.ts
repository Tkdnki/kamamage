/**
 * Module partagé d'audit/nettoyage des ressources de familiers contre DofusDB.
 * Utilisé par scripts/clean-pet-resources.ts et scripts/extract-pet-xp.ts.
 *
 * - `normalizeName` : normalisation bilatérale (casse, accents, ligatures œ/Œ,
 *   apostrophes, espaces) pour comparer un nom du dataset à un nom DofusDB.
 * - `buildDiacriticInsensitiveRegex` : motif regex insensible aux accents pour
 *   interroger `name.fr[$regex]` (l'option `i` ne gère pas les accents).
 * - `lookupDofusdbName` : retrouve le NOM OFFICIEL DofusDB d'une ressource,
 *   ou `null` si aucun item ne correspond (recherche exacte normalisée,
 *   puis repli sur le mot significatif pour couvrir les ligatures Œil/Œuf…).
 * - `NAME_ALIASES` : redirections connues vers le nom officiel DofusDB.
 */

export const DOFUSDB_BASE_URL = 'https://api.dofusdb.fr';
const TIMEOUT_MS = 8000;

/**
 * Table des alias : nom de départ (tel que dans le dataset) → nom officiel DofusDB.
 * La correspondance se fait sur le nom NORMALISÉ, donc insensible à la casse et
 * aux accents (ex: "Rune GA PM" → "Rune Ga PM" → "Rune Ga Pme").
 * Ne sert que pour les différences qui ne sont pas une simple casse/accent/ligature
 * (ces dernières sont auto-résolues par `lookupDofusdbName`).
 * Regroupe : renommages réels côté Dofus, fautes de frappe du xlsx, variantes
 * orthographiques et le changement de préfixe des runes composées (Pa→Pata…).
 */
export const NAME_ALIASES: Record<string, string> = {
  // Runes de forgemagie
  'Rune Ga PM': 'Rune Ga Pme',
  'Rune GA PM': 'Rune Ga Pme',
  'Rune PO': 'Rune Po',
  // Fautes de frappe / variantes du fichier source
  'Mis en plis de voracle': 'Mise en plis de Voracle',
  'Langue du Champodonte': 'Langue de Champodonte',
  'Borderie de Nileza': 'Broderie de Nileza',
  'Poils magique de Tanuki': 'Poils magiques de Tanuki',
  'Baguete rythmique': 'Baguette Rythmique',
  'Queue de Boufmouth Légendaire': 'Queue du Boufmouth légendaire',
  'Corne de Kamasterik': 'Corne de Kamasterisk',
  'Fleur de kalyptus': 'Fleur de Kaliptus',
  'Scalp de Meulou': 'Scalp du Meulou',
  'Poil de Smilomouth': 'Poils de Smilomouth',
  'Patte de Matiscroc': 'Patte de Masticroc',
  'Epaulette de Dazak Martegel': 'Épaulière de Dazak Martegel',
  'Épaulette de Bwork': 'Épaulière de Bwork',
  'Corde de Fancrome': 'Corde du Fancrôme',
  'Dent en Or du Craqueleur': 'Dent en Or de Craqueleur',
  'Clef de la salle Minotot': 'Clef de la salle du Minotot',
};

/** Normalise un nom pour comparaison bilatérale (retourne '' si vide). */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’`]/g, "'")
    .replace(/[^a-z0-9\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Construit le motif regex diacritique-insensible pour `name.fr[$regex]`. */
export function buildDiacriticInsensitiveRegex(query: string): string {
  const clean = query.replace(/[‘’`']/g, "'");
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped
    .replace(/œ/g, '[œŒ]')
    .replace(/Œ/g, '[œŒ]')
    .replace(/[aàáâãäAÀÁÂÃÄ]/g, '[aàáâãäAÀÁÂÃÄ]')
    .replace(/[eéèêëEÉÈÊË]/g, '[eéèêëEÉÈÊË]')
    .replace(/[iíìîïIÍÌÎÏ]/g, '[iíìîïIÍÌÎÏ]')
    .replace(/[oóòôõöOÓÒÔÕÖ]/g, '[oóòôõöOÓÒÔÕÖ]')
    .replace(/[uúùûüUÚÙÛÜ]/g, '[uúùûüUÚÙÛÜ]')
    .replace(/[cçCÇ]/g, '[cçCÇ]');
}

/** Mots courants ignorés lors du repli sur le mot significatif. */
const STOP_WORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'un', 'une', 'au', 'aux', 'en', 'et', 'ou', 'par', 'pour', 'sur',
]);

/** Extrait le mot le plus significatif d'un nom (le plus long hors mots courants). */
export function extractSignificantWord(query: string): string {
  return extractSignificantWords(query)[0] ?? '';
}

/** Extrait les mots significatifs triés par longueur décroissante (hors mots courants). */
export function extractSignificantWords(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’`']/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = normalized.split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

/** Tronque un mot pour élargir une recherche (compense les coquilles de fin). */
export function truncateForSearch(word: string): string {
  if (word.length > 6) return word.slice(0, -2);
  if (word.length > 4) return word.slice(0, -1);
  return word;
}

async function dofusdbGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${DOFUSDB_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/** Interroge DofusDB par regex diacritique-insensible et renvoie les noms.fr. */
async function searchNames(regexPattern: string): Promise<string[]> {
  const encoded = encodeURIComponent(regexPattern);
  const path = `/items?name.fr[$regex]=${encoded}&name.fr[$options]=i&$limit=100`;
  const data = await dofusdbGet<{ data?: { name?: { fr?: string } }[] }>(path);
  return (data.data ?? [])
    .map((x) => x.name?.fr ?? '')
    .filter(Boolean);
}

/**
 * Retrouve le nom officiel DofusDB d'une ressource.
 * Stratégie (toujours en match normalisé exact) :
 *   1. Requête "nom complet" en regex diacritique.
 *   2. Sinon repli sur chacun des mots significatifs (les plus longs d'abord),
 *      plus leur racine tronquée — couvre les ligatures Œil/Œuf ("Oeil de X" →
 *      "Œil de X"), les casse et les coquilles de fin.
 * @param name Nom à résoudre (déjà passé par les alias avant appel).
 * @returns Le nom officiel DofusDB, ou `null` si absent.
 */
export async function lookupDofusdbName(name: string): Promise<string | null> {
  const candidates: string[] = [];

  const tryPattern = async (pattern: string): Promise<void> => {
    try {
      candidates.push(...(await searchNames(pattern)));
    } catch {
      // réseau touché : on continue avec les étapes suivantes
    }
  };

  const target = normalizeName(name);
  let found = candidates.some((c) => normalizeName(c) === target);

  await tryPattern(buildDiacriticInsensitiveRegex(name));
  found = candidates.some((c) => normalizeName(c) === target);

  if (!found) {
    const words = [...new Set(extractSignificantWords(name))];
    for (const word of words) {
      await tryPattern(buildDiacriticInsensitiveRegex(word));
      const root = truncateForSearch(word);
      if (root !== word && root.length >= 3) {
        await tryPattern(buildDiacriticInsensitiveRegex(root));
      }
      if (candidates.some((c) => normalizeName(c) === target)) break;
    }
  }

  return candidates.find((c) => normalizeName(c) === target) ?? null;
}

/** Résout un nom en appliquant d'abord les alias connus. */
export function applyAlias(name: string): string {
  const normalized = normalizeName(name);
  for (const [from, to] of Object.entries(NAME_ALIASES)) {
    if (normalizeName(from) === normalized) return to;
  }
  return name;
}