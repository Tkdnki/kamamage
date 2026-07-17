import { supabase } from './supabaseClient';
import type { PriceData } from '../context/DofusContext';

// ─── Runes ───────────────────────────────────────────────────────────────────

export async function pushRunePricesToServer(server: string, data: Record<string, number>): Promise<void> {
  const rows = Object.entries(data).map(([itemKey, price]) => ({
    server_name: server,
    category: 'rune',
    item_key: itemKey,
    price,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('kama_prices').upsert(rows, {
    onConflict: 'server_name,category,item_key',
  });
  if (error) console.warn('[Sync] pushRunePrices error:', error.message);
}

export async function fetchRunePricesFromServer(server: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from('kama_prices')
    .select('item_key, price')
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

// ─── HDV ─────────────────────────────────────────────────────────────────────

export async function pushHdvPricesToServer(server: string, data: Record<string, PriceData>): Promise<void> {
  const rows = Object.entries(data).map(([itemId, pd]) => ({
    server_name: server,
    item_id: itemId,
    price_x1: pd.x1,
    price_x10: pd.x10,
    price_x100: pd.x100,
    price_x1000: pd.x1000,
    unit_average: pd.unitAverage,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('kama_hdv_prices').upsert(rows, {
    onConflict: 'server_name,item_id',
  });
  if (error) console.warn('[Sync] pushHdvPrices error:', error.message);
}

export async function fetchHdvPricesFromServer(server: string): Promise<Record<string, PriceData> | null> {
  const { data, error } = await supabase
    .from('kama_hdv_prices')
    .select('item_id, price_x1, price_x10, price_x100, price_x1000, unit_average')
    .eq('server_name', server);

  if (error) {
    console.warn('[Sync] fetchHdvPrices error:', error.message);
    return null;
  }

  const prices: Record<string, PriceData> = {};
  for (const row of data ?? []) {
    prices[row.item_id] = {
      x1: row.price_x1,
      x10: row.price_x10,
      x100: row.price_x100,
      x1000: row.price_x1000,
      unitAverage: row.unit_average,
    };
  }
  return prices;
}
