import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import type { DofusItem } from '../data/mockData';
import { useServer } from './ServerContext';
import { useAuth } from './AuthContext';
import { pushHdvPricesToServer, fetchHdvPricesFromServer, pushMonthlySalesVolumeToServer, fetchMonthlySalesVolumeFromServer } from '../lib/sync';

export type PriceLot = 'x1' | 'x10' | 'x100' | 'x1000';

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
  /**
   * Lots explicitement mis à 0 par l'utilisateur (enregistrement manuel).
   * La fusion distante (poll/scan) ne doit JAMAIS ré-écraser ces lots par
   * l'ancienne valeur du serveur (qui ne stocke que les lots > 0). Un lot
   * présent ici vaut "décision explicite de 0", pas "donnée manquante".
   */
  manualZeroLots?: Partial<Record<PriceLot, boolean>>;
  /** Horodatage (ISO) de la dernière écriture connue PAR LOT. Permet à la
   *  fusion de comparer la fraîcheur lot par lot et d'accepter un 0 explicite
   *  distant sans que les anciennes valeurs du serveur ne ressuscitent un prix
   *  que l'utilisateur a volontairement effacé. */
  lotUpdatedAt?: Partial<Record<PriceLot, string>>;
}

export interface SetHdvPriceOptions {
  /**
   * true = enregistrement EXPLICITE de l'utilisateur : les lots à 0 sont une
   * décision volontaire (effacement manuel) et seront protégés de la fusion
   * distante. false/absent = écriture par défaut (scan) : un 0 reste une
   * "donnée inconnue" que la fusion peut combler.
   */
  explicit?: boolean;
}

export interface HdvPrices {
  [itemId: string]: PriceData;
}

interface DofusContextType {
  hdvPrices: HdvPrices;
  trackedItemIds: string[];
  customItems: DofusItem[];
  /** Vrai pendant qu'un scan HDV est en cours (file non vide ou traitement actif). */
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  setHdvPrice: (itemId: string, x1: number, x10: number, x100: number, x1000: number, options?: SetHdvPriceOptions) => void;
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
 * - La fraîcheur est comparée LOT PAR LOT (lotUpdatedAt) quand disponible : cela
 *   distingue un prix explicitement mis à 0 (ligne en base à 0, marquée
 *   manualZeroLots) d'un lot simplement absent (0 non marqué).
 * - Une ligne distante plus récente pour un lot (prix > 0 OU 0 explicite) prime.
 * - Un zéro EXPLICITE local reste protégé tant que le distant n'apporte pas de
 *   ligne plus fraîche pour CE lot (les anciennes valeurs du serveur ne
 *   ressuscitent pas un prix volontairement effacé).
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

  // Horodatage (ms) d'un lot : privilégie le timestamp par lot, sinon celui de l'entrée.
  const lotTs = (p: PriceData, lot: PriceLot): number => {
    const t = p.lotUpdatedAt?.[lot];
    if (t) { const n = new Date(t).getTime(); if (!Number.isNaN(n)) return n; }
    if (p.updatedAt) { const n = new Date(p.updatedAt).getTime(); if (!Number.isNaN(n)) return n; }
    return 0;
  };
  const iso = (ts: number): string | undefined => (ts > 0 ? new Date(ts).toISOString() : undefined);

  // Fusion lot par lot : renvoie la valeur gagnante, si c'est un zéro explicite
  // (décision utilisateur) et l'horodatage de la source gagnante.
  const decideLot = (loc: number, rem: number, lot: PriceLot): { value: number; explicitZero: boolean; ts: number } => {
    const locT = lotTs(local, lot);
    const remT = lotTs(val, lot);
    const remoteLotIsNewer = remT > locT;
    const localExplicitZero = !!local.manualZeroLots?.[lot];
    const remoteExplicitZero = !!val.manualZeroLots?.[lot];

    let value: number;
    let ts: number;
    let source: 'local' | 'remote';

    if (remoteLotIsNewer && (remoteExplicitZero || rem > 0)) {
      // 1) Le distant possède une ligne plus fraîche pour CE lot (prix connu OU
      //    0 explicite distant) → sa décision prime, 0 inclus.
      value = rem; ts = remT > 0 ? remT : locT; source = 'remote';
    } else if (localExplicitZero) {
      // 2) Zéro explicite local : protégé contre les anciennes valeurs distantes.
      value = 0; ts = locT; source = 'local';
    } else if (remoteIsNewer) {
      // 3) Fusion par défaut : un lot distant absent (0 non marqué) ne supprime
      //    jamais un prix local connu.
      if (rem > 0) { value = rem; ts = remT > 0 ? remT : locT; source = 'remote'; }
      else { value = loc; ts = locT; source = 'local'; }
    } else if (loc > 0) {
      value = loc; ts = locT; source = 'local';
    } else {
      value = rem; ts = remT > 0 ? remT : locT; source = 'remote';
    }

    const explicitZero = value === 0 && (localExplicitZero || (remoteExplicitZero && source === 'remote'));
    return { value, explicitZero, ts };
  };

