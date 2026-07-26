import { createContext, useContext, useEffect, useRef, useMemo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import type { DofusItem } from '../data/mockData';
import { useServer } from './ServerContext';
import { useAuth } from './AuthContext';
import { pushHdvPricesToServer, fetchHdvPricesFromServer, pushMonthlySalesVolumeToServer, fetchMonthlySalesVolumeFromServer, fetchVoteCounts, toggleConsolidatedVote } from '../lib/sync';
import type { VoteCounts } from '../lib/sync';

export interface PriceData {
  x1: number;
  x10: number;
  x100: number;
  x1000: number;
  unitAverage: number;
  author?: string | null;
  authorId?: string | null;
  monthlySalesVolume?: number;
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
  votes: VoteCounts;
  toggleVote: (itemKey: string, vote: 'up' | 'down') => void;
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

export function DofusProvider({ children }: { children: ReactNode }) {
  const { selectedServer } = useServer();
  const storageKey = `hdvPrices_${selectedServer.toLowerCase().replace(/[\s']/g, '_')}`;

  const [trackedItemIds, setTrackedItemIds] = useLocalStorage<string[]>('kamamage_tracked_items', [
    'ing_ble', 'ing_frene', 'ing_fer', 'ing_laine_bouftou'
  ]);
  const [customItems, setCustomItems] = useLocalStorage<DofusItem[]>('kamamage_custom_items', []);

  // hdvPrices est un état local, initialisé depuis le cache localStorage
  const [hdvPrices, setHdvPrices] = useState<HdvPrices>(() => loadCache(storageKey));

  // Votes sur les prix consolidés
  const [votes, setVotes] = useState<VoteCounts>({});

  // Persiste dans localStorage à chaque changement
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    saveCache(storageKey, hdvPrices);
  }, [hdvPrices, storageKey]);

  // Au montage / changement de serveur : on tente de récupérer depuis Supabase
  // (les données distantes écrasent le cache local — communauté d'abord)
  const serverRef = useRef(selectedServer);
  useEffect(() => {
    serverRef.current = selectedServer;
    let cancelled = false;

    const loadFromServer = async () => {
      const [remote, remoteVolumes, remoteVotes] = await Promise.all([
        fetchHdvPricesFromServer(selectedServer),
        fetchMonthlySalesVolumeFromServer(selectedServer),
        fetchVoteCounts(selectedServer),
      ]);

      if (cancelled) return;

      if (remote && Object.keys(remote).length > 0) {
        setHdvPrices(prev => {
          const merged = { ...prev };
          for (const [key, val] of Object.entries(remote)) {
            merged[key] = { ...merged[key], ...val, author: val.author ?? merged[key]?.author };
          }
          if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
          return merged;
        });
      }

      if (remoteVolumes && Object.keys(remoteVolumes).length > 0) {
        setHdvPrices(prev => {
          let changed = false;
          const merged = { ...prev };
          for (const [key, volume] of Object.entries(remoteVolumes)) {
            if (merged[key]?.monthlySalesVolume !== volume) {
              changed = true;
              merged[key] = { ...merged[key], monthlySalesVolume: volume };
            }
          }
          return changed ? merged : prev;
        });
      }

      if (remoteVotes && Object.keys(remoteVotes).length > 0) {
        setVotes(remoteVotes);
      }
    };

    loadFromServer();
    return () => { cancelled = true; };
  }, [selectedServer]);

  const { user, refreshUserStats } = useAuth();

  const statsRefreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedRefreshStats = useCallback(() => {
    if (statsRefreshTimer.current) clearTimeout(statsRefreshTimer.current);
    statsRefreshTimer.current = setTimeout(() => refreshUserStats(), 2000);
  }, [refreshUserStats]);

  // Sauvegarde : push immédiat à Supabase + update local
  const pendingPush = useRef<Record<string, PriceData>>({});
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();
  const flushPending = useCallback(() => {
    const data = { ...pendingPush.current };
    pendingPush.current = {};
    if (Object.keys(data).length > 0) {
      pushHdvPricesToServer(selectedServer, data);
      debouncedRefreshStats();
    }
  }, [selectedServer, debouncedRefreshStats]);

  const toggleVote = useCallback((itemKey: string, vote: 'up' | 'down') => {
    setVotes(prev => {
      const current = prev[itemKey];
      const myVote = current?.myVote;
      let newUp = current?.up ?? 0;
      let newDown = current?.down ?? 0;

      if (myVote === vote) {
        if (vote === 'up') newUp--;
        else newDown--;
        return { ...prev, [itemKey]: { up: newUp, down: newDown, myVote: null } };
      }

      if (myVote === 'up') newUp--;
      else if (myVote === 'down') newDown--;

      if (vote === 'up') newUp++;
      else newDown++;

      return { ...prev, [itemKey]: { up: newUp, down: newDown, myVote: vote } };
    });
    toggleConsolidatedVote(itemKey, selectedServer, vote);
    debouncedRefreshStats();
  }, [selectedServer, debouncedRefreshStats]);

  const setHdvPrice = useCallback((itemId: string, x1: number, x10: number, x100: number, x1000: number) => {
    if (!user) return;
    let sum = 0;
    let count = 0;
    if (x1 > 0) { sum += x1; count++; }
    if (x10 > 0) { sum += x10 / 10; count++; }
    if (x100 > 0) { sum += x100 / 100; count++; }
    if (x1000 > 0) { sum += x1000 / 1000; count++; }
    const unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
    const entry: PriceData = { x1, x10, x100, x1000, unitAverage };

    // Mise à jour locale immédiate
    setHdvPrices(prev => ({ ...prev, [itemId]: entry }));

    // Push à Supabase (debounced 1s pour grouper les changements rapides)
    pendingPush.current[itemId] = entry;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(flushPending, 1000);
  }, [flushPending]);

  // Volume de ventes mensuel — même pattern debounced
  const pendingVolumePush = useRef<Record<string, number>>({});
  const volumePushTimer = useRef<ReturnType<typeof setTimeout>>();
  const flushVolumePending = useCallback(() => {
    const data = { ...pendingVolumePush.current };
    pendingVolumePush.current = {};
    if (Object.keys(data).length > 0) {
      pushMonthlySalesVolumeToServer(selectedServer, data);
      debouncedRefreshStats();
    }
  }, [selectedServer, debouncedRefreshStats]);

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
  }, [flushVolumePending]);

  // Ménage des timers au démontage
  useEffect(() => {
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      flushPending();
      if (volumePushTimer.current) clearTimeout(volumePushTimer.current);
      flushVolumePending();
      if (statsRefreshTimer.current) clearTimeout(statsRefreshTimer.current);
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
      votes,
      toggleVote,
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
