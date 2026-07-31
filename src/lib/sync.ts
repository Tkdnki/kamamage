import { supabase } from './supabaseClient';
import type { PriceData } from '../context/DofusContext';

// ─── RPC upsert (contourne RLS via SECURITY DEFINER) ────────────────────

async function upsertPrice(server: string, category: string, itemKey: string, lot: string | null, price: number) {
  if (!price || price <= 0) {
    console.warn(`[Sync] ⚠️ Upsert ignoré pour "${itemKey}" (lot ${lot ?? 'aucun'}): prix invalide (${price})`);
    return;
  }
  const { data, error } = await supabase.rpc('upsert_consolidated_price', {
    p_server_name: server,
    p_category: category,
    p_item_key: itemKey,
    p_lot: lot,
    p_price: price,
  });
  if (error) {
    console.error(`[Sync] ❌ Error upsert_consolidated_price pour "${itemKey}" (${lot ?? 'x1'}):`, error.message);
  } else {
    console.log(`[Sync] 📤 Supabase upsert réussi: server="${server}", category="${category}", itemKey="${itemKey}", lot="${lot ?? 'x1'}", price=${price}K`, data);
  }
}

// ─── Runes ──────────────────────────────────────────────────────────────

export async function pushRunePricesToServer(server: string, data: Record<string, number>): Promise<void> {
  console.log(`[Sync] 🚀 Envoi de ${Object.keys(data).length} prix de runes vers Supabase (${server})...`);
  await Promise.all(
    Object.entries(data).map(([itemKey, price]) =>
      upsertPrice(server, 'rune', itemKey, null, price)
    )
  );
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
  console.log(`[Sync] 🚀 Synchronisation HDV vers Supabase (Serveur: "${server}"). ${Object.keys(data).length} item(s) à traiter.`);

  await Promise.all(
    Object.entries(data).flatMap(([itemId, pd]) => {
      const lots: { lot: string; price: number }[] = [];
      // Règle n°2 : Ne filtrer et n'envoyer QUE les lots ayant un prix strictement supérieur à 0.
      // Pour un équipement (seul x1 > 0), les lots x10, x100, x1000 valant 0 NE SERONT PAS envoyés.
      if (pd.x1 && pd.x1 > 0) lots.push({ lot: 'x1', price: pd.x1 });
      if (pd.x10 && pd.x10 > 0) lots.push({ lot: 'x10', price: pd.x10 });
      if (pd.x100 && pd.x100 > 0) lots.push({ lot: 'x100', price: pd.x100 });
      if (pd.x1000 && pd.x1000 > 0) lots.push({ lot: 'x1000', price: pd.x1000 });

      if (lots.length === 0) {
        console.log(`[Sync] ℹ️ Aucun lot > 0 pour itemKey="${itemId}" - aucun upsert envoyé à Supabase.`);
        return [];
      }

      console.log(`[Sync] 📦 Envoi Supabase pour itemKey="${itemId}":`, lots.map(l => `${l.lot}=${l.price}K`).join(', '));
      return lots.map(l => upsertPrice(server, 'hdv', itemId, l.lot, l.price));
    })
  );
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

  const prices: Record<string, PriceData> = {};
  for (const row of data ?? []) {
    const id = row.item_key;
    if (!prices[id]) prices[id] = { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0, author: null, authorId: null, updatedAt: null };
    if (row.lot === 'x1') prices[id].x1 = row.price;
    else if (row.lot === 'x10') prices[id].x10 = row.price;
    else if (row.lot === 'x100') prices[id].x100 = row.price;
    else if (row.lot === 'x1000') prices[id].x1000 = row.price;
    if ((row as any).profiles?.pseudo) prices[id].author = (row as any).profiles.pseudo;
    if (row.author_id) prices[id].authorId = row.author_id;
    if (row.updated_at) prices[id].updatedAt = row.updated_at;
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

  return data?.coefficient ?? null;
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
    if (row.coefficient > 0) coefficients[row.item_key] = row.coefficient;
  }
  return coefficients;
}

export async function pushItemCoefficient(server: string, itemKey: string, coefficient: number): Promise<void> {
  if (!coefficient || coefficient <= 0) {
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

// ─── Volume de ventes mensuel ─────────────────────────────────────

export async function pushMonthlySalesVolumeToServer(server: string, data: Record<string, number>): Promise<void> {
  console.log(`[Sync] 🚀 Envoi du volume mensuel de ventes vers Supabase (${server})...`);
  await Promise.all(
    Object.entries(data).map(([itemKey, volume]) =>
      supabase.rpc('upsert_monthly_sales_volume', {
        p_server_name: server,
        p_item_key: itemKey,
        p_volume: volume,
      })
    )
  );
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
