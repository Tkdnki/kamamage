/**
 * Types TypeScript correspondant exactement au schéma JSON retourné par l'API DofusDB.
 * Documentation explorée via https://api.dofusdb.fr
 */

/** Objet multilingue pour les noms, descriptions et slugs */
export interface I18nString {
  id?: string;
  fr: string;
  en?: string;
  de?: string;
  es?: string;
  pt?: string;
}

/** Type d'item (ex: Épée, Bois, Chapeau…) */
export interface DofusDbItemType {
  id: number;
  name: I18nString;
  superTypeId?: number;
  categoryId?: number;
}

/** Structure complète d'un item retourné par /items */
export interface DofusDbItem {
  _id: string;
  id: number;
  iconId: number;
  level: number;
  typeId: number;
  /** URL complète de l'image, ex: "https://api.dofusdb.fr/img/items/6007.png" */
  img: string;
  name: I18nString;
  description?: I18nString;
  slug?: I18nString;
  hasRecipe: boolean;
  type?: DofusDbItemType;
  /** Liste des IDs de recettes qui utilisent cet item comme ingrédient */
  recipesThatUse?: number[];
  /** IDs des recettes de cet item lui-même (rarement populé dans /items) */
  recipeIds?: number[];
}

/** Structure d'un job (métier) retourné dans /recipes */
export interface DofusDbJob {
  id: number;
  name: I18nString;
  img: string;
}

/**
 * Structure complète d'une recette retournée par /recipes?resultId={id}
 * - `ingredients` : tableau d'items complets (DofusDbItem) dans le même ordre que `quantities`
 * - `quantities`  : tableau de nombres (quantité pour chaque ingrédient, même ordre)
 * - `job`         : le métier qui effectue ce craft
 * - `result`      : l'item produit par la recette
 */
export interface DofusDbRecipe {
  id: number;
  resultId: number;
  resultLevel: number;
  jobId: number;
  ingredientIds: number[];
  quantities: number[];
  ingredients: DofusDbItem[];
  result: DofusDbItem;
  job: DofusDbJob;
  resultType?: DofusDbItemType;
}

/** Réponse paginée retournée par les endpoints DofusDB (ex: /items, /recipes) */
export interface DofusDbPaginatedResponse<T> {
  total: number;
  limit: number;
  skip: number;
  data: T[];
}
