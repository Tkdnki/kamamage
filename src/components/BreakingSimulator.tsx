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
  Loader2, Search, AlertTriangle, Coins, Info, Hammer, GraduationCap, Crosshair, Plus,
} from 'lucide-react';
import ItemImage from './ItemImage';
import QuickPriceInput from './QuickPriceInput';
import {
  BREAKING_JOBS, DOFUSDB_BASE_URL, FETCH_TIMEOUT,
  calculateBreaking,
} from '../lib/breaking';
import type { BreakingResult, DofusDbItemFull, ExoEntry } from '../lib/breaking';
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
  const [craftCostOverride, setCraftCostOverride] = useState<number | null>(null);

  const [itemStats, setItemStats] = useState<DofusDbItemFull | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [runeCommunityPrices, setRuneCommunityPrices] = useState<Record<string, { price: number; author: string | null }>>({});

  // Focus
  const [focusEffectIndex, setFocusEffectIndex] = useState<number | null>(null);

  // Exos
  const [exoEntries, setExoEntries] = useState<ExoEntry[]>([]);
  const [exoSelectRuneId, setExoSelectRuneId] = useState(DOFUS_RUNES.length > 0 ? DOFUS_RUNES[0].id : '');
  const [exoQuantity, setExoQuantity] = useState(1);

  const fetchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    setCraftItems([]);
    setSelectedItemId(null);
    setItemStats(null);
    setFocusEffectIndex(null);
    setExoEntries([]);
    setIsLoadingItems(true);
    fetchCraftsByJob(activeJob)
      .then(items => setCraftItems(items))
      .finally(() => setIsLoadingItems(false));
  }, [activeJob]);

  useEffect(() => {
    if (!pendingBreakingItemId) return;
    const item = craftItems.find(i => i._id === pendingBreakingItemId);
    if (!item) return;
    setSelectedItemId(item._id);
    clearPendingBreakingNavigation();
  }, [pendingBreakingItemId, craftItems, clearPendingBreakingNavigation]);

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

  const pricesByCode = useMemo(() => {
    const m: Record<string, number> = {};
    for (const rune of DOFUS_RUNES) {
      const userPrice = hdvPrices[rune.id]?.unitAverage;
      const communityPrice = runeCommunityPrices[rune.code]?.price ?? 0;
      const price = (userPrice ?? 0) > 0 ? userPrice! : communityPrice;
      if (price > 0) m[rune.code] = price;
    }
    return m;
  }, [hdvPrices, runeCommunityPrices]);

  const breaking = useMemo<BreakingResult | null>(() => {
    if (!selectedItem || !itemStats?.possibleEffects || itemStats.possibleEffects.length === 0) return null;

    const itemPriceData = hdvPrices[selectedItem._id];
    const craftCost = craftCostOverride ?? itemPriceData?.unitAverage ?? 0;

    return calculateBreaking(
      itemStats.possibleEffects,
      selectedItem.level,
      coefficient,
      rollMode,
      pricesByCode,
      craftCost,
      selectedItem.name,
      selectedItem.imgUrl,
      focusEffectIndex,
      exoEntries,
    );
  }, [selectedItem, itemStats, coefficient, rollMode, pricesByCode, hdvPrices, focusEffectIndex, exoEntries, craftCostOverride]);

  const formatKamas = (n: number) => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${Math.round(n).toLocaleString()} K`;
  };

  const addExo = () => {
    if (!exoSelectRuneId || exoQuantity <= 0) return;
    setExoEntries(prev => {
      const existing = prev.find(e => e.runeId === exoSelectRuneId);
      if (existing) {
        return prev.map(e =>
          e.runeId === exoSelectRuneId ? { ...e, quantity: e.quantity + exoQuantity } : e,
        );
      }
      return [...prev, { runeId: exoSelectRuneId, quantity: exoQuantity }];
    });
  };

  const removeExo = (runeId: string) => {
    setExoEntries(prev => prev.filter(e => e.runeId !== runeId));
  };

  const runeOptionById = useMemo(() => {
    const m: Record<string, typeof DOFUS_RUNES[0]> = {};
    for (const r of DOFUS_RUNES) m[r.id] = r;
    return m;
  }, []);

  const hasFocus = focusEffectIndex !== null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-400" />
          Simulateur de Brisage
        </h1>

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
                  onClick={() => { setSelectedItemId(item._id); setFocusEffectIndex(null); setExoEntries([]); }}
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

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Coefficient</label>
                    <input
                      type="number"
                      min={1}
                      value={coefficient}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 1) setCoefficient(v);
                        if (e.target.value === '') setCoefficient(1);
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

                  {hasFocus && (
                    <button
                      onClick={() => setFocusEffectIndex(null)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <Crosshair className="h-3 w-3" />
                      Focus: ligne {focusEffectIndex! + 1}
                    </button>
                  )}
                </div>
              </div>

              {/* Results */}
              {breaking && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Prix de l'item</p>
                      <input
                        type="number"
                        min={0}
                        value={craftCostOverride ?? breaking.craftCost}
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          setCraftCostOverride(!isNaN(v) && v >= 0 ? v : null);
                          if (e.target.value === '') setCraftCostOverride(null);
                        }}
                        className="w-full bg-transparent text-center text-lg font-extrabold text-slate-300 focus:outline-none focus:text-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div className={`bg-slate-900/40 rounded-xl p-3 text-center ${hasFocus ? 'border border-purple-500/20' : ''}`}>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                        Bénéfice net{hasFocus ? ' (Std)' : ''}
                      </p>
                      <p className={`text-lg font-extrabold ${breaking.netProfitStd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKamas(breaking.netProfitStd)}
                      </p>
                    </div>
                    <div className={`bg-slate-900/40 rounded-xl p-3 text-center ${hasFocus ? 'border border-purple-500/20' : ''}`}>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                        ROI{hasFocus ? ' (Std)' : ''}
                      </p>
                      <p className={`text-lg font-extrabold ${breaking.roiStd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {breaking.roiStd >= 0 ? '+' : ''}{breaking.roiStd.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {hasFocus && (
                    <div className="grid grid-cols-2 gap-3 -mt-1">
                      <div className="bg-purple-900/5 rounded-xl p-2 text-center border border-purple-500/20">
                        <p className="text-[8px] text-purple-400 uppercase tracking-wider">Bénéfice net (Focus)</p>
                        <p className={`text-sm font-bold ${breaking.netProfitFocus >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatKamas(breaking.netProfitFocus)}
                        </p>
                      </div>
                      <div className="bg-purple-900/5 rounded-xl p-2 text-center border border-purple-500/20">
                        <p className="text-[8px] text-purple-400 uppercase tracking-wider">ROI (Focus)</p>
                        <p className={`text-sm font-bold ${breaking.roiFocus >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {breaking.roiFocus >= 0 ? '+' : ''}{breaking.roiFocus.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Rune table */}
                  <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                    <div className="p-3 border-b border-white/5 flex items-center justify-between">
                      <h3 className="text-[11px] uppercase tracking-widest text-slate-300 font-bold">
                        Lignes de stats ({breaking.lines.length + breaking.exoLines.length})
                      </h3>
                      {hasFocus && (
                      <span className="text-[9px] text-purple-400 font-semibold">
                        Focus : cible +50% des autres lignes
                      </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th className="text-left py-2.5 px-3 font-semibold">Caractéristique</th>
                            <th className="text-center py-2.5 px-3 font-semibold">Jet</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Prix</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Runes</th>
                            <th className="text-right py-2.5 px-3 font-semibold">Kamas</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-purple-400">Runes Focus</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-purple-400">Kamas Focus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breaking.lines
                            .filter(l => l.quantityStd > 0.01 || l.quantityFocus > 0.01)
                            .map((l, i) => {
                              const effectiveUnitPrice = pricesByCode[l.rune.code] ?? 0;
                              return (
                                <tr
                                  key={l.rune.id + '-' + i}
                                  className={`${i % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.04] transition-colors ${l.isFocused ? 'bg-purple-900/10 border-l-2 border-l-purple-500' : ''}`}
                                >
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setFocusEffectIndex(l.effectIndex)}
                                        className={`p-1 rounded-md transition-all border ${
                                          l.isFocused
                                            ? 'bg-purple-500/15 border-purple-500/40 text-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.2)]'
                                            : 'bg-slate-800/40 border-slate-700/50 text-slate-500 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300'
                                        }`}
                                        title={l.isFocused ? 'Désactiver le focus' : 'Focaliser le brisage sur cette stat (+50 % des autres)'}
                                      >
                                        <Crosshair className="h-4 w-4" />
                                      </button>
                                      <div>
                                        <span className="font-semibold text-slate-200">{l.rune.code}</span>
                                        <div className="text-[9px] text-slate-500">{l.statName}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="text-center py-2 px-3 text-slate-400 font-mono text-[10px]">
                                    {l.jetMin === l.jetMax ? l.jetMin : `${l.jetMin}–${l.jetMax}`}
                                    <br />
                                    <span className="text-amber-400/70">{l.jet.toFixed(1)}</span>
                                  </td>
                                  <td className="text-right py-2 px-3">
                                    <div className="flex flex-col items-end gap-0.5">
                                      {effectiveUnitPrice > 0 ? (
                                        <span className="text-[10px] text-amber-400 font-mono">{Math.round(effectiveUnitPrice).toLocaleString()} K</span>
                                      ) : (
                                        <span className="text-[10px] text-slate-600 font-mono">—</span>
                                      )}
                                      <QuickPriceInput
                                        x1={hdvPrices[l.rune.id]?.x1 ?? 0}
                                        x10={hdvPrices[l.rune.id]?.x10 ?? 0}
                                        x100={hdvPrices[l.rune.id]?.x100 ?? 0}
                                        x1000={hdvPrices[l.rune.id]?.x1000 ?? 0}
                                        onSetPrices={(x1, x10, x100, x1000) => setHdvPrice(l.rune.id, x1, x10, x100, x1000)}
                                        disabled={!user}
                                      />
                                    </div>
                                  </td>
                                  <td className="text-right py-2 px-3 font-mono text-slate-300">
                                    {l.quantityStd.toFixed(2)}
                                  </td>
                                  <td className={`text-right py-2 px-3 font-mono font-bold ${l.valueStd > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {Math.round(l.valueStd).toLocaleString()} K
                                  </td>
                                  <td className="text-right py-2 px-3 font-mono text-purple-300">
                                    {hasFocus ? l.quantityFocus.toFixed(2) : '—'}
                                  </td>
                                  <td className={`text-right py-2 px-3 font-mono font-bold ${hasFocus && l.valueFocus > 0 ? 'text-purple-400' : 'text-slate-500'}`}>
                                    {hasFocus ? `${Math.round(l.valueFocus).toLocaleString()} K` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          {/* Exo lines */}
                          {breaking.exoLines.map((exo, i) => {
                            const effectiveUnitPrice = pricesByCode[exo.rune.code] ?? 0;
                            return (
                              <tr key={'exo-' + exo.rune.id} className="bg-cyan-900/10 border-l-2 border-l-cyan-500">
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => removeExo(exo.rune.id)}
                                      className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                      title="Supprimer l'exo"
                                    >
                                      ×
                                    </button>
                                    <div>
                                      <span className="font-semibold text-cyan-300">{exo.rune.code}</span>
                                      <div className="text-[9px] text-cyan-400/60">Exo</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center py-2 px-3 text-slate-500 font-mono text-[10px]">—</td>
                                <td className="text-right py-2 px-3 font-mono">
                                  {effectiveUnitPrice > 0 ? (
                                    <span className="text-amber-400">{Math.round(effectiveUnitPrice).toLocaleString()} K</span>
                                  ) : (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-cyan-300">
                                  {exo.quantity.toFixed(2)}
                                </td>
                                <td className="text-right py-2 px-3 font-mono font-bold text-cyan-300">
                                  {Math.round(exo.valueStd).toLocaleString()} K
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-cyan-300">{hasFocus ? exo.quantity.toFixed(2) : '—'}</td>
                                <td className="text-right py-2 px-3 font-mono font-bold text-cyan-300">{hasFocus ? `${Math.round(exo.valueFocus).toLocaleString()} K` : '—'}</td>
                              </tr>
                            );
                          })}
                          {/* Total row */}
                          <tr className="border-t border-white/10 bg-white/[0.03]">
                            <td colSpan={4} className="py-2.5 px-3 text-right text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              Total Kamas
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono font-bold text-amber-400">
                              {Math.round(breaking.totalValueStd).toLocaleString()} K
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono text-purple-400">—</td>
                            <td className="text-right py-2.5 px-3 font-mono font-bold text-purple-400">
                              {hasFocus ? `${Math.round(breaking.totalValueFocus).toLocaleString()} K` : '—'}
                            </td>
                          </tr>
                          {breaking.lines.filter(l => l.quantityStd > 0.01 || l.quantityFocus > 0.01).length === 0 && breaking.exoLines.length === 0 && (
                            <tr>
                              <td colSpan={7} className="text-center py-6 text-slate-500">
                                Aucune rune produite avec ces réglages.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Exo section */}
                  <div className="glass-panel rounded-xl border border-white/5 p-3">
                    <h4 className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-3 flex items-center gap-1.5">
                      <Plus className="h-3 w-3" /> Ajouter un exo
                    </h4>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col">
                        <label className="text-[8px] text-slate-500 uppercase font-bold mb-0.5">Rune</label>
                        <select
                          value={exoSelectRuneId}
                          onChange={e => setExoSelectRuneId(e.target.value)}
                          className="bg-[#070a12] border border-white/10 rounded px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-cyan-500/40 max-w-[160px]"
                        >
                          {DOFUS_RUNES.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[8px] text-slate-500 uppercase font-bold mb-0.5">Quantité</label>
                        <input
                          type="number"
                          min={1}
                          value={exoQuantity}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v) && v >= 1) setExoQuantity(v);
                          }}
                          className="w-16 bg-[#070a12] border border-white/10 rounded px-2 py-1.5 text-[10px] text-white text-center focus:outline-none focus:border-cyan-500/40 [appearance:textfield]"
                        />
                      </div>
                      <button
                        onClick={addExo}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all"
                      >
                        <Plus className="h-3 w-3" /> Ajouter
                      </button>
                    </div>
                    {exoEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {exoEntries.map(e => {
                          const r = runeOptionById[e.runeId];
                          return (
                            <span key={e.runeId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-900/20 border border-cyan-500/20 text-[10px] text-cyan-300">
                              {r?.name ?? e.runeId} ×{e.quantity}
                              <button onClick={() => removeExo(e.runeId)} className="text-slate-500 hover:text-rose-400 ml-0.5">×</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
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