  const d1 = decideLot(local.x1, val.x1, 'x1');
  const d10 = decideLot(local.x10, val.x10, 'x10');
  const d100 = decideLot(local.x100, val.x100, 'x100');
  const d1000 = decideLot(local.x1000, val.x1000, 'x1000');

  const manualZeroLots: Partial<Record<PriceLot, boolean>> = {};
  if (d1.explicitZero) manualZeroLots.x1 = true;
  if (d10.explicitZero) manualZeroLots.x10 = true;
  if (d100.explicitZero) manualZeroLots.x100 = true;
  if (d1000.explicitZero) manualZeroLots.x1000 = true;

  const before = JSON.stringify(merged[key]);
  const mergedEntry: PriceData = {
    x1: d1.value,
    x10: d10.value,
    x100: d100.value,
    x1000: d1000.value,
    unitAverage: 0,
    author: remoteIsNewer ? (val.author ?? local.author ?? null) : (local.author ?? val.author ?? null),
    authorId: remoteIsNewer ? (val.authorId ?? local.authorId ?? null) : (local.authorId ?? val.authorId ?? null),
    updatedAt: remoteIsNewer
      ? (val.updatedAt ?? local.updatedAt ?? null)
      : (local.updatedAt ?? val.updatedAt ?? null),
    monthlySalesVolume: local.monthlySalesVolume ?? val.monthlySalesVolume,
    // Préserve les décisions utilisateur (lots explicitement mis à 0) et la
    // fraîcheur par lot à travers les fusions.
    manualZeroLots: Object.keys(manualZeroLots).length > 0 ? manualZeroLots : undefined,
    lotUpdatedAt: {
      x1: iso(d1.ts) ?? local.lotUpdatedAt?.x1 ?? val.lotUpdatedAt?.x1,
      x10: iso(d10.ts) ?? local.lotUpdatedAt?.x10 ?? val.lotUpdatedAt?.x10,
      x100: iso(d100.ts) ?? local.lotUpdatedAt?.x100 ?? val.lotUpdatedAt?.x100,
      x1000: iso(d1000.ts) ?? local.lotUpdatedAt?.x1000 ?? val.lotUpdatedAt?.x1000,
    },
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

  // Flag global "un scan HDV est en cours" : le polling Supabase en arrière-plan
  // est suspendu pendant ce temps (le scanner écrit des prix, on évite de re-fetch
  // en parallèle). Un ref permet au poll de lire la valeur sans re-créer l'intervalle.
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

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

  const { user } = useAuth();

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
  }, [selectedServer, syncedStorageKey, user?.id]);

  // Rafraîchissement automatique des prix en arrière-plan : les prix distants
  // (Supabase) alimentent le state global de manière réactive sans attendre un
  // focus utilisateur ni un refetch manuel. Le tri du brisage se met à jour seul.
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      // Scan HDV en cours → on suspend le polling (évite de re-fetch pendant
      // les écritures du scanner). Reprise automatique au tick suivant.
      if (isScanningRef.current) return;
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

    // Pas de poll() immédiat ici : l'effet de montage ci-dessus effectue déjà la
    // récupération initiale (évite un double fetch simultané à l'ouverture).
    const intervalId = setInterval(poll, PRICE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [selectedServer]);

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

  const setHdvPrice = useCallback((itemId: string, x1: number, x10: number, x100: number, x1000: number, options?: SetHdvPriceOptions) => {
    if (!user) return;
    let sum = 0;
    let count = 0;
    if (x1 > 0) { sum += x1; count++; }
    if (x10 > 0) { sum += x10 / 10; count++; }
    if (x100 > 0) { sum += x100 / 100; count++; }
    if (x1000 > 0) { sum += x1000 / 1000; count++; }
    const unitAverage = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
    const nowIso = new Date().toISOString();
    const entry: PriceData = {
      x1, x10, x100, x1000,
      unitAverage,
      updatedAt: nowIso,
      // L'enregistrement est une photographie complète des 4 lots : on marque la
      // fraîcheur par lot pour que la fusion distante ne ré-écrase pas cette
      // décision par d'anciennes lignes du serveur.
      lotUpdatedAt: { x1: nowIso, x10: nowIso, x100: nowIso, x1000: nowIso },
    };

    // Enregistrement EXPLICITE de l'utilisateur : les lots à 0 sont une décision
    // volontaire. On les marque pour que la fusion distante (applyRemotePrice)
    // ne les ré-écrase pas par l'ancienne valeur du serveur. Un lot re-saisi à
    // une valeur > 0 est simplement absent de ce marquage (donc non protégé).
    if (options?.explicit) {
      const manualZeroLots: Partial<Record<PriceLot, boolean>> = {};
      if (x1 <= 0) manualZeroLots.x1 = true;
      if (x10 <= 0) manualZeroLots.x10 = true;
      if (x100 <= 0) manualZeroLots.x100 = true;
      if (x1000 <= 0) manualZeroLots.x1000 = true;
      if (Object.keys(manualZeroLots).length > 0) entry.manualZeroLots = manualZeroLots;
    }

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
      isScanning,
      setIsScanning,
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
