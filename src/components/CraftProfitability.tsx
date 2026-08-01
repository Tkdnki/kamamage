import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ComponentType } from 'react';
import { useDofus } from '../context/DofusContext';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';

import { DOFUS_JOBS } from '../data/mockData';
import { fetchCraftsByJob } from '../services/api';
import type { CraftItem, NormalizedRecipeIngredient } from '../services/api';
import { BREAKING_JOBS } from '../lib/breaking';
import {
  Flame, Trees, Pickaxe, Scissors, Droplets, Fish, Bone,
  Wrench, Shield, Footprints, Gem, Wand2, Wheat, Heart,
  TrendingUp, TrendingDown, AlertTriangle, Coins, Sparkles, Loader2, Search,
  ShoppingCart, Check, Copy, GraduationCap, Camera
} from 'lucide-react';
import ItemImage from './ItemImage';
import QuickPriceInput from './QuickPriceInput';
import { getOptimalCost } from '../lib/pricing';

const JOB_ICONS: { [key: string]: ComponentType<any> } = {
  'Alchimiste': Droplets, 'Bijoutier': Gem, 'Bricoleur': Wrench,
  'Bûcheron': Trees, 'Chasseur': Bone, 'Cordonnier': Footprints,
  'Éleveur': Heart, 'Façonneur': Shield, 'Forgeron': Flame,
  'Mineur': Pickaxe, 'Paysan': Wheat, 'Pêcheur': Fish,
  'Sculpteur': Wand2, 'Tailleur': Scissors
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="h-4 w-4 opacity-40 hover:opacity-100 transition-opacity shrink-0"
    >
      {copied ? <Check className="h-full w-full text-emerald-400" /> : <Copy className="h-full w-full" />}
    </button>
  );
};

