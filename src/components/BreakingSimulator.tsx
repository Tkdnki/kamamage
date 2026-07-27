import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { FC } from 'react';
import { useDofus } from '../context/DofusContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { fetchCraftsByJob } from '../services/api';
import type { CraftItem } from '../services/api';
import {
  Gem, Scissors, Shield, Flame, Wand2, Heart,
  Loader2, Search, AlertTriangle, TrendingUp, TrendingDown, Coins, Info, Hammer, GraduationCap,
} from 'lucide-react';
import ItemImage from './ItemImage';
import QuickPriceInput from './QuickPriceInput';
import {
  BREAKING_JOBS, DOFUSDB_BASE_URL, FETCH_TIMEOUT,
  calculateBreaking,
} from '../lib/breaking';
import type { BreakingResult, DofusDbItemFull } from '../lib/breaking';
import { DOFUS_RUNES } from '../data/mockData';
import { fetchRunePricesWithAuthor } from '../lib/sync';

const JOB_ICONS: Record<string, FC<any>> = {
  Bijoutier: Gem, Cordonnier: Scissors, Façonneur: Shield,
  Forgeron: Flame, Sculpteur: Wand2, Tailleur: Heart,
};

export default function BreakingSimulator() {
  const { hdvPrices, setHdvPrice } = useDofus();
  const { selectedServer } = useServer();
  const { user } = useAuth();
  const { navigateToCraftsItem, navigateToLevelingItem, pendingBreakingItemId, clearPendingBreakingNavigation } = useNavigation();

  const [activeJob, setActiveJob] = useState('Forgeron');
  const [craftItems, setCraftItems] = useState<CraftItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [coefficient, setCoefficient] = useState(100);
  const [rollMode, setRollMode] = useState<'avg' | 'min' | 'max'>('avg');

  const [itemStats, setItemStats] = useState<DofusDbItemFull | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [runeCommunityPrices, setRuneCommunityPrices] = useState<Record<string, { price: number; author: string | null }>>({});

  const fetchAbort = useRef<AbortController | null>(null);

  // Carte rune code → rune id
  const codeToRuneId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of DOFUS_RUNES) m[r.code] = r.id;
    return m;
  }, []);

  useEffect(() => {
    setCraftItems([]);
    setSelectedItemId(null);
    setItemStats(null);
    setIsLoadingItems(true);
    fetchCraftsByJob(activeJob)
      .then(items => setCraftItems(items))
      .finally(() => setIsLoadingItems(false));
  }, [activeJob]);

  // Navigation entrante depuis Crafts / Leveling
  useEffect(() => {
    if (!pendingBreakingItemId) return;
    const item = craftItems.find(i => i._id === pendingBreakingItemId);
    if (!item) return;
    setSelectedItemId(item._id);
    clearPendingBreakingNavigation();
  }, [pendingBreakingItemId, craftItems, clearPendingBreakingNavigation]);

  // Prix communautaires des runes (fallback)
  useEffect(() => {
    fetchRunePricesWithAuthor(selectedServer).then(data => setRuneCommunityPrices(data));
  }, [selectedServer]);

  const selectedItem = useMemo(
    () => craftItems.find(i => i._id === selectedItemId) ?? null,
    [craftItems, selectedItemId],
  );

  const fetchItemStats = useCallback(async (dofusdbId: number) => {
    if (fetchAbort.current) fetchAbort.current.abort();
    const controller = new AbortController();
    fetchAbort.current = controller;
    setIsLoadingStats(true);
    setItemStats(null);

    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(`${DOFUSDB_BASE_URL}/items/${dofusdbId}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);
      if (!res.ok) return;
      const data = await res.json();
      if (!controller.signal.aborted) setItemStats(data);
    } catch {
      clearTimeout(timeoutId);
    } finally {
      if (!controller.signal.aborted) setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (selectedItem?.dofusdbId) fetchItemStats(selectedItem.dofusdbId);
  }, [selectedItem?.dofusdbId, fetchItemStats]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return craftItems;
    const q = searchQuery.toLowerCase();
    return craftItems.filter(i => i.name.toLowerCase().includes(q));
  }, [craftItems, searchQuery]);

  const breaking = useMemo<BreakingResult | null>(() => {
    if (!selectedItem || !itemStats?.possibleEffects || itemStats.possibleEffects.length === 0) return null;

    const itemPriceData = hdvPrices[selectedItem._id];
    const craftCost = itemPriceData?.unitAverage ?? 0;

    // Prix par code de rune : hdvPrices (utilisateur) puis communauté
    const pricesByCode: Record<string, number> = {};
    for (const rune of DOFUS_RUNES) {
      const userPrice = hdvPrices[rune.id]?.unitAverage;
      const communityPrice = runeCommunityPrices[rune.code]?.price ?? 0;
      const price = (userPrice ?? 0) > 0 ? userPrice! : communityPrice;
      if (price > 0) pricesByCode[rune.code] = price;
    }

    return calculateBreaking(
      itemStats.possibleEffects,
      selectedItem.level,
      coefficient,
      rollMode,
      pricesByCode,
      craftCost,
      selectedItem.name,
      selectedItem.imgUrl,
    );
  }, [selectedItem, itemStats, coefficient, rollMode, hdvPrices, runeCommunityPrices]);

  const formatKamas = (n: number) => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${Math.round(n).toLocaleString()} K`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-400" />
          Simulateur de Brisage
        </h1>

        {/* Job selector */}
        <div className="flex flex-wrap gap-1.5">
          {BREAKING_JOBS.map(job => {
            const Icon = JOB_ICONS[job];
            const isActive = activeJob === job;
            return (
              <button
                key={job}
                onClick={() => setActiveJob(job)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                    : 'bg-slate-800/30 text-slate-400 border border-slate-700/40 hover:bg-slate-700/40'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {job}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* LEFT: Item list */}
        <div className="w-full lg:w-[35%] flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un équipement…"
              className="w-full bg-[#070a12] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/40"
            />
          </div>

          {isLoadingItems && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            </div>
          )}

          {!isLoadingItems && filteredItems.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-500">
              {searchQuery.trim() ? 'Aucun résultat.' : `Aucun équipement trouvé pour ${activeJob}.`}
            </div>
          )}

          <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {filteredItems.map(item => {
              const isSelected = selectedItemId === item._id;
              const priceData = hdvPrices[item._id];
              const hasPrice = priceData && priceData.unitAverage > 0;
              return (
                <button
                  key={item._id}
                  onClick={() => setSelectedItemId(item._id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-amber-900/15 border-amber-500/40'
                      : 'bg-slate-800/20 border-slate-700/40 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ItemImage item={item} className="h-9 w-9 bg-slate-800/30 rounded-lg p-1 border border-slate-700/30 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold truncate ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Niveau {item.level}
                        {hasPrice && <span className="ml-2 text-amber-400/70">{Math.round(priceData!.unitAverage).toLocaleString()} K</span>}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Detail + Results */}
        <div className="w-full lg:w-[65%] flex flex-col gap-4">
          {!selectedItem && (
            <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
              <Info className="h-8 w-8 text-slate-500" />
              <p className="text-sm text-slate-400">
                Sélectionnez un équipement dans la liste de gauche pour simuler son brisage.
              </p>
            </div>
          )}

          {selectedItem && isLoadingStats && (
            <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center gap-3 min-h-[300px]">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              <p className="text-sm text-slate-400">Chargement des statistiques…</p>
            </div>
          )}

          {selectedItem && !isLoadingStats && !itemStats && (
            <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center gap-3 min-h-[300px]">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-slate-400">
                Impossible de charger les statistiques de cet item.
              </p>
            </div>
          )}

          {selectedItem && !isLoadingStats && itemStats && (
            <>
              {/* Item info + controls */}
              <div className="glass-panel rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <ItemImage item={selectedItem} className="h-12 w-12 bg-slate-800/30 rounded-xl p-1 border border-slate-700/30" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-white truncate">{selectedItem.name}</h2>
                    <p className="text-[11px] text-slate-400">
                      Niveau {selectedItem.level} — {activeJob}
                      {(() => {
                        const p = hdvPrices[selectedItem._id];
                        return p?.unitAverage ? <span className="ml-2 text-amber-400">{Math.round(p.unitAverage).toLocaleString()} K</span> : null;
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => navigateToCraftsItem(selectedItem._id, activeJob)}
                      className="flex items-center gap-1 bg-[#151f32] hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/20 text-slate-400 hover:text-emerald-400 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all"
                      title="Voir dans Rentabilité Crafts"
                    >
                      <Hammer className="h-3 w-3" />
                      <span className="hidden sm:inline">Craft</span>
                    </button>
                    <button
                      onClick={() => navigateToLevelingItem(selectedItem._id, activeJob, undefined, selectedItem.level)}
                      className="flex items-center gap-1 bg-[#151f32] hover:bg-sky-500/10 border border-white/10 hover:border-sky-500/20 text-slate-400 hover:text-sky-400 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all"
                      title="Voir dans Conseiller XP"
                    >
                      <GraduationCap className="h-3 w-3" />
                      <span className="hidden sm:inline">XP</span>
                    </button>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Coefficient</label>
                    <input
                      type="number"
                      min={10}
                      max={300}
                      value={coefficient}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 10 && v <= 300) setCoefficient(v);
                      }}
                      className="w-16 bg-[#070a12] border border-white/10 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Jet</label>
                    {(['min', 'avg', 'max'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setRollMode(mode)}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all border ${
                          rollMode === mode
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-slate-800/30 text-slate-500 border-slate-700/40 hover:bg-slate-700/40'
                        }`}
                      >
                        {mode === 'min' ? 'Min' : mode === 'avg' ? 'Moyen' : 'Parfait'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rune results */}
              {breaking && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-900/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider">Valeur runes</p>
                      <p className="text-lg font-extrabold text-amber-400">{Math.round(breaking.totalValue).toLocaleString()} K</p>
                    </div>
                    <div className="bg-slate-900/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider">Coût item</p>
                      <p className="text-lg font-extrabold text-slate-300">{Math.round(breaking.craftCost).toLocaleString()} K</p>
                    </div>
                    <div className="bg-slate-900/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider">Bénéfice net</p>
                      <p className={`text-lg font-extrabold ${breaking.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKamas(breaking.netProfit)}
                      </p>
                    </div>
                    <div className="bg-slate-900/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider">ROI</p>
                      <p className={`text-lg font-extrabold ${breaking.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {breaking.roi >= 0 ? '+' : ''}{breaking.roi.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Rune table */}
                  <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                    <div className="p-3 border-b border-white/5">
                      <h3 className="text-[11px] uppercase tracking-widest text-slate-300 font-bold">
                        Runes obtenues ({breaking.runes.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th className="text-left py-2.5 px-3 font-semibold">Rune</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Qté</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Prix unitaire</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Sous-total</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Prix</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breaking.runes
                            .sort((a, b) => b.value - a.value)
                            .filter(r => r.quantity > 0.01)
                            .map((r, i) => (
                              <tr key={r.rune.id} className={`${i % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.04] transition-colors`}>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-200">{r.rune.name}</span>
                                    <span className="text-[9px] text-slate-600">({r.rune.code})</span>
                                  </div>
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-slate-300">
                                  {r.quantity.toFixed(2)}
                                </td>
                                <td className="text-right py-2 px-3 font-mono">
                                  {(() => {
                                    const uid = r.rune.id;
                                    const hdv = hdvPrices[uid];
                                    const cp = runeCommunityPrices[r.rune.code]?.price ?? 0;
                                    const up = hdv?.unitAverage ?? 0;
                                    const effective = up > 0 ? up : cp > 0 ? cp : 0;
                                    return effective > 0 ? (
                                      <span className="text-amber-400">{Math.round(effective).toLocaleString()} K</span>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    );
                                  })()}
                                </td>
                                <td className={`text-right py-2 px-3 font-mono font-bold ${r.value > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                  {Math.round(r.value).toLocaleString()} K
                                </td>
                                <td className="py-2 px-3">
                                  <QuickPriceInput
                                    x1={hdvPrices[r.rune.id]?.x1 ?? 0}
                                    x10={hdvPrices[r.rune.id]?.x10 ?? 0}
                                    x100={hdvPrices[r.rune.id]?.x100 ?? 0}
                                    x1000={hdvPrices[r.rune.id]?.x1000 ?? 0}
                                    onSetPrices={(x1, x10, x100, x1000) => setHdvPrice(r.rune.id, x1, x10, x100, x1000)}
                                    disabled={!user}
                                  />
                                </td>
                              </tr>
                            ))}
                          {breaking.runes.filter(r => r.quantity > 0.01).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-6 text-slate-500">Aucune rune produite avec ces réglages.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Profitability indicator */}
                  <div className={`px-4 py-3 rounded-xl border text-xs ${
                    breaking.netProfit >= 0
                      ? 'bg-emerald-500/[0.04] border-emerald-500/25 flex items-center gap-2'
                      : 'bg-rose-500/[0.04] border-rose-500/25 flex items-center gap-2'
                  }`}>
                    {breaking.netProfit >= 0
                      ? <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
                      : <TrendingDown className="h-4 w-4 text-rose-400 shrink-0" />
                    }
                    <span className={breaking.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {breaking.netProfit >= 0
                        ? `Brisage rentable : ${Math.round(breaking.netProfit).toLocaleString()} K de bénéfice estimé (ROI ${breaking.roi.toFixed(1)}%).`
                        : `Brisage déficitaire : perte estimée de ${Math.round(Math.abs(breaking.netProfit)).toLocaleString()} K.`
                      }
                    </span>
                  </div>
                </>
              )}

              {!breaking && itemStats && (
                <div className="glass-panel rounded-xl p-8 text-center text-sm text-slate-500 min-h-[200px] flex items-center justify-center">
                  {itemStats.possibleEffects.length > 0
                    ? 'Aucune rune produite — vérifiez les réglages ou les prix des runes.'
                    : 'Cet équipement n\'a pas de statistiques exploitables pour le brisage.'}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
