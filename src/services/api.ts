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
    .replace(/[‘’`']/g, "'")
    .replace(/[^a-z0-9\s-']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Recherche des items par nom sur DofusDB.
 * Utilise une regex diacritique-insensible pour trouver les items avec ou sans accents en BDD.
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
    console.log('[searchItems] Recherche DofusDB (insensible aux accents):', cleanQuery);
    const items = await trySearch(cleanQuery);
    console.log(`[searchItems] DofusDB a retourné ${items.length} résultat(s)`);
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