export default function CraftProfitability() {
  const { user } = useAuth();
  const { hdvPrices, setHdvPrice, setMonthlySalesVolume, trackItem } = useDofus();
  const { navigateToHdvItem, addIngredientsToCart, previousItemId, previousJob, clearPreviousNavigation, navigateToLevelingItem, pendingCraftsItemId, pendingCraftsJob, clearPendingCraftsNavigation, navigateToBreakingItem, pendingBreakingItemId, clearPendingBreakingNavigation, openScanner, openTargetedScanner } = useNavigation();

  const [activeJob, setActiveJob] = useState<string>('Paysan');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [craftItems, setCraftItems] = useState<CraftItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'profit-desc' | 'profit-asc' | 'roi-desc' | 'roi-asc' | 'volume-desc' | 'volume-asc' | 'level-asc' | 'level-desc' | 'name-asc' | 'name-desc'>('profit-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [hideLowVolume, setHideLowVolume] = useState(false);
  const [minSalesVolume, setMinSalesVolume] = useState(5);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [craftItems, searchQuery, sortBy]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCraftItems([]);
    setSelectedItemId(null);
    setSearchQuery('');
    setCurrentPage(1);
    setIsLoadingItems(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchCraftsByJob(activeJob)
      .then(items => {
        setCraftItems(items);
        if (items.length > 0) {
          setSelectedItemId(items[0]._id);
        }
      })
      .finally(() => setIsLoadingItems(false));
  }, [activeJob]);

  useEffect(() => {
    if (previousJob && previousJob !== activeJob) {
      setActiveJob(previousJob);
    }
  }, [previousJob, activeJob]);

  useEffect(() => {
    if (previousItemId && craftItems.length > 0) {
      const exists = craftItems.find(item => item._id === previousItemId);
      if (exists) setSelectedItemId(previousItemId);
      clearPreviousNavigation();
    }
  }, [previousItemId, craftItems, clearPreviousNavigation]);

  // Navigation entrante depuis le Conseiller XP métier
  useEffect(() => {
    if (!pendingCraftsItemId || craftItems.length === 0) return;

    // Si le métier doit encore changer, on attend le prochain chargement des crafts
    if (pendingCraftsJob && pendingCraftsJob !== activeJob) {
      setActiveJob(pendingCraftsJob);
      return;
    }

    const exists = craftItems.find(item => item._id === pendingCraftsItemId);
    if (exists) {
      setSelectedItemId(pendingCraftsItemId);
      clearPendingCraftsNavigation();
    }
  }, [pendingCraftsItemId, pendingCraftsJob, craftItems, activeJob, clearPendingCraftsNavigation]);

  // Navigation entrante depuis le Simulateur de Brisage
  useEffect(() => {
    if (!pendingBreakingItemId || craftItems.length === 0) return;
    const exists = craftItems.find(item => item._id === pendingBreakingItemId);
    if (exists) {
      setSelectedItemId(pendingBreakingItemId);
      clearPendingBreakingNavigation();
    }
  }, [pendingBreakingItemId, craftItems, clearPendingBreakingNavigation]);

  const filteredItems = useMemo(() => {
    let list = craftItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'profit-desc': {
          const pA = getCraftStats(a, a.recipeIngredients).benefit;
          const pB = getCraftStats(b, b.recipeIngredients).benefit;
          return (pB || 0) - (pA || 0);
        }
        case 'profit-asc': {
          const pA = getCraftStats(a, a.recipeIngredients).benefit;
          const pB = getCraftStats(b, b.recipeIngredients).benefit;
          return (pA || 0) - (pB || 0);
        }
        case 'roi-desc': {
          const rA = getCraftStats(a, a.recipeIngredients).roi;
          const rB = getCraftStats(b, b.recipeIngredients).roi;
          return (rB || 0) - (rA || 0);
        }
        case 'roi-asc': {
          const rA = getCraftStats(a, a.recipeIngredients).roi;
          const rB = getCraftStats(b, b.recipeIngredients).roi;
          return (rA || 0) - (rB || 0);
        }
        case 'volume-desc': {
          const vA = hdvPrices[a._id]?.monthlySalesVolume ?? 0;
          const vB = hdvPrices[b._id]?.monthlySalesVolume ?? 0;
          return vB - vA;
        }
        case 'volume-asc': {
          const vA = hdvPrices[a._id]?.monthlySalesVolume ?? 0;
          const vB = hdvPrices[b._id]?.monthlySalesVolume ?? 0;
          return vA - vB;
        }
        case 'level-asc': return a.level - b.level;
        case 'level-desc': return b.level - a.level;
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        default: return 0;
      }
    });
    return list;
  }, [craftItems, searchQuery, sortBy, hdvPrices]);

  const filteredVolumeItems = useMemo(() => {
    if (!hideLowVolume) return filteredItems;
    return filteredItems.filter(item => {
      const volume = hdvPrices[item._id]?.monthlySalesVolume ?? 0;
      return volume >= (minSalesVolume || 0);
    });
  }, [filteredItems, hideLowVolume, minSalesVolume, hdvPrices]);

  const totalPages = Math.max(1, Math.ceil(filteredVolumeItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const displayedItems = useMemo(
    () => filteredVolumeItems.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE),
    [filteredVolumeItems, safePage],
  );

  const selectedItem = selectedItemId
    ? craftItems.find(item => item._id === selectedItemId) ?? craftItems[0] ?? null
    : craftItems[0] ?? null;

  const activeIngredients: NormalizedRecipeIngredient[] = selectedItem?.recipeIngredients ?? [];

  const handleJobChange = (jobName: string) => {
    setActiveJob(jobName);
  };

  const getSaleProbability = (volume: number): { label: string; color: string } => {
    if (volume >= 1000) return { label: 'Très forte probabilité de vente rapide', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    if (volume >= 300) return { label: 'Forte probabilité de vente rapide', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (volume >= 50) return { label: 'Probabilité de vente moyenne', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    if (volume >= 1) return { label: 'Faible probabilité de vente (lente)', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
    return { label: 'Probabilité de vente inconnue (hors marché)', color: 'bg-slate-700/50 text-slate-400 border-slate-600/30' };
  };

  // ─── Calcul de la rentabilité ───────────────────────────────────────────────

  interface EnrichedIngredient extends NormalizedRecipeIngredient {
    unitPrice: number;
    totalPrice: number;
    isMissing: boolean;
    bestSource: string;
  }

  function getBestUnitPrice(itemId: string): { price: number; isMissing: boolean; source: string } {
    const p = hdvPrices[itemId];
    if (!p) return { price: 0, isMissing: true, source: '' };

    const candidates: { price: number; label: string }[] = [];
    if (p.x1 > 0) candidates.push({ price: p.x1, label: 'x1' });
    if (p.x10 > 0) candidates.push({ price: p.x10 / 10, label: 'x10' });
    if (p.x100 > 0) candidates.push({ price: p.x100 / 100, label: 'x100' });
    if (p.x1000 > 0) candidates.push({ price: p.x1000 / 1000, label: 'x1000' });

    if (candidates.length === 0) return { price: 0, isMissing: true, source: '' };

    const best = candidates.reduce((a, b) => a.price < b.price ? a : b);
    return { price: best.price, isMissing: false, source: best.label };
  }

  function getCraftStats(item: CraftItem, ingredients: NormalizedRecipeIngredient[]) {
    let totalCost = 0;
    let hasMissingPrices = false;

    const enriched: EnrichedIngredient[] = ingredients.map(ing => {
      const cost = getOptimalCost(hdvPrices[ing.id], ing.quantity);
      const isMissing = cost === null;
      if (isMissing) hasMissingPrices = true;
      const totalPrice = cost ?? 0;
      const unitPrice = ing.quantity > 0 ? totalPrice / ing.quantity : 0;
      totalCost += totalPrice;
      return { ...ing, unitPrice, totalPrice, isMissing, bestSource: '' };
    });

    const { price: sellPrice, isMissing: isSellPriceMissing } = getBestUnitPrice(item._id);
    const benefit = sellPrice - totalCost;
    const roi = totalCost > 0 ? Math.round((benefit / totalCost) * 100) : 0;
    const monthlySalesVolume = hdvPrices[item._id]?.monthlySalesVolume ?? 0;

    return {
      enriched,
      totalCost,
      hasMissingPrices,
      sellPrice,
      isSellPriceMissing,
      benefit: isNaN(benefit) ? 0 : benefit,
      roi: isNaN(roi) ? 0 : roi,
      monthlySalesVolume,
    };
  }

  const stats = selectedItem ? getCraftStats(selectedItem, activeIngredients) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* JOBS GRID */}
      <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-dofus-accent" />
          Sélectionner un métier
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {DOFUS_JOBS.map(job => {
            const Icon = JOB_ICONS[job] || Sparkles;
            const isActive = activeJob === job;
            return (
              <button
                key={job}
                onClick={() => handleJobChange(job)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-300 ${
                  isActive
                    ? 'bg-dofus-accent/10 border-dofus-accent text-dofus-accent shadow-glow-amber'
                    : 'bg-[#090d16]/40 border-white/5 text-slate-400 hover:text-white hover:border-white/10 hover:bg-[#151f32]/20'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'animate-pulse-glow text-dofus-accent' : ''}`} />
                <span className="text-xs font-semibold">{job}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: CRAFTABLE ITEMS LIST */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-white text-md">Objets Craftables ({craftItems.length})</h3>
              <span className="text-[10px] text-slate-400 font-bold bg-[#151f32] px-2 py-0.5 rounded uppercase tracking-wider">
                {activeJob}
              </span>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrer les crafts…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-dofus-accent/40"
              />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider shrink-0">Trier</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="flex-1 bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-dofus-accent/40 appearance-none cursor-pointer"
              >
                <option value="profit-desc">Bénéfice net ↓</option>
                <option value="profit-asc">Bénéfice net ↑</option>
                <option value="roi-desc">ROI % ↓</option>
                <option value="roi-asc">ROI % ↑</option>
                <option value="volume-desc">Ventes/mois ↓</option>
                <option value="volume-asc">Ventes/mois ↑</option>
                <option value="level-asc">Niveau ↑</option>
                <option value="level-desc">Niveau ↓</option>
                <option value="name-asc">Nom A-Z</option>
                <option value="name-desc">Nom Z-A</option>
              </select>
            </div>

            {isLoadingItems ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
                <Loader2 className="h-5 w-5 animate-spin text-dofus-accent" />
                Chargement des crafts…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                {searchQuery.trim()
                  ? 'Aucun craft ne correspond à votre recherche.'
                  : 'Aucun objet craftable trouvé pour ce métier.'}
              </div>
            ) : (
              <>
              <div className="flex flex-col gap-2.5 max-h-[500px] overflow-y-auto pr-1">
                {displayedItems.map(item => {
                  const isSelected = selectedItem?._id === item._id;
                  const itemStats = getCraftStats(item, item.recipeIngredients);

                  return (
                    <div
                      key={item._id}
                      className={`w-full p-3 rounded-xl border transition-all duration-300 group ${
                        isSelected
                          ? 'bg-dofus-accent/5 border-dofus-accent/40 shadow-inner'
                          : 'bg-[#090d16]/30 border-white/5 hover:border-white/10 hover:bg-[#151f32]/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => setSelectedItemId(item._id)}>
                          <div className="relative shrink-0">
                            <ItemImage item={item} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10" />
                            <span className="absolute -bottom-1 -right-1 text-[8px] bg-[#070a12] text-slate-300 font-bold px-1 rounded border border-white/10">
                              {item.level}
                            </span>
                          </div>
                          <div>
                            <h4 className={`text-sm font-semibold transition-colors leading-tight ${isSelected ? 'text-dofus-accent' : 'text-slate-200 group-hover:text-white'}`}>
                              {item.name}
                            </h4>
                            <span className="text-[9px] text-slate-400 capitalize">{item.type}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {itemStats.hasMissingPrices ? (
                            <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> Prix ?
                            </span>
                          ) : itemStats.isSellPriceMissing ? (
                            <span className="text-[9px] text-slate-500 bg-[#151f32] px-2 py-0.5 rounded-full font-bold">
                              Prix Vente ?
                            </span>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                itemStats.benefit >= 0
                                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                              }`}>
                                {itemStats.benefit >= 0 ? '+' : ''}{Math.round(itemStats.benefit).toLocaleString()} K
                              </span>
                              {(itemStats.monthlySalesVolume || 0) > 0 && (
                                <span className="text-[9px] font-semibold text-slate-500">
                                  {itemStats.monthlySalesVolume} v/m
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <QuickPriceInput
                        x1={hdvPrices[item._id]?.x1}
                        x10={hdvPrices[item._id]?.x10}
                        x100={hdvPrices[item._id]?.x100}
                        x1000={hdvPrices[item._id]?.x1000}
                        onSetPrices={(a, b, c, d) => setHdvPrice(item._id, a, b, c, d)}
                        disabled={!user}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Volume filter */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/5 mt-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideLowVolume}
                    onChange={e => setHideLowVolume(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/40 focus:ring-offset-0"
                  />
                  <span className="text-[10px] text-slate-400 font-medium">Masquer items &lt;</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={minSalesVolume}
                  onChange={e => setMinSalesVolume(Math.max(1, Number(e.target.value) || 1))}
                  disabled={!hideLowVolume}
                  className="w-14 bg-slate-950/50 border border-slate-700/50 rounded px-1.5 py-0.5 text-[10px] text-white text-center focus:outline-none focus:border-amber-500/50 disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] text-slate-500">ventes/mois</span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-2">
                  <span className="text-[10px] text-slate-500">{filteredVolumeItems.length} objets — page {safePage}/{totalPages}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="px-2 py-1 text-[11px] font-bold rounded bg-[#0c101d] border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ←
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                      const pageNum = start + i;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 text-[11px] font-bold rounded transition-colors ${
                            pageNum === safePage
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-[#0c101d] border border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="px-2 py-1 text-[11px] font-bold rounded bg-[#0c101d] border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </>
            )}
          </div>
        </div>

        {/* RIGHT: CALCULATION WORKBENCH */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {selectedItem && stats ? (
            <div className="glass-panel rounded-xl border border-white/5 shadow-xl p-5 flex flex-col gap-6 relative">
              <div className="absolute top-0 right-0 w-48 h-48 bg-dofus-accent/3 rounded-full blur-3xl -z-10" />

              {/* Header item — clickable name */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-4">
                  <div className="relative shadow-lg">
                    <ItemImage item={selectedItem} className="h-16 w-16 bg-[#151f32]/85 rounded-xl p-1 border border-white/10" imgClassName="h-12 w-12 object-contain" />
                    <span className="absolute -bottom-1.5 -right-1.5 text-xs bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black px-2 py-0.5 rounded-md shadow-md">
                      Lvl {selectedItem.level}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3
                        className="text-xl font-bold text-white leading-tight cursor-pointer hover:text-amber-400 transition-colors"
                        onClick={() => navigateToHdvItem({ _id: selectedItem._id, name: selectedItem.name, type: selectedItem.type, level: selectedItem.level, imgUrl: selectedItem.imgUrl }, selectedItem._id, activeJob)}
                      >
                        {selectedItem.name}
                      </h3>
                      <CopyButton text={selectedItem.name} />
                      <button
                        type="button"
                        onClick={() => openTargetedScanner({ expectedName: selectedItem.name, expectedId: selectedItem._id, type: selectedItem.type })}
                        className="h-4 w-4 opacity-40 hover:opacity-100 hover:text-cyan-400 transition-opacity shrink-0"
                        title={`Scan forcé des prix de ${selectedItem.name}`}
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 capitalize font-medium">
                      {selectedItem.type} &bull; Métier {activeJob}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addIngredientsToCart(activeIngredients.map(ing => ({
                      id: ing.id, name: ing.name, type: ing.type, level: ing.level, imgUrl: ing.imgUrl, quantity: ing.quantity
                    })))}
                    className="flex items-center gap-1.5 bg-[#151f32] hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-slate-300 hover:text-rose-400 text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Ajouter au panier
                  </button>
                  <button
                    onClick={() => trackItem({
                      _id: selectedItem._id,
                      name: selectedItem.name,
                      type: selectedItem.type,
                      level: selectedItem.level,
                      imgUrl: selectedItem.imgUrl,
                      dofusdbId: selectedItem.dofusdbId,
                    })}
                    className="bg-[#151f32] hover:bg-dofus-accent/10 border border-white/10 hover:border-dofus-accent/20 text-slate-300 hover:text-dofus-accent text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                  >
                    Suivre en HDV
                  </button>
                  <button
                    onClick={() => openScanner([
                      { expectedName: selectedItem.name, expectedId: selectedItem._id, type: selectedItem.type },
                      ...activeIngredients.map(ing => ({ expectedName: ing.name, expectedId: ing.id, type: ing.type }))
                    ])}
                    className="bg-[#151f32] hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/20 text-slate-300 hover:text-cyan-400 text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                  >
                    <Camera className="h-3.5 w-3.5" /> Scan recette
                  </button>
                  <button
                    onClick={() => navigateToLevelingItem(selectedItem._id, activeJob, undefined, selectedItem.level)}
                    className="bg-[#151f32] hover:bg-sky-500/10 border border-white/10 hover:border-sky-500/20 text-slate-300 hover:text-sky-400 text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                  >
                    <GraduationCap className="h-3.5 w-3.5" /> XP
                  </button>
                  {BREAKING_JOBS.includes(activeJob) && (
                    <button
                      onClick={() => navigateToBreakingItem(selectedItem._id)}
                      className="bg-[#151f32] hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-slate-300 hover:text-red-400 text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                    >
                      <Wrench className="h-3.5 w-3.5" /> Brisage
                    </button>
                  )}
                </div>
              </div>

              {/* Ingrédients */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Ingrédients requis</h4>

                {activeIngredients.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl">
                    Aucune recette trouvée pour cet item.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {stats.enriched.map(ing => (
                      <div
                        key={ing.id}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          ing.isMissing ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#090d16]/30 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateToHdvItem({ _id: ing.id, name: ing.name, type: ing.type, level: ing.level, imgUrl: ing.imgUrl }, selectedItemId ?? undefined, activeJob)}>
                          <ItemImage item={ing} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10 shrink-0" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-white leading-tight hover:text-amber-400 transition-colors">{ing.name}</p>
                              <CopyButton text={ing.name} />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openTargetedScanner({ expectedName: ing.name, expectedId: ing.id, type: ing.type }); }}
                                className="h-4 w-4 opacity-40 hover:opacity-100 hover:text-cyan-400 transition-opacity shrink-0"
                                title={`Scan forcé des prix de ${ing.name}`}
                              >
                                <Camera className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Quantité : <span className="text-dofus-accent font-bold">x{ing.quantity}</span>
                              {ing.type && <span className="ml-2 opacity-60 capitalize">{ing.type}</span>}
                            </p>
                          </div>
                        </div>

                        <QuickPriceInput
                          x1={hdvPrices[ing.id]?.x1}
                          x10={hdvPrices[ing.id]?.x10}
                          x100={hdvPrices[ing.id]?.x100}
                          x1000={hdvPrices[ing.id]?.x1000}
                          onSetPrices={(a, b, c, d) => setHdvPrice(ing.id, a, b, c, d)}
                          disabled={!user}
                        />
                        {(hdvPrices[ing.id]?.author || hdvPrices[ing.id]?.updatedAt) && (
                          <div className="flex items-center justify-end gap-2 mt-1.5">
                            {hdvPrices[ing.id]?.author && <p className="text-[9px] text-slate-500">Modifié par {hdvPrices[ing.id].author}</p>}
                            {hdvPrices[ing.id]?.updatedAt && <p className="text-[9px] text-slate-600">{new Date(hdvPrices[ing.id].updatedAt!).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Résumé économique */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                <div className="flex flex-col gap-4 bg-[#090d16]/30 p-4 border border-white/5 rounded-xl">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Coût de fabrication</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-2xl font-extrabold text-white">{stats.totalCost.toLocaleString()}</span>
                      <span className="text-xs text-dofus-accent font-bold">Kamas</span>
                    </div>
                    {stats.hasMissingPrices && (
                      <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="h-3 w-3" /> Coût incomplet (prix manquants)
                      </p>
                    )}
                  </div>

                  {/* Prix de vente (HDV) — inputs directs */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prix de vente (HDV)</span>
                    <div className="mt-1">
                      <QuickPriceInput
                        x1={hdvPrices[selectedItem._id]?.x1}
                        x10={hdvPrices[selectedItem._id]?.x10}
                        x100={hdvPrices[selectedItem._id]?.x100}
                        x1000={hdvPrices[selectedItem._id]?.x1000}
                        onSetPrices={(a, b, c, d) => setHdvPrice(selectedItem._id, a, b, c, d)}
                        disabled={!user}
                      />
                    </div>
                    {(hdvPrices[selectedItem._id]?.author || hdvPrices[selectedItem._id]?.updatedAt) && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {hdvPrices[selectedItem._id]?.author && <p className="text-[9px] text-slate-500">Modifié par {hdvPrices[selectedItem._id].author}</p>}
                        {hdvPrices[selectedItem._id]?.updatedAt && <p className="text-[9px] text-slate-600">{new Date(hdvPrices[selectedItem._id].updatedAt!).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                      </div>
                    )}
                  </div>

                  {/* Volume de ventes mensuel */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ventes / mois</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        min={0}
                        value={stats.monthlySalesVolume ?? ''}
                        onChange={e => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          setMonthlySalesVolume(selectedItem._id, v);
                        }}
                        className="w-24 bg-slate-950/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-lg font-extrabold text-white text-center focus:outline-none focus:border-amber-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-slate-400 font-bold">unités</span>
                    </div>
                    <div className="mt-2">
                      <span className={`inline-block px-3 py-1.5 rounded-md text-xs font-medium border ${getSaleProbability(stats.monthlySalesVolume || 0).color}`}>
                        {getSaleProbability(stats.monthlySalesVolume || 0).label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex flex-col justify-between gap-3 shadow-lg ${
                  stats.hasMissingPrices
                    ? 'bg-slate-900/40 border-white/5 text-slate-500'
                    : stats.isSellPriceMissing
                    ? 'bg-[#151f32]/20 border-white/5 text-slate-400'
                    : stats.benefit >= 0
                    ? 'bg-emerald-950/20 border-emerald-500/20 shadow-glow-emerald text-emerald-400'
                    : 'bg-rose-950/20 border-rose-500/20 shadow-glow-rose text-rose-400'
                }`}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bénéfice Net Estimé</span>
                    {stats.hasMissingPrices ? (
                      <div className="text-sm font-semibold text-amber-400 mt-2">
                        Renseignez tous les prix pour calculer le bénéfice.
                      </div>
                    ) : stats.isSellPriceMissing ? (
                      <div className="text-sm font-semibold text-slate-400 mt-2">
                        Prix de vente inconnu. Cliquez sur le nom de l'objet en haut pour l'ajouter.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        {stats.benefit >= 0
                          ? <TrendingUp className="h-6 w-6 text-emerald-400" />
                          : <TrendingDown className="h-6 w-6 text-rose-400" />}
                        <span className="text-3xl font-black">
                          {stats.benefit >= 0 ? '+' : ''}{Math.round(stats.benefit).toLocaleString()}
                        </span>
                        <span className="text-sm font-bold">K</span>
                      </div>
                    )}
                  </div>

                  {!stats.hasMissingPrices && !stats.isSellPriceMissing && (
                    <div className="flex justify-between items-center text-xs font-bold border-t border-white/5 pt-2.5 mt-2.5">
                      <span>Rendement (ROI) :</span>
                      <span className={`text-sm ${stats.benefit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.roi > 0 ? '+' : ''}{stats.roi}%
                      </span>
                    </div>
                  )}

                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-16 text-center border border-white/5 shadow-xl flex flex-col items-center justify-center">
              <Coins className="h-12 w-12 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">
                Sélectionnez un objet dans le panneau de gauche pour voir sa recette et calculer le coût de craft.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
