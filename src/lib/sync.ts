import { supabase } from './supabaseClient';
import type { PriceData } from '../context/DofusContext';

// ─── Batch upsert (contourne RLS via SECURITY DEFINER) ──────────────────

interface ConsolidatedPricePayload {
  server_name: string;
  category: string;
  item_key: string;
  lot: string | null;
  price: number;
}

async function batchUpsertPrices(payloads: ConsolidatedPricePayload[]): Promise<void> {
  if (payloads.length === 0) return;
  const { error } = await supabase.rpc('upsert_consolidated_prices', { p_prices: payloads });
  if (error) {
    console.error(`[Sync] ❌ Error upsert_consolidated_prices (${payloads.length} lignes):`, error.message);
  } else {
    console.log(`[Sync] 📤 Batch Supabase réussi : ${payloads.length} prix synchronisés.`);
  }
}

// ─── XP des ressources de familiers (overrides) ──────────────────────────

/**
 * Récupère tous les overrides d'XP de ressources de familiers (table
 * `item_xp_overrides`), indexés par `item_id`. Sert à remplacer la valeur
 * du JSON statique par la valeur corrigée en jeu.
 */
export async function fetchPetXpOverrides(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('item_xp_overrides')
    .select('item_id, xp_value');

  if (error) {
    console.warn('[Sync] ❌ fetchPetXpOverrides error:', error.message);
    return {};
  }

  const overrides: Record<string, number> = {};
  for (const row of data ?? []) {
    const value = Number(row.xp_value);
    if (Number.isFinite(value)) overrides[row.item_id] = value;
  }
  return overrides;
}

/**
 * Upsert d'un override d'XP pour une ressource de familier (`item_xp_overrides`).
 * `item_id` est l'itemId DofusDB (ou nom normalisé en fallback), comme pour les prix.
 * @returns true si l'upsert Supabase a réussi.
 */
export async function updateResourceXp(itemId: string, xpValue: number): Promise<boolean> {
  const { error } = await supabase
    .from('item_xp_overrides')
    .upsert({
      item_id: itemId,
      xp_value: xpValue,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'item_id' });

  if (error) {
    console.error(`[Sync] ❌ Error upsert item_xp_overrides pour "${itemId}":`, error.message);
    return false;
  }
  console.log(`[Sync] 📤 XP sauvegardée: item_id="${itemId}", xp_value=${xpValue}`);
  return true;
}

// ─── Runes ──────────────────────────────────────────────────────────────

export async function pushRunePricesToServer(server: string, data: Record<string, number>): Promise<void> {
  const payloads: ConsolidatedPricePayload[] = Object.entries(data)
    .filter(([, price]) => price > 0)
    .map(([itemKey, price]) => ({ server_name: server, category: 'rune', item_key: itemKey, lot: null, price }));
  if (payloads.length === 0) {
    console.log('[Sync] ℹ️ Aucun prix de rune > 0 à synchroniser.');
    return;
  }
  await batchUpsertPrices(payloads);
}

export async function fetchRunePricesFromServer(server: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price')
    .eq('server_name', server)
    .eq('category', 'rune');

  if (error) {
    console.warn('[Sync] ❌ fetchRunePrices error:', error.message);
    return null;
  }

  const prices: Record<string, number> = {};
  for (const row of data ?? []) {
    prices[row.item_key] = row.price;
  }
  return prices;
}

export async function fetchRunePricesWithAuthor(server: string): Promise<Record<string, { price: number; author: string | null }>> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price, profiles!author_id(pseudo)')
    .eq('server_name', server)
    .eq('category', 'rune');

  if (error) {
    console.warn('[Sync] ❌ fetchRunePricesWithAuthor error:', error.message);
    return {};
  }

  const result: Record<string, { price: number; author: string | null }> = {};
  for (const row of data ?? []) {
    result[row.item_key] = {
      price: row.price,
      author: (row as any).profiles?.pseudo ?? null,
    };
  }
  return result;
}

// ─── HDV ────────────────────────────────────────────────────────────────

