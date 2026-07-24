import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ComponentType, FC } from 'react';
import { useDofus } from '../context/DofusContext';
import { useNavigation } from '../context/NavigationContext';
import { DOFUS_JOBS } from '../data/mockData';
import { fetchCraftsByJob } from '../services/api';
import type { CraftItem } from '../services/api';
import {
  Flame, Trees, Pickaxe, Scissors, Droplets, Fish, Bone,
  Wrench, Shield, Footprints, Gem, Wand2, Wheat, Heart,
  Loader2, TrendingUp, TrendingDown, AlertTriangle, Search,
  GraduationCap, Info, Copy, Check
} from 'lucide-react';
import ItemImage from './ItemImage';
import QuickPriceInput from './QuickPriceInput';
import { getCalculatedXp } from '../lib/leveling/xp';
import { getOptimalCost } from '../lib/pricing';

const JOB_ICONS: { [key: string]: ComponentType<any> } = {
  'Alchimiste': Droplets, 'Bijoutier': Gem, 'Bricoleur': Wrench,
  'Bûcheron': Trees, 'Chasseur': Bone, 'Cordonnier': Footprints,
  'Éleveur': Heart, 'Façonneur': Shield, 'Forgeron': Flame,
  'Mineur': Pickaxe, 'Paysan': Wheat, 'Pêcheur': Fish,
  'Sculpteur': Wand2, 'Tailleur': Scissors
};

