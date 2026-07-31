import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { DofusItem } from '../data/mockData';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type ViewType = 'hdv' | 'crafts' | 'leveling' | 'forgemagie' | 'breaking' | 'elevage' | 'shopping' | 'profile';

export interface ScannerQueueItem {
  expectedName: string;
  expectedId: string;
  /** Type DofusDB de l'item (ex: "Épée", "Minerai") pour afficher l'HDV cible */
  type?: string;
}

export interface CartEntry {
  item: DofusItem;
  quantityNeeded: number;
  quantityGathered: number;
}

type ShoppingCart = Record<string, CartEntry>;

interface NavigationContextType {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isScannerOpen: boolean;
  openScanner: (recipeItems?: ScannerQueueItem[]) => void;
  closeScanner: () => void;
  scannerInitialQueue: ScannerQueueItem[];
  pendingHdvItem: Partial<DofusItem> | null;
  navigateToHdvItem: (item: Partial<DofusItem>, itemId?: string, job?: string, jobLevel?: number) => void;
  clearPendingHdvItem: () => void;
  previousView: ViewType | null;
  clearPreviousView: () => void;
  previousItemId: string | null;
  previousJob: string | null;
  previousJobLevel: number | null;
  clearPreviousNavigation: () => void;
  pendingCraftsItemId: string | null;
  pendingCraftsJob: string | null;
  navigateToCraftsItem: (itemId: string, job?: string) => void;
  clearPendingCraftsNavigation: () => void;
  pendingLevelingItemId: string | null;
  pendingLevelingJob: string | null;
  pendingLevelingJobLevel: number | null;
  pendingLevelingItemLevel: number | null;
  navigateToLevelingItem: (itemId: string, job?: string, jobLevel?: number, itemLevel?: number) => void;
  clearPendingLevelingNavigation: () => void;
  pendingBreakingItemId: string | null;
  navigateToBreakingItem: (itemId: string) => void;
  clearPendingBreakingNavigation: () => void;
  shoppingCart: ShoppingCart;
  addIngredientsToCart: (ingredients: { id: string; name: string; type: string; level: number; imgUrl: string; quantity: number }[]) => void;
  updateCartGathered: (id: string, gathered: number) => void;
  resetCart: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ViewType>('hdv');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerInitialQueue, setScannerInitialQueue] = useState<ScannerQueueItem[]>([]);
  const openScanner = (recipeItems?: ScannerQueueItem[]) => {
    if (recipeItems) setScannerInitialQueue(recipeItems);
    setIsScannerOpen(true);
  };
  const closeScanner = () => {
    setIsScannerOpen(false);
    setScannerInitialQueue([]);
  };
  const [pendingHdvItem, setPendingHdvItem] = useState<Partial<DofusItem> | null>(null);
  const [previousView, setPreviousView] = useState<ViewType | null>(null);
  const [previousItemId, setPreviousItemId] = useState<string | null>(null);
  const [previousJob, setPreviousJob] = useState<string | null>(null);
  const [previousJobLevel, setPreviousJobLevel] = useState<number | null>(null);
  const [shoppingCart, setShoppingCart] = useLocalStorage<ShoppingCart>('kamamage_shopping_cart', {});
  const [pendingCraftsItemId, setPendingCraftsItemId] = useState<string | null>(null);
  const [pendingCraftsJob, setPendingCraftsJob] = useState<string | null>(null);
  const [pendingLevelingItemId, setPendingLevelingItemId] = useState<string | null>(null);
  const [pendingLevelingJob, setPendingLevelingJob] = useState<string | null>(null);
  const [pendingLevelingJobLevel, setPendingLevelingJobLevel] = useState<number | null>(null);
  const [pendingLevelingItemLevel, setPendingLevelingItemLevel] = useState<number | null>(null);
  const [pendingBreakingItemId, setPendingBreakingItemId] = useState<string | null>(null);

  const navigateToHdvItem = (item: Partial<DofusItem>, itemId?: string, job?: string, jobLevel?: number) => {
    setPreviousView(activeView);
    if (itemId) setPreviousItemId(itemId);
    if (job) setPreviousJob(job);
    if (jobLevel !== undefined) setPreviousJobLevel(jobLevel);
    setPendingHdvItem(item);
    setActiveView('hdv');
  };

  const clearPendingHdvItem = () => setPendingHdvItem(null);
  const clearPreviousView = () => setPreviousView(null);
  const clearPreviousNavigation = () => {
    setPreviousItemId(null);
    setPreviousJob(null);
    setPreviousJobLevel(null);
  };

  const navigateToCraftsItem = (itemId: string, job?: string) => {
    setPendingCraftsItemId(itemId);
    if (job) setPendingCraftsJob(job);
    setActiveView('crafts');
  };

  const clearPendingCraftsNavigation = () => {
    setPendingCraftsItemId(null);
    setPendingCraftsJob(null);
  };

  const navigateToLevelingItem = (itemId: string, job?: string, jobLevel?: number, itemLevel?: number) => {
    setPendingLevelingItemId(itemId);
    if (job) setPendingLevelingJob(job);
    if (jobLevel !== undefined) setPendingLevelingJobLevel(jobLevel);
    if (itemLevel !== undefined) setPendingLevelingItemLevel(itemLevel);
    setActiveView('leveling');
  };

  const clearPendingLevelingNavigation = () => {
    setPendingLevelingItemId(null);
    setPendingLevelingJob(null);
    setPendingLevelingJobLevel(null);
    setPendingLevelingItemLevel(null);
  };

  const navigateToBreakingItem = (itemId: string) => {
    setPendingBreakingItemId(itemId);
    setActiveView('breaking');
  };

  const clearPendingBreakingNavigation = () => {
    setPendingBreakingItemId(null);
  };

  const addIngredientsToCart = (ingredients: { id: string; name: string; type: string; level: number; imgUrl: string; quantity: number }[]) => {
    setShoppingCart(prev => {
      const next = { ...prev };
      for (const ing of ingredients) {
        if (next[ing.id]) {
          next[ing.id] = {
            ...next[ing.id],
            quantityNeeded: next[ing.id].quantityNeeded + ing.quantity,
          };
        } else {
          next[ing.id] = {
            item: { _id: ing.id, name: ing.name, type: ing.type, level: ing.level, imgUrl: ing.imgUrl },
            quantityNeeded: ing.quantity,
            quantityGathered: 0,
          };
        }
      }
      return next;
    });
  };

  const updateCartGathered = (id: string, gathered: number) => {
    setShoppingCart(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], quantityGathered: gathered } };
    });
  };

  const resetCart = () => setShoppingCart({});

  return (
    <NavigationContext.Provider value={{
      activeView, setActiveView,
      isScannerOpen, openScanner, closeScanner, scannerInitialQueue,
      pendingHdvItem, navigateToHdvItem, clearPendingHdvItem,
      previousView, clearPreviousView,
      previousItemId, previousJob, previousJobLevel, clearPreviousNavigation,
      pendingCraftsItemId, pendingCraftsJob, navigateToCraftsItem, clearPendingCraftsNavigation,
      pendingLevelingItemId, pendingLevelingJob, pendingLevelingJobLevel, pendingLevelingItemLevel, navigateToLevelingItem, clearPendingLevelingNavigation,
      pendingBreakingItemId, navigateToBreakingItem, clearPendingBreakingNavigation,
      shoppingCart, addIngredientsToCart, updateCartGathered, resetCart,
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