export async function pushHdvPricesToServer(server: string, data: Record<string, PriceData>): Promise<void> {
  const payloads: ConsolidatedPricePayload[] = [];

  for (const [itemId, pd] of Object.entries(data)) {
    // On n'envoie qu'un lot s'il a un prix strictement supérieur à 0 OU s'il a
    // été explicitement mis à 0 par l'utilisateur (manualZeroLots) : un 0 explicite
    // est une décision volontaire (effacement manuel) à persister en base, alors
    // qu'un 0 non marqué (scan incomplet) signifie "lot inconnu" et ne doit pas
    // écraser la donnée existante.
    const explicitZeros = pd.manualZeroLots ?? {};
    if ((pd.x1 > 0) || explicitZeros.x1) payloads.push({ server_name: server, category: 'hdv', item_key: itemId, lot: 'x1', price: pd.x1 });
    if ((pd.x10 > 0) || explicitZeros.x10) payloads.push({ server_name: server, category: 'hdv', item_key: itemId, lot: 'x10', price: pd.x10 });
    if ((pd.x100 > 0) || explicitZeros.x100) payloads.push({ server_name: server, category: 'hdv', item_key: itemId, lot: 'x100', price: pd.x100 });
    if ((pd.x1000 > 0) || explicitZeros.x1000) payloads.push({ server_name: server, category: 'hdv', item_key: itemId, lot: 'x1000', price: pd.x1000 });
  }

  if (payloads.length === 0) {
    console.log(`[Sync] ℹ️ Aucun lot à synchroniser (${Object.keys(data).length} item(s) traités).`);
    return;
  }

  await batchUpsertPrices(payloads);
}

export async function fetchHdvPricesFromServer(server: string): Promise<Record<string, PriceData> | null> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price, lot, author_id, updated_at, profiles!author_id(pseudo)')
    .eq('server_name', server)
    .eq('category', 'hdv');

  if (error) {
    console.warn('[Sync] ❌ fetchHdvPrices error:', error.message);
    return null;
  }

  console.log(`[Supabase Fetch] ${data?.length ?? 0} ligne(s) reçues de la DB.`);

  const prices: Record<string, PriceData> = {};
  for (const row of data ?? []) {
    const id = row.item_key;
    if (!prices[id]) prices[id] = {
      x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0,
      author: null, authorId: null, updatedAt: null,
      manualZeroLots: {}, lotUpdatedAt: {},
    };
    const lot = row.lot;
    // Un lot dont la ligne existe en base avec price = 0 est une décision
    // EXPLICITE de l'utilisateur (effacement manuel) : on le marque pour que la
    // fusion distante l'accepte au lieu de le traiter comme "lot inconnu".
    if (lot === 'x1') { prices[id].x1 = row.price; if (row.price === 0) prices[id].manualZeroLots!.x1 = true; }
    else if (lot === 'x10') { prices[id].x10 = row.price; if (row.price === 0) prices[id].manualZeroLots!.x10 = true; }
    else if (lot === 'x100') { prices[id].x100 = row.price; if (row.price === 0) prices[id].manualZeroLots!.x100 = true; }
    else if (lot === 'x1000') { prices[id].x1000 = row.price; if (row.price === 0) prices[id].manualZeroLots!.x1000 = true; }
    if ((row as any).profiles?.pseudo) prices[id].author = (row as any).profiles.pseudo;
    if (row.author_id) prices[id].authorId = row.author_id;
    // Horodatage par lot (1 ligne par lot par item en base) : sert de comparatif
    // de fraîcheur dans la fusion (applyRemotePrice).
    if (lot === 'x1' || lot === 'x10' || lot === 'x100' || lot === 'x1000') {
      if (row.updated_at) prices[id].lotUpdatedAt![lot as 'x1' | 'x10' | 'x100' | 'x1000'] = row.updated_at;
    }
    // updatedAt = timestamp le PLUS RÉCENT parmi les lignes du lot (une ligne obsolète ne
    // doit jamais rétrograder la fraîcheur de l'entrée).
    if (row.updated_at) {
      const t = new Date(row.updated_at).getTime();
      const cur = prices[id].updatedAt ? new Date(prices[id].updatedAt).getTime() : 0;
      if (t > cur) prices[id].updatedAt = row.updated_at;
    }
  }

  for (const id of Object.keys(prices)) {
    const p = prices[id];
    let sum = 0, count = 0;
    if (p.x1 > 0) { sum += p.x1; count++; }
    if (p.x10 > 0) { sum += p.x10 / 10; count++; }
    if (p.x100 > 0) { sum += p.x100 / 100; count++; }
    if (p.x1000 > 0) { sum += p.x1000 / 1000; count++; }
    p.unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  }

  return prices;
}

export async function fetchHdvPricesWithAuthor(server: string): Promise<Record<string, { x1: number; x10: number; x100: number; x1000: number; unitAverage: number; author: string | null; authorId: string | null; updatedAt: string | null }>> {
  const result = await fetchHdvPricesFromServer(server);
  return result ?? {};
}

// ─── Coefficient de brisage ────────────────────────────────────────

