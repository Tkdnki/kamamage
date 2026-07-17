import { supabase } from './supabaseClient';
import type { PriceData } from '../context/DofusContext';

// ─── Lecture des prix consolidés (public) ──────────────────────────────

export async function fetchConsolidatedPrices(server: string, category: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price')
    .eq('server_name', server)
    .eq('category', category);

  if (error) {
    console.warn('[Sync] fetchConsolidatedPrices error:', error.message);
    return null;
  }

  const prices: Record<string, number> = {};
  for (const row of data ?? []) {
    prices[row.item_key] = row.price;
  }
  return prices;
}

// ─── Runes (lecture via consolidated_prices, écriture via price_submissions) ──

export async function fetchRunePricesFromServer(server: string): Promise<Record<string, number> | null> {
  return fetchConsolidatedPrices(server, 'rune');
}

// Stub de compatibilité : l'écriture passe désormais par price_submissions (voir PriceSubmitForm)
export async function pushRunePricesToServer(_server: string, _data: Record<string, number>): Promise<void> {
  // Remplacé par le système de soumission collaborative
}

// ─── HDV ─────────────────────────────────────────────────────────────────────

export async function pushHdvPricesToServer(_server: string, _data: Record<string, PriceData>): Promise<void> {
  // Remplacé par le système de soumission collaborative
}

export async function fetchHdvPricesFromServer(server: string): Promise<Record<string, PriceData> | null> {
  const { data, error } = await supabase
    .from('consolidated_prices')
    .select('item_key, price, lot')
    .eq('server_name', server)
    .eq('category', 'hdv');

  if (error) {
    console.warn('[Sync] fetchHdvPrices error:', error.message);
    return null;
  }

  const prices: Record<string, PriceData> = {};
  for (const row of data ?? []) {
    const id = row.item_key;
    if (!prices[id]) prices[id] = { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0 };
    if (row.lot === 'x1') prices[id].x1 = row.price;
    else if (row.lot === 'x10') prices[id].x10 = row.price;
    else if (row.lot === 'x100') prices[id].x100 = row.price;
    else if (row.lot === 'x1000') prices[id].x1000 = row.price;
  }

  // Recalculer unitAverage
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
