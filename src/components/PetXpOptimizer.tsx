import { useEffect, useMemo, useState } from 'react';
import { useDofus } from '../context/DofusContext';
import { useNavigation } from '../context/NavigationContext';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import type { DofusItem } from '../data/mockData';
import petXpResources from '../data/petXpResources.json';
import { searchItems } from '../services/api';
import {
  DEFAULT_MAX_XP,
  MAX_PET_LEVEL,
  xpForLevel,
  bestUnitPrice,
  computeRows,
  normalizeName,
  summarize,
} from '../lib/petXp';
import type { PetXpRow, PetLots } from '../lib/petXp';
import { decodeHtmlEntities } from '../lib/stringUtils';
import { fetchPetXpOverrides, updateResourceXp } from '../lib/sync';
import {
  PawPrint,
  TrendingDown,
  Search,
  Filter,
  Target,
  Coins,
  Info,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

type SortKey = 'name' | 'xp' | 'unitPrice' | 'ratio' | 'quantityNeeded' | 'totalCost';
type SortDir = 'asc' | 'desc';
type LotKey = keyof PetLots;

const LOT_LABELS: { key: LotKey; label: string }[] = [
  { key: 'x1', label: 'x1' },
  { key: 'x10', label: 'x10' },
  { key: 'x100', label: 'x100' },
  { key: 'x1000', label: 'x1000' },
];

/**
 * Clé de stockage CANONIQUE d'une ressource de familier dans le store global :
 *   - l'itemId DofusDB (`_id`, ex: "312") si le nom est connu du catalogue global
 *     (customItems + mock + résolutions DofusDB) ;
 *   - sinon le nom normalisé, pour qu'une fiche Prix HDV ouverte dessus retrouve
 *     exactement la même clé que l'édition manuelle ici.
 * Les anciennes clés `pet:<nom>` (versions précédentes) sont lues en fallback.
 * La comparaison est TOUJOURS insensible à la casse et aux accents : "Aigue-marine"
 * du JSON ⟶ "Aigue-Marine" du catalogue DofusDB.
 */
function globalPriceKey(normalizedName: string, catalog: Map<string, { itemId: string; name: string }>): string {
  return catalog.get(normalizedName)?.itemId ?? normalizedName;
}

/** Cache de session : nom normalisé → item DofusDB (évite de re-solliciter l'API). */
const dofusNameCache = new Map<string, DofusItem | null>();

/** Résout l'item DofusDB officiel d'un nom de ressource (recherche DofusDB). */
async function resolveDofusItem(name: string): Promise<DofusItem | null> {
  const norm = normalizeName(name);
  if (dofusNameCache.has(norm)) return dofusNameCache.get(norm) ?? null;
  try {
    const results = await searchItems(name);
    const found = results.find(it => normalizeName(it.name) === norm) ?? null;
    dofusNameCache.set(norm, found);
    return found;
  } catch {
    dofusNameCache.set(norm, null);
    return null;
  }
}

export default function PetXpOptimizer() {
  const { hdvPrices, customItems, setHdvPrice } = useDofus();
  const { openScanner, navigateToHdvItem } = useNavigation();

  const [currentLevelRaw, setCurrentLevelRaw] = useState('0');
  const [targetLevelRaw, setTargetLevelRaw] = useState(String(MAX_PET_LEVEL));
  const [searchQuery, setSearchQuery] = useState('');
  const [hideUnpriced, setHideUnpriced] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  /** Nom de la dernière ressource copiée (affiche la coche 1,5 s). */
  const [copiedName, setCopiedName] = useState<string | null>(null);
  /** Items DofusDB résolus à la volée (noms absents du catalogue local). */
  const [resolvedDofusItems, setResolvedDofusItems] = useState<Map<string, DofusItem>>(new Map());
  /**
   * Overrides d'XP chargés/édités (table Supabase `item_xp_overrides`).
   * Clés : item_id DofusDB (ou nom normalisé en fallback) — même convention
   * que les prix. Appliqués par-dessus petXpResources.json.
   */
  const [xpOverrides, setXpOverrides] = useState<Record<string, number>>({});
  /** Brouillon de saisie par ressource (clé = item_id) pendant la frappe (évite
   *  le rebond du contrôle tandis que les calculs sont recalculés). */
  const [xpDrafts, setXpDrafts] = useState<Record<string, string>>({});
  /** item_id dont la sauvegarde Supabase vient de réussir (coche verte 1,5 s). */
  const [savedXp, setSavedXp] = useState<string | null>(null);

  /** Parse une saisie d'XP (accepte virgule) en nombre > 0, sinon 0. */
  const parseXp = (raw: string): number => {
    const n = Number(raw.trim().replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const toLevel = (raw: string): number => {
    const n = Math.floor(Number(raw.replace(',', '.')));
    if (!Number.isFinite(n)) return 0;
    return Math.min(MAX_PET_LEVEL, Math.max(0, n));
  };
  const currentLevel = toLevel(currentLevelRaw);
  const toTargetLevel = (raw: string): number => {
    const n = Math.floor(Number(raw.replace(',', '.')));
    if (!Number.isFinite(n)) return MAX_PET_LEVEL;
    // Niveau ciblé : min 1, max 100, et jamais inférieur au niveau actuel.
    return Math.min(MAX_PET_LEVEL, Math.max(currentLevel, Math.max(1, n)));
  };
  const targetLevel = toTargetLevel(targetLevelRaw);
  const currentXp = xpForLevel(currentLevel);
  const targetXp = xpForLevel(targetLevel);
  const xpRemaining = Math.max(0, targetXp - currentXp);

  // Catalogue local (customItems + mock) normalisé, indépendant des résolutions.
  const localCatalogByKey = useMemo(() => {
    const m = new Map<string, { itemId: string; name: string }>();
    for (const it of [...(customItems ?? []), ...DOFUS_MOCK_ITEMS]) {
      if (!it?.name || !it._id) continue;
      const key = normalizeName(it.name);
      if (!m.has(key)) m.set(key, { itemId: it._id, name: it.name });
    }
    return m;
  }, [customItems]);

  // Résolution asynchrone en tâche de fond : pour chaque ressource du familier
  // dont le nom n'est pas dans le catalogue local, on interroge DofusDB pour
  // retrouver l'itemId officiel (insensible casse/accents). Ex: "Aigue-marine"
  // du JSON ⟶ "Aigue-Marine" (Lvl 150) du catalogue DofusDB.
  useEffect(() => {
    let cancelled = false;
    const missing = petXpResources
      .map(r => r.name)
      .filter(n => {
        const key = normalizeName(n);
        return !localCatalogByKey.has(key) && !dofusNameCache.has(key);
      })
      .slice(0, 60);
    if (missing.length === 0) return;

    (async () => {
      const results = await Promise.all(missing.map(n => resolveDofusItem(n)));
      if (cancelled) return;
      setResolvedDofusItems(prev => {
        const next = new Map(prev);
        let changed = false;
        for (let i = 0; i < missing.length; i++) {
          const found = results[i];
          if (found) {
            const key = normalizeName(missing[i]);
            if (!next.has(key)) {
              next.set(key, found);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    })();

    return () => { cancelled = true; };
  }, [localCatalogByKey, resolvedDofusItems]);

  // Hydratation des overrides d'XP depuis Supabase : les valeurs de
  // `item_xp_overrides` remplacent celles du JSON statique à l'affichage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const overrides = await fetchPetXpOverrides();
      if (cancelled) return;
      setXpOverrides(prev => (Object.keys(overrides).length > 0 ? { ...prev, ...overrides } : prev));
    })();
    return () => { cancelled = true; };
  }, []);

  // Index complet nom → item DofusDB (local + résolutions à la volée),
  // insensible casse/accents, pour croiser la fiche familier avec l'HDV.
  const realItemByKey = useMemo(() => {
    const m = new Map<string, { itemId: string; name: string }>(localCatalogByKey);
    for (const [key, it] of resolvedDofusItems) {
      if (!m.has(key)) m.set(key, { itemId: it._id, name: it.name });
    }
    return m;
  }, [localCatalogByKey, resolvedDofusItems]);

  /** Récupère l'item DofusDB complet (catalogue local, sinon résolution) pour
   * garder le même itemId et ne jamais créer de doublon temporaire. */
  const getRealItem = (norm: string): Partial<DofusItem> | null => {
    const fromLocal = [...(customItems ?? []), ...DOFUS_MOCK_ITEMS].find(
      it => it?.name && it._id && normalizeName(it.name) === norm,
    );
    if (fromLocal) return { _id: fromLocal._id, name: decodeHtmlEntities(fromLocal.name), type: fromLocal.type, level: fromLocal.level, imgUrl: fromLocal.imgUrl };
    const resolved = resolvedDofusItems.get(norm);
    if (resolved) return { _id: resolved._id, name: decodeHtmlEntities(resolved.name), type: resolved.type, level: resolved.level, imgUrl: resolved.imgUrl };
    return null;
  };

  /**
   * Index complet nomNormalisé → prix par lot, sourcé depuis le store GLOBAL :
   *   1. la clé canonique (itemId DofusDB si l'item est connu, sinon le nom
   *      normalisé) — exactement la même clé que l'onglet Prix HDV ;
   *   2. en fallback, l'ancienne clé `pet:<nom>` des versions précédentes.
   * Cela synchronise Familiers ⇄ Prix HDV ⇄ Supabase (même itemId/nom partout).
   */
  const priceByKey = useMemo(() => {
    const map = new Map<string, { itemId: string | null; lots: PetLots }>();
    const lotsOf = (p: { x1: number; x10: number; x100: number; x1000: number; unitAverage?: number }): PetLots => ({
      x1: p.x1 ?? 0,
      x10: p.x10 ?? 0,
      x100: p.x100 ?? 0,
      x1000: p.x1000 ?? 0,
    });
    for (const res of petXpResources) {
      const norm = normalizeName(res.name);
      const canonicalKey = globalPriceKey(norm, realItemByKey);
      const real = realItemByKey.get(norm);
      // 1. Store global via la clé canonique (itemId ou nom normalisé).
      const globalEntry = hdvPrices[canonicalKey];
      // 2. Fallback : prix enregistré sous le nom normalisé (édition manuelle
      //    faite avant la résolution DofusDB de l'item).
      const nameEntry = canonicalKey !== norm ? hdvPrices[norm] : undefined;
      // 3. Fallback : ancienne clé isolée `pet:<nom>` (versions précédentes).
      const legacyEntry = hdvPrices[`pet:${norm}`];
      const source = globalEntry || legacyEntry || nameEntry;
      const itemId = real?.itemId ?? null;
      let lots = source ? lotsOf(source) : { x1: 0, x10: 0, x100: 0, x1000: 0 };
      // Compat ancien format : un prix unique (uniquement unitAverage) devient x1.
      if (!!source && lots.x1 === 0 && lots.x10 === 0 && lots.x100 === 0 && lots.x1000 === 0 && (source.unitAverage ?? 0) > 0) {
        lots = { ...lots, x1: source.unitAverage ?? 0 };
      }
      map.set(norm, { itemId, lots });
    }
    return map;
  }, [hdvPrices, realItemByKey]);

  const rows = useMemo<PetXpRow[]>(() => {
    // Applique les overrides Supabase (`item_xp_overrides`) par-dessus le JSON
    // statique : clé canonique (itemId DofusDB) d'abord, nom normalisé en
    // fallback — même convention de clés que les prix.
    const effective = petXpResources.map(res => {
      const norm = normalizeName(res.name);
      const key = globalPriceKey(norm, realItemByKey);
      const override = xpOverrides[key] ?? xpOverrides[norm];
      return override !== undefined && Number.isFinite(override) && override > 0
        ? { ...res, xp: override }
        : res;
    });
    return computeRows(effective, priceByKey, currentXp, targetXp);
  }, [petXpResources, priceByKey, realItemByKey, xpOverrides, currentXp, targetXp]);

  const summary = useMemo(() => summarize(rows), [rows]);

  const pricedRows = useMemo(() => rows.filter(r => bestUnitPrice(r.lots) > 0).length, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (hideUnpriced && !r.hasPrice) return false;
      return true;
    });
    base.sort((a, b) => {
      const raw = sortKey === 'name'
        ? a.name.localeCompare(b.name, 'fr')
        : sortKey === 'xp'
          ? a.xp - b.xp
          : sortKey === 'unitPrice'
            ? a.unitPrice - b.unitPrice
            : sortKey === 'quantityNeeded'
              ? (a.quantityNeeded ?? Infinity) - (b.quantityNeeded ?? Infinity)
              : sortKey === 'totalCost'
                ? (a.totalCost ?? Infinity) - (b.totalCost ?? Infinity)
                : a.ratio - b.ratio;
      return sortDir === 'desc' ? -raw : raw;
    });
    return base;
  }, [rows, searchQuery, hideUnpriced, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'asc');
    }
  };

  const renderSortHead = ({ label, k, align = 'text-right' }: { label: string; k: SortKey; align?: string }) => (
    <th className={`${align} px-3 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-amber-400 transition-colors`} onClick={() => toggleSort(k)}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );

/** Édition manuelle d'un lot : écrit dans le store GLOBAL sous la clé
   *  CANONIQUE (itemId DofusDB si l'item est connu — y compris résolution à
   *  la volée —, sinon nom normalisé). Familiers et Prix HDV partagent ainsi
   *  exactement la même clé, garantissant la synchronisation bidirectionnelle. */
  const updateLot = (resName: string, lot: LotKey, rawValue: string) => {
    const norm = normalizeName(resName);
    const real = realItemByKey.get(norm);
    const key = globalPriceKey(norm, realItemByKey);
    // Si l'item n'est pas encore résolu, lance la résolution en tâche de fond :
    // toutes les prochaine écritures/lectures utiliseront son itemId DofusDB.
    if (!real) {
      void resolveDofusItem(resName).then(found => {
        if (found) {
          const keyNorm = normalizeName(found.name);
          setResolvedDofusItems(prev => {
            if (prev.has(keyNorm)) return prev;
            const next = new Map(prev);
            next.set(keyNorm, found);
            return next;
          });
        }
      });
    }
    const prev = hdvPrices[key];
    const lots: PetLots = {
      x1: prev?.x1 ?? 0,
      x10: prev?.x10 ?? 0,
      x100: prev?.x100 ?? 0,
      x1000: prev?.x1000 ?? 0,
    };
const n = Number(rawValue.replace(',', '.'));
    lots[lot] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    setHdvPrice(key, lots.x1, lots.x10, lots.x100, lots.x1000, { explicit: true });
  };

  /** Clé canonique (itemId DofusDB si résolu, sinon nom normalisé) d'une ressource,
   *  identique pour les prix HDV et pour les overrides d'XP Supabase. */
  const xpKeyOf = (resName: string): string => globalPriceKey(normalizeName(resName), realItemByKey);

  /** Édition en direct de l'XP : met à jour le brouillon et l'override local
   *  (recalcul immédiat du ratio / qté / coût), sans toucher à Supabase. */
  const updateXp = (resName: string, rawValue: string) => {
    const key = xpKeyOf(resName);
    setXpDrafts(prev => ({ ...prev, [key]: rawValue }));
    const n = parseXp(rawValue);
    if (n > 0) {
      setXpOverrides(prev => ({ ...prev, [key]: n, [normalizeName(resName)]: n }));
    }
  };

  /** Sauvegarde Supabase au blur (upsert silencieux, échec loggé seulement). */
  const commitXp = (resName: string) => {
    const key = xpKeyOf(resName);
    const raw = xpDrafts[key];
    const n = parseXp(raw ?? '');
    if (n > 0) {
      setXpOverrides(prev => ({ ...prev, [key]: n, [normalizeName(resName)]: n }));
      void updateResourceXp(key, n).then(ok => {
        if (ok) {
          setSavedXp(key);
          window.setTimeout(() => setSavedXp(prev => (prev === key ? null : prev)), 1500);
        }
      });
    }
    // Efface le brouillon une fois committé (retour à la valeur affichée).
    setXpDrafts(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** Ouvre la fiche/ligne de la ressource dans l'onglet Prix HDV.
   *  Résout TOUJOURS l'itemId DofusDB officiel (catalogue local d'abord,
   *  puis recherche DofusDB à la volée) pour ne jamais ouvrir un item
   *  temporaire quand l'item existe sous son nom officiel dans le catalogue. */
  const openInHdv = async (row: PetXpRow) => {
    const norm = normalizeName(row.name);
    const real = getRealItem(norm);
    // Passe TOUJOURS le vraie fiche DofusDB (id + métadonnées) quand l'item
    // existe sous son nom officiel ; sinon un item fallback minimal.
    navigateToHdvItem(
      real ?? {
        _id: norm,
        name: row.name,
        type: 'Ressource',
        level: 0,
        imgUrl: '',
      } as Partial<DofusItem>,
      real?._id ?? undefined,
    );
    // Résolution en arrière-plan : dès que l'item DofusDB est trouvé, la
    // prochaine visite utilisera son itemId réel (et non une clé nom).
    if (!real) {
      const found = await resolveDofusItem(row.name);
      if (found) {
        const keyNorm = normalizeName(found.name);
        setResolvedDofusItems(prev => {
          const next = new Map(prev);
          if (!next.has(keyNorm)) next.set(keyNorm, found);
          return next.has(keyNorm) ? next : prev;
        });
      }
    }
  };

  /** Copie le nom exact de la ressource + feedback visuel éphémère (1,5 s). */
  const copyResourceName = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      // presse-papier indisponible : on ignore silencieusement
    }
    setCopiedName(name);
    window.setTimeout(() => setCopiedName(prev => (prev === name ? null : prev)), 1500);
  };

