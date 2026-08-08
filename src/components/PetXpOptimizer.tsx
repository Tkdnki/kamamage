import { useMemo, useState } from 'react';
import { useDofus } from '../context/DofusContext';
import { DOFUS_MOCK_ITEMS } from '../data/mockData';
import petXpResources from '../data/petXpResources.json';
import {
  DEFAULT_MAX_XP,
  computeRows,
  normalizeName,
  summarize,
} from '../lib/petXp';
import type { PetXpRow } from '../lib/petXp';
import {
  PawPrint,
  TrendingDown,
  Search,
  Filter,
  Target,
  Coins,
  Info,
} from 'lucide-react';

type SortKey = 'name' | 'xp' | 'unitPrice' | 'ratio' | 'quantityNeeded' | 'totalCost';
type SortDir = 'asc' | 'desc';

export default function PetXpOptimizer() {
  const { hdvPrices, customItems } = useDofus();

  const [currentXpInput, setCurrentXpInput] = useState('0');
  const [targetXpRaw, setTargetXpRaw] = useState(String(DEFAULT_MAX_XP));
  const [searchQuery, setSearchQuery] = useState('');
  const [hideUnpriced, setHideUnpriced] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('unitPrice');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const currentXp = Number.isFinite(Number(currentXpInput.replace(',', '.'))) ? Number(currentXpInput.replace(',', '.')) : 0;
  const targetXp = Number.isFinite(Number(targetXpRaw.replace(',', '.'))) ? Number(targetXpRaw.replace(',', '.')) : DEFAULT_MAX_XP;
  const xpRemaining = Math.max(0, targetXp - currentXp);

  // Index nom → id : permet de croiser le nom d'une ressource familier avec un
  // item connu (search HDV / mock) disposant d'un prix.
  const priceByKey = useMemo(() => {
    const map = new Map<string, { itemId: string; unitPrice: number }>();
    const items = [...(customItems ?? []), ...DOFUS_MOCK_ITEMS];
    for (const it of items) {
      if (!it?.name || !it._id) continue;
      const price = hdvPrices[it._id]?.unitAverage ?? 0;
      if (price <= 0) continue;
      const key = normalizeName(it.name);
      if (!map.has(key) || price < (map.get(key)!.unitPrice)) {
        map.set(key, { itemId: it._id, unitPrice: price });
      }
    }
    return map;
  }, [hdvPrices, customItems]);

  const rows = useMemo<PetXpRow[]>(() => {
    return computeRows(petXpResources, priceByKey, currentXp, targetXp);
  }, [priceByKey, currentXp, targetXp]);

  const summary = useMemo(() => summarize(rows), [rows]);

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* En-tête du module */}
      <div className="glass-panel rounded-xl p-5 sm:p-6 border border-amber-500/20 shadow-xl bg-gradient-to-r from-[#0f1421] to-[#151f32]">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
          <PawPrint className="h-5 w-5 text-amber-400" />
          Optimisation Familier — XP jusqu'au Niveau 100
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-400 leading-relaxed">
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">1. Prix HDV</div>
            Renseignez / scannez les prix des ressources (onglet Prix HDV) pour activer les calculs de rentabilité.
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">2. XP de départ</div>
            Indiquez l'XP actuelle du familier (Niveau 1 = 0 XP par défaut).
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-amber-400 font-bold uppercase tracking-wider mb-1">3. XP cible</div>
            Le niveau 100 correspond à {DEFAULT_MAX_XP.toLocaleString()} XP par défaut.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">XP de départ</label>
          <input
            type="number"
            min={0}
            value={currentXpInput}
            onChange={e => setCurrentXpInput(e.target.value)}
            className="w-36 bg-[#0c101d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">XP cible (niveau)</label>
          <input
            type="number"
            min={1}
            value={targetXpRaw}
            onChange={e => setTargetXpRaw(e.target.value)}
            className="w-36 bg-[#0c101d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40"
          />
        </div>
        <div className="bg-[#0c101d]/60 border border-amber-500/20 rounded-lg px-3 py-2 text-xs">
          <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">XP restant</span>
          <span className="font-mono font-extrabold text-amber-400">{Math.round(xpRemaining).toLocaleString()}</span>
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
            <div className="text-base font-extrabold text-white truncate w-full">{summary.bestResource.name}</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border border-white/10 flex flex-col items-center justify-center text-center gap-1">
            <Target className="h-5 w-5 text-amber-400" />
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Quantité nécessaire</div>
            <div className="text-xl font-black text-amber-400">
              {summary.quantity !== null ? summary.quantity.toLocaleString() : '—'}
            </div>
            <div className="text-[10px] text-slate-500">({summary.pricedCount} ressource(s) avec prix sur {summary.totalCount})</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border border-white/10 flex flex-col items-center justify-center text-center gap-1">
            <Coins className="h-5 w-5 text-amber-400" />
            <div className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Coût total Level 100</div>
            <div className="text-xl font-black text-slate-100">
              {summary.totalCost !== null ? `${Math.round(summary.totalCost).toLocaleString()} K` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">en n'achetant que la {summary.bestResource.name}</div>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl p-5 border border-amber-500/20 bg-[#0d1117]/60 text-sm text-amber-400 flex items-center gap-3">
          <Info className="h-5 w-5 shrink-0" />
          Aucune ressource avec un prix HDV renseigné. Renseignez ou scannez les prix des resources dans l'onglet Prix HDV pour activer les calculs.
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
                {renderSortHead({ label: 'Prix HDV', k: 'unitPrice' })}
                {renderSortHead({ label: 'Ratio K / XP', k: 'ratio' })}
                {renderSortHead({ label: 'Qté nécessaire (Lvl 100)', k: 'quantityNeeded' })}
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
                  <td className="px-3 py-2 text-right font-mono text-slate-200">
                    {row.hasPrice ? `${Math.round(row.unitPrice).toLocaleString()} K` : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.hasPrice ? (
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
        Ratio = Prix HDV ÷ XP offerte (plus bas = plus rentable). La quantité et le coût sont calculés pour atteindre l'XP cible depuis l'XP de départ.
      </div>
    </div>
  );
}