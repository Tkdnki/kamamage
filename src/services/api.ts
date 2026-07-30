import type { DofusDbItem, DofusDbRecipe, DofusDbPaginatedResponse } from '../types/dofusdb';
import type { DofusItem } from '../data/mockData';

const DOFUSDB_BASE_URL = 'https://api.dofusdb.fr';
const TIMEOUT_MS = 5000;

// ─── Map des Métiers DofusDB ──────────────────────────────────────────────────

export const DOFUSDB_JOB_IDS: Record<string, number> = {
  'Alchimiste': 26,
  'Bijoutier': 16,
  'Bricoleur': 60,
  'Bûcheron': 2,
  'Chasseur': 41,
  'Cordonnier': 15,
  'Façonneur': 65,
  'Forgeron': 11,
  'Mineur': 24,
  'Paysan': 28,
  'Pêcheur': 36,
  'Sculpteur': 13,
  'Tailleur': 27,
};

// ─── Normalisation unifiée des chaînes pour comparaison bilatérale ────────────

/**
 * Normalise une chaîne pour comparaison bilatérale stricte :
 * - Passage en minuscules
 * - Suppression des accents et diacritiques (É -> e, etc.)
 * - Uniformisation des apostrophes
 * - Nettoyage des espaces superflus
 */
export function normalize(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`']/g, "'")
    .replace(/[^a-z0-9\s-']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Distance de Levenshtein + Fuzzy matching OCR ────────────────────────────

/**
 * Calcule la distance de Levenshtein entre deux chaînes.
 * Représente le nombre minimum de caractères à insérer, supprimer ou remplacer
 * pour transformer `a` en `b`.
 */
export function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const matrix: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) matrix[i][0] = i;
  for (let j = 0; j <= lb; j++) matrix[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[la][lb];
}

/**
 * Longueur minimale de nom pour autoriser le fuzzy matching (évite les faux positifs sur les noms courts).
 */
const FUZZY_MIN_NAME_LENGTH = 6;

/**
 * Seuil maximal de distance de Levenshtein toléré.
 * - 1 caractère de différence pour les noms de 6-10 caractères.
 * - 2 caractères de différence pour les noms de plus de 10 caractères.
 */
function getMaxFuzzyDistance(normalizedName: string): number {
  if (normalizedName.length > 10) return 2;
  return 1;
}

/**
 * Recherche un item fuzzy dans une liste en utilisant la distance de Levenshtein.
 * Retourne l'item correspondant si et seulement si :
 * - Le nom normalisé fait plus de `FUZZY_MIN_NAME_LENGTH` caractères
 * - La distance de Levenshtein est ≤ le seuil autorisé
 * - Un seul item unique correspond dans cette marge
 *
 * @returns L'item DofusItem correspondant, ou undefined si aucun ou multiple matches.
 */
export function fuzzyFindItem(
  candidates: DofusItem[],
  ocrNormalized: string,
): { item: DofusItem; distance: number } | undefined {
  if (ocrNormalized.length < FUZZY_MIN_NAME_LENGTH) return undefined;

  const maxDist = getMaxFuzzyDistance(ocrNormalized);

  const matches: { item: DofusItem; distance: number }[] = [];
  for (const candidate of candidates) {
    const candidateNormalized = normalize(candidate.name);
    const distance = levenshteinDistance(ocrNormalized, candidateNormalized);
    if (distance > 0 && distance <= maxDist) {
      matches.push({ item: candidate, distance });
    }
  }

  if (matches.length === 1) return matches[0];
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Normalisation : DofusDbItem → DofusItem (format interne de l'app) ───────

export function normalizeDofusDbItem(raw: DofusDbItem): DofusItem {
  return {
    _id: String(raw.id),
    name: raw.name.fr,
    type: raw.type?.name?.fr ?? String(raw.typeId),
    level: raw.level,
    imgUrl: raw.img,
  };
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface NormalizedRecipeIngredient {
  id: string;
  name: string;
  quantity: number;
  imgUrl: string;
  type: string;
  level: number;
}

export interface CraftItem {
  _id: string;
  name: string;
  type: string;
  level: number;
  imgUrl: string;
  dofusdbId?: number;
  job?: string;
  recipeIngredients: NormalizedRecipeIngredient[];
}

// ─── Generateur de Regex diacritique pour DofusDB ────────────────────────────

function buildDiacriticInsensitiveRegex(query: string): string {
  const clean = query.replace(/[‘’`']/g, "'");
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped
    .replace(/[aàáâãäAÀÁÂÃÄ]/g, '[aàáâãäAÀÁÂÃÄ]')
    .replace(/[eéèêëEÉÈÊË]/g, '[eéèêëEÉÈÊË]')
    .replace(/[iíìîïIÍÌÎÏ]/g, '[iíìîïIÍÌÎÏ]')
    .replace(/[oóòôõöOÓÒÔÕÖ]/g, '[oóòôõöOÓÒÔÕÖ]')
    .replace(/[uúùûüUÚÙÛÜ]/g, '[uúùûüUÚÙÛÜ]')
    .replace(/[cçCÇ]/g, '[cçCÇ]');
}