// File de scan : TOUTES les ressources du familier (1 302) sont ciblées, que
  // leurs prix soient déjà renseignés ou non. La modale de scan les garde toutes
  // disponibles : "Scan complet" = les 1 302, "Prix à actualiser" = uniquement
  // celles sans aucun lot > 0. Le badge du bouton compte les ressources dont un
  // prix manque encore.
  const scanQueue = useMemo<ScannerQueueItem[]>(() => {
    const q: ScannerQueueItem[] = [];
    for (const r of petXpResources) {
      const norm = normalizeName(r.name);
      q.push({ expectedName: r.name, expectedId: globalPriceKey(norm, realItemByKey), type: 'Ressource' });
    }
    return q;
  }, [realItemByKey]);

  const missingPriceCount = useMemo(() => {
    let count = 0;
    for (const r of petXpResources) {
      const norm = normalizeName(r.name);
      const lots = priceByKey.get(norm)?.lots;
      if (lots && (lots.x1 > 0 || lots.x10 > 0 || lots.x100 > 0 || lots.x1000 > 0)) continue;
      count += 1;
    }
    return count;
  }, [priceByKey]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* En-tête du module */}
      <div className="glass-panel rounded-xl p-5 sm:p-6 border border-amber-500/20 shadow-xl bg-gradient-to-r from-[#0f1421] to-[#151f32]">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PawPrint className="h-5 w-5 text-amber-400" />
            Optimisation Familier — XP jusqu'au Niveau 100
          </h2>
          <button
            onClick={() => openScanner(scanQueue.length > 0 ? scanQueue : undefined, { title: 'Scan HDV — Familiers', initialScanMode: missingPriceCount > 0 ? 'stale' : 'full' })}
            disabled={missingPriceCount === 0}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg border transition-colors ${
              missingPriceCount > 0
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-transparent shadow-lg hover:opacity-90'
                : 'bg-white/5 text-slate-500 border-white/10 cursor-not-allowed'
            }`}
            title={missingPriceCount > 0 ? `${missingPriceCount} ressources sans prix à scanner` : 'Toutes les ressources ont un prix'}
          >
            <RefreshCw className="h-4 w-4" />
            Scanner une capture HDV
            {missingPriceCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-black/30 rounded text-[10px]">{missingPriceCount}</span>}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-400 leading-relaxed">
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">1. Prix par lot</div>
            Les 4 cases <b>x1 · x10 · x100 · x1000</b> sont modifiables en ligne. Le prix unitaire tenant le plus économique est retenu automatiquement pour le ratio et le coût.
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">2. Niveau du familier</div>
            Niveau actuel (0) → niveau ciblé (100). La conversion est automatique : niveau 0 = 0 XP, niveau {MAX_PET_LEVEL} = {DEFAULT_MAX_XP.toLocaleString()} XP.
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">3. Scan HDV</div>
            Scannez une capture de l'HDV pour remplir les 4 lots des ressources sans prix, puis recalcul instantané.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Niveau actuel</label>
          <input
            type="number"
            min={0}
            max={MAX_PET_LEVEL}
            value={currentLevelRaw}
            onChange={e => setCurrentLevelRaw(e.target.value)}
            className="w-36 bg-[#0c101d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40"
          />
          <div className="text-[10px] text-slate-500 mt-0.5">{currentXp.toLocaleString()} XP cumulés</div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Niveau ciblé</label>
          <input
            type="number"
            min={Math.max(1, currentLevel)}
            max={MAX_PET_LEVEL}
            value={targetLevelRaw}
            onChange={e => setTargetLevelRaw(e.target.value)}
            className="w-36 bg-[#0c101d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40"
          />
          <div className="text-[10px] text-slate-500">{targetXp.toLocaleString()} XP au total</div>
        </div>
        <div className="bg-[#0c101d]/60 border border-amber-500/20 rounded-lg px-3 py-2 text-xs">
          <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">XP restant</span>
          <span className="font-mono font-extrabold text-amber-400">{Math.round(xpRemaining).toLocaleString()}</span>
          {currentLevel >= targetLevel && <span className="ml-2 text-emerald-400 font-bold">Déjà max ✓</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher une ressource…"
              className="pl-8 w-56 bg-[#0c101d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40"
            />
          </div>
          <button
            onClick={() => setHideUnpriced(p => !p)}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all border ${
              hideUnpriced
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <Filter className="h-3 w-3" />
            {hideUnpriced ? 'Prix connus' : 'Tout'}
          </button>
        </div>
      </div>

      {/* Carte récapitulative — la plus rentable */}
      {summary.bestResource ? (
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel rounded-xl p-4 border border-emerald-500/20 bg-gradient-to-r from-[#0d1512] to-[#122019] sm:col-span-1 flex flex-col items-center justify-center text-center gap-1">
            <TrendingDown className="h-5 w-5 text-emerald-400" />
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">La plus rentable en HDV</div>
            <button
              type="button"
              onClick={() => openInHdv(summary.bestResource!)}
              title="Ouvrir dans Prix HDV"
              className="text-base font-extrabold text-white truncate w-full hover:text-amber-400 transition-colors leading-snug"
            >
              {summary.bestResource.name}
            </button>
          </div>
          <div className="glass-panel rounded-xl p-4 border border-white/10 flex flex-col items-center justify-center text-center gap-1">
            <Target className="h-5 w-5 text-amber-400" />
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Quantité nécessaire</div>
            <div className="text-xl font-black text-amber-400">
              {summary.quantity !== null && summary.quantity !== undefined ? summary.quantity.toLocaleString() : '—'}
            </div>
            <div className="text-[10px] text-slate-500">({pricedRows} ressource(s) avec prix sur {rows.length})</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border border-white/10 flex flex-col items-center justify-center text-center gap-1">
            <Coins className="h-5 w-5 text-amber-400" />
            <div className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Coût total Level 100</div>
            <div className="text-xl font-black text-slate-100">
              {summary.totalCost !== null && summary.totalCost !== undefined ? `${Math.round(summary.totalCost).toLocaleString()} K` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">en n'achetant que la {summary.bestResource?.name}</div>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl p-5 border border-amber-500/20 bg-[#0d1117]/60 text-sm text-amber-400 flex items-center gap-3">
          <Info className="h-5 w-5 shrink-0" />
          Aucune ressource avec un prix HDV renseigné. Éditez les cases de prix ci-dessous ou scannez une capture HDV — la quantité nécessaire reste affichée sur l'XP offerte.
        </div>
      )}

      {/* Tableau récapitulatif */}
      <div className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#0a0e18]/80 border-b border-white/10">
              <tr>
                {renderSortHead({ label: 'Ressource', k: 'name', align: 'text-left' })}
                {renderSortHead({ label: 'XP offerte', k: 'xp' })}
                <th className="text-right px-3 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  Prix HDV (lots)
                </th>
                {renderSortHead({ label: 'Ratio K / XP', k: 'ratio' })}
                {renderSortHead({ label: 'Qté nécessaire', k: 'quantityNeeded' })}
                {renderSortHead({ label: 'Coût total', k: 'totalCost' })}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr
                  key={`${row.name}-${idx}`}
                  className={`border-b border-white/5 hover:bg-white/[0.03] transition-colors ${
                    summary.bestResource && summary.bestResource.name === row.name ? 'bg-emerald-500/[0.06]' : ''
                  }`}
>
                    <td className="px-3 py-2 text-left">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openInHdv(row)}
                          title="Ouvrir dans Prix HDV"
                          className="group/name flex items-center gap-1 text-slate-200 font-semibold hover:text-amber-400 transition-colors text-left cursor-pointer"
                        >
                          {row.name}
                          <ExternalLink className="h-3 w-3 text-slate-600 group-hover/name:text-amber-400/70 shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={e => copyResourceName(e, row.name)}
                          title={copiedName === row.name ? 'Copié !' : 'Copier le nom'}
                          className="shrink-0 p-1 rounded-md hover:bg-white/10 text-slate-500 hover:text-slate-200 transition-colors"
                        >
                          {copiedName === row.name ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {summary.bestResource?.name === row.name && (
                          <TrendingDown className="h-3.5 w-3.5 text-emerald-400 shrink-0" title="Plus rentable" />
                        )}
                      </div>
                    </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        key={xpKeyOf(row.name)}
                        type="number"
                        step={0.1}
                        min={0.1}
                        inputMode="decimal"
                        value={xpDrafts[xpKeyOf(row.name)] ?? row.xp}
                        onChange={e => updateXp(row.name, e.target.value)}
                        onBlur={e => commitXp(row.name)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        title="XP offerte — éditable (sauvegardée sur Supabase)"
                        className="w-20 bg-transparent border border-transparent focus:bg-[#0c101d] focus:border-amber-500/40 hover:border-white/15 rounded px-1 py-1 text-right font-mono text-xs text-slate-200 focus:outline-none transition-colors"
                      />
                      {savedXp === xpKeyOf(row.name) && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {LOT_LABELS.map(lot => (
                        <label key={lot.key} className="flex flex-col items-center gap-0.5" title={`Prix ${lot.key}`}>
                          <input
                            type="number"
                            min={0}
                            value={row.lots[lot.key] > 0 ? row.lots[lot.key] : ''}
                            placeholder={lot.label}
                            onChange={e => updateLot(row.name, lot.key, e.target.value)}
                            className="w-14 bg-[#0c101d] border border-white/10 rounded px-1 py-1 text-right font-mono text-[11px] text-slate-200 focus:outline-none focus:border-amber-500/40 placeholder:text-slate-600"
                          />
                          <span className="text-[8px] text-slate-600 uppercase">{lot.label === 'x1' ? '1' : lot.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      {row.unitPrice > 0 ? `unitaire le plus bas : ${row.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} K` : '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.hasPrice && row.xp > 0 ? (
                      <span className="text-amber-400">{row.ratio.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {row.quantityNeeded !== null ? row.quantityNeeded.toLocaleString() : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-200">
                    {row.totalCost !== null ? `${Math.round(row.totalCost).toLocaleString()} K` : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-500">Aucune ressource ne correspond aux filtres.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
        <Info className="h-3 w-3" />
        Prix par lot : le prix unitaire le plus économique (x1, x10/10, x100/100, x1000/1000) sert au Ratio K/XP. Le Coût total est calculé en décomposant l'achat en x1000 → x100 → x10 → x1. Sans prix, les colonnes prix, ratio et coût affichent « — ».
      </div>
    </div>
  );
}
