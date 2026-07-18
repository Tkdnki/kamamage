import type { DofusDbItem, DofusDbRecipe, DofusDbPaginatedResponse } from '../types/dofusdb';
import type { DofusItem } from '../data/mockData';


const DOFUSDB_BASE_URL = 'https://api.dofusdb.fr';
const TIMEOUT_MS = 5000;

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

/**
 * Transforme un item DofusDB en format interne DofusItem utilisé par le reste de l'app.
 * On stocke `dofusdbId` pour pouvoir récupérer la recette plus tard.
 */
export function normalizeDofusDbItem(raw: DofusDbItem): DofusItem {
  return {
    _id: String(raw.id),
    name: raw.name.fr,
    type: raw.type?.name?.fr ?? String(raw.typeId),
    level: raw.level,
    imgUrl: raw.img,
    // Pas de recette embarquée : elle sera chargée à la demande via fetchRecipeForItem()
  };
}

// ─── Recherche d'items ────────────────────────────────────────────────────────

/**
 * Recherche des items par nom (partiel, insensible à la casse) sur DofusDB.
 * La liste est vide tant que l'utilisateur n'a pas tapé 3 caractères.
 * En cas d'échec de l'API, retourne un tableau vide sans injecter de fausses données.
 */
export async function searchItems(query: string): Promise<DofusItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 3) return [];

  try {
    const encoded = encodeURIComponent(cleanQuery);
    const path = `/items?name.fr[$regex]=${encoded}&name.fr[$options]=i&$limit=25`;
    const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbItem>>(path);

    const items: DofusItem[] = (data.data ?? []).map(normalizeDofusDbItem);

    return items;
  } catch (err) {
    console.warn('[KamaMage] searchItems — DofusDB inaccessible :', err);
    return [];
  }
}

// ─── Récupération de recette ──────────────────────────────────────────────────

/**
 * Récupère la recette d'un item via son ID numérique DofusDB.
 * Endpoint : GET /recipes?resultId={dofusdbId}
 *
 * Retourne un tableau d'ingrédients normalisés ou `null` si la recette est absente.
 */
export async function fetchRecipeForItem(dofusdbId: number): Promise<NormalizedRecipeIngredient[] | null> {
  try {
    const path = `/recipes?resultId=${dofusdbId}`;
    const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbRecipe>>(path);

    if (!data.data || data.data.length === 0) return null;

    // DofusDB peut retourner plusieurs recettes pour un même item (variantes de craft).
    // On prend la première.
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

/**
 * Récupère les recettes pour un métier donné (par jobId DofusDB).
 * Endpoint : GET /recipes?jobId={jobId}&$limit=50
 */
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

// ─── New: fetch crafts by job (via /recipes) ──────────────────────────────────

/** Objet craft tel que consommé par CraftProfitability (recette embarquée) */
export interface CraftItem {
  _id: string;
  name: string;
  type: string;
  level: number;
  imgUrl: string;
  dofusdbId: number;
  ingredients: NormalizedRecipeIngredient[];
}

/** Mapping nom de métier → jobId DofusDB (source : /jobs) */
const JOB_ID_MAP: Record<string, number> = {
  Alchimiste: 26,
  Bijoutier: 16,
  Bricoleur: 65,
  Bûcheron: 2,
  Chasseur: 41,
  Cordonnier: 15,
  Éleveur: 79,
  Façonneur: 60,
  Forgeron: 11,
  Mineur: 24,
  Paysan: 28,
  Pêcheur: 36,
  Sculpteur: 13,
  Tailleur: 27,
};

const CRAFTS_PER_PAGE = 200;

/**
 * Récupère tous les crafts d'un métier depuis DofusDB.
 * Interroge /recipes?jobId={id} qui retourne chaque recette avec
 * result (objet crafté), ingredients (full items) et quantities.
 */
export async function fetchCraftsByJob(
  jobName: string,
): Promise<CraftItem[]> {
  const jobId = JOB_ID_MAP[jobName];
  if (!jobId) {
    console.warn(`[KamaMage] fetchCraftsByJob — métier inconnu : ${jobName}`);
    return [];
  }

  const seenByItemId = new Map<string, CraftItem>();
  const seenByRecipeId = new Set<number>();
  let allItems: CraftItem[] = [];
  let skip = 0;

  try {
    while (true) {
      const path = `/recipes?jobId=${jobId}&$limit=${CRAFTS_PER_PAGE}&$skip=${skip}`;
      const data = await dofusdbGet<DofusDbPaginatedResponse<DofusDbRecipe>>(path);
      const batch = data.data ?? [];

      if (batch.length === 0) break;

      for (const recipe of batch) {
        if (seenByRecipeId.has(recipe.id)) continue;
        seenByRecipeId.add(recipe.id);

        const itemId = String(recipe.result.id);
        if (seenByItemId.has(itemId)) continue;

        seenByItemId.set(itemId, {
          _id: itemId,
          name: recipe.result.name.fr,
          type: recipe.result.type?.name?.fr ?? String(recipe.result.typeId),
          level: recipe.result.level,
          imgUrl: recipe.result.img,
          dofusdbId: recipe.result.id,
          ingredients: recipe.ingredients.map((ing, idx) => ({
            id: String(ing.id),
            name: ing.name.fr,
            quantity: recipe.quantities[idx] ?? 1,
            imgUrl: ing.img,
            type: ing.type?.name?.fr ?? String(ing.typeId),
            level: ing.level,
          })),
        });
      }

      skip += batch.length;
    }

    allItems = Array.from(seenByItemId.values());
    return allItems;
  } catch (err) {
    console.warn(
      `[KamaMage] fetchCraftsByJob(${jobName}) — DofusDB inaccessible :`,
      err,
    );
    return allItems.length > 0 ? allItems : [];
  }
}

// ─── Types exportés pour les composants ──────────────────────────────────────

/** Ingrédient normalisé prêt à l'emploi dans les composants */
export interface NormalizedRecipeIngredient {
  id: string;         // String(dofusDbItem.id)
  name: string;       // item.name.fr
  quantity: number;
  imgUrl: string;
  type: string;
  level: number;
}
