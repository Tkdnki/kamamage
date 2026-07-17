import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { DofusItem } from '../data/mockData';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type ViewType = 'hdv' | 'crafts' | 'forgemagie' | 'shopping';

export interface CartEntry {
  item: DofusItem;
  quantityNeeded: number;
  quantityGathered: number;
}

type ShoppingCart = Record<string, CartEntry>;

interface NavigationContextType {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  pendingHdvItem: Partial<DofusItem> | null;
  navigateToHdvItem: (item: Partial<DofusItem>) => void;
  clearPendingHdvItem: () => void;
  shoppingCart: ShoppingCart;
  addIngredientsToCart: (ingredients: { id: string; name: string; type: string; level: number; imgUrl: string; quantity: number }[]) => void;
  updateCartGathered: (id: string, gathered: number) => void;
  resetCart: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ViewType>('hdv');
  const [pendingHdvItem, setPendingHdvItem] = useState<Partial<DofusItem> | null>(null);
  const [shoppingCart, setShoppingCart] = useLocalStorage<ShoppingCart>('kamamage_shopping_cart', {});

  const navigateToHdvItem = (item: Partial<DofusItem>) => {
    setPendingHdvItem(item);
    setActiveView('hdv');
  };

  const clearPendingHdvItem = () => setPendingHdvItem(null);

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
      pendingHdvItem, navigateToHdvItem, clearPendingHdvItem,
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
