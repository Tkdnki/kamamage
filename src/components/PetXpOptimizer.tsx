import { useMemo, useState } from 'react';
import { useDofus } from '../context/DofusContext';
import { useNavigation } from '../context/NavigationContext';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import petXpResources from '../data/petXpResources.json';
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
import {
  PawPrint,
  TrendingDown,
  Search,
  Filter,
  Target,
  Coins,
  Info,
  RefreshCw,
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

/** Clé de stockage canonique d'une ressource de familier : `pet:<nomNormalisé>`. */
function petKey(name: string): string {
  return `pet:${normalizeName(name)}`;
}

export default function PetXpOptimizer() {
  const { hdvPrices, customItems, setHdvPrice } = useDofus();
  const { openScanner } = useNavigation();

  const [currentLevelRaw, setCurrentLevelRaw] = useState('1');
  const [targetLevelRaw, setTargetLevelRaw] = useState(String(MAX_PET_LEVEL));
  const [searchQuery, setSearchQuery] = useState('');
  const [hideUnpriced, setHideUnpriced] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toLevel = (raw: string): number => {
    const n = Math.floor(Number(raw.replace(',', '.')));
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_PET_LEVEL, Math.max(1, n));
  };
  const currentLevel = toLevel(currentLevelRaw);
  const targetLevel = toLevel(targetLevelRaw);
  const currentXp = xpForLevel(currentLevel);
  const targetXp = xpForLevel(targetLevel);
  const xpRemaining = Math.max(0, targetXp - currentXp);

  // Index nom → item DofusDB : seulement pour les resources qui ont un item
  // réel (customItems + mock), pour croiser la fiche familier avec l'HDV.
  const realItemByKey = useMemo(() => {
    const m = new Map<string, { itemId: string; name: string }>();
    for (const it of [...(customItems ?? []), ...DOFUS_MOCK_ITEMS]) {
      if (!it?.name || !it._id) continue;
      const key = normalizeName(it.name);
      if (!m.has(key)) m.set(key, { itemId: it._id, name: it.name });
    }
    return m;
  }, [customItems]);

  /**
   * Index complet nomNormalisé → prix par lot, sourcé :
   *   1. la clé `pet:<nom>` (édition manuelle ici et dans l'onglet Familiers) ;
   *   2. l'item DofusDB réel quand il existe (compat avec l'ancien format).
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
      const petEntry = hdvPrices[petKey(res.name)];
      const real = realItemByKey.get(norm);
      const realEntry = real ? hdvPrices[real.itemId] : undefined;
      const source = petEntry || realEntry;
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
    return computeRows(petXpResources, priceByKey, currentXp, targetXp);
  }, [priceByKey, currentXp, targetXp]);

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

  /** Édition manuelle d'un lot : écrite en local + Supabase via le contexte. */
  const updateLot = (resName: string, lot: LotKey, rawValue: string) => {
    const key = petKey(resName);
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

  // File de scan : ressources actuellement sans prix (à scanner). On limite la
  // file à une taille raisonnable pour ne pas surcharger la modale et le mode
  // "import par capture" reste accessible via l'onglet Prix HDV.
  const scanQueue = useMemo<ScannerQueueItem[]>(() => {
    const q: ScannerQueueItem[] = [];
    for (const r of petXpResources) {
      const norm = normalizeName(r.name);
      const lots = priceByKey.get(norm)?.lots;
      if (lots && (lots.x1 > 0 || lots.x10 > 0 || lots.x100 > 0 || lots.x1000 > 0)) continue;
      q.push({ expectedName: r.name, expectedId: petKey(r.name), type: 'Ressource' });
      if (q.length >= 100) break;
    }
    return q;
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
            onClick={() => openScanner(scanQueue.length > 0 ? scanQueue : undefined, { title: 'Scan HDV — Familiers' })}
            disabled={scanQueue.length === 0}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg border transition-colors ${
              scanQueue.length > 0
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-transparent shadow-lg hover:opacity-90'
                : 'bg-white/5 text-slate-500 border-white/10 cursor-not-allowed'
            }`}
            title={scanQueue.length > 0 ? `${scanQueue.length} ressources sans prix à scanner` : 'Toutes les ressources ont un prix'}
          >
            <RefreshCw className="h-4 w-4" />
            Scanner une capture HDV
            {scanQueue.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-black/30 rounded text-[10px]">{scanQueue.length}</span>}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-400 leading-relaxed">
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">1. Prix par lot</div>
            Les 4 cases <b>x1 · x10 · x100 · x1000</b> sont modifiables en ligne. Le prix unitaire tenant le plus économique est retenu automatiquement pour le ratio et le coût.
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">2. Niveau du familier</div>
            Niveau actuel (1) → niveau ciblé (100). La conversion est automatique : niveau 1 = 0 XP, niveau {MAX_PET_LEVEL} = {DEFAULT_MAX_XP.toLocaleString()} XP.
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
            min={1}
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
            min={1}
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
          {xpRemaining <= 0 && <span className="ml-2 text-emerald-400 font-bold">Déjà max ✓</span>}
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
            <div className="text-base font-extrabold text-white truncate w-full" title={summary.bestResource.name}>{summary.bestResource.name}</div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-semibold">{row.name}</span>
                      {summary.bestResource?.name === row.name && (
                        <TrendingDown className="h-3.5 w-3.5 text-emerald-400" title="Plus rentable" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{row.xp.toLocaleString()}</td>
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
