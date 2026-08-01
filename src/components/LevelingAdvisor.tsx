import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ComponentType, FC } from 'react';
import { useDofus } from '../context/DofusContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { DOFUS_JOBS } from '../data/mockData';
import { fetchCraftsByJob } from '../services/api';
import type { CraftItem, NormalizedRecipeIngredient } from '../services/api';
import { BREAKING_JOBS } from '../lib/breaking';
import {
  Flame, Trees, Pickaxe, Scissors, Droplets, Fish, Bone,
  Wrench, Shield, Footprints, Gem, Wand2, Wheat, Heart,
  Loader2, TrendingUp, TrendingDown, AlertTriangle, Search,
  GraduationCap, Info, Copy, Check, ChevronDown, Camera, CheckCircle2
} from 'lucide-react';
import ItemImage from './ItemImage';
import QuickPriceInput from './QuickPriceInput';
import { getCalculatedXp, calculateCraftsToTarget, JOB_XP_LEVELS } from '../lib/leveling/xp';
import type { LevelGoalResult } from '../lib/leveling/xp';
import { getOptimalCost, isPriceStaleOrMissing } from '../lib/pricing';

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
  const { user } = useAuth();
  const { navigateToHdvItem, previousItemId, previousJob, previousJobLevel, clearPreviousNavigation, navigateToCraftsItem, pendingLevelingItemId, pendingLevelingJob, pendingLevelingJobLevel, pendingLevelingItemLevel, clearPendingLevelingNavigation, navigateToBreakingItem, pendingBreakingItemId, clearPendingBreakingNavigation, openScanner, openTargetedScanner } = useNavigation();

  const [activeJob, setActiveJob] = useState<string>('Forgeron');
  const [jobLevel, setJobLevel] = useState<number>(1);
  const [craftItems, setCraftItems] = useState<CraftItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [targetLevel, setTargetLevel] = useState<number>(2);
  const [currentXp, setCurrentXp] = useState(0);

  // Réinitialiser XP et ajuster la cible quand le niveau change
  useEffect(() => {
    setCurrentXp(0);
    setTargetLevel(prev => Math.max(prev, jobLevel + 1));
  }, [jobLevel]);


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

  // Navigation entrante depuis Rentabilité Crafts
  useEffect(() => {
    if (!pendingLevelingItemId || craftItems.length === 0) return;

    // Si le métier doit encore changer, on attend le prochain chargement des crafts
    if (pendingLevelingJob && pendingLevelingJob !== activeJob) {
      setActiveJob(pendingLevelingJob);
      return;
    }

    // Ajuster le niveau du métier si l'item ciblé est au-dessus du filtre de visibilité
    if (pendingLevelingItemLevel !== null && pendingLevelingItemLevel > jobLevel) {
      setJobLevel(pendingLevelingItemLevel);
    }

    if (pendingLevelingJobLevel !== null && pendingLevelingJobLevel !== jobLevel) {
      setJobLevel(pendingLevelingJobLevel);
    }

    const exists = craftItems.find(item => item._id === pendingLevelingItemId);
    if (exists) {
      setSelectedItemId(pendingLevelingItemId);
      clearPendingLevelingNavigation();
    }
  }, [pendingLevelingItemId, pendingLevelingJob, pendingLevelingJobLevel, pendingLevelingItemLevel, craftItems, activeJob, jobLevel, clearPendingLevelingNavigation]);

  // Navigation entrante depuis le Simulateur de Brisage
  useEffect(() => {
    if (!pendingBreakingItemId || craftItems.length === 0) return;
    const exists = craftItems.find(item => item._id === pendingBreakingItemId);
    if (exists) {
      setSelectedItemId(pendingBreakingItemId);
      clearPendingBreakingNavigation();
    }
  }, [pendingBreakingItemId, craftItems, clearPendingBreakingNavigation]);

  const minLevel = Math.max(1, jobLevel - 20);
  // Plage par défaut : au minimum Niv. 1 à 20 pour que les bas niveaux
  // (ex. Niv. 1 → 2) montrent toujours les crafts de départ.
  const defaultMaxLevel = Math.max(jobLevel, 20);

  const filteredItems = useMemo(() => {
    let list = craftItems.filter(item => item.level >= minLevel && item.level <= defaultMaxLevel);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [craftItems, searchQuery, defaultMaxLevel, minLevel]);

  const rows = useMemo<LevelRow[]>(() => {
    return filteredItems.map(item => {
      const xpGained = getCalculatedXp(item.level, jobLevel, 1, item.craftXpRatio);

      let craftCost = 0;
      let missingIngredients = false;
      for (const ing of item.recipeIngredients ?? []) {
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

  // ── Scan Métier par tranche de niveau ─────────────────────────────────────
  // Collecte TOUTES les ressources de toutes les recettes de la tranche
  // affichée (Niv. minLevel → defaultMaxLevel), dédoublonnées par id, puis ne garde
  // que celles dont le prix est manquant ou obsolète (> 10 jours).
  const trancheFromLevel = minLevel;
  const trancheToLevel = defaultMaxLevel;

  const rangeRecipes = useMemo(
    () => craftItems.filter(r => r.level >= trancheFromLevel && r.level <= trancheToLevel),
    [craftItems, trancheFromLevel, trancheToLevel],
  );

  const allTrancheIngredients = useMemo<NormalizedRecipeIngredient[]>(() => {
    const map = new Map<string, NormalizedRecipeIngredient>();
    for (const r of rangeRecipes) {
      for (const ing of r.recipeIngredients ?? []) {
        if (!map.has(ing.id)) map.set(ing.id, ing);
      }
    }
    return Array.from(map.values());
  }, [rangeRecipes]);

  const staleOrMissingIngredients = useMemo(
    () => allTrancheIngredients.filter(ing => isPriceStaleOrMissing(ing.id, hdvPrices)),
    [allTrancheIngredients, hdvPrices],
  );

  const openJobScan = useCallback(() => {
    // S'il reste des prix à actualiser : scan ciblé "stale" sur la liste filtrée.
    // Sinon (tout est à jour) : on ouvre quand même en mode "full" pour permettre
    // un rescan manuel de toute la tranche.
    const items: ScannerQueueItem[] = (
      staleOrMissingIngredients.length > 0 ? staleOrMissingIngredients : allTrancheIngredients
    ).map(ing => ({
      expectedName: ing.name,
      expectedId: ing.id,
      type: ing.type,
    }));
    openScanner(items, {
      title: `Scan HDV Métier - ${activeJob} Niv. ${trancheFromLevel} à ${trancheToLevel}`,
      initialScanMode: staleOrMissingIngredients.length > 0 ? 'stale' : 'full',
    });
  }, [staleOrMissingIngredients, allTrancheIngredients, openScanner, activeJob, trancheFromLevel, trancheToLevel]);

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

  // -- Split rows into complete (scored) and unknown --
  const sortedComplete = useMemo(() => {
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

  const planning = useMemo<LevelGoalResult | null>(() => {
    if (!selectedRow || isCostUnknown(selectedRow) || selectedRow.craftCost <= 0) return null;
    return calculateCraftsToTarget(
      selectedRow.item.level,
      jobLevel,
      Math.max(jobLevel + 1, Math.min(200, targetLevel)),
      currentXp,
      selectedRow.craftCost,
      selectedRow.item.craftXpRatio,
    );
  }, [selectedRow, jobLevel, targetLevel, currentXp, activeJob]);

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
            Niveaux
          </label>
          <div className="flex flex-col gap-2.5">
            {/* Niveau actuel */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 w-[52px] shrink-0">Actuel</span>
              <input
                type="number"
                min={1}
                max={200}
                value={jobLevel}
                onChange={e => setJobLevel(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-20 bg-slate-950/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-sm text-white font-bold focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 text-center"
              />
              <span className="text-xs text-slate-400">/ 200</span>
            </div>
            <div className="w-full h-1 bg-slate-800/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 transition-all duration-300"
                style={{ width: `${Math.round((jobLevel / 200) * 100)}%` }}
              />
            </div>
            {/* XP actuelle */}
            {(() => {
              const currentLevelMaxXp = Math.max(0, (JOB_XP_LEVELS[jobLevel + 1] ?? 0) - (JOB_XP_LEVELS[jobLevel] ?? 0));
              return (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 w-[52px] shrink-0">XP</span>
                  <input
                    type="number"
                    min={0}
                    max={currentLevelMaxXp}
                    value={currentXp}
                    onChange={e => setCurrentXp(Math.max(0, Math.min(currentLevelMaxXp, Number(e.target.value) || 0)))}
                    className="w-20 bg-slate-950/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-slate-500">/ {currentLevelMaxXp.toLocaleString()} XP</span>
                </div>
              );
            })()}
            {/* Niveau cible */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 w-[52px] shrink-0">Objectif</span>
              <input
                type="number"
                min={jobLevel + 1}
                max={200}
                value={targetLevel}
                onChange={e => setTargetLevel(Math.max(jobLevel + 1, Math.min(200, Number(e.target.value) || jobLevel + 1)))}
                className="w-20 bg-slate-950/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-sm text-white font-bold focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 text-center"
              />
              <span className="text-xs text-slate-400">/ 200</span>
            </div>
            <div className="w-full h-1 bg-slate-800/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 transition-all duration-300"
                style={{ width: `${Math.round((targetLevel / 200) * 100)}%` }}
              />
            </div>

            {/* Scan Métier par tranche de niveau */}
            {(() => {
              const staleCount = staleOrMissingIngredients.length;
              const allUpToDate = staleCount === 0;
              return (
                <button
                  type="button"
                  onClick={openJobScan}
                  disabled={isLoadingItems || rangeRecipes.length === 0}
                  className={`mt-1 w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all border relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed ${
                    allUpToDate
                      ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                  }`}
                  title={`Scanner les prix des ressources de la tranche Niv. ${trancheFromLevel} à ${trancheToLevel}`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Camera className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Scanner la tranche Niv. {trancheFromLevel} - {trancheToLevel}</span>
                  </span>
                  {allUpToDate ? (
                    <span className="shrink-0 flex items-center gap-1 text-[9px] bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      À jour (&lt;10j)
                    </span>
                  ) : (
                    <span className="shrink-0 flex items-center gap-1 text-[9px] bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded-full">
                      <Camera className="h-2.5 w-2.5" />
                      {staleCount} ressource{staleCount > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              );
            })()}
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
          Affichage des recettes optimisées (<strong className="text-amber-400">Niv. {minLevel} à {defaultMaxLevel}</strong>).
          Pour un classement fiable, cliquez sur les items et complétez les prix manquants.
        </span>
      </div>

      {/* Warning banner for incomplete items */}
      {(() => {
        if (sortedUnknown.length === 0) return null;
        return (
          <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-slate-300 relative z-10">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong className="text-amber-400">{sortedUnknown.length} item{sortedUnknown.length > 1 ? 's' : ''} ignoré{sortedUnknown.length > 1 ? 's' : ''}</strong> du classement —
              <span> {sortedUnknown.length} avec prix manquants</span>.
              Renseignez les données dans la section ci-dessous.
            </span>
          </div>
        );
      })()}

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
            : `Aucun craft disponible entre les niveaux ${minLevel} et ${defaultMaxLevel} pour ce métier.`}
        </div>
      )}

      {/* Master-Detail Layout */}
      {!isLoadingItems && rows.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 relative z-10">
          {/* ─── MASTER PANEL (1/3) ─── */}
          <div className="w-full lg:w-[34%] flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
            {/* Complete items section (prices + volume) */}
            {sortedComplete.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-1">
                  Items recommandés ({sortedComplete.length})
                </h3>
                {sortedComplete.map((row, index) => {
                  const benefit = getNetBenefit(row);
                  const roi = getROI(row);
                  const isProfit = benefit >= 0;
                  const isSelected = selectedItemId === row.item._id;
                  const isTop3 = index < 3;
                  return (
                    <div
                      key={row.item._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectItem(row.item._id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectItem(row.item._id);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 relative overflow-hidden cursor-pointer ${
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
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openTargetedScanner({ expectedName: row.item.name, expectedId: row.item._id, type: row.item.type }); }}
                              className="shrink-0 p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                              title={`Scan forcé des prix de ${row.item.name}`}
                            >
                              <Camera className="h-3.5 w-3.5" />
                            </button>
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
                    </div>
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
                    <div
                      key={row.item._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectItem(row.item._id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectItem(row.item._id);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
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
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openTargetedScanner({ expectedName: row.item.name, expectedId: row.item._id, type: row.item.type }); }}
                              className="shrink-0 p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                              title={`Scan forcé des prix de ${row.item.name}`}
                            >
                              <Camera className="h-3.5 w-3.5" />
                            </button>
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
                    </div>
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
                <div className="flex items-start gap-4 border-b border-slate-700/50 pb-4">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent rounded-xl blur-sm" />
                    <ItemImage item={selectedItem} className="h-14 w-14 bg-slate-800/30 rounded-xl p-1.5 border border-slate-700/30 relative shadow-lg" />
                  </div>
                  <div className="min-w-0 flex-1">
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
                  <button
                    type="button"
                    onClick={() => navigateToCraftsItem(selectedItem._id, activeJob)}
                    className="shrink-0 flex items-center gap-1.5 bg-[#151f32] hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/20 text-slate-300 hover:text-emerald-400 text-[10px] font-bold py-2 px-2.5 rounded-lg transition-all"
                    title="Voir dans Rentabilité Crafts"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Rentabilité</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openScanner([
                      { expectedName: selectedItem.name, expectedId: selectedItem._id, type: selectedItem.type },
                      ...selectedItem.recipeIngredients.map(ing => ({ expectedName: ing.name, expectedId: ing.id, type: ing.type }))
                    ])}
                    className="shrink-0 flex items-center gap-1.5 bg-[#151f32] hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/20 text-slate-300 hover:text-cyan-400 text-[10px] font-bold py-2 px-2.5 rounded-lg transition-all"
                    title="Scanner les prix de cette recette"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Scan recette</span>
                  </button>
                  {BREAKING_JOBS.includes(activeJob) && (
                    <button
                      type="button"
                      onClick={() => navigateToBreakingItem(selectedItem._id)}
                      className="shrink-0 flex items-center gap-1.5 bg-[#151f32] hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-slate-300 hover:text-red-400 text-[10px] font-bold py-2 px-2.5 rounded-lg transition-all"
                      title="Voir dans Simulateur de Brisage"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Brisage</span>
                    </button>
                  )}
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
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openTargetedScanner({ expectedName: selectedItem.name, expectedId: selectedItem._id, type: selectedItem.type }); }}
                          className="shrink-0 p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                          title={`Scan forcé des prix de ${selectedItem.name}`}
                        >
                          <Camera className="h-3 w-3" />
                        </button>
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
                      disabled={!user}
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

                {/* Planification objectif de niveau */}
                {planning && (
                  <div className="p-4 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.03]">
                    <div className="flex items-center gap-2 mb-3">
                      <GraduationCap className="h-4 w-4 text-cyan-400" />
                      <span className="text-[11px] uppercase tracking-widest text-cyan-300 font-bold">
                        Objectif Niveau {targetLevel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-slate-900/40 rounded-lg p-3 text-center">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">Crafts nécessaires</p>
                        <p className="text-xl font-extrabold text-cyan-400">{planning.totalCrafts.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-900/40 rounded-lg p-3 text-center">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">Coût total estimé</p>
                        <p className="text-xl font-extrabold text-cyan-400">{Math.round(planning.totalCost).toLocaleString()} K</p>
                      </div>
                    </div>
                    <details className="group">
                      <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300 transition-colors list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                        Détail par niveau
                      </summary>
                      <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
                        {planning.xpPerLevel.map(d => (
                          <div key={d.level} className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/30 rounded px-2 py-1">
                            <span className="font-mono text-slate-300">Niv. {d.level}</span>
                            <span className="text-slate-500">{d.xpNeeded.toLocaleString()} XP</span>
                            <span className="text-cyan-400">× {d.crafts} craft{d.crafts > 1 ? 's' : ''}</span>
                            <span className="font-mono text-slate-300">{Math.round(d.subtotalCost).toLocaleString()} K</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {/* Ingredients */}
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-slate-300 font-bold mb-2 block">
                    Ingrédients requis
                  </label>
                  <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                    {(selectedItem.recipeIngredients ?? []).map(ing => {
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
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openTargetedScanner({ expectedName: ing.name, expectedId: ing.id, type: ing.type }); }}
                                className="shrink-0 p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                                title={`Scan forcé des prix de ${ing.name}`}
                              >
                                <Camera className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-500">x{ing.quantity}</div>
                          </div>
                          <QuickPriceInput
                            x1={currentX1}
                            x10={currentX10}
                            x100={currentX100}
                            x1000={currentX1000}
                            onSetPrices={(a, b, c, d) => setHdvPrice(ing.id, a, b, c, d)}
                            disabled={!user}
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
