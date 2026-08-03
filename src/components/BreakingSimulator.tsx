import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { FC } from 'react';
import { useDofus } from '../context/DofusContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { fetchCraftsByJob } from '../services/api';
import type { CraftItem, NormalizedRecipeIngredient } from '../services/api';
import {
  Gem, Scissors, Shield, Flame, Wand2, Heart,
  Loader2, Search, AlertTriangle, Coins, Info, Hammer, GraduationCap, Crosshair, Plus,
  Copy, ExternalLink, Camera, PenLine, Check,
} from 'lucide-react';
import ItemImage from './ItemImage';
import QuickPriceInput from './QuickPriceInput';
import {
  BREAKING_JOBS, DOFUSDB_BASE_URL, FETCH_TIMEOUT,
  calculateBreaking, getRunePriceKey, getEffectConfig, findMatchingRune,
} from '../lib/breaking';
import type { BreakingResult, DofusDbItemFull, ExoEntry } from '../lib/breaking';
import { DOFUS_RUNES } from '../data/mockData';
import type { Rune } from '../data/mockData';
import { fetchRunePricesWithAuthor, fetchItemCoefficient, pushItemCoefficient, fetchAllItemCoefficients, deleteItemCoefficient } from '../lib/sync';
import { getOptimalCost, getPriceRecord, isPriceStaleOrMissing, isPriceOutdated } from '../lib/pricing';

const JOB_ICONS: Record<string, FC<any>> = {
  Bijoutier: Gem, Cordonnier: Scissors, Façonneur: Shield,
  Forgeron: Flame, Sculpteur: Wand2, Tailleur: Heart,
};