const CopyButton: FC<{ text: string }> = ({ text }) => {
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

interface LevelRow {
  item: CraftItem;
  xpGained: number;
  craftCost: number;
  missingIngredients: boolean;
}

export default function LevelingAdvisor() {
  const { hdvPrices, setHdvPrice } = useDofus();
  const { navigateToHdvItem, previousItemId, previousJob, previousJobLevel, clearPreviousNavigation } = useNavigation();

  const [activeJob, setActiveJob] = useState<string>('Forgeron');
  const [jobLevel, setJobLevel] = useState<number>(1);
  const [craftItems, setCraftItems] = useState<CraftItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);


  useEffect(() => {
    setCraftItems([]);
    setIsLoadingItems(true);
    fetchCraftsByJob(activeJob)
      .then(items => setCraftItems(items))
      .finally(() => setIsLoadingItems(false));
  }, [activeJob]);

  useEffect(() => {
    if (previousJob && previousJob !== activeJob) {
      setActiveJob(previousJob);
    }
    if (previousJobLevel !== null && previousJobLevel !== jobLevel) {
      setJobLevel(previousJobLevel);
    }
  }, [previousJob, previousJobLevel, activeJob, jobLevel]);

  useEffect(() => {
    if (previousItemId && craftItems.length > 0) {
      const exists = craftItems.find(item => item._id === previousItemId);
      if (exists) setSelectedItemId(previousItemId);
      clearPreviousNavigation();
    }
  }, [previousItemId, craftItems, clearPreviousNavigation]);

  const minLevel = Math.max(1, jobLevel - 20);

  const filteredItems = useMemo(() => {
    let list = craftItems.filter(item => item.level >= minLevel && item.level <= jobLevel);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [craftItems, searchQuery, jobLevel, minLevel]);

  const rows = useMemo<LevelRow[]>(() => {
    return filteredItems.map(item => {
      const xpGained = getCalculatedXp(item.level, jobLevel, activeJob, 1, item.name);

      let craftCost = 0;
      let missingIngredients = false;
      for (const ing of item.ingredients) {
        const cost = getOptimalCost(hdvPrices[ing.id], ing.quantity);
        if (cost !== null) {
          craftCost += cost;
        } else {
          missingIngredients = true;
        }
      }

      return { item, xpGained, craftCost, missingIngredients };
    });
  }, [filteredItems, jobLevel, hdvPrices]);

  const hasResalePrice = (itemId: string): boolean => {
    const p = hdvPrices[itemId];
    return !!p && (p.x1 > 0 || p.x10 > 0 || p.x100 > 0 || p.x1000 > 0);
  };

  const isCostUnknown = (row: LevelRow): boolean =>
    row.missingIngredients || row.craftCost <= 0 || !hasResalePrice(row.item._id);

  const getNetBenefit = (row: LevelRow): number => {
    const priceData = hdvPrices[row.item._id];
    const resale = priceData?.unitAverage ?? 0;
    return resale - row.craftCost;
  };

  const getROI = (row: LevelRow): number => {
    if (row.craftCost <= 0) return 0;
    const benefit = getNetBenefit(row);
    return (benefit / row.craftCost) * 100;
  };

  const getEfficiencyScore = (row: LevelRow): number => {
    return getROI(row) * row.xpGained;
  };

  const formatKamas = (n: number): string => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${Math.round(n).toLocaleString()} K`;
  };

  // -- Split rows into known (scored) and unknown (missing prices) --
  const sortedKnown = useMemo(() => {
    return [...rows]
      .filter(r => !isCostUnknown(r))
      .sort((a, b) => {
        const scoreA = getEfficiencyScore(a);
        const scoreB = getEfficiencyScore(b);
        return scoreB - scoreA;
      });
  }, [rows, hdvPrices]);

  const sortedUnknown = useMemo(() => {
    return [...rows]
      .filter(r => isCostUnknown(r))
      .sort((a, b) => b.item.level - a.item.level);
  }, [rows]);

  const selectedRow = useMemo(
    () => rows.find(r => r.item._id === selectedItemId) ?? null,
    [rows, selectedItemId],
  );

  const selectItem = (id: string) => setSelectedItemId(id);

  const selectedItem = selectedRow?.item ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/90 to-yellow-600 shadow-lg shadow-amber-500/25">
          <GraduationCap className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Conseiller XP métier</h1>
          <p className="text-xs text-slate-400">Trouvez les meilleurs crafts pour monter votre métier</p>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 relative z-10">
        <div className="glass-panel rounded-xl p-4">
          <label className="text-[11px] uppercase tracking-widest text-slate-300 font-bold mb-2 block">Métier</label>
          <div className="flex flex-wrap gap-1.5">
            {DOFUS_JOBS.map(job => {
              const Icon = JOB_ICONS[job] || Flame;
              const isActive = activeJob === job;
              return (
                <button
                  key={job}
                  onClick={() => setActiveJob(job)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    isActive
                      ? 'border border-amber-500 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.2)] text-amber-400'
                      : 'bg-slate-800/30 hover:bg-slate-700/50 border border-slate-700/30 transition-all'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {job}
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <label className="text-[11px] uppercase tracking-widest text-slate-300 font-bold mb-2 block">
            Niveau du métier
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={200}
                value={jobLevel}
                onChange={e => setJobLevel(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-24 bg-slate-950/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 text-center"
              />
              <span className="text-xs text-slate-400">/ 200</span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-800/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 transition-all duration-300"
                style={{ width: `${Math.round((jobLevel / 200) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <label className="text-[11px] uppercase tracking-widest text-slate-300 font-bold mb-2 block">Recherche</label>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-amber-400 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nom d'item..."
               className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Level range banner */}
      <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl bg-slate-900/40 backdrop-blur-md border border-slate-700/50 text-xs text-slate-300 relative z-10 shadow-xl">
        <Info className="h-4 w-4 text-amber-400 shrink-0" />
        <span>
          Affichage des recettes optimisées (<strong className="text-amber-400">Niv. {minLevel} à {jobLevel}</strong>).
          Pour un classement fiable, cliquez sur les items et complétez les prix manquants.
        </span>
      </div>

      {/* Loading State */}
      {isLoadingItems && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingItems && rows.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
          {searchQuery.trim()
            ? 'Aucun item ne correspond à votre recherche.'
            : `Aucun craft disponible entre les niveaux ${minLevel} et ${jobLevel} pour ce métier.`}
        </div>
      )}

      {/* Master-Detail Layout */}
      {!isLoadingItems && rows.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 relative z-10">
          {/* ─── MASTER PANEL (1/3) ─── */}
          <div className="w-full lg:w-[34%] flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
            {/* Known items section */}
            {sortedKnown.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-1">
                  Items renseignés ({sortedKnown.length})
                </h3>
                {sortedKnown.map((row, index) => {
                  const benefit = getNetBenefit(row);
                  const roi = getROI(row);
                  const isProfit = benefit >= 0;
                  const isSelected = selectedItemId === row.item._id;
                  const isTop3 = index < 3;
                  return (
                    <button
                      key={row.item._id}
                      onClick={() => selectItem(row.item._id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                        isSelected || isTop3
                          ? 'border border-emerald-500/60 bg-emerald-900/10 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                          : 'border border-slate-700/40 bg-slate-800/20 hover:bg-slate-800/40'
                      }`}
                    >
                      {isTop3 && !isSelected && (
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.06),transparent_70%)] pointer-events-none" />
                      )}
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <ItemImage item={row.item} className="h-10 w-10 bg-slate-800/30 rounded-lg p-1 border border-slate-700/30" />
                          {isTop3 && (
                            <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold text-white px-1.5 rounded-full shadow-lg ${
                              isSelected ? 'bg-amber-500 shadow-amber-500/30' : 'bg-emerald-500 shadow-emerald-500/30'
                            }`}>
                              #{index + 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold truncate ${isSelected || isTop3 ? 'text-white' : 'text-slate-200'}`}>
                              {row.item.name}
                            </span>
                            {isTop3 && (
                              <span className="shrink-0 text-[9px] font-bold text-emerald-400 bg-emerald-900/40 border border-emerald-500/40 px-1.5 py-0.5 rounded-full">
                                Recommandé
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400">Niv.{row.item.level}</span>
                            <span className="text-[10px] font-mono text-amber-400">{row.xpGained.toLocaleString()} XP</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 min-w-0">
                          <div className={`text-[11px] font-bold font-mono ${
                            isProfit ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {formatKamas(benefit)}
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <span className={`text-[9px] font-medium ${isProfit ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                              ROI
                            </span>
                            <span className={`text-[9px] font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfit ? '+' : ''}{roi.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Unknown items section */}
            {sortedUnknown.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  Prix à renseigner ({sortedUnknown.length})
                </h3>
                {sortedUnknown.map(row => {
                  const isSelected = selectedItemId === row.item._id;
                  const missingResale = !row.missingIngredients && row.craftCost > 0 && !hasResalePrice(row.item._id);
                  return (
                    <button
                      key={row.item._id}
                      onClick={() => selectItem(row.item._id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                        isSelected
                          ? 'bg-amber-900/20 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                          : 'border border-slate-700/40 bg-slate-800/20 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <ItemImage item={row.item} className="h-10 w-10 bg-slate-800/30 rounded-lg p-1 border border-slate-700/30" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold truncate ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                              {row.item.name}
                            </span>
                            {missingResale ? (
                              <span className="shrink-0 text-[9px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                Revente manquante
                              </span>
                            ) : (
                              <span className="shrink-0 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" /> Prix à renseigner
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400">Niv.{row.item.level}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── DETAIL PANEL (2/3) ─── */}
          <div className="w-full lg:w-[66%]">
            {selectedItem && selectedRow ? (
              <div className="glass-panel rounded-xl p-5 flex flex-col gap-5">

                {/* Item header */}
                <div className="flex items-center gap-4 border-b border-slate-700/50 pb-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent rounded-xl blur-sm" />
                    <ItemImage item={selectedItem} className="h-14 w-14 bg-slate-800/30 rounded-xl p-1.5 border border-slate-700/30 relative shadow-lg" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedItem.name}</h2>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
                      <span>Niveau <strong className="bg-amber-500 text-slate-950 font-bold px-2 py-1 rounded text-[11px]">{selectedItem.level}</strong></span>
                      <span className="flex items-center gap-1">
                        XP : <strong className="text-amber-400">{selectedRow.xpGained.toLocaleString()}</strong>
                      </span>
                      {!selectedRow.missingIngredients && selectedRow.craftCost > 0 && (
                        <span>
                          Coût : <strong className="text-slate-200">{Math.round(selectedRow.craftCost).toLocaleString()} K</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resale Price */}
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-slate-300 font-bold mb-2 block">
                    Prix de revente de l'item
                  </label>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/20 border border-slate-700/40">
                    <ItemImage
                      item={selectedItem}
                      className="h-9 w-9 bg-slate-800/30 rounded-lg p-1 border border-slate-700/30 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-200 truncate flex items-center gap-1.5">
                        <button type="button" onClick={e => { e.stopPropagation(); navigateToHdvItem({ _id: selectedItem._id, name: selectedItem.name, type: selectedItem.type, level: selectedItem.level, imgUrl: selectedItem.imgUrl }, selectedItem._id, activeJob, jobLevel); }} className="hover:text-amber-400 transition-colors text-left truncate">{selectedItem.name}</button>
                        <CopyButton text={selectedItem.name} />
                      </div>
                      <div className="text-[10px] text-slate-500">Revente</div>
                    </div>
                    <QuickPriceInput
                      key={selectedItem._id}
                      x1={hdvPrices[selectedItem._id]?.x1 ?? 0}
                      x10={hdvPrices[selectedItem._id]?.x10 ?? 0}
                      x100={hdvPrices[selectedItem._id]?.x100 ?? 0}
                      x1000={hdvPrices[selectedItem._id]?.x1000 ?? 0}
                      onSetPrices={(a, b, c, d) => setHdvPrice(selectedItem._id, a, b, c, d)}
                    />
                  </div>
                </div>

                {/* Bilan financier */}
                {!isCostUnknown(selectedRow) && (() => {
                  const benefit = getNetBenefit(selectedRow);
                  const roi = getROI(selectedRow);
                  const isProfit = benefit >= 0;
                  const craftCost = selectedRow.craftCost;
                  const resale = hdvPrices[selectedRow.item._id]?.unitAverage ?? 0;
                  const absCost = Math.abs(craftCost - resale);
                  const kamasPerXp = selectedRow.xpGained > 0 ? absCost / selectedRow.xpGained : 0;
                  return (
                    <div className={`px-4 py-4 rounded-xl border ${isProfit ? 'bg-emerald-500/[0.04] border-emerald-500/25 shadow-glow-emerald' : 'bg-rose-500/[0.04] border-rose-500/25 shadow-glow-rose'}`}>
                      {/* Ligne 1 : détail coût / revente */}
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <div className="text-slate-400">
                          Coût : <strong className="text-slate-200">{Math.round(craftCost).toLocaleString()} K</strong>
                        </div>
                        <div className="text-slate-600">−</div>
                        <div className="text-slate-400 text-right">
                          Revente : <strong className="text-slate-200">{Math.round(resale).toLocaleString()} K</strong>
                        </div>
                      </div>
                      {/* Ligne 2 : résultat net */}
                      <div className={`mt-2 pt-2.5 border-t ${isProfit ? 'border-emerald-500/15' : 'border-rose-500/15'} flex items-center justify-between`}>
                        <span className={`text-xs font-bold uppercase tracking-wider ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? 'Bénéfice net' : 'Perte nette'}
                        </span>
                        <span className={`text-xl font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : '-'}{Math.round(Math.abs(benefit)).toLocaleString()} K
                        </span>
                      </div>
                      {/* Ligne 3 : ROI */}
                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        <span className="text-slate-500">ROI</span>
                        <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded-md ${
                          isProfit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {isProfit ? '+' : ''}{roi.toFixed(1)}%
                        </span>
                      </div>
                      {/* Ligne 4 : ratio K/XP */}
                      <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-1">
                        <span>Soit</span>
                        <span className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {kamasPerXp.toFixed(2)} K
                        </span>
                        <span>/ XP {isProfit ? 'gagnés' : 'dépensés'}</span>
                      </div>
                    </div>
                  );
                })()}


  
                {/* Ingredients */}
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-slate-300 font-bold mb-2 block">
                    Ingrédients requis
                  </label>
                  <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                    {selectedItem.ingredients.map(ing => {
                      const priceData = hdvPrices[ing.id];
                      const currentPrice = priceData?.unitAverage ?? 0;
                      const currentX1 = priceData?.x1 ?? 0;
                      const currentX10 = priceData?.x10 ?? 0;
                      const currentX100 = priceData?.x100 ?? 0;
                      const currentX1000 = priceData?.x1000 ?? 0;
                      return (
                        <div
                          key={ing.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/20 border border-slate-700/40 hover:border-slate-700/70 hover:bg-slate-800/40 transition-all"
                        >
                          <ItemImage
                            item={ing}
                      className="h-9 w-9 bg-slate-800/30 rounded-lg p-1 border border-slate-700/30 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-200 truncate flex items-center gap-1.5">
                              <button type="button" onClick={() => navigateToHdvItem({ _id: ing.id, name: ing.name, type: ing.type, level: ing.level, imgUrl: ing.imgUrl }, selectedItemId ?? undefined, activeJob, jobLevel)} className="hover:text-amber-400 transition-colors text-left truncate">{ing.name}</button>
                              <CopyButton text={ing.name} />
                            </div>
                            <div className="text-[10px] text-slate-500">x{ing.quantity}</div>
                          </div>
                          <QuickPriceInput
                            x1={currentX1}
                            x10={currentX10}
                            x100={currentX100}
                            x1000={currentX1000}
                            onSetPrices={(a, b, c, d) => setHdvPrice(ing.id, a, b, c, d)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
                <Info className="h-8 w-8 text-slate-500" />
                <p className="text-sm text-slate-400">
                  Sélectionnez un item dans la liste de gauche pour voir son détail et saisir ses prix.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