// ─── Recherche d'items ────────────────────────────────────────────────────────

/**
 * Mots courants à ignorer lors de l'extraction du mot significatif
 * (articles, prépositions, préfixes de marque, etc.)
 */
const STOP_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "l", "un", "une",
  "au", "aux", "en", "et", "ou", "par", "pour", "sur",
  "casque", "épée", "epee", "cape", "anneau", "ceinture", "bottes", "bouclier",
  "amulette", "tout", "tous",
]);

/**
 * Extrait le mot le plus significatif d'un nom d'item OCR.
 * Ignore les articles, prépositions et termes génériques d'équipement.
 * Priorise le mot le plus long restant (le plus spécifique).
 *
 * Exemples :
 * - "Casque de l'Obsidiantre" → "obsidiantre"
 * - "Épée du Chaos" → "chaos"
 * - "Obsidianstre" → "obsidianstre"
 * - "La petite épée" → "petite"
 */
export function extractSignificantWord(query: string): string {
  const normalized = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`']/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length === 0) return '';
  return words.reduce((a, b) => (a.length >= b.length ? a : b));
}

/**
 * Tronque un mot à la racine la plus significative possible pour élargir la recherche.
 * Enlève les 2 derniers caractères si le mot fait > 6 caractères, pour compenser
 * les fautes OCR courantes en fin de mot (ex: "Obsidianstre" → "Obsidian").
 */
export function truncateForSearch(word: string): string {
  if (word.length > 6) return word.slice(0, -2);
  if (word.length > 4) return word.slice(0, -1);
  return word;
}

/**
 * Recherche des items par nom sur DofusDB.
 * Utilise une regex diacritique-insensible pour trouver les items avec ou sans accents en BDD.
 * En cas de 0 résultat, relance une recherche élargie sur le mot significatif le plus long
 * pour alimenter le fuzzy matching.
 */
export async function searchItems(query: string): Promise<DofusItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 3) return [];

  const trySearch = async (q: string): Promise<DofusItem[]> => {
    const regexPattern = buildDiacriticInsensitiveRegex(q);
    const encoded = encodeURIComponent(regexPattern);
    const path = `/items?name.fr[$regex]=${encoded}&name.fr[$options]=i&$limit=25`;
    const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbItem>>(path);
    return (data.data ?? []).map(normalizeDofusDbItem);
  };

  try {
    // 1. Recherche stricte avec le nom complet
    console.log('[searchItems] Recherche DofusDB (insensible aux accents):', cleanQuery);
    let items = await trySearch(cleanQuery);
    console.log(`[searchItems] DofusDB a retourné ${items.length} résultat(s)`);

    // 2. Si 0 résultat, élargir avec le mot significatif (pour alimenter le fuzzy matching)
    if (items.length === 0) {
      const significantWord = extractSignificantWord(cleanQuery);
      if (significantWord && significantWord !== cleanQuery.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        console.log(`[searchItems] Élargissement sur mot significatif: "${significantWord}"`);
        items = await trySearch(significantWord);
        console.log(`[searchItems] Recherche élargie: ${items.length} résultat(s)`);

        // 3. Si toujours 0, tronquer la racine pour encore plus de résultats
        if (items.length === 0) {
          const root = truncateForSearch(significantWord);
          if (root.length >= 3 && root !== significantWord) {
            console.log(`[searchItems] Recherche par racine tronquée: "${root}"`);
            items = await trySearch(root);
            console.log(`[searchItems] Recherche racine: ${items.length} résultat(s)`);
          }
        }
      }
    }

    return items;
  } catch (err) {
    console.warn('[KamaMage] searchItems — DofusDB inaccessible :', err);
    return [];
  }
}

// ─── Récupération de recette par item ─────────────────────────────────────────

export async function fetchRecipeForItem(dofusdbId: number): Promise<NormalizedRecipeIngredient[] | null> {
  try {
    const path = `/recipes?resultId=${dofusdbId}`;
    const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbRecipe>>(path);

    if (!data.data || data.data.length === 0) return null;

    const recipe = data.data[0];

    return recipe.ingredients.map((ing, idx) => ({
      id: String(ing.id),
      name: ing.name.fr,
      quantity: recipe.quantities[idx] ?? 1,
      imgUrl: ing.img,
      type: ing.type?.name?.fr ?? String(ing.typeId),
      level: ing.level,
    }));
  } catch (err) {
    console.warn(`[KamaMage] fetchRecipeForItem(${dofusdbId}) — DofusDB inaccessible :`, err);
    return null;
  }
}

// ─── Récupération de crafts par métier ───────────────────────────────────────

export async function fetchCraftsByJob(jobName: string): Promise<CraftItem[]> {
  const jobId = DOFUSDB_JOB_IDS[jobName];
  if (!jobId) {
    console.warn(`[KamaMage] Métier inconnu: "${jobName}"`);
    return [];
  }

  try {
    const path = `/recipes?jobId=${jobId}&$limit=50`;
    const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbRecipe>>(path);

    if (!data.data) return [];

    return data.data.map(recipe => {
      const resultItem = recipe.result;
      const ingredients: NormalizedRecipeIngredient[] = (recipe.ingredients ?? []).map((ing, idx) => ({
        id: String(ing.id),
        name: ing.name?.fr ?? 'Ingrédient inconnu',
        quantity: recipe.quantities?.[idx] ?? 1,
        imgUrl: ing.img ?? '',
        type: ing.type?.name?.fr ?? 'Ressource',
        level: ing.level ?? 1,
      }));

      return {
        _id: String(resultItem.id),
        name: resultItem.name?.fr ?? 'Item inconnu',
        type: recipe.resultType?.name?.fr ?? resultItem.type?.name?.fr ?? 'Équipement',
        level: recipe.resultLevel ?? resultItem.level ?? 1,
        imgUrl: resultItem.img ?? '',
        dofusdbId: resultItem.id,
        job: jobName,
        recipeIngredients: ingredients,
      };
    });
  } catch (err) {
    console.warn(`[KamaMage] fetchCraftsByJob(${jobName}) — DofusDB inaccessible :`, err);
    return [];
  }
}

export async function fetchRecipesByJob(jobId: number): Promise<DofusDbRecipe[]> {
  try {
    const path = `/recipes?jobId=${jobId}&$limit=50`;
    const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbRecipe>>(path);
    return data.data ?? [];
  } catch (err) {
    console.warn(`[KamaMage] fetchRecipesByJob(${jobId}) — DofusDB inaccessible :`, err);
    return [];
  }
}
