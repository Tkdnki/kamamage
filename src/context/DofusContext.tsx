import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import type { DofusItem } from '../data/mockData';
import { useServer } from './ServerContext';
import { useAuth } from './AuthContext';
import { pushHdvPricesToServer, fetchHdvPricesFromServer, pushMonthlySalesVolumeToServer, fetchMonthlySalesVolumeFromServer } from '../lib/sync';

export interface PriceData {
  x1: number;
  x10: number;
  x100: number;
  x1000: number;
  unitAverage: number;
  author?: string | null;
  authorId?: string | null;
  monthlySalesVolume?: number;
  updatedAt?: string | null;
}

export interface HdvPrices {
  [itemId: string]: PriceData;
}

interface DofusContextType {
  hdvPrices: HdvPrices;
  trackedItemIds: string[];
  customItems: DofusItem[];
  setHdvPrice: (itemId: string, x1: number, x10: number, x100: number, x1000: number) => void;
  setMonthlySalesVolume: (itemId: string, volume: number) => void;
  trackItem: (item: DofusItem) => void;
  untrackItem: (itemId: string) => void;
  getItemById: (itemId: string) => DofusItem | undefined;
  getItemPriceInfo: (itemId: string) => { price: number; isMissing: boolean };
}

const DofusContext = createContext<DofusContextType | undefined>(undefined);

function loadCache(storageKey: string): HdvPrices {
  try {
    const item = window.localStorage.getItem(storageKey);
    return item ? JSON.parse(item) : {};
  } catch {
    return {};
  }
}

function saveCache(storageKey: string, prices: HdvPrices) {
  window.localStorage.setItem(storageKey, JSON.stringify(prices));
}

/** Intervalle de rafraîchissement des prix en arrière-plan (ms). */
const PRICE_POLL_INTERVAL_MS = 30000;

/**
 * Fusionne une valeur distante dans un objet de prix (muté en place).
 * - L'utilisateur n'a pas l'item en local → on prend la valeur distante.
 * - La valeur distante est strictement plus récente (updatedAt) → elle prime sur les lots
 *   qu'elle connaît, MAIS un lot distant à 0/absent (pas de ligne en base) ne peut JAMAIS
 *   écraser une valeur locale connue : la base ne stocke que les lots > 0, donc un 0
 *   distant signifie "lot inconnu", pas "prix volontairement à 0".
 * - Sinon on conserve les lots locaux et on comble les trous avec le distant.
 * @returns true si l'objet a été modifié.
 */
function applyRemotePrice(merged: HdvPrices, key: string, val: PriceData): boolean {
  const local = merged[key];
  if (!local) {
    merged[key] = val;
    return true;
  }

  const remoteIsNewer =
    !!val.updatedAt && (local.updatedAt ? new Date(val.updatedAt) > new Date(local.updatedAt) : true);

  // Fusion lot par lot (non destructif) : la donnée la plus pertinente gagne, mais un lot
  // distant absent (0) ne supprime jamais un prix local déjà renseigné.
  const pickLot = (loc: number, rem: number): number => {
    if (remoteIsNewer) return rem > 0 ? rem : loc;
    return loc > 0 ? loc : rem;
  };

  const before = JSON.stringify(merged[key]);
  const mergedEntry: PriceData = {
    x1: pickLot(local.x1, val.x1),
    x10: pickLot(local.x10, val.x10),
    x100: pickLot(local.x100, val.x100),
    x1000: pickLot(local.x1000, val.x1000),
    unitAverage: 0,
    author: remoteIsNewer ? (val.author ?? local.author ?? null) : (local.author ?? val.author ?? null),
    authorId: remoteIsNewer ? (val.authorId ?? local.authorId ?? null) : (local.authorId ?? val.authorId ?? null),
    updatedAt: remoteIsNewer
      ? (val.updatedAt ?? local.updatedAt ?? null)
      : (local.updatedAt ?? val.updatedAt ?? null),
    monthlySalesVolume: local.monthlySalesVolume ?? val.monthlySalesVolume,
  };
  // Recalcule le prix moyen unitaire à partir des lots fusionnés pour rester cohérent.
  let sum = 0;
  let count = 0;
  if (mergedEntry.x1 > 0) { sum += mergedEntry.x1; count++; }
  if (mergedEntry.x10 > 0) { sum += mergedEntry.x10 / 10; count++; }
  if (mergedEntry.x100 > 0) { sum += mergedEntry.x100 / 100; count++; }
  if (mergedEntry.x1000 > 0) { sum += mergedEntry.x1000 / 1000; count++; }
  mergedEntry.unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;

  merged[key] = mergedEntry;
  return before !== JSON.stringify(merged[key]);
}

