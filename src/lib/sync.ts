import { supabase } from './supabaseClient';
import type { PriceData } from '../context/DofusContext';

// ─── RPC upsert (contourne RLS via SECURITY DEFINER) ────────────────────

async function upsertPrice(server: string, category: string, itemKey: string, lot: string | null, price: number) {
  const { error } = await supabase.rpc('upsert_consolidated_price', {
    p_server_name: server,
    p_category: category,
    p_item_key: itemKey,
    p_lot: lot,
    p_price: price,
  });
  if (error) console.warn(`[Sync] upsert_consolidated_price error:`, error.message);
}

// ─── Runes ──────────────────────────────────────────────────────────────

export async function pushRunePricesToServer(server: string, data: Record<string, number>): Promise<void> {
  await Promise.all(
    Object.entries(data).map(([itemKey, price]) =>
      upsertPrice(server, 'rune', itemKey, null, price)
    )
  );
}

export async function fetchRunePricesFromServer(server: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price, updated_by, profiles!author_id(pseudo)')
    .eq('server_name', server)
    .eq('category', 'rune');

  if (error) {
    console.warn('[Sync] fetchRunePrices error:', error.message);
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
    console.warn('[Sync] fetchRunePricesWithAuthor error:', error.message);
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
  await Promise.all(
    Object.entries(data).flatMap(([itemId, pd]) => {
      const lots: { lot: string; price: number }[] = [];
      if (pd.x1 > 0) lots.push({ lot: 'x1', price: pd.x1 });
      if (pd.x10 > 0) lots.push({ lot: 'x10', price: pd.x10 });
      if (pd.x100 > 0) lots.push({ lot: 'x100', price: pd.x100 });
      if (pd.x1000 > 0) lots.push({ lot: 'x1000', price: pd.x1000 });
      // Lots mis à 0 : supprimer l'entrée côté serveur
      const zeroLots: { lot: string }[] = [];
      if (pd.x1 === 0) zeroLots.push({ lot: 'x1' });
      if (pd.x10 === 0) zeroLots.push({ lot: 'x10' });
      if (pd.x100 === 0) zeroLots.push({ lot: 'x100' });
      if (pd.x1000 === 0) zeroLots.push({ lot: 'x1000' });
      const deletes = zeroLots.map(l => deletePrice(server, 'hdv', itemId, l.lot));
      return [...lots.map(l => upsertPrice(server, 'hdv', itemId, l.lot, l.price)), ...deletes];
    })
  );
}

async function deletePrice(server: string, category: string, itemKey: string, lot: string | null) {
  let query = supabase
    .from('consolidated_prices')
    .delete()
    .eq('server_name', server)
    .eq('category', category)
    .eq('item_key', itemKey);
  if (lot !== null) query = query.eq('lot', lot);
  const { error } = await query;
  if (error) console.warn(`[Sync] deletePrice error:`, error.message);
}

export async function fetchHdvPricesFromServer(server: string): Promise<Record<string, PriceData> | null> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price, lot, profiles!author_id(pseudo)')
    .eq('server_name', server)
    .eq('category', 'hdv');

  if (error) {
    console.warn('[Sync] fetchHdvPrices error:', error.message);
    return null;
  }

  const prices: Record<string, PriceData> = {};
  for (const row of data ?? []) {
    const id = row.item_key;
    if (!prices[id]) prices[id] = { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0, author: null };
    if (row.lot === 'x1') prices[id].x1 = row.price;
    else if (row.lot === 'x10') prices[id].x10 = row.price;
    else if (row.lot === 'x100') prices[id].x100 = row.price;
    else if (row.lot === 'x1000') prices[id].x1000 = row.price;
    if ((row as any).profiles?.pseudo) prices[id].author = (row as any).profiles.pseudo;
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

export async function fetchHdvPricesWithAuthor(server: string): Promise<Record<string, { x1: number; x10: number; x100: number; x1000: number; unitAverage: number; author: string | null }>> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price, lot, profiles!author_id(pseudo)')
    .eq('server_name', server)
    .eq('category', 'hdv');

  if (error) {
    console.warn('[Sync] fetchHdvPricesWithAuthor error:', error.message);
    return {};
  }

  const result: Record<string, any> = {};
  for (const row of data ?? []) {
    const id = row.item_key;
    if (!result[id]) result[id] = { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0, author: null };
    if (row.lot === 'x1') result[id].x1 = row.price;
    else if (row.lot === 'x10') result[id].x10 = row.price;
    else if (row.lot === 'x100') result[id].x100 = row.price;
    else if (row.lot === 'x1000') result[id].x1000 = row.price;
    if ((row as any).profiles?.pseudo) result[id].author = (row as any).profiles.pseudo;
  }

  for (const id of Object.keys(result)) {
    const p = result[id];
    let sum = 0, count = 0;
    if (p.x1 > 0) { sum += p.x1; count++; }
    if (p.x10 > 0) { sum += p.x10 / 10; count++; }
    if (p.x100 > 0) { sum += p.x100 / 100; count++; }
    if (p.x1000 > 0) { sum += p.x1000 / 1000; count++; }
    p.unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  }

  return result;
}
