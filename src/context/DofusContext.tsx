import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import type { DofusItem } from '../data/mockData';
import { useServer } from './ServerContext';
import { pushHdvPricesToServer, fetchHdvPricesFromServer } from '../lib/sync';

export interface PriceData {
  x1: number;
  x10: number;
  x100: number;
  x1000: number;
  unitAverage: number;
  author?: string | null;
}

export interface HdvPrices {
  [itemId: string]: PriceData;
}

type PricesByServer = Record<string, HdvPrices>;

interface DofusContextType {
  hdvPrices: HdvPrices;
  trackedItemIds: string[];
  customItems: DofusItem[];
  setHdvPrice: (itemId: string, x1: number, x10: number, x100: number, x1000: number) => void;
  trackItem: (item: DofusItem) => void;
  untrackItem: (itemId: string) => void;
  getItemById: (itemId: string) => DofusItem | undefined;
  getItemPriceInfo: (itemId: string) => { price: number; isMissing: boolean };
}

const DofusContext = createContext<DofusContextType | undefined>(undefined);

export function DofusProvider({ children }: { children: ReactNode }) {
  const { selectedServer } = useServer();
  const [hdvPricesByServer, setHdvPricesByServer] = useLocalStorage<PricesByServer>('kamamage_hdv_prices', {});

  const [trackedItemIds, setTrackedItemIds] = useLocalStorage<string[]>('kamamage_tracked_items', [
    'ing_ble', 'ing_frene', 'ing_fer', 'ing_laine_bouftou'
  ]);
  const [customItems, setCustomItems] = useLocalStorage<DofusItem[]>('kamamage_custom_items', []);

  const hdvPrices: HdvPrices = hdvPricesByServer[selectedServer] ?? {};

  const setHdvPrice = (itemId: string, x1: number, x10: number, x100: number, x1000: number) => {
    let sum = 0;
    let count = 0;
    if (x1 > 0) { sum += x1; count++; }
    if (x10 > 0) { sum += x10 / 10; count++; }
    if (x100 > 0) { sum += x100 / 100; count++; }
    if (x1000 > 0) { sum += x1000 / 1000; count++; }
    const unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;

    setHdvPricesByServer(prev => {
      const serverPrices = prev[selectedServer] ?? {};
      return {
        ...prev,
        [selectedServer]: {
          ...serverPrices,
          [itemId]: { x1, x10, x100, x1000, unitAverage }
        }
      };
    });
  };

  // Debounce synchronisation HDV
  const hdvSyncRef = useRef<ReturnType<typeof setTimeout>>(null);
  const hdvPricesForSync = hdvPrices;
  useEffect(() => {
    if (hdvSyncRef.current) clearTimeout(hdvSyncRef.current);
    hdvSyncRef.current = setTimeout(() => {
      const entries = Object.entries(hdvPricesForSync);
      if (entries.length > 0) {
        pushHdvPricesToServer(selectedServer, Object.fromEntries(entries));
      }
    }, 2000);
    return () => { if (hdvSyncRef.current) clearTimeout(hdvSyncRef.current); };
  }, [hdvPricesForSync, selectedServer]);

  // Récupération HDV distante au montage / changement serveur
  useEffect(() => {
    let cancelled = false;

    // Clear local prices for the new server to prevent stale data
    setHdvPricesByServer(prev => {
      const current = prev[selectedServer];
      if (current && Object.keys(current).length > 0) {
        return { ...prev, [selectedServer]: {} };
      }
      return prev;
    });

    fetchHdvPricesFromServer(selectedServer).then(remote => {
      if (cancelled || !remote || Object.keys(remote).length === 0) return;
      setHdvPricesByServer(prev => {
        const local = prev[selectedServer] ?? {};
        const merged = { ...remote };
        for (const [key, val] of Object.entries(local)) {
          merged[key] = { ...merged[key], ...val };
          if (remote[key]?.author) merged[key].author = remote[key].author;
        }
        if (JSON.stringify(local) === JSON.stringify(merged)) return prev;
        return { ...prev, [selectedServer]: merged };
      });
    });
    return () => { cancelled = true; };
  }, [selectedServer]);

  const trackItem = (item: DofusItem) => {
    if (!trackedItemIds.includes(item._id)) {
      setTrackedItemIds(prev => [...prev, item._id]);
    }
    const isMock = DOFUS_MOCK_ITEMS.some(mockItem => mockItem._id === item._id);
    if (!isMock && !customItems.some(cItem => cItem._id === item._id)) {
      setCustomItems(prev => [...prev, item]);
    }
  };

  const untrackItem = (itemId: string) => {
    setTrackedItemIds(prev => prev.filter(id => id !== itemId));
  };

  const getItemById = (itemId: string): DofusItem | undefined => {
    const mock = DOFUS_MOCK_ITEMS.find(item => item._id === itemId);
    if (mock) return mock;
    return customItems.find(item => item._id === itemId);
  };

  const getItemPriceInfo = (itemId: string) => {
    const priceData = hdvPricesByServer[selectedServer]?.[itemId];
    if (priceData && priceData.unitAverage > 0) {
      return { price: priceData.unitAverage, isMissing: false };
    }
    return { price: 0, isMissing: true };
  };

  return (
    <DofusContext.Provider value={{
      hdvPrices,
      trackedItemIds,
      customItems,
      setHdvPrice,
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