export function DofusProvider({ children }: { children: ReactNode }) {
  const { selectedServer } = useServer();
  const storageKey = `hdvPrices_${selectedServer.toLowerCase().replace(/[\s']/g, '_')}`;
  const syncedStorageKey = `kamamage_synced_hdv_${selectedServer.toLowerCase().replace(/[\s']/g, '_')}`;

  const [trackedItemIds, setTrackedItemIds] = useLocalStorage<string[]>('kamamage_tracked_items', [
    'ing_ble', 'ing_frene', '312', 'ing_laine_bouftou'
  ]);
  const [customItems, setCustomItems] = useLocalStorage<DofusItem[]>('kamamage_custom_items', []);

  // hdvPrices est un état local, initialisé depuis le cache localStorage
  const [hdvPrices, setHdvPrices] = useState<HdvPrices>(() => loadCache(storageKey));

  // Clés des items déjà synchronisés vers Supabase (persistées par serveur).
  // Permet au re-sync (login) de ne pousser QUE les items réellement non sync
  // au lieu de renvoyer tout le cache localStorage à chaque connexion.
  const syncedKeysRef = useRef<Set<string>>((() => {
    try {
      const raw = window.localStorage.getItem(syncedStorageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  })());

  const persistSyncedKeys = useCallback(() => {
    try {
      window.localStorage.setItem(syncedStorageKey, JSON.stringify([...syncedKeysRef.current]));
    } catch {
      // ignore localStorage errors
    }
  }, [syncedStorageKey]);

  const markSynced = useCallback((keys: string[]) => {
    for (const k of keys) syncedKeysRef.current.add(k);
    persistSyncedKeys();
  }, [persistSyncedKeys]);

  // Persiste dans localStorage à chaque changement
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    saveCache(storageKey, hdvPrices);
  }, [hdvPrices, storageKey]);

  // Au montage / changement de serveur : on tente de récupérer depuis Supabase
  // (les données locales utilisateur prennent priorité sur les données distantes)
  const serverRef = useRef(selectedServer);
  useEffect(() => {
    serverRef.current = selectedServer;
    // On recharge l'ensemble "synced" propre au nouveau serveur.
    syncedKeysRef.current = new Set<string>();
    try {
      const raw = window.localStorage.getItem(syncedStorageKey);
      if (raw) syncedKeysRef.current = new Set(JSON.parse(raw) as string[]);
    } catch {
      // ignore localStorage errors
    }
    let cancelled = false;

    const mergeVolumes = (prev: HdvPrices, remoteVolumes: Record<string, number>) => {
      let changed = false;
      const merged = { ...prev };
      for (const [key, volume] of Object.entries(remoteVolumes)) {
        if (merged[key]?.monthlySalesVolume !== volume) {
          changed = true;
          merged[key] = { ...merged[key], monthlySalesVolume: volume };
        }
      }
      return changed ? merged : prev;
    };

    const loadFromServer = async () => {
      const [remote, remoteVolumes] = await Promise.all([
        fetchHdvPricesFromServer(selectedServer),
        fetchMonthlySalesVolumeFromServer(selectedServer),
      ]);

      if (cancelled) return;

      if (remote && Object.keys(remote).length > 0) {
        setHdvPrices(prev => {
          const merged = { ...prev };
          let changed = false;
          for (const [key, val] of Object.entries(remote)) {
            changed = applyRemotePrice(merged, key, val) || changed;
          }
          return changed ? merged : prev;
        });
      }

      if (remoteVolumes && Object.keys(remoteVolumes).length > 0) {
        setHdvPrices(prev => mergeVolumes(prev, remoteVolumes));
      }
    };

    loadFromServer();
    return () => { cancelled = true; };
  }, [selectedServer, syncedStorageKey]);

  // Rafraîchissement automatique des prix en arrière-plan : les prix distants
  // (Supabase) alimentent le state global de manière réactive sans attendre un
  // focus utilisateur ni un refetch manuel. Le tri du brisage se met à jour seul.
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const remote = await fetchHdvPricesFromServer(selectedServer);
      if (cancelled || !remote || Object.keys(remote).length === 0) return;
      setHdvPrices(prev => {
        const merged = { ...prev };
        let changed = false;
        for (const [key, val] of Object.entries(remote)) {
          changed = applyRemotePrice(merged, key, val) || changed;
        }
        if (changed) {
          console.log(`[Supabase Poll] ${Object.keys(remote).length} item(s) reçus, ${Object.keys(merged).length} item(s) en état local après fusion`);
        }
        return changed ? merged : prev;
      });
    };

    poll();
    const intervalId = setInterval(poll, PRICE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [selectedServer]);

  const { user } = useAuth();

  // Re-sync : quand un utilisateur se connecte, pousser UNIQUEMENT les prix
  // localStorage qui n'ont jamais été sync (ex: scan fait hors-ligne, ou onglet
  // fermé avant le flush). Les items déjà marqués "synced" ne sont PAS renvoyés.
  useEffect(() => {
    if (!user) return;
    const localCache = loadCache(storageKey);
    const toPush: HdvPrices = {};
    for (const [key, val] of Object.entries(localCache)) {
      if (!syncedKeysRef.current.has(key)) toPush[key] = val;
    }
    const keys = Object.keys(toPush);
    if (keys.length === 0) return;
    pushHdvPricesToServer(selectedServer, toPush)
      .then(() => markSynced(keys))
      .catch(() => {});
  }, [user, selectedServer, storageKey, markSynced]);

  // Sauvegarde : push immédiat à Supabase + update local
  const pendingPush = useRef<Record<string, PriceData>>({});
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();
  const flushPending = useCallback(() => {
    const data = { ...pendingPush.current };
    pendingPush.current = {};
    const keys = Object.keys(data);
    if (keys.length > 0) {
      pushHdvPricesToServer(selectedServer, data)
        .then(() => markSynced(keys))
        .catch(() => {});
    }
  }, [selectedServer, markSynced]);

  const setHdvPrice = useCallback((itemId: string, x1: number, x10: number, x100: number, x1000: number) => {
    if (!user) return;
    let sum = 0;
    let count = 0;
    if (x1 > 0) { sum += x1; count++; }
    if (x10 > 0) { sum += x10 / 10; count++; }
    if (x100 > 0) { sum += x100 / 100; count++; }
    if (x1000 > 0) { sum += x1000 / 1000; count++; }
    const unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
    const entry: PriceData = { x1, x10, x100, x1000, unitAverage, updatedAt: new Date().toISOString() };

    // Item modifié → à re-synchroniser (retiré de l'ensemble "synced")
    syncedKeysRef.current.delete(itemId);
    persistSyncedKeys();

    // Mise à jour locale immédiate
    setHdvPrices(prev => ({ ...prev, [itemId]: entry }));

    // Push à Supabase (debounced 1s pour grouper les changements rapides)
    pendingPush.current[itemId] = entry;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(flushPending, 1000);
  }, [user, flushPending, persistSyncedKeys]);

  // Volume de ventes mensuel — même pattern debounced
  const pendingVolumePush = useRef<Record<string, number>>({});
  const volumePushTimer = useRef<ReturnType<typeof setTimeout>>();
  const flushVolumePending = useCallback(() => {
    const data = { ...pendingVolumePush.current };
    pendingVolumePush.current = {};
    if (Object.keys(data).length > 0) {
      pushMonthlySalesVolumeToServer(selectedServer, data);
    }
  }, [selectedServer]);

  const setMonthlySalesVolume = useCallback((itemId: string, volume: number) => {
    if (!user) return;
    setHdvPrices(prev => {
      const current = prev[itemId];
      const updated: PriceData = current
        ? { ...current, monthlySalesVolume: volume }
        : { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0, monthlySalesVolume: volume };
      return { ...prev, [itemId]: updated };
    });

    // Push à Supabase (debounced)
    pendingVolumePush.current[itemId] = volume;
    if (volumePushTimer.current) clearTimeout(volumePushTimer.current);
    volumePushTimer.current = setTimeout(flushVolumePending, 1000);
  }, [user, flushVolumePending]);

  // Ménage des timers au démontage
  useEffect(() => {
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      flushPending();
      if (volumePushTimer.current) clearTimeout(volumePushTimer.current);
      flushVolumePending();
    };
  }, [flushPending, flushVolumePending]);

  const trackItem = useCallback((item: DofusItem) => {
    if (!trackedItemIds.includes(item._id)) {
      setTrackedItemIds(prev => [...prev, item._id]);
    }
    const isMock = DOFUS_MOCK_ITEMS.some(mockItem => mockItem._id === item._id);
    if (!isMock && !customItems.some(cItem => cItem._id === item._id)) {
      setCustomItems(prev => [...prev, item]);
    }
  }, [trackedItemIds, customItems]);

  const untrackItem = useCallback((itemId: string) => {
    setTrackedItemIds(prev => prev.filter(id => id !== itemId));
  }, []);

  const getItemById = useCallback((itemId: string): DofusItem | undefined => {
    const mock = DOFUS_MOCK_ITEMS.find(item => item._id === itemId);
    if (mock) return mock;
    return customItems.find(item => item._id === itemId);
  }, [customItems]);

  const getItemPriceInfo = useCallback((itemId: string) => {
    const priceData = hdvPrices[itemId];
    if (priceData && priceData.unitAverage > 0) {
      return { price: priceData.unitAverage, isMissing: false };
    }
    return { price: 0, isMissing: true };
  }, [hdvPrices]);

  return (
    <DofusContext.Provider value={{
      hdvPrices,
      trackedItemIds,
      customItems,
      setHdvPrice,
      setMonthlySalesVolume,
      trackItem,
      untrackItem,
      getItemById,
      getItemPriceInfo
    }}>
      {children}
    </DofusContext.Provider>
  );
}

export function useDofus() {
  const context = useContext(DofusContext);
  if (context === undefined) {
    throw new Error('useDofus must be used within a DofusProvider');
  }
  return context;
}