export default function BreakingSimulator() {
  const { hdvPrices, setHdvPrice } = useDofus();
  const { selectedServer } = useServer();
  const { user } = useAuth();
  const { navigateToCraftsItem, navigateToLevelingItem, navigateToHdvItem, openScanner, openTargetedScanner, pendingBreakingItemId, clearPendingBreakingNavigation } = useNavigation();

  const [activeJob, setActiveJob] = useState('Forgeron');
  const [craftItems, setCraftItems] = useState<CraftItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [minLevelFilter, setMinLevelFilter] = useState('');
  const [maxLevelFilter, setMaxLevelFilter ] = useState('');
  const [selectedTargetRunes, setSelectedTargetRunes] = useState<string[]>([]);
  const [filterCraftComplete, setFilterCraftComplete] = useState(false);
  const [filterItemPriced, setFilterItemPriced] = useState(false);
  const [filterBreakEvenEnabled, setFilterBreakEvenEnabled] = useState(false);
  // Seuil (en %) en dessous duquel un item est considéré rentable via Achat.
  // 100 est la valeur par défaut (rentable dès ≤ 100 % de coef).
  const [breakEvenThreshold, setBreakEvenThreshold] = useState('100');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [coefficient, setCoefficient] = useState<number | null>(null);
  const [rollMode, setRollMode] = useState<'avg' | 'min' | 'max'>('avg');

  const [itemStats, setItemStats] = useState<DofusDbItemFull | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [runeCommunityPrices, setRuneCommunityPrices] = useState<Record<string, { price: number; author: string | null }>>({});

  // Coefficients persistés en base, indexés par itemKey (pour le tri par rentabilité)
  const [coeffMap, setCoeffMap] = useState<Record<string, number>>({});

  // Focus
  const [focusEffectIndex, setFocusEffectIndex] = useState<number | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Saisie rapide des prix d'ingrédients manquants (ouvre la popup dédiée).
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {}
  };

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

  // Charge les coefficients enregistrés du serveur pour estimer la rentabilité de la liste.
  useEffect(() => {
    let cancelled = false;
    fetchAllItemCoefficients(selectedServer)
      .then(map => { if (!cancelled) setCoeffMap(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedServer]);

  const selectedItem = useMemo(
    () => craftItems.find(i => i._id === selectedItemId) ?? null,
    [craftItems, selectedItemId],
  );

  // ─── Coefficient de brisage : persistance (Supabase item_coefficients) ───

  const COEFFICIENT_DEBOUNCE_MS = 700;
  const coeffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCoeffRef = useRef<{ itemKey: string; server: string; value: number | null } | null>(null);
  const coeffFetchItemRef = useRef<string | null>(null);
  const coeffEditedRef = useRef(false);

  // Vide la file d'attente d'upsert restante (au changement d'item/serveur ou au démontage).
  const flushPendingCoefficient = useCallback(() => {
    if (coeffTimerRef.current) {
      clearTimeout(coeffTimerRef.current);
      coeffTimerRef.current = null;
    }
    const pending = pendingCoeffRef.current;
    pendingCoeffRef.current = null;
    if (pending && pending.value === null) {
      deleteItemCoefficient(pending.server, pending.itemKey).catch(err =>
        console.warn('[Brisage] ❌ Suppression du coefficient en erreur:', err),
      );
    } else if (pending && pending.value !== null && pending.value >= 1) {
      pushItemCoefficient(pending.server, pending.itemKey, pending.value).catch(err =>
        console.warn('[Brisage] ❌ Sauvegarde du coefficient en erreur:', err),
      );
    }
  }, []);

  useEffect(() => {
    return () => flushPendingCoefficient();
  }, [flushPendingCoefficient]);

  // Au chargement d'un item : reset à non renseigné puis lecture de la valeur sauvegardée pour le serveur actuel.
  // (Migration : l'ancienne valeur par défaut 100 % est ignorée, elle ne représentait aucun coefficient saisi.)
  useEffect(() => {
    if (!selectedItem?._id) return;
    const itemKey = selectedItem._id;
    flushPendingCoefficient();
    setCoefficient(null);
    coeffFetchItemRef.current = itemKey;
    coeffEditedRef.current = false;
    fetchItemCoefficient(selectedServer, itemKey)
      .then(value => {
        if (coeffFetchItemRef.current !== itemKey) return;
        if (coeffEditedRef.current) return;
        if (value !== null && value >= 1) setCoefficient(value);
      })
      .catch(() => {});
  }, [selectedItem?._id, selectedServer, flushPendingCoefficient]);

  // Écriture immédiate dans le state local + upsert différé (debounce) vers Supabase.
  // 100 % est traité comme « non renseigné » (ancienne valeur par défaut du simulateur,
  // jamais un vrai coefficient saisi) → on supprime la valeur enregistrée le cas échéant.
  const handleCoefficientChange = useCallback((value: number | null) => {
    const normalized = value !== null && value >= 1 && value !== 100 ? value : null;
    setCoefficient(normalized);
    coeffEditedRef.current = true;
    if (!selectedItem) return;
    pendingCoeffRef.current = { itemKey: selectedItem._id, server: selectedServer, value: normalized };
    if (coeffTimerRef.current) clearTimeout(coeffTimerRef.current);
    coeffTimerRef.current = setTimeout(() => {
      coeffTimerRef.current = null;
      const pending = pendingCoeffRef.current;
      pendingCoeffRef.current = null;
      if (pending) {
        if (pending.value === null) {
          // Saisie vidée → suppression du coefficient enregistré.
          deleteItemCoefficient(pending.server, pending.itemKey).catch(err =>
            console.warn('[Brisage] ❌ Suppression du coefficient en erreur:', err),
          );
        } else if (pending.value >= 1) {
          pushItemCoefficient(pending.server, pending.itemKey, pending.value).catch(err =>
            console.warn('[Brisage] ❌ Sauvegarde du coefficient en erreur:', err),
          );
        }
      }
    }, COEFFICIENT_DEBOUNCE_MS);
  }, [selectedItem, selectedServer]);

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

  const pricesByCode = useMemo(() => {
    const m: Record<string, number> = {};
    for (const rune of DOFUS_RUNES) {
      // Les prix des runes sont lus depuis le state global (hdvPrices) avec la
      // même clé que l'onglet Prix HDV : l'ID DofusDB (item_key de la rune).
      const userPrice = hdvPrices[getRunePriceKey(rune)]?.unitAverage;
      const communityPrice = runeCommunityPrices[rune.code]?.price ?? 0;
      const price = (userPrice ?? 0) > 0 ? userPrice! : communityPrice;
      if (price > 0) m[rune.code] = price;
    }
    return m;
  }, [hdvPrices, runeCommunityPrices]);

  // ─── Filtrage par niveau (Niveau Min/Max) ────────────────────────────────
  // Appliqué aux items du métier (liste de gauche) ET au scan HDV (compteur).
  // Champs vides = pas de borne (tous les niveaux).
  const levelFilteredItems = useMemo(() => {
    const minRaw = minLevelFilter.trim();
    const maxRaw = maxLevelFilter.trim();
    const min = minRaw === '' ? null : Number(minRaw);
    const max = maxRaw === '' ? null : Number(maxRaw);
    const hasMin = min !== null && !Number.isNaN(min);
    const hasMax = max !== null && !Number.isNaN(max);
    if (!hasMin && !hasMax) return craftItems;
    return craftItems.filter(item => {
      if (hasMin && item.level < min) return false;
      if (hasMax && item.level > max) return false;
      return true;
    });
  }, [craftItems, minLevelFilter, maxLevelFilter]);

  // Codes de runes générés par chaque item (résolus via findMatchingRune),
  // pour le filtre par rune(s) cible(s).
  const itemRuneCodes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of craftItems) {
      const codes: string[] = [];
      for (const eff of item.possibleEffects ?? []) {
        const cfg = getEffectConfig(eff.effectId);
        if (!cfg) continue;
        const rune = findMatchingRune(cfg.name, 0, cfg.unit);
        if (rune) codes.push(rune.code);
      }
      map.set(item._id, codes);
    }
    return map;
  }, [craftItems]);

  // ─── Scan HDV Métier (Équipements + Runes) ───────────────────────────────
  // Runes uniques associées aux lignes de stats des équipements de la tranche de
  // niveau, résolues via le mapping Stat → Rune corrigé (findMatchingRune).
  const jobRunes = useMemo<ScannerQueueItem[]>(() => {
    const runeMap = new Map<string, ScannerQueueItem>();
    for (const item of levelFilteredItems) {
      for (const eff of item.possibleEffects ?? []) {
        const cfg = getEffectConfig(eff.effectId);
        if (!cfg) continue;
        const rune = findMatchingRune(cfg.name, 0, cfg.unit);
        if (!rune) continue;
        const key = getRunePriceKey(rune);
        if (!runeMap.has(key)) {
          runeMap.set(key, { expectedName: rune.name, expectedId: key, type: 'Rune de forgemagie' });
        }
      }
    }
    return Array.from(runeMap.values());
  }, [levelFilteredItems]);

  const jobEquipments = useMemo<ScannerQueueItem[]>(
    () => levelFilteredItems.map(item => ({ expectedName: item.name, expectedId: item._id, type: item.type })),
    [levelFilteredItems],
  );

  // Tous les items à scanner du métier (équipements + runes).
  const jobScanAll = useMemo(() => [...jobEquipments, ...jobRunes], [jobEquipments, jobRunes]);

  // Un ÉQUIPEMENT est « à jour » si son prix à l'unité (unitAverage, source EXACTE
  // affichée sur la carte d'item) est strictement positif. Un prix présent mais
  // sans date de mise à jour valide est conservé (cohérent avec l'affichage).
  // À actualiser uniquement si le prix est absent/nul OU la date attestée date
  // de plus de 10 jours. Les équipements n'ont qu'un prix à l'unité (pas de lots
  // x10/x100/x1000), donc on écarte la logique « lots » réservée aux ressources.
  const needsEquipmentScan = useCallback((eq: ScannerQueueItem): boolean => {
    // Résolveur partagé : même source que la carte d'item (getPriceRecord).
    const p = getPriceRecord(eq, hdvPrices);
    // Même source de prix que la carte d'item (hdvPrices[_id].unitAverage).
    const hasValidPrice = typeof p?.unitAverage === 'number' && p.unitAverage > 0;
    if (!hasValidPrice) return true;
    // Péremption : ne s'applique que si une date existe et date de > 10 jours.
    if (!p?.updatedAt) return false;
    return isPriceOutdated(p.updatedAt, 10);
  }, [hdvPrices]);

  // Une ressource/rune nécessite un scan si son prix (lots) est absent/nul OU
  // obsolète (> 10 jours). On réutilise la logique partagée de l'HdvScannerModal.
  const needsRuneScan = useCallback(
    (it: ScannerQueueItem) => isPriceStaleOrMissing(it.expectedId, hdvPrices),
    [hdvPrices],
  );

  // La tranche de niveau s'applique déjà via jobEquipments/jobRunes (construits
  // sur levelFilteredItems) : le décompte baisse donc quand on filtre par niveau.
  const jobEquipmentsToUpdate = useMemo(
    () => jobEquipments.filter(needsEquipmentScan),
    [jobEquipments, needsEquipmentScan],
  );
  const jobRunesToUpdate = useMemo(
    () => jobRunes.filter(needsRuneScan),
    [jobRunes, needsRuneScan],
  );

  // Ouvre le scanner HDV pré-rempli pour le métier : mode "stale" (manquants +
  // > 10 jours) s'il reste des prix à actualiser, sinon "full" (tous les
  // équipements et runes de la tranche de niveau).
  const openJobScan = useCallback(() => {
    const needs = [...jobEquipmentsToUpdate, ...jobRunesToUpdate];
    const items = needs.length > 0 ? needs : jobScanAll;
    openScanner(items, {
      title: `Scan HDV Métier - ${activeJob}`,
      initialScanMode: needs.length > 0 ? 'stale' : 'full',
    });
  }, [jobEquipmentsToUpdate, jobRunesToUpdate, jobScanAll, openScanner, activeJob]);
  // ─── Rentabilité estimée de chaque item (tri de la liste) ───────────────
  // (Valeur totale estimée des runes obtenues × coefficient) − Prix d'achat.
  // Calcul réactif : se recalcule dès que les prix globaux (hdvPrices / runes)
  // ou les coefficients changent → le tri se met à jour automatiquement.
  const itemsWithProfit = useMemo(() => {
    const list: {
      item: CraftItem;
      profit: number;
      profitCraft: number | null;
      breakEvenCoefStd: number | null;
      status: 'ok' | 'no-stats' | 'missing-price' | 'no-coefficient' | 'missing-ingredients';
    }[] = [];
    for (const item of craftItems) {
      if (!item.possibleEffects || item.possibleEffects.length === 0) {
        list.push({ item, profit: Number.NEGATIVE_INFINITY, profitCraft: null, breakEvenCoefStd: null, status: 'no-stats' });
        continue;
      }
      // Coefficient non renseigné → classement basé sur un coef théorique de 100 %,
      // le badge « Coef. non testé » le signale dans la liste.
      const coeff = selectedItemId === item._id ? coefficient : (coeffMap[item._id] ?? null);
      const effCoeff = coeff !== null && coeff >= 1 ? coeff : 100;
      const coeffMissing = !(coeff !== null && coeff >= 1);
      const craftCost = hdvPrices[item._id]?.unitAverage ?? 0;
      // Coût de craft : somme des coûts optimaux des ingrédients de la recette.
      let recipeCost = 0;
      let hasMissingIngredients = false;
      for (const ing of item.recipeIngredients ?? []) {
        const c = getOptimalCost(hdvPrices[ing.id], ing.quantity);
        if (c === null) {
          hasMissingIngredients = true;
          continue;
        }
        recipeCost += c;
      }
      try {
        const b = calculateBreaking(
          item.possibleEffects,
          item.level,
          effCoeff,
          'avg',
          pricesByCode,
          craftCost,
          item.name,
          item.imgUrl,
        );
        if (b.hasMissingPrices) {
          // Un prix indispensable (item ou rune) est manquant → le profit serait faux.
          list.push({ item, profit: Number.NEGATIVE_INFINITY, profitCraft: null, breakEvenCoefStd: b.breakEvenCoefStd, status: 'missing-price' });
        } else if (hasMissingIngredients) {
          // Achat possible mais recette incomplète → profitCraft indisponible.
          list.push({
            item,
            profit: b.netProfitStd,
            profitCraft: null,
            breakEvenCoefStd: b.breakEvenCoefStd,
            status: coeffMissing ? 'no-coefficient' : 'missing-ingredients',
          });
        } else {
          list.push({
            item,
            profit: b.netProfitStd,
            profitCraft: b.totalValueStd - recipeCost,
            breakEvenCoefStd: b.breakEvenCoefStd,
            status: coeffMissing ? 'no-coefficient' : 'ok',
          });
        }
      } catch {
        list.push({ item, profit: Number.NEGATIVE_INFINITY, profitCraft: null, breakEvenCoefStd: null, status: 'no-stats' });
      }
    }
    return list;
  }, [craftItems, coefficient, selectedItemId, coeffMap, pricesByCode, hdvPrices]);

  const profitById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of itemsWithProfit) m[p.item._id] = p.profit;
    return m;
  }, [itemsWithProfit]);

  const profitCraftById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of itemsWithProfit) if (p.profitCraft !== null) m[p.item._id] = p.profitCraft;
    return m;
  }, [itemsWithProfit]);

  const statusById = useMemo(() => {
    const m: Record<string, 'ok' | 'no-stats' | 'missing-price' | 'no-coefficient' | 'missing-ingredients'> = {};
    for (const p of itemsWithProfit) m[p.item._id] = p.status;
    return m;
  }, [itemsWithProfit]);

  const breakEvenCoefById = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const p of itemsWithProfit) m[p.item._id] = p.breakEvenCoefStd;
    return m;
  }, [itemsWithProfit]);

  // Filtre par niveau, rune(s) cible(s), présence/fraîcheur des prix, seuil de
  // rentabilité via Achat, puis tri par rentabilité.
  const breakEvenThresholdNum = parseFloat(breakEvenThreshold.replace(',', '.'));
  const hasBreakEvenThreshold = filterBreakEvenEnabled && !Number.isNaN(breakEvenThresholdNum) && breakEvenThresholdNum > 0;
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = levelFilteredItems.filter(i => {
      // Recherche
      if (q && !i.name.toLowerCase().includes(q)) return false;
      // Runes cibles
      if (selectedTargetRunes.length > 0 && !(itemRuneCodes.get(i._id) ?? []).some(c => selectedTargetRunes.includes(c))) return false;
      // « Prix de craft à jour » : tous les ingrédients ont un prix valide (> 0).
      if (filterCraftComplete && i.recipeIngredients && i.recipeIngredients.length > 0) {
        for (const ing of i.recipeIngredients) {
          if (getOptimalCost(hdvPrices[ing.id], ing.quantity) === null) return false;
        }
      }
      // « Prix HDV item à jour » : prix de vente équipement renseigné (> 0).
      if (filterItemPriced && !((hdvPrices[i._id]?.unitAverage ?? 0) > 0)) return false;
      // « Rentable dès ≤ X % via Achat » : breakEvenCoeff non nul et ≤ seuil.
      if (hasBreakEvenThreshold) {
        const bec = breakEvenCoefById[i._id];
        if (bec === null || bec === undefined || !(bec <= breakEvenThresholdNum)) return false;
      }
      return true;
    });
    base.sort((a, b) => {
      const pa = profitById[a._id] ?? Number.NEGATIVE_INFINITY;
      const pb = profitById[b._id] ?? Number.NEGATIVE_INFINITY;
      if (pa === pb) return a.name.localeCompare(b.name, 'fr');
      return pb - pa;
    });
    return base;
  }, [levelFilteredItems, searchQuery, selectedTargetRunes, itemRuneCodes, profitById, filterCraftComplete, filterItemPriced, hasBreakEvenThreshold, breakEvenThresholdNum, breakEvenCoefById, hdvPrices]);
  // Coefficient effectif : si non renseigné, on utilise un coef théorique de 100 %
  // pour estimer les runes/focus, tout en signalant que la valeur n'est pas validée.
  const effectiveCoefficient = coefficient !== null && coefficient >= 1 ? coefficient : 100;
  const hasRealCoefficient = coefficient !== null && coefficient >= 1;

  const breaking = useMemo<BreakingResult | null>(() => {
    if (!selectedItem || !itemStats?.possibleEffects || itemStats.possibleEffects.length === 0) return null;

    const craftCost = hdvPrices[selectedItem._id]?.unitAverage ?? 0;

    return calculateBreaking(
      itemStats.possibleEffects,
      selectedItem.level,
      effectiveCoefficient,
      rollMode,
      pricesByCode,
      craftCost,
      selectedItem.name,
      selectedItem.imgUrl,
      focusEffectIndex,
      exoEntries,
    );
  }, [selectedItem, itemStats, effectiveCoefficient, rollMode, pricesByCode, hdvPrices, focusEffectIndex, exoEntries]);

  // Coût de craft de l'item sélectionné (somme des coûts optimaux des ingrédients).
  const selectedCraftCost = useMemo(() => {
    let total = 0;
    let hasMissing = false;
    const missing: NormalizedRecipeIngredient[] = [];
    for (const ing of selectedItem?.recipeIngredients ?? []) {
      const c = getOptimalCost(hdvPrices[ing.id], ing.quantity);
      if (c === null) {
        hasMissing = true;
        missing.push(ing);
        continue;
      }
      total += c;
    }
    return { total, hasMissing, missingIngredients: missing };
  }, [selectedItem, hdvPrices]);

  // Rentabilité via craft (récupère les mêmes lignes de runes, seul le coût diffère).
  const breakingCraft = useMemo<BreakingResult | null>(() => {
    if (!selectedItem || !itemStats?.possibleEffects || itemStats.possibleEffects.length === 0) return null;

    return calculateBreaking(
      itemStats.possibleEffects,
      selectedItem.level,
      effectiveCoefficient,
      rollMode,
      pricesByCode,
      selectedCraftCost.total,
      selectedItem.name,
      selectedItem.imgUrl,
      focusEffectIndex,
      exoEntries,
    );
  }, [selectedItem, itemStats, effectiveCoefficient, rollMode, pricesByCode, selectedCraftCost.total, focusEffectIndex, exoEntries]);

  // Suggestion du meilleur Focus : la rune dont le focus donne la plus grande valeur totale.
  // Un Focus n'est recommandé QUE si la ligne ciblée génère au moins 1,0 rune entière en mode
  // Focus (runesFocus ≥ 1.0) : en jeu, une quantité < 1 se traduit très souvent par 0 rune.
  const bestFocusSuggestion = useMemo<{
    suggestion: { effectIndex: number; runeCode: string; totalValueFocus: number; quantityFocus: number } | null;
    noneQualify: boolean;
  }>(() => {
    if (!selectedItem || !itemStats?.possibleEffects || itemStats.possibleEffects.length === 0 || !breaking) {
      return { suggestion: null, noneQualify: false };
    }
    let best: { effectIndex: number; runeCode: string; totalValueFocus: number; quantityFocus: number } | null = null;
    let hasCandidateWithPrice = false;
    let anyQualifying = false;
    for (const l of breaking.lines) {
      const focused = calculateBreaking(
        itemStats.possibleEffects,
        selectedItem.level,
        effectiveCoefficient,
        rollMode,
        pricesByCode,
        breaking.craftCost,
        selectedItem.name,
        selectedItem.imgUrl,
        l.effectIndex,
        exoEntries,
      );
      if (!focused || focused.hasMissingPrices) continue;
      const focusedLine = focused.lines.find(fl => fl.isFocused);
      if (!focusedLine) continue;
      hasCandidateWithPrice = true;
      if (focusedLine.quantityFocus < 1.0) continue;
      anyQualifying = true;
      if (!best || focused.totalValueFocus > best.totalValueFocus) {
        best = {
          effectIndex: l.effectIndex,
          runeCode: l.rune.code,
          totalValueFocus: focused.totalValueFocus,
          quantityFocus: focusedLine.quantityFocus,
        };
      }
    }
    return { suggestion: best, noneQualify: hasCandidateWithPrice && !anyQualifying };
  }, [selectedItem, itemStats, breaking, effectiveCoefficient, rollMode, pricesByCode, exoEntries]);

  const formatKamas = (n: number) => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${Math.round(n).toLocaleString()} K`;
  };

  // Ouvre le scanner HDV avec la file : item brisé + runes générées.
  // Les prix scannés sont écrits dans hdvPrices (contexte global) sous les IDs
  // du présent calculateur → recalcul immédiat de la rentabilité.
  const scanBreakingPrices = useCallback(() => {
    if (!selectedItem || !breaking) return;
    const runesById = new Map<string, Rune>();
    for (const l of breaking.lines) {
      if (!l.rune.id.startsWith('synthetic-')) runesById.set(l.rune.id, l.rune);
    }
    for (const e of breaking.exoLines) {
      if (!e.rune.id.startsWith('synthetic-')) runesById.set(e.rune.id, e.rune);
    }
    openScanner([
      { expectedName: selectedItem.name, expectedId: selectedItem._id, type: selectedItem.type },
      ...[...runesById.values()].map(r => ({ expectedName: r.name, expectedId: getRunePriceKey(r), type: 'Rune de forgemagie' })),
    ]);
  }, [selectedItem, breaking, openScanner]);

  // Ouvre le scanner HDV sur UNIQUEMENT les ingrédients sans prix de la recette
  // (HDV Ressources). Chaque prix scanné est écrit dans hdvPrices sous l'ID de la
  // ressource → recalcul immédiat du coût de craft.
  const scanMissingRecipe = useCallback(() => {
    const missing = selectedCraftCost.missingIngredients;
    if (missing.length === 0 || !selectedItem) return;
    const queue: ScannerQueueItem[] = missing.map(ing => ({
      expectedName: ing.name,
      expectedId: ing.id,
      type: ing.type || 'Ressource',
    }));
    openScanner(queue, {
      title: `Ingrédients manquants - ${selectedItem.name}`,
      initialScanMode: 'full',
    });
  }, [selectedItem, selectedCraftCost.missingIngredients, openScanner]);

  // Sauvegarde rapide manuelle d'un prix d'ingrédient (x1 = prix renseigné).
  const saveQuickIngredientPrice = useCallback((ing: NormalizedRecipeIngredient, price: number) => {
    if (price <= 0) return;
    setHdvPrice(ing.id, price, 0, 0, 0, { explicit: true });
  }, [setHdvPrice]);

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
          {/* Filtre par niveau (Niveau Min/Max) — champs vides = tous les niveaux */}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={minLevelFilter}
              onChange={e => setMinLevelFilter(e.target.value)}
              placeholder="Niv. min"
              className="w-20 bg-[#070a12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/40"
            />
            <span className="text-slate-600 text-xs">→</span>
            <input
              type="number"
              min={1}
              value={maxLevelFilter}
              onChange={e => setMaxLevelFilter(e.target.value)}
              placeholder="Niv. max"
              className="w-20 bg-[#070a12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/40"
            />
            {(minLevelFilter.trim() !== '' || maxLevelFilter.trim() !== '' || selectedTargetRunes.length > 0 || filterCraftComplete || filterItemPriced || filterBreakEvenEnabled) && (
              <button
                type="button"
                onClick={() => {
                  setMinLevelFilter('');
                  setMaxLevelFilter('');
                  setSelectedTargetRunes([]);
                  setFilterCraftComplete(false);
                  setFilterItemPriced(false);
                  setFilterBreakEvenEnabled(false);
                  setBreakEvenThreshold('100');
                }}
                className="ml-auto text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 shrink-0"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Runes cibles (multi-sélection) */}
          <div className="flex flex-wrap gap-1">
            {DOFUS_RUNES.map(rune => {
              const active = selectedTargetRunes.includes(rune.code);
              return (
                <button
                  key={rune.code}
                  type="button"
                  onClick={() =>
                    setSelectedTargetRunes(prev =>
                      active ? prev.filter(c => c !== rune.code) : [...prev, rune.code],
                    )
                  }
                  title={`Filtrer les équipements produisant la ${rune.name}`}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-800/30 border-slate-700/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rune.code}
                </button>
              );
            })}
          </div>

          {/* Filtres de présence / fraîcheur des prix + seuil de rentabilité via Achat */}
          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-800/20 border border-white/5">
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterCraftComplete}
                onChange={e => setFilterCraftComplete(e.target.checked)}
                className="accent-amber-500 h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1">
                <Hammer className="h-3 w-3 text-emerald-400" />
                Craft complet (prix de tous les ingrédients à jour)
              </span>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterItemPriced}
                onChange={e => setFilterItemPriced(e.target.checked)}
                className="accent-amber-500 h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-400" />
                Prix HDV item à jour
              </span>
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterBreakEvenEnabled}
                  onChange={e => setFilterBreakEvenEnabled(e.target.checked)}
                  className="accent-emerald-500 h-3.5 w-3.5"
                />
                <span className="whitespace-nowrap">Rentable dès ≤</span>
              </label>
              <input
                type="number"
                min={1}
                disabled={!filterBreakEvenEnabled}
                value={breakEvenThreshold}
                onChange={e => setBreakEvenThreshold(e.target.value)}
                placeholder="100"
                className="w-16 bg-[#070a12] border border-white/10 rounded-md px-2 py-1 text-[11px] text-white text-right placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 disabled:opacity-40"
              />
              <span className="text-[11px] text-slate-400">% via Achat</span>
            </div>
          </div>
          {/* Scan HDV Métier : équipements + runes (prix manquants ou obsolètes > 10 jours) */}
          {!isLoadingItems && jobScanAll.length > 0 && (
            <button
              type="button"
              onClick={openJobScan}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all border bg-slate-800/20 border-amber-500/30 hover:bg-amber-500/10 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.12)]"
              title={`Scanner en HDV les équipements et runes du métier ${activeJob} (prix manquants ou obsolètes > 10 jours)`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Scan HDV Métier - {activeJob}</span>
              </span>
              {jobEquipmentsToUpdate.length + jobRunesToUpdate.length > 0 ? (
                <span className="shrink-0 flex items-center gap-1 text-[9px] bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {jobEquipmentsToUpdate.length} équip. · {jobRunesToUpdate.length} runes à actualiser
                </span>
              ) : (
                <span className="shrink-0 flex items-center gap-1 text-[9px] bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  <Camera className="h-2.5 w-2.5" />
                  {jobScanAll.length} items à jour
                </span>
              )}
            </button>
          )}

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

          {!isLoadingItems && filteredItems.length > 0 && (
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">
              Trié par rentabilité estimée (prix HDV + runes)
            </p>
          )}

          <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {filteredItems.map(item => {
              const isSelected = selectedItemId === item._id;
              const priceData = getPriceRecord(item, hdvPrices);
              const hasPrice = priceData && priceData.unitAverage > 0;
              const profit = profitById[item._id] ?? Number.NEGATIVE_INFINITY;
              const status = statusById[item._id] ?? 'no-stats';
              return (
                <div
                  key={item._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedItemId(item._id); setFocusEffectIndex(null); setExoEntries([]); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedItemId(item._id);
                      setFocusEffectIndex(null);
                      setExoEntries([]);
                    }
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-900/15 border-amber-500/40'
                      : 'bg-slate-800/20 border-slate-700/40 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ItemImage item={item} className="h-9 w-9 bg-slate-800/30 rounded-lg p-1 border border-slate-700/30 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                          {item.name}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); openTargetedScanner({ expectedName: item.name, expectedId: item._id, type: item.type }); }}
                          className="shrink-0 p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                          title={`Scan forcé des prix de ${item.name}`}
                        >
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Niveau {item.level}
                        {hasPrice && <span className="ml-2 text-amber-400/70">{Math.round(priceData!.unitAverage).toLocaleString()} K</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {status === 'ok' ? (
                        <div className="text-right">
                          <span className={`block text-[10px] font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {profit >= 0 ? '+' : ''}{Math.round(profit).toLocaleString()} K
                          </span>
                          {profitCraftById[item._id] !== undefined && (
                            <span className={`block text-[9px] font-semibold ${profitCraftById[item._id] >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                              Craft {profitCraftById[item._id] >= 0 ? '+' : ''}{Math.round(profitCraftById[item._id]).toLocaleString()} K
                            </span>
                          )}
                        </div>
                      ) : status === 'missing-price' ? (
                        <span className="text-[9px] font-semibold text-amber-500/90 flex items-center gap-0.5 justify-end">
                          <AlertTriangle className="h-3 w-3" /> Prix manquant
                        </span>
                      ) : status === 'missing-ingredients' ? (
                        <div className="text-right">
                          <span className={`block text-[10px] font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {profit >= 0 ? '+' : ''}{Math.round(profit).toLocaleString()} K
                          </span>
                          <span className="block text-[9px] font-semibold text-amber-500/80 flex items-center gap-0.5 justify-end">
                            <AlertTriangle className="h-3 w-3" /> Prix incomplet
                          </span>
                        </div>
                      ) : status === 'no-coefficient' ? (
                        <div className="text-right">
                          <span className={`block text-[10px] font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {profit >= 0 ? '+' : ''}{Math.round(profit).toLocaleString()} K
                          </span>
                          <span className="block text-[9px] font-semibold text-slate-500 flex items-center gap-0.5 justify-end">
                            <Info className="h-3 w-3" /> Coef. non testé
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-600">—</span>
                      )}
                    </div>
                  </div>
                </div>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigateToHdvItem({
                          _id: selectedItem._id,
                          name: selectedItem.name,
                          type: selectedItem.type,
                          level: selectedItem.level,
                          imgUrl: selectedItem.imgUrl,
                        })}
                        className="text-base font-bold text-white truncate hover:text-amber-400 transition-colors text-left"
                        title="Voir dans les prix HDV"
                      >
                        {selectedItem.name}
                      </button>
                      <button
                        onClick={() => copyToClipboard(selectedItem.name, `item-name-${selectedItem._id}`)}
                        className={`p-1 rounded transition-all shrink-0 ${
                          copiedId === `item-name-${selectedItem._id}`
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                        }`}
                        title="Copier le nom"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => openTargetedScanner({ expectedName: selectedItem.name, expectedId: selectedItem._id, type: selectedItem.type })}
                        className="p-1 rounded transition-all shrink-0 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10"
                        title={`Scan forcé des prix de ${selectedItem.name}`}
                      >
                        <Camera className="h-3 w-3" />
                      </button>
                      <ExternalLink className="h-3 w-3 text-slate-500 shrink-0" />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Niveau {selectedItem.level} — {activeJob}
                      {(() => {
                        const p = hdvPrices[selectedItem._id];
                        return p?.unitAverage ? <span className="ml-2 text-amber-400">{Math.round(p.unitAverage).toLocaleString()} K</span> : null;
                      })()}
                    </p>
                    <div className="mt-1.5">
                      <QuickPriceInput
                        x1={hdvPrices[selectedItem._id]?.x1 ?? 0}
                        x10={hdvPrices[selectedItem._id]?.x10 ?? 0}
                        x100={hdvPrices[selectedItem._id]?.x100 ?? 0}
                        x1000={hdvPrices[selectedItem._id]?.x1000 ?? 0}
                        onSetPrices={(x1, x10, x100, x1000) => setHdvPrice(selectedItem._id, x1, x10, x100, x1000, { explicit: true })}
                        disabled={!user}
                      />
                    </div>
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
                      value={coefficient ?? ''}
                      placeholder="- %"
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') {
                          handleCoefficientChange(null);
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (!isNaN(v) && v >= 1) handleCoefficientChange(v);
                      }}
                      className={`w-16 bg-[#070a12] border border-white/10 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        coefficient === null ? 'text-slate-500 italic' : 'text-white'
                      }`}
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
                  {!hasRealCoefficient && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 mb-3">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Estimation basée sur un coef. théorique de 100 % (à ajuster après brisage).
                    </div>
                  )}
                  {/* Summary cards */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400">Achat HDV</span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Prix d'achat</p>
                      <input
                        type="number"
                        min={0}
                        value={breaking.craftCost}
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          if (!isNaN(v) && v >= 0) setHdvPrice(selectedItem._id, v, 0, 0, 0, { explicit: true });
                        }}
                        className={`w-full bg-transparent text-center text-lg font-extrabold focus:outline-none focus:text-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          breaking.missingItemPrice ? 'text-rose-400 border border-red-500/50 rounded py-0.5' : 'text-slate-300'
                        }`}
                      />
                    </div>
                    <div className={`bg-slate-900/40 rounded-xl p-3 text-center ${hasFocus ? 'border border-purple-500/20' : ''}`}>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                        Bénéfice net{hasFocus ? ' (Std)' : ''}
                      </p>
                      {breaking.hasMissingPrices ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix manquant
                        </p>
                      ) : (
                        <p className={`text-lg font-extrabold ${breaking.netProfitStd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatKamas(breaking.netProfitStd)}
                        </p>
                      )}
                    </div>
                    <div className={`bg-slate-900/40 rounded-xl p-3 text-center ${hasFocus ? 'border border-purple-500/20' : ''}`}>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                        ROI{hasFocus ? ' (Std)' : ''}
                      </p>
                      {breaking.hasMissingPrices ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix manquant
                        </p>
                      ) : (
                        <p className={`text-lg font-extrabold ${breaking.roiStd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {breaking.roiStd >= 0 ? '+' : ''}{breaking.roiStd.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                  {!breaking.hasMissingPrices && breaking.breakEvenCoefStd !== null && (
                    <div className="text-right -mt-1 text-[9px] text-slate-400">
                      <span className={breaking.breakEvenCoefStd <= 100 ? 'text-emerald-400/90' : 'text-amber-400/90'}>
                        Rentable dès <b>{breaking.breakEvenCoefStd} %</b> de coef via Achat
                      </span>
                    </div>
                  )}
                  {breaking.hasMissingPrices && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 -mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Renseignez les prix manquants (item ou runes) ou utilisez « Scan HDV » pour calculer la rentabilité.
                    </div>
                  )}
                  {hasFocus && (
                    <div className="grid grid-cols-2 gap-3 -mt-1">
                      <div className="bg-purple-900/5 rounded-xl p-2 text-center border border-purple-500/20">
                        <p className="text-[8px] text-purple-400 uppercase tracking-wider">Bénéfice net (Focus)</p>
                        {breaking.hasMissingPrices ? (
                          <p className="text-[11px] font-bold text-amber-400/90 flex items-center justify-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Prix manquant
                          </p>
                        ) : (
                          <p className={`text-sm font-bold ${breaking.netProfitFocus >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatKamas(breaking.netProfitFocus)}
                          </p>
                        )}
                      </div>
                      <div className="bg-purple-900/5 rounded-xl p-2 text-center border border-purple-500/20">
                        <p className="text-[8px] text-purple-400 uppercase tracking-wider">ROI (Focus)</p>
                        {breaking.hasMissingPrices ? (
                          <p className="text-[11px] font-bold text-amber-400/90 flex items-center justify-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Prix manquant
                          </p>
                        ) : (
                          <p className={`text-sm font-bold ${breaking.roiFocus >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {breaking.roiFocus >= 0 ? '+' : ''}{breaking.roiFocus.toFixed(1)}%
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Rentabilité via craft */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">Via craft</span>
                    {selectedItem.recipeIngredients && selectedItem.recipeIngredients.length > 0 && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                        selectedCraftCost.hasMissing
                          ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                          : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                      }`}>
                        {`${selectedItem.recipeIngredients.length - selectedCraftCost.missingIngredients.length}/${selectedItem.recipeIngredients.length} ingrédients renseignés`}
                      </span>
                    )}
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  {selectedCraftCost.hasMissing && selectedCraftCost.missingIngredients.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        type="button"
                        onClick={scanMissingRecipe}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                        title={`Scanner en HDV les ${selectedCraftCost.missingIngredients.length} ingrédients sans prix de la recette`}
                      >
                        <Camera className="h-3.5 w-3.5 shrink-0" />
                        Scanner les {selectedCraftCost.missingIngredients.length} ingrédients manquants
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickEntryOpen(true)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
                        title="Saisir manuellement les prix des ingrédients manquants (sans scan)"
                      >
                        <PenLine className="h-3.5 w-3.5 shrink-0" />
                        Saisie rapide
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-900/10 rounded-xl p-3 text-center border border-emerald-500/20">
                      <p className="text-[9px] text-emerald-400/80 uppercase tracking-wider mb-1">Coût des ingrédients</p>
                      {selectedCraftCost.hasMissing ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix incomplet
                        </p>
                      ) : (
                        <p className={`text-lg font-extrabold ${breakingCraft?.missingItemPrice ? 'text-rose-400' : 'text-emerald-300'}`}>
                          {Math.round(selectedCraftCost.total).toLocaleString()} K
                        </p>
                      )}
                    </div>
                    <div className="bg-emerald-900/10 rounded-xl p-3 text-center border border-emerald-500/20">
                      <p className="text-[9px] text-emerald-400/80 uppercase tracking-wider mb-1">Bénéfice net</p>
                      {selectedCraftCost.hasMissing ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix incomplet
                        </p>
                      ) : breakingCraft?.hasMissingPrices ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix manquant
                        </p>
                      ) : (
                        <p className={`text-lg font-extrabold ${breakingCraft && breakingCraft.netProfitStd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {breakingCraft ? formatKamas(breakingCraft.netProfitStd) : '—'}
                        </p>
                      )}
                    </div>
                    <div className="bg-emerald-900/10 rounded-xl p-3 text-center border border-emerald-500/20">
                      <p className="text-[9px] text-emerald-400/80 uppercase tracking-wider mb-1">ROI</p>
                      {selectedCraftCost.hasMissing ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix incomplet
                        </p>
                      ) : breakingCraft?.hasMissingPrices ? (
                        <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 shrink-0" /> Prix manquant
                        </p>
                      ) : (
                        <p className={`text-lg font-extrabold ${breakingCraft && breakingCraft.roiStd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {breakingCraft && breakingCraft.roiStd >= 0 ? '+' : ''}{breakingCraft ? breakingCraft.roiStd.toFixed(1) : '—'}%
                        </p>
                      )}
                    </div>
                  </div>
                  {!selectedCraftCost.hasMissing && breakingCraft && !breakingCraft.hasMissingPrices && breakingCraft.breakEvenCoefStd !== null && (
                    <div className="text-right -mt-1 text-[9px] text-slate-400">
                      <span className={breakingCraft.breakEvenCoefStd <= 100 ? 'text-emerald-400/90' : 'text-amber-400/90'}>
                        Rentable dès <b>{breakingCraft.breakEvenCoefStd} %</b> de coef via Craft
                      </span>
                    </div>
                  )}
                  {selectedCraftCost.hasMissing && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 -mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Le prix de certains ingrédients est manquant : la rentabilité via craft ne peut pas être calculée.
                    </div>
                  )}

                  {bestFocusSuggestion && bestFocusSuggestion.suggestion && !hasFocus && (
                    <button
                      onClick={() => setFocusEffectIndex(bestFocusSuggestion.suggestion!.effectIndex)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-[10px] text-purple-300 hover:bg-purple-500/20 transition-all -mt-1"
                      title={`Cliquer pour appliquer ce focus (${bestFocusSuggestion.suggestion!.quantityFocus.toFixed(2)} rune(s) en focus)`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Crosshair className="h-3.5 w-3.5 shrink-0" />
                        Focus suggéré : <b>{bestFocusSuggestion.suggestion!.runeCode}</b> — rune la plus rentable à cibler
                      </span>
                      <span className="shrink-0 text-[9px] text-purple-400/80">
                        {bestFocusSuggestion.suggestion!.quantityFocus.toFixed(2)} rune(s) · {Math.round(bestFocusSuggestion.suggestion!.totalValueFocus).toLocaleString()} K (focus)
                      </span>
                    </button>
                  )}
                  {bestFocusSuggestion && bestFocusSuggestion.noneQualify && !hasFocus && (
                    <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-600/40 text-[10px] text-slate-400 -mt-1">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Aucun focus recommandé (runes &lt; 1 en focus) — préférez le brisage Standard.
                    </div>
                  )}

                  {/* Rune table */}
                  <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                    <div className="p-3 border-b border-white/5 flex items-center justify-between gap-2">
                      <h3 className="text-[11px] uppercase tracking-widest text-slate-300 font-bold">
                        Lignes de stats ({breaking.lines.length + breaking.exoLines.length})
                      </h3>
                      <div className="flex items-center gap-2">
                        {hasFocus && (
                        <span className="text-[9px] text-purple-400 font-semibold">
                          Focus : cible +50% des autres lignes
                        </span>
                        )}
                        <button
                          onClick={scanBreakingPrices}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all"
                          title="Scanner l'item et les runes générées en HDV pour mettre à jour les prix"
                        >
                          <Camera className="h-3 w-3" /> Scan HDV
                        </button>
                      </div>
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
                                      <div className="flex items-center gap-1.5">
                                        <RuneIcon rune={l.rune} />
                                        <div>
                                          <button
                                            onClick={() => navigateToHdvItem({
                                              _id: getRunePriceKey(l.rune),
                                              name: l.rune.name,
                                              type: 'Rune',
                                              level: 1,
                                              imgUrl: l.rune.imgUrl ?? '',
                                            })}
                                            className="font-semibold text-slate-200 hover:text-amber-400 transition-colors text-left"
                                            title="Voir les prix de cette rune"
                                          >
                                            {l.rune.code}
                                          </button>
                                          <div className="text-[9px] text-slate-500">{l.statName}</div>
                                        </div>
                                        <button
                                          onClick={() => copyToClipboard(l.rune.code, `rune-${l.rune.id}`)}
                                          className={`p-0.5 rounded transition-all ${
                                            copiedId === `rune-${l.rune.id}`
                                              ? 'text-emerald-400 bg-emerald-500/10'
                                              : 'text-slate-600 hover:text-slate-300 hover:bg-slate-700/30'
                                          }`}
                                          title="Copier le nom de la rune"
                                        >
                                          <Copy className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          onClick={() => openTargetedScanner({ expectedName: l.rune.name, expectedId: getRunePriceKey(l.rune), type: 'Rune de forgemagie' })}
                                          className="p-0.5 rounded transition-all text-slate-600 hover:text-cyan-400 hover:bg-cyan-500/10"
                                          title={`Scan forcé des prix de ${l.rune.name}`}
                                        >
                                          <Camera className="h-2.5 w-2.5" />
                                        </button>
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
                                        <span className="text-[10px] text-amber-500/80 font-mono flex items-center gap-1">
                                          <AlertTriangle className="h-3 w-3" /> Prix manquant
                                        </span>
                                      )}
                                      <QuickPriceInput
                                        x1={hdvPrices[getRunePriceKey(l.rune)]?.x1 ?? 0}
                                        x10={hdvPrices[getRunePriceKey(l.rune)]?.x10 ?? 0}
                                        x100={hdvPrices[getRunePriceKey(l.rune)]?.x100 ?? 0}
                                        x1000={hdvPrices[getRunePriceKey(l.rune)]?.x1000 ?? 0}
                                        onSetPrices={(x1, x10, x100, x1000) => setHdvPrice(getRunePriceKey(l.rune), x1, x10, x100, x1000, { explicit: true })}
                                        disabled={!user}
                                        warnEmpty
                                      />
                                    </div>
                                  </td>
                                  <td className="text-right py-2 px-3 font-mono text-slate-300">
                                    {l.quantityStd.toFixed(2)}
                                  </td>
                                  <td className={`text-right py-2 px-3 font-mono font-bold ${l.valueStd > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {effectiveUnitPrice > 0 ? `${Math.round(l.valueStd).toLocaleString()} K` : '—'}
                                  </td>
                                  <td className="text-right py-2 px-3 font-mono text-purple-300">
                                    {hasFocus ? (
                                      l.quantityFocus < 1 ? (
                                        <span
                                          className="inline-flex items-center justify-end gap-1 text-amber-500 font-semibold cursor-help"
                                          title="Quantité < 1 : risque élevé d'obtenir 0 rune"
                                        >
                                          <AlertTriangle className="h-3 w-3 shrink-0" />
                                          {l.quantityFocus.toFixed(2)}
                                        </span>
                                      ) : (
                                        l.quantityFocus.toFixed(2)
                                      )
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className={`text-right py-2 px-3 font-mono font-bold ${hasFocus && l.valueFocus > 0 ? 'text-purple-400' : 'text-slate-500'}`}>
                                    {hasFocus && effectiveUnitPrice > 0 ? `${Math.round(l.valueFocus).toLocaleString()} K` : '—'}
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
                                    <div className="flex items-center gap-1.5">
                                      <RuneIcon rune={exo.rune} />
                                      <div>
                                        <button
                                          onClick={() => navigateToHdvItem({
                                            _id: getRunePriceKey(exo.rune),
                                            name: exo.rune.name,
                                            type: 'Rune',
                                            level: 1,
                                            imgUrl: exo.rune.imgUrl ?? '',
                                          })}
                                          className="font-semibold text-cyan-300 hover:text-amber-400 transition-colors text-left"
                                          title="Voir les prix de cette rune"
                                        >
                                          {exo.rune.code}
                                        </button>
                                        <button
                                          onClick={() => openTargetedScanner({ expectedName: exo.rune.name, expectedId: getRunePriceKey(exo.rune), type: 'Rune de forgemagie' })}
                                          className="p-0.5 rounded transition-all text-slate-600 hover:text-cyan-400 hover:bg-cyan-500/10"
                                          title={`Scan forcé des prix de ${exo.rune.name}`}
                                        >
                                          <Camera className="h-2.5 w-2.5" />
                                        </button>
                                        <div className="text-[9px] text-cyan-400/60">Exo</div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center py-2 px-3 text-slate-500 font-mono text-[10px]">—</td>
                                <td className="text-right py-2 px-3 font-mono">
                                  {effectiveUnitPrice > 0 ? (
                                    <span className="text-amber-400">{Math.round(effectiveUnitPrice).toLocaleString()} K</span>
                                  ) : (
                                    <span className="text-amber-500/80 flex items-center justify-end gap-1">
                                      <AlertTriangle className="h-3 w-3" /> Prix manquant
                                    </span>
                                  )}
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-cyan-300">
                                  {exo.quantity.toFixed(2)}
                                </td>
                                <td className="text-right py-2 px-3 font-mono font-bold text-cyan-300">
                                  {effectiveUnitPrice > 0 ? `${Math.round(exo.valueStd).toLocaleString()} K` : '—'}
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-cyan-300">{hasFocus ? exo.quantity.toFixed(2) : '—'}</td>
                                <td className="text-right py-2 px-3 font-mono font-bold text-cyan-300">
                                  {hasFocus && effectiveUnitPrice > 0 ? `${Math.round(exo.valueFocus).toLocaleString()} K` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Total row */}
                          <tr className="border-t border-white/10 bg-white/[0.03]">
                            <td colSpan={4} className="py-2.5 px-3 text-right text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              Total Kamas
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono font-bold text-amber-400">
                              {breaking.hasMissingPrices ? '—' : `${Math.round(breaking.totalValueStd).toLocaleString()} K`}
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono text-purple-400">—</td>
                            <td className="text-right py-2.5 px-3 font-mono font-bold text-purple-400">
                              {hasFocus && !breaking.hasMissingPrices ? `${Math.round(breaking.totalValueFocus).toLocaleString()} K` : '—'}
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
                              <option key={r.id} value={r.id}>{r.code}</option>
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
                              {r && <RuneIcon rune={r} />}
                              {r?.code ?? e.runeId} ×{e.quantity}
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
{/* Popup de saisie rapide des prix d'ingrédients manquants */}
      {quickEntryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setQuickEntryOpen(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#0b1020] border border-white/10 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-sky-400" />
                  Saisie rapide des ingrédients
                </h3>
                <p className="text-[10px] text-slate-400">
                  {selectedCraftCost.missingIngredients.length} ingrédient(s) sans prix — {selectedItem?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickEntryOpen(false)}
                className="text-slate-500 hover:text-white transition-all"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2 p-4">
              {selectedCraftCost.missingIngredients.map(ing => (
                <QuickIngredientRow key={ing.id} ing={ing} onSave={saveQuickIngredientPrice} />
              ))}
              {selectedCraftCost.missingIngredients.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  Tous les ingrédients ont un prix. La rentabilité via craft est calculée.
                </p>
              )}
              <button
                type="button"
                onClick={() => setQuickEntryOpen(false)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-[11px] font-bold bg-slate-700/30 border border-white/10 text-slate-300 hover:bg-slate-700/50 transition-all"
              >
                Terminé
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuneIcon({ rune, size = 18 }: { rune: { imgUrl?: string; name?: string; code?: string }; size?: number }) {
  const [hasError, setHasError] = useState(false);
  if (!rune.imgUrl || hasError) return null;
  return (
    <img
      src={rune.imgUrl}
      alt={rune.name ?? ''}
      onError={() => setHasError(true)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function QuickIngredientRow({ ing, onSave }: { ing: NormalizedRecipeIngredient; onSave: (ing: NormalizedRecipeIngredient, price: number) => void }) {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const handleSave = () => {
    const v = parseFloat(draft.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    onSave(ing, v);
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1200);
  };
  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/20 border border-white/5">
      <ItemImage item={ing} className="h-8 w-8 bg-slate-800/30 rounded-md p-0.5 border border-slate-700/30 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-200 font-semibold truncate">{ing.name}</p>
        <p className="text-[9px] text-slate-500">×{ing.quantity}</p>
      </div>
      <div className="relative shrink-0">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
          placeholder="0"
          className="w-24 bg-[#070a12] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white text-right placeholder-slate-600 focus:outline-none focus:border-amber-500/40"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">K</span>
      </div>
      <button
        type="button"
        onClick={handleSave}
        className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-300 ${
          saved
            ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-300'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
        }`}
        title="Sauvegarder ce prix"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