export async function fetchItemCoefficient(server: string, itemKey: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('item_coefficients')
    .select('coefficient')
    .eq('server_name', server)
    .eq('item_key', itemKey)
    .maybeSingle();

  if (error) {
    console.warn('[Sync] ❌ fetchItemCoefficient error:', error.message);
    return null;
  }

  // Migration 100 % → non renseigné (ancienne valeur par défaut du simulateur).
  if (data?.coefficient !== null && data?.coefficient !== undefined && data.coefficient !== 100 && data.coefficient > 0) {
    return data.coefficient;
  }
  return null;
}

/**
 * Récupère tous les coefficients de brisage du serveur en une requête,
 * indexés par itemKey. Utilisé pour l'estimation de rentabilité de la liste.
 */
export async function fetchAllItemCoefficients(server: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('item_coefficients')
    .select('item_key, coefficient')
    .eq('server_name', server);

  if (error) {
    console.warn('[Sync] ❌ fetchAllItemCoefficients error:', error.message);
    return {};
  }

  const coefficients: Record<string, number> = {};
  for (const row of data ?? []) {
    // Migration 100 % → non renseigné : 100 % était l'ancienne valeur par défaut
    // affichée par le simulateur (et jamais un vrai coefficient saisi), on l'ignore.
    if (row.coefficient > 0 && row.coefficient !== 100) coefficients[row.item_key] = row.coefficient;
  }
  return coefficients;
}

export async function pushItemCoefficient(server: string, itemKey: string, coefficient: number): Promise<void> {
  // 100 % est l'ancienne valeur par défaut du simulateur (jamais un vrai coefficient
  // saisi) → on ne l'enregistre pas, pour préserver la migration vers « non renseigné ».
  if (!coefficient || coefficient <= 0 || coefficient === 100) {
    console.warn(`[Sync] ⚠️ Upsert ignoré pour "${itemKey}": coefficient invalide (${coefficient})`);
    return;
  }

  const { error } = await supabase
    .from('item_coefficients')
    .upsert({
      server_name: server,
      item_key: itemKey,
      coefficient,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error(`[Sync] ❌ Error upsert item_coefficients pour "${itemKey}" (${server}):`, error.message);
  } else {
    console.log(`[Sync] 📤 Coefficient sauvegardé: server="${server}", itemKey="${itemKey}", coefficient=${coefficient}`);
  }
}

/**
 * Supprime un coefficient enregistré (saisie vidée par l'utilisateur).
 * Permet de repasser l'item à « non renseigné » sur tous les appareils.
 */
export async function deleteItemCoefficient(server: string, itemKey: string): Promise<void> {
  const { error } = await supabase
    .from('item_coefficients')
    .delete()
    .eq('server_name', server)
    .eq('item_key', itemKey);

  if (error) {
    console.error(`[Sync] ❌ Error delete item_coefficients pour "${itemKey}" (${server}):`, error.message);
  } else {
    console.log(`[Sync] 🗑️ Coefficient supprimé: server="${server}", itemKey="${itemKey}"`);
  }
}

// ─── Volume de ventes mensuel ─────────────────────────────────────

export async function pushMonthlySalesVolumeToServer(server: string, data: Record<string, number>): Promise<void> {
  const payloads = Object.entries(data)
    .filter(([, volume]) => volume > 0)
    .map(([itemKey, volume]) => ({ server_name: server, item_key: itemKey, volume }));

  if (payloads.length === 0) {
    console.log('[Sync] ℹ️ Aucun volume de ventes > 0 à synchroniser.');
    return;
  }

  const { error } = await supabase.rpc('upsert_monthly_sales_volumes', { p_volumes: payloads });
  if (error) {
    console.error(`[Sync] ❌ Error upsert_monthly_sales_volumes (${payloads.length} lignes):`, error.message);
  } else {
    console.log(`[Sync] 📤 Batch Supabase réussi : ${payloads.length} volumes synchronisés.`);
  }
}

export async function fetchMonthlySalesVolumeFromServer(server: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from('item_monthly_sales_volume')
    .select('item_key, volume')
    .eq('server_name', server);

  if (error) {
    console.warn('[Sync] ❌ fetchMonthlySalesVolume error:', error.message);
    return null;
  }

  const volumes: Record<string, number> = {};
  for (const row of data ?? []) {
    volumes[row.item_key] = row.volume;
  }
  return volumes;
}

// ─── Statistiques utilisateur ────────────────────────────────

export interface UserStats {
  pricesCount: number;
}

export async function fetchUserStats(userId: string): Promise<UserStats | null> {
  const { data, error } = await supabase.rpc('get_user_stats', { p_user_id: userId });
  if (error) { console.warn('[Sync] ❌ fetchUserStats error:', error.message); return null; }
  if (!data || data.length === 0) return { pricesCount: 0 };
  return { pricesCount: Number(data[0].prices_count) };
}
