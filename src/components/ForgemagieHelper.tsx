import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { pushRunePricesToServer, fetchRunePricesFromServer } from '../lib/sync';
import { createPortal } from 'react-dom';
import { searchItems } from '../services/api';
import type { DofusItem } from '../data/mockData';
import { useServer } from '../context/ServerContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  Search, Wand2, Loader2, Undo2, RotateCcw, TrendingUp, CheckCircle2,
  AlertTriangle, Sparkles, X
} from 'lucide-react';
import ItemImage from './ItemImage';

const DOFUSDB_BASE_URL = 'https://api.dofusdb.fr';
const FETCH_TIMEOUT = 5000;

// Dofus 2.0 Unity effectId → characteristic mapping (vérifié via api.dofusdb.fr/effects et /characteristics)
const STAT_CONFIG: Record<number, { name: string; weight: number; unit: string }> = {
  110: { name: 'Soin', weight: 5, unit: '' },
  111: { name: 'PA', weight: 100, unit: '' },
  112: { name: 'Dommages', weight: 5, unit: '' },
  113: { name: 'Portée', weight: 51, unit: '' },
  114: { name: 'Invocations', weight: 30, unit: '' },
  115: { name: 'Critique', weight: 10, unit: '' },
  118: { name: 'Force', weight: 1, unit: '' },
  119: { name: 'Agilité', weight: 1, unit: '' },
  123: { name: 'Chance', weight: 1, unit: '' },
  124: { name: 'Sagesse', weight: 3, unit: '' },
  125: { name: 'Vitalité', weight: 0.25, unit: '' },
  126: { name: 'Intelligence', weight: 1, unit: '' },
  127: { name: 'PM', weight: 90, unit: '' },
  128: { name: 'PM', weight: 90, unit: '' },
  138: { name: 'Puissance', weight: 5, unit: '' },
  160: { name: 'Esquive PA', weight: 4, unit: '' },
  161: { name: 'Esquive PM', weight: 4, unit: '' },
  168: { name: 'Pods', weight: 0.25, unit: '' },
  169: { name: 'Initiative', weight: 0.1, unit: '' },
  174: { name: 'Initiative', weight: 0.1, unit: '' },
  175: { name: 'Initiative', weight: 0.1, unit: '' },
  176: { name: 'Prospection', weight: 3, unit: '' },
  177: { name: 'Prospection', weight: 3, unit: '' },
  178: { name: 'Soins', weight: 5, unit: '' },
  179: { name: 'Soins', weight: 5, unit: '' },
  186: { name: 'Puissance', weight: 5, unit: '' },
  200: { name: 'Résistance Neutre', weight: 6, unit: '%' },
  201: { name: 'Résistance Terre', weight: 6, unit: '%' },
  202: { name: 'Résistance Feu', weight: 6, unit: '%' },
  203: { name: 'Résistance Eau', weight: 6, unit: '%' },
  204: { name: 'Résistance Air', weight: 6, unit: '%' },
  205: { name: 'Résistance Neutre (fixe)', weight: 2, unit: '' },
  206: { name: 'Résistance Terre (fixe)', weight: 2, unit: '' },
  207: { name: 'Résistance Feu (fixe)', weight: 2, unit: '' },
  208: { name: 'Résistance Eau (fixe)', weight: 2, unit: '' },
  209: { name: 'Résistance Air (fixe)', weight: 2, unit: '' },
  752: { name: 'Fuite', weight: 4, unit: '' },
  753: { name: 'Tacle', weight: 4, unit: '' },
  754: { name: 'Fuite', weight: 4, unit: '' },
  755: { name: 'Tacle', weight: 4, unit: '' },
};

// Noms d'effets supplémentaires pour les IDs non couverts par STAT_CONFIG
const EFFECT_MAP: Record<number, string> = {
  210: 'Résistance Neutre (%)',
  211: 'Résistance Terre (%)',
  212: 'Résistance Feu (%)',
  213: 'Résistance Eau (%)',
  214: 'Résistance Air (%)',
  215: 'Résistance Neutre (fixe)',
  216: 'Résistance Terre (fixe)',
  217: 'Résistance Feu (fixe)',
  218: 'Résistance Eau (fixe)',
  219: 'Résistance Air (fixe)',
  220: 'Résistance Neutre (PI)',
  221: 'Résistance Terre (PI)',
  222: 'Résistance Feu (PI)',
  223: 'Résistance Eau (PI)',
  224: 'Résistance Air (PI)',
  240: 'Dommages Neutre',
  241: 'Dommages Terre',
  242: 'Dommages Feu',
  243: 'Dommages Eau',
  244: 'Dommages Air',
  245: 'Dommages Neutre (%)',
  246: 'Dommages Terre (%)',
  247: 'Dommages Feu (%)',
  248: 'Dommages Eau (%)',
  249: 'Dommages Air (%)',
  250: 'Dommages Pièces',
  252: 'Retrait PA',
  253: 'Retrait PM',
  254: 'Retrait PA',
  255: 'Retrait PM',
  256: 'Esquive PA',
  257: 'Esquive PM',
  260: 'Vol Neutre',
  261: 'Vol Terre',
  262: 'Vol Feu',
  263: 'Vol Eau',
  264: 'Vol Air',
};

const EXOTIC_EFFECTS = [
  { effectId: 111, name: 'PA', weight: 100 },
  { effectId: 127, name: 'PM', weight: 90 },
  { effectId: 113, name: 'Portée', weight: 51 },
  { effectId: 114, name: 'Invocations', weight: 30 },
  { effectId: 125, name: 'Vitalité', weight: 0.25 },
  { effectId: 200, name: 'Résistance Neutre', weight: 6 },
  { effectId: 201, name: 'Résistance Terre', weight: 6 },
  { effectId: 202, name: 'Résistance Feu', weight: 6 },
  { effectId: 203, name: 'Résistance Eau', weight: 6 },
  { effectId: 204, name: 'Résistance Air', weight: 6 },
];


const RUNE_NAMES = ['Vi', 'Fo', 'Ine', 'Age', 'Cha', 'Sa', 'So', 'Do', 'Cri', 'Do Cri', 'Do Pou', 'Tac', 'Fui', 'Prospe', 'Pod', 'Ini', 'Portée', 'Invoc', 'Pa Ga', 'Pme Ga', 'Ra Vi', 'Pa Vi', 'Ra Fo', 'Pa Fo', 'Ra Ine', 'Pa Ine', 'Ra Age', 'Pa Age', 'Ra Cha', 'Pa Cha', 'Ra Sa', 'Pa Sa'];

const EMPTY_RUNE_PRICES: Record<string, number> = Object.fromEntries(RUNE_NAMES.map(k => [k, 0]));

// Poids → nom de rune de base pour le lookup de prix
const WEIGHT_TO_RUNE: Record<number, string> = {
  0.25: 'Vi',
  1: 'Fo',
  3: 'Sa',
  4: 'Tac',
  5: 'Do',
  6: 'Prospe',
  10: 'Cri',
  30: 'Invoc',
  51: 'Portée',
  90: 'Pme Ga',
  100: 'Pa Ga',
};

// effectId → nom de rune pour le calcul de brisage
const EFFECT_ID_TO_RUNE: Record<number, string> = {
  111: 'Pa Ga',
  127: 'Pme Ga',
  128: 'Pme Ga',
  113: 'Portée',
  114: 'Invoc',
  125: 'Vi',
  118: 'Fo',
  119: 'Age',
  123: 'Cha',
  124: 'Sa',
  126: 'Ine',
  112: 'Do',
  138: 'Do Pou',
  186: 'Do Pou',
  110: 'So',
  178: 'So',
  179: 'So',
  176: 'Prospe',
  177: 'Prospe',
  115: 'Cri',
  160: 'Fui',
  161: 'Fui',
  752: 'Fui',
  754: 'Fui',
  753: 'Tac',
  755: 'Tac',
  168: 'Pod',
  169: 'Ini',
  174: 'Ini',
  175: 'Ini',
  200: 'Ra Vi',
  201: 'Ra Fo',
  202: 'Ra Ine',
  203: 'Ra Age',
  204: 'Ra Cha',
  205: 'Pa Vi',
  206: 'Pa Fo',
  207: 'Pa Ine',
  208: 'Pa Age',
  209: 'Pa Cha',
};

interface StatLine {
  effectId: number;
  name: string;
  weight: number;
  unit: string;
  baseMin: number;
  baseMax: number;
  currentValue: number;
  targetValue: number;
  isExotic: boolean;
}

interface DofusDbEffect {
  effectId: number;
  diceNum: number;
  diceSide: number;
}

interface DofusDbItemFull {
  id: number;
  name: { fr: string };
  type?: { name: { fr: string } };
  level: number;
  img: string;
  possibleEffects: DofusDbEffect[];
}

type GoalMode = 'perfect' | 'overstat' | 'exotic';

interface RuneLogEntry {
  id: string;
  runeName: string;
  statName: string;
  weight: number;
  type: 'sc' | 'sn' | 'ec';
  statChange: number;
  puitsChange: number;
  droppedStats: { name: string; weight: number }[];
}

async function fetchItemFull(dofusdbId: number): Promise<DofusDbItemFull | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${DOFUSDB_BASE_URL}/items/${dofusdbId}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    console.log('[ForgemagieHelper] possibleEffects bruts :', data.possibleEffects);
    return data;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

function getEffectConfig(effectId: number): { name: string; weight: number; unit: string } {
  const cfg = STAT_CONFIG[effectId];
  if (!cfg) {
    console.warn(`[ForgemagieHelper] effectId ${effectId} non reconnu — ajoute-le à STAT_CONFIG`);
    return { name: `Effet #${effectId}`, weight: 1, unit: '' };
  }
  return cfg;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

interface SuggestionPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: () => void;
}

interface MageAdviceGoal {
  id: string;
  label: string;
  description: string;
}

interface MageAdvice {
  isWorthMaging: boolean;
  advice: string;
  recommendedGoals: MageAdviceGoal[];
}

const SPECIAL_ITEMS: Record<string, { name: string; advice: string; recommendedGoalIds: string[] }> = {
  'gelano': {
    name: 'Gelano',
    advice: 'Le Gelano possède déjà un PA. Ne visez pas un exo PA — concentrez-vous sur la Vitalité ou un exo PM/PO.',
    recommendedGoalIds: ['over-vitalite', 'exo-pm', 'exo-po'],
  },
  'cape fulgurante': {
    name: 'Cape Fulgurante',
    advice: 'Excellente cape à exo PA/PM — fort potentiel de poids disponible.',
    recommendedGoalIds: ['exo-pa', 'exo-pm'],
  },
};

function getMageAdvice(
  itemLevel: number,
  itemType: string,
  itemName: string,
  stats: StatLine[],
): MageAdvice {
  const name = itemName?.toLowerCase() ?? '';
  const type = itemType?.toLowerCase() ?? '';

  const specialKey = Object.keys(SPECIAL_ITEMS).find(k => name.includes(k));
  if (specialKey) {
    const special = SPECIAL_ITEMS[specialKey];
    return {
      isWorthMaging: special.recommendedGoalIds.length > 0,
      advice: special.advice,
      recommendedGoals: special.recommendedGoalIds.map(id => {
        const labels: Record<string, { label: string; description: string }> = {
          'perfect': { label: '🌟 Jet Parfait', description: 'Toutes les stats au max' },
          'over-vitalite': { label: '❤️ Over Vitalité', description: 'Vitalité au-dessus du jet max' },
          'exo-pa': { label: '⚡ Exo PA', description: '+1 PA exotique' },
          'exo-pm': { label: '👟 Exo PM', description: '+1 PM exotique' },
          'exo-po': { label: '📏 Exo Portée', description: '+1 Portée exotique' },
        };
        return { id, ...(labels[id] ?? { label: id, description: '' }) };
      }),
    };
  }

  if (itemLevel < 20) {
    return {
      isWorthMaging: false,
      advice: '⚠️ Cet item est de niveau trop bas (< 20) pour être rentable à FM.',
      recommendedGoals: [],
    };
  }

  const hasVit = stats.some(s => s.effectId === 125 && !s.isExotic);
  const hasPa = stats.some(s => s.effectId === 111 && !s.isExotic);
  const hasPm = stats.some(s => (s.effectId === 127 || s.effectId === 128) && !s.isExotic);
  const hasPo = stats.some(s => s.effectId === 113 && !s.isExotic);

  const goals: MageAdviceGoal[] = [];
  goals.push({ id: 'perfect', label: '🌟 Jet Parfait', description: 'Toutes les stats au max' });
  if (hasVit) goals.push({ id: 'over-vitalite', label: '❤️ Over Vitalité', description: 'Vitalité au-dessus du jet max' });

  if (itemLevel >= 60) {
    if (!hasPa && (type.includes('anneau') || type.includes('cape') || type.includes('amulet')))
      goals.push({ id: 'exo-pa', label: '⚡ Exo PA', description: '+1 PA exotique' });
    if (!hasPm && (type.includes('anneau') || type.includes('amulet') || type.includes('ceinture') || type.includes('bottes') || type.includes('cape') || type.includes('chapeau')))
      goals.push({ id: 'exo-pm', label: '👟 Exo PM', description: '+1 PM exotique' });
    if (!hasPo && (type.includes('anneau') || type.includes('baguette') || type.includes('arc') || type.includes('épée') || type.includes('hache') || type.includes('bâton') || type.includes('dague')))
      goals.push({ id: 'exo-po', label: '📏 Exo Portée', description: '+1 Portée exotique' });
  }

  return {
    isWorthMaging: true,
    advice: goals.length > 1
      ? 'Sélectionnez un objectif ci-dessous pour configurer automatiquement la forge.'
      : 'Cet item ne semble pas avoir d\'objectifs de forge au-delà du jet parfait.',
    recommendedGoals: goals,
  };
}

function getSuggestionsForItem(
  stats: StatLine[],
  itemType: string,
  itemLevel: number,
  applyPreset: (fn: (setStats: React.Dispatch<React.SetStateAction<StatLine[]>>, setGoalMode: React.Dispatch<React.SetStateAction<GoalMode>>, setOverstatIndex: React.Dispatch<React.SetStateAction<number | null>>, setOverstatTargetValue: React.Dispatch<React.SetStateAction<number>>, setExoticLines: React.Dispatch<React.SetStateAction<StatLine[]>>) => void) => void,
): SuggestionPreset[] {
  const presets: SuggestionPreset[] = [];
  const type = itemType.toLowerCase();

  // ── Jet Parfait (toujours disponible) ──
  presets.push({
    id: 'perfect',
    label: '🌟 Jet Parfait',
    description: 'Toutes les stats au jet max',
    icon: '🎯',
    action: () => applyPreset((setSt, setGm) => {
      setGm('perfect');
      setSt(prev => prev.map(s => s.isExotic ? s : { ...s, targetValue: s.baseMax }));
    }),
  });

  // ── Over Vitalité (si l'item a de la Vitalité) ──
  const vitIndex = stats.findIndex(s => s.effectId === 125 && !s.isExotic);
  if (vitIndex !== -1) {
    const vitBase = stats[vitIndex].baseMax;
    const vitTarget = vitBase + Math.max(20, Math.round(vitBase * 0.5));
    presets.push({
      id: 'over-vitalite',
      label: `❤️ Over Vitalité`,
      description: `Vitalité → ${vitTarget} (+${vitTarget - vitBase})`,
      icon: '❤️',
      action: () => applyPreset((setSt, setGm, setOvi, setOvt) => {
        setGm('overstat');
        setOvi(vitIndex);
        setOvt(vitTarget);
        setSt(prev => prev.map((s, i) => {
          if (s.isExotic) return s;
          if (i === vitIndex) return { ...s, targetValue: vitTarget };
          return { ...s, targetValue: s.baseMax };
        }));
      }),
    });
  }

  // ── Exo PM (bagues, amulettes, ceintures, bottes, capes) — niveau >= 60 ──
  const hasNativePm = stats.some(s => (s.effectId === 127 || s.effectId === 128) && !s.isExotic);
  const canExoPm = !stats.some(s => s.isExotic && (s.effectId === 127 || s.effectId === 128));
  if (itemLevel >= 60 && !hasNativePm && canExoPm && (type.includes('anneau') || type.includes('amulet') || type.includes('ceinture') || type.includes('bottes') || type.includes('cape') || type.includes('chapeau'))) {
    presets.push({
      id: 'exo-pm',
      label: '👟 Exo PM',
      description: '+1 PM exotique',
      icon: '👟',
      action: () => applyPreset((setSt, setGm, _ovi, _ovt, setExo) => {
        setGm('exotic');
        setExo([{
          effectId: 127, name: 'PM', weight: 90, unit: '',
          baseMin: 0, baseMax: 1, currentValue: 0, targetValue: 1, isExotic: true,
        }]);
        setSt(prev => [...prev, {
          effectId: 127, name: 'PM', weight: 90, unit: '',
          baseMin: 0, baseMax: 1, currentValue: 0, targetValue: 1, isExotic: true,
        }]);
      }),
    });
  }

  // ── Exo PA (bagues, capes, amulettes) — niveau >= 60 ──
  const hasNativePa = stats.some(s => s.effectId === 111 && !s.isExotic);
  const canExoPa = !stats.some(s => s.isExotic && s.effectId === 111);
  if (itemLevel >= 60 && !hasNativePa && canExoPa && (type.includes('anneau') || type.includes('cape') || type.includes('amulet'))) {
    presets.push({
      id: 'exo-pa',
      label: '⚡ Exo PA',
      description: '+1 PA exotique',
      icon: '⚡',
      action: () => applyPreset((setSt, setGm, _ovi, _ovt, setExo) => {
        setGm('exotic');
        setExo([{
          effectId: 111, name: 'PA', weight: 100, unit: '',
          baseMin: 0, baseMax: 1, currentValue: 0, targetValue: 1, isExotic: true,
        }]);
        setSt(prev => [...prev, {
          effectId: 111, name: 'PA', weight: 100, unit: '',
          baseMin: 0, baseMax: 1, currentValue: 0, targetValue: 1, isExotic: true,
        }]);
      }),
    });
  }

  // ── Exo Portée (armes, bagues) — niveau >= 60 ──
  const hasNativePo = stats.some(s => s.effectId === 113 && !s.isExotic);
  const canExoPo = !stats.some(s => s.isExotic && s.effectId === 113);
  if (itemLevel >= 60 && !hasNativePo && canExoPo && (type.includes('anneau') || type.includes('baguette') || type.includes('arc') || type.includes('épée') || type.includes('hache') || type.includes('bâton') || type.includes('dague'))) {
    presets.push({
      id: 'exo-po',
      label: '📏 Exo Portée',
      description: '+1 Portée exotique',
      icon: '📏',
      action: () => applyPreset((setSt, setGm, _ovi, _ovt, setExo) => {
        setGm('exotic');
        setExo([{
          effectId: 113, name: 'Portée', weight: 51, unit: '',
          baseMin: 0, baseMax: 1, currentValue: 0, targetValue: 1, isExotic: true,
        }]);
        setSt(prev => [...prev, {
          effectId: 113, name: 'Portée', weight: 51, unit: '',
          baseMin: 0, baseMax: 1, currentValue: 0, targetValue: 1, isExotic: true,
        }]);
      }),
    });
  }

  return presets;
}



export default function ForgemagieHelper() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DofusItem[]>([]);
  const [, setIsSearchLoading] = useState(false);

  const [selectedItem, setSelectedItem] = useState<DofusItem | null>(null);
  const [itemFull, setItemFull] = useState<DofusDbItemFull | null>(null);
  const [isItemLoading, setIsItemLoading] = useState(false);

  const [stats, setStats] = useState<StatLine[]>([]);
  const [goalMode, setGoalMode] = useState<GoalMode>('perfect');
  const [overstatIndex, setOverstatIndex] = useState<number | null>(null);
  const [overstatTargetValue, setOverstatTargetValue] = useState(0);
  const [exoticLines, setExoticLines] = useState<StatLine[]>([]);

  const [puits, setPuits] = useState(0);
  const [runeLog, setRuneLog] = useState<RuneLogEntry[]>([]);

  const [selectedDropStat, setSelectedDropStat] = useState<number | null>(null);
  const [selectedDropQty, setSelectedDropQty] = useState(1);
  const [ecDropLines, setEcDropLines] = useState<{ index: number; newValue: number }[]>([]);

  const [selectedRuneStat, setSelectedRuneStat] = useState<number | null>(null);
  const [selectedRuneQty, setSelectedRuneQty] = useState(1);

  const { selectedServer } = useServer();
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [estimatedSalePrice, setEstimatedSalePrice] = useState(0);

  const [allRunePrices, setAllRunePrices] = useLocalStorage<Record<string, Record<string, number>>>('kamamage_rune_prices', {});
  const runePrices = allRunePrices[selectedServer] ?? EMPTY_RUNE_PRICES;
  const [runePriceManagerOpen, setRunePriceManagerOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);

  // Debounce pour synchronisation collaborative
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      if (Object.keys(runePrices).length > 0) {
        pushRunePricesToServer(selectedServer, runePrices).then(() => {
          setLastSyncTime(new Date().toLocaleTimeString('fr-FR'));
        });
      }
    }, 1500);
    return () => {
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [runePrices, selectedServer]);

  // Récupération des prix distants au montage / changement de serveur
  useEffect(() => {
    let cancelled = false;
    setSyncInProgress(true);
    fetchRunePricesFromServer(selectedServer).then(remote => {
      if (cancelled) return;
      setLastSyncTime(new Date().toLocaleTimeString('fr-FR'));
      if (!remote || Object.keys(remote).length === 0) return;
      setAllRunePrices(prev => {
        const local = prev[selectedServer] ?? {};
        const merged = { ...remote, ...local };
        if (JSON.stringify(local) === JSON.stringify(merged)) {
          setSyncInProgress(false);
          return prev;
        }
        return { ...prev, [selectedServer]: merged };
      });
      setSyncInProgress(false);
    });
    return () => { cancelled = true; };
  }, [selectedServer]);

  const handleForceSync = useCallback(() => {
    setSyncInProgress(true);
    pushRunePricesToServer(selectedServer, runePrices).then(() => {
      fetchRunePricesFromServer(selectedServer).then(remote => {
        setLastSyncTime(new Date().toLocaleTimeString('fr-FR'));
        setSyncInProgress(false);
        if (!remote || Object.keys(remote).length === 0) return;
        setAllRunePrices(prev => {
          const local = prev[selectedServer] ?? {};
          const merged = { ...remote, ...local };
          if (JSON.stringify(local) === JSON.stringify(merged)) return prev;
          return { ...prev, [selectedServer]: merged };
        });
      });
    });
  }, [selectedServer, runePrices]);

  const costToGoal = useMemo(() => {
    if (stats.length === 0) return { breakdown: [], totalCost: 0, totalWeight: 0 };
    const breakdown = stats
      .filter(s => s.targetValue > s.currentValue)
      .map(s => {
        const gap = s.targetValue - s.currentValue;
        const runeName = WEIGHT_TO_RUNE[s.weight] ?? null;
        const unitPrice = runeName ? (runePrices[runeName] ?? 0) : 0;
        const cost = unitPrice * gap;
        return {
          name: s.name,
          gap,
          weight: s.weight,
          runeName,
          unitPrice,
          cost,
        };
      });
    const totalCost = breakdown.reduce((a, b) => a + b.cost, 0);
    const totalWeight = breakdown.reduce((a, b) => a + b.gap * b.weight, 0);
    return { breakdown, totalCost, totalWeight };
  }, [stats, runePrices]);

  const applyPreset = useCallback((fn: (
    setStats: React.Dispatch<React.SetStateAction<StatLine[]>>,
    setGoalMode: React.Dispatch<React.SetStateAction<GoalMode>>,
    setOverstatIndex: React.Dispatch<React.SetStateAction<number | null>>,
    setOverstatTargetValue: React.Dispatch<React.SetStateAction<number>>,
    setExoticLines: React.Dispatch<React.SetStateAction<StatLine[]>>,
  ) => void) => {
    setPuits(0);
    setRuneLog([]);
    setSelectedRuneStat(null);
    setSelectedDropStat(null);
    setEcDropLines([]);
    setExoticLines([]);
    // Reset all stats to base values and remove exotic stats
    setStats(prev => prev.filter(s => !s.isExotic).map(s => ({ ...s, currentValue: s.baseMin })));
    // Call the preset action after a tick so stats are fresh
    setTimeout(() => {
      fn(setStats, setGoalMode, setOverstatIndex, setOverstatTargetValue, setExoticLines);
    }, 0);
  }, []);

  const suggestions = useMemo(() => {
    if (!itemFull || stats.length === 0) return [];
    const type = itemFull.type?.name?.fr ?? itemFull.name?.fr ?? '';
    return getSuggestionsForItem(stats, type, itemFull.level, applyPreset);
  }, [itemFull, stats, applyPreset]);

  const mageAdvice = useMemo(() => {
    if (!itemFull || !selectedItem || stats.length === 0) return null;
    const type = itemFull.type?.name?.fr ?? selectedItem.type ?? '';
    return getMageAdvice(itemFull.level, type, selectedItem.name, stats);
  }, [itemFull, selectedItem, stats]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSearchResults([]);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      try {
        const results = await searchItems(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch full item details when selected
  useEffect(() => {
    if (!selectedItem) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItemFull(null);
      setStats([]);
      return;
    }
    const dbId = parseInt(selectedItem._id, 10);
    if (isNaN(dbId)) {
      setItemFull(null);
      setStats([]);
      return;
    }
    setIsItemLoading(true);
    fetchItemFull(dbId).then(full => {
      setItemFull(full);
      if (full && full.possibleEffects) {
        const parsed: StatLine[] = full.possibleEffects.map(e => {
          const cfg = getEffectConfig(e.effectId);
          return {
            effectId: e.effectId,
            name: cfg.name,
            weight: cfg.weight,
            unit: cfg.unit,
            baseMin: Math.min(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
            baseMax: Math.max(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
            currentValue: Math.min(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
            targetValue: Math.max(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
            isExotic: false,
          };
        });
        setStats(parsed);
        setGoalMode('perfect');
        setOverstatIndex(null);
        setOverstatTargetValue(0);
        setExoticLines([]);
        setPuits(0);
        setRuneLog([]);
      } else {
        setStats([]);
      }
    }).finally(() => setIsItemLoading(false));
  }, [selectedItem]);

  // Recalculate target values when goal mode changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStats(prev => prev.map((s, i) => {
      if (s.isExotic) return s;
      if (goalMode === 'perfect') return { ...s, targetValue: s.baseMax };
      if (goalMode === 'overstat' && overstatIndex === i) {
        return { ...s, targetValue: Math.max(overstatTargetValue, s.baseMax) };
      }
      return { ...s, targetValue: s.baseMax };
    }));
  }, [goalMode, overstatIndex, overstatTargetValue]);

  // Completion check
  const completionStats = useMemo(() => {
    if (stats.length === 0) return null;

    const pctList = stats.map(s =>
      s.targetValue > 0 ? Math.round((s.currentValue / s.targetValue) * 100) : 100
    );
    const avgPct = Math.round(pctList.reduce((a, b) => a + b, 0) / pctList.length);
    const allAbove95 = pctList.every(p => p >= 95);
    const isExhausted = puits === 0;

    let goalMet = true;
    if (goalMode === 'overstat' && overstatIndex !== null && stats[overstatIndex]) {
      goalMet = stats[overstatIndex].currentValue >= stats[overstatIndex].targetValue;
    }
    if (goalMode === 'exotic') {
      const exoticStats = stats.filter(s => s.isExotic);
      goalMet = exoticStats.length === 0 || exoticStats.every(s => s.currentValue >= s.targetValue);
    }

    const isComplete = allAbove95 && isExhausted && goalMet;
    return { avgPct, pctList, allAbove95, isExhausted, goalMet, isComplete };
  }, [stats, puits, goalMode, overstatIndex]);

  // Rune recommendation
  const recommendedRune = useMemo((): {
    index: number | null;
    stat: StatLine | null;
    priority: string;
    message?: string;
  } | null => {
    if (stats.length === 0) return null;

    // ── Mode Exotique : guide pédagogique ──
    if (goalMode === 'exotic') {
      const exoticUnmet = stats.filter(s => s.isExotic && s.currentValue < s.targetValue);

      if (exoticUnmet.length > 0) {
        // Stat exotique la plus légère en premier (la plus facile à passer)
        const target = exoticUnmet.sort((a, b) => a.weight - b.weight)[0];

        if (puits < target.weight) {
          // Étape A : besoin de puits
          return {
            index: null,
            stat: target,
            priority: 'exo-puits',
            message: `Générez du Puits. Passez des petites runes (Force, Vitalité…) jusqu'à faire sauter une statistique à fort poids (ex: PA, PM, PO) pour obtenir du reliquat.`,
          };
        }

        // Étape B : puits suffisant
        return {
          index: null,
          stat: target,
          priority: 'exo-tentative',
          message: `Puits optimal ! Tentez de passer votre rune ${target.name} maintenant.`,
        };
      }

      // Étape C : exo réussi, stats natives peut-être tombées
      const droppedNative = stats.filter(
        s => !s.isExotic && s.currentValue === 0 && s.baseMax > 0
      );
      if (droppedNative.length > 0) {
        const target = droppedNative[0];
        return {
          index: stats.indexOf(target),
          stat: target,
          priority: 'exo-reparation',
          message: `Exo réussi ! Remontez maintenant les statistiques natives manquantes en croisant les doigts.`,
        };
      }
    }

    // ── Cas général : puits à zéro → conseiller un sacrifice ──
    if (puits === 0) {
      const heavy = stats
        .filter(s => !s.isExotic && s.weight >= 4 && s.currentValue >= 1)
        .map(s => ({ i: stats.indexOf(s), s }))
        .sort((a, b) => b.s.weight - a.s.weight);
      if (heavy.length > 0) {
        return { index: heavy[0].i, stat: heavy[0].s, priority: 'puits' };
      }
    }

    // ── Défaut : stat la plus éloignée de sa cible en % ──
    const gaps = stats
      .map((s, i) => ({ i, s, gap: s.targetValue - s.currentValue }))
      .filter(x => x.gap > 0)
      .sort((a, b) => {
        const pctA = a.s.targetValue > 0 ? a.s.currentValue / a.s.targetValue : 1;
        const pctB = b.s.targetValue > 0 ? b.s.currentValue / b.s.targetValue : 1;
        return pctA - pctB;
      });

    if (gaps.length > 0) {
      return { index: gaps[0].i, stat: gaps[0].s, priority: 'gap' };
    }

    return null;
  }, [stats, puits, goalMode]);

  const updateStatValue = useCallback((index: number, newValue: number) => {
    setStats(prev => prev.map((s, i) => i === index ? { ...s, currentValue: Math.max(0, newValue) } : s));
  }, []);

  const handleSelectItem = useCallback((item: DofusItem) => {
    setSelectedItem(item);
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
  }, []);

  const handleGoalModeChange = useCallback((mode: GoalMode) => {
    setGoalMode(mode);
    if (mode !== 'overstat') setOverstatIndex(null);
    if (mode !== 'exotic') {
      setExoticLines([]);
      setStats(prev => prev.filter(s => !s.isExotic));
    }
  }, []);

  const addExoticLine = useCallback((effectId: number) => {
    const cfg = EXOTIC_EFFECTS.find(e => e.effectId === effectId);
    if (!cfg) return;
    setExoticLines(prev => {
      if (prev.some(l => l.effectId === effectId)) return prev;
      const newStat: StatLine = {
        effectId: cfg.effectId,
        name: cfg.name,
        weight: cfg.weight,
        unit: '',
        baseMin: 0,
        baseMax: 1,
        currentValue: 0,
        targetValue: 1,
        isExotic: true,
      };
      return [...prev, newStat];
    });
    setStats(prev => {
      if (prev.some(s => s.effectId === effectId && s.isExotic)) return prev;
      const cfg2 = EXOTIC_EFFECTS.find(e => e.effectId === effectId);
      if (!cfg2) return prev;
      return [...prev, {
        effectId: cfg2.effectId,
        name: cfg2.name,
        weight: cfg2.weight,
        unit: '',
        baseMin: 0,
        baseMax: 1,
        currentValue: 0,
        targetValue: 1,
        isExotic: true,
      }];
    });
  }, []);

  const removeExoticLine = useCallback((effectId: number) => {
    setExoticLines(prev => prev.filter(l => l.effectId !== effectId));
    setStats(prev => prev.filter(s => !(s.effectId === effectId && s.isExotic)));
  }, []);

  const updateExoticTarget = useCallback((effectId: number, value: number) => {
    setExoticLines(prev => prev.map(l => l.effectId === effectId ? { ...l, targetValue: value } : l));
    setStats(prev => prev.map(s => s.effectId === effectId && s.isExotic ? { ...s, targetValue: value } : s));
  }, []);

  const applyRuneResult = useCallback((type: 'sc' | 'sn' | 'ec') => {
    if (selectedRuneStat === null) return;
    const statIndex = stats.findIndex(s => s.effectId === selectedRuneStat);
    if (statIndex === -1) return;
    const stat = stats[statIndex];
    const runeWeight = stat.weight * selectedRuneQty;
    let newPuits = puits;
    const dropped: { name: string; weight: number }[] = [];

    if (type === 'sc') {
      const newVal = Math.min(stat.currentValue + selectedRuneQty, stat.targetValue);
      updateStatValue(statIndex, newVal);
    } else if (type === 'sn') {
      const newVal = Math.min(stat.currentValue + selectedRuneQty, stat.targetValue);
      updateStatValue(statIndex, newVal);
      if (puits > 0) {
        newPuits = Math.max(0, puits - runeWeight);
      } else {
        if (selectedDropStat !== null) {
          const dropIndex = stats.findIndex(s => s.effectId === selectedDropStat);
          if (dropIndex !== -1) {
            const dropStat = stats[dropIndex];
            const dropAmount = Math.max(1, selectedDropQty);
            const newDropVal = Math.max(0, dropStat.currentValue - dropAmount);
            updateStatValue(dropIndex, newDropVal);
            const dropWeight = dropStat.weight * dropAmount;
            dropped.push({ name: dropStat.name, weight: dropWeight });
            newPuits += dropWeight;
          }
        }
      }
    } else if (type === 'ec') {
      let totalDropWeight = 0;
      for (const line of ecDropLines) {
        if (line.index < 0 || line.index >= stats.length) continue;
        const s = stats[line.index];
        const dropAmount = Math.max(0, s.currentValue - Math.max(0, line.newValue));
        if (dropAmount > 0) {
          updateStatValue(line.index, Math.max(0, line.newValue));
          const dw = s.weight * dropAmount;
          totalDropWeight += dw;
          dropped.push({ name: s.name, weight: dw });
        }
      }
      newPuits += totalDropWeight;
    }

    setPuits(Math.max(0, newPuits));

    const entry: RuneLogEntry = {
      id: generateId(),
      runeName: `${type === 'sc' ? 'SC' : type === 'sn' ? 'SN' : 'EC'} ${stat.name}`,
      statName: stat.name,
      weight: runeWeight,
      type,
      statChange: type === 'ec' ? 0 : selectedRuneQty,
      puitsChange: newPuits - puits,
      droppedStats: dropped,
    };
    setRuneLog(prev => [entry, ...prev]);

    setSelectedDropStat(null);
    setSelectedDropQty(1);
    setEcDropLines([]);
    setSelectedRuneStat(null);
    setSelectedRuneQty(1);
  }, [selectedRuneStat, selectedRuneQty, stats, puits, updateStatValue, selectedDropStat, ecDropLines, selectedDropQty]);

  const handleUndo = useCallback(() => {
    if (runeLog.length === 0) return;
    const last = runeLog[0];
    setRuneLog(prev => prev.slice(1));

    // Reverse puits
    setPuits(prev => Math.max(0, prev - last.puitsChange));

    // Reverse stat changes
    setStats(prev => prev.map(s => {
      if (s.name === last.statName && !last.type.includes('ec')) {
        return { ...s, currentValue: Math.max(0, s.currentValue - last.statChange) };
      }
      return s;
    }));

    // Reverse dropped stats
    for (const drop of last.droppedStats) {
      setStats(prev => prev.map(s => {
        if (s.name === drop.name) {
          return { ...s, currentValue: s.currentValue + Math.round(drop.weight / s.weight) };
        }
        return s;
      }));
    }
  }, [runeLog]);

  const handleReset = useCallback(() => {
    setPuits(0);
    setRuneLog([]);
    if (itemFull && itemFull.possibleEffects) {
      setStats(itemFull.possibleEffects.map(e => {
        const cfg = getEffectConfig(e.effectId);
        return {
          effectId: e.effectId,
          name: cfg.name,
          weight: cfg.weight,
          unit: cfg.unit,
          baseMin: Math.min(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
          baseMax: Math.max(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
          currentValue: Math.min(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
          targetValue: Math.max(e.diceNum, e.diceSide !== 0 ? e.diceSide : e.diceNum),
          isExotic: false,
        };
      }));
    }
    setExoticLines([]);
    setGoalMode('perfect');
    setOverstatIndex(null);
    setSelectedRuneStat(null);
    setSelectedDropStat(null);
    setEcDropLines([]);
  }, [itemFull]);

  const allStats = useMemo(() => stats, [stats]);

  const normalStats = useMemo(() => stats.filter(s => !s.isExotic), [stats]);

  const neededRunes = useMemo(() => {
    return allStats
      .filter(s => s.targetValue > s.currentValue)
      .map(s => ({
        name: s.name,
        weight: s.weight,
        currentGap: s.targetValue - s.currentValue,
        estimatedWeight: (s.targetValue - s.currentValue) * s.weight,
      }))
      .sort((a, b) => b.estimatedWeight - a.estimatedWeight);
  }, [allStats]);

  useEffect(() => {
    if (!searchFocused || searchResults.length === 0) return;
    const update = () => {
      if (searchInputRef.current) {
        const rect = searchInputRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [searchFocused, searchResults.length]);

  useEffect(() => {
    if (!searchFocused) return;
    const handleClick = (e: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest('[data-search-dropdown]')
      ) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [searchFocused]);

  return (
    <>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ─── LEFT PANEL: Search + Stat Sheet ─── */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* ITEM SEARCH */}
          <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -z-10" />
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              <Search className="h-5 w-5 text-purple-400" />
              Choisir un équipement
            </h2>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Ex: Gelano, Dragoturkey, Coiffe du Bouftou..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchFocused(true); }}
                onFocus={() => setSearchFocused(true)}
                className="w-full bg-[#080d16] border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-3.5 text-slate-500 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

          </div>

          {/* SELECTED ITEM HEADER */}
          {selectedItem && (
            <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
              {isItemLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                  Chargement de l'item…
                </div>
              ) : itemFull ? (
                <>
                  <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/5">
                    <div className="relative shrink-0">
                      <ItemImage item={{ imgUrl: itemFull.img, name: itemFull.name.fr, type: itemFull.type?.name?.fr, _id: itemFull._id }} className="h-14 w-14 bg-[#151f32]/85 rounded-xl p-1 border border-white/10" imgClassName="h-10 w-10 object-contain" />
                      <span className="absolute -bottom-1 -right-1 text-[9px] bg-gradient-to-r from-purple-500 to-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded">
                        Lvl {itemFull.level}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{itemFull.name.fr}</h3>
                      <p className="text-xs text-slate-400 capitalize">{itemFull.type?.name?.fr ?? 'Équipement'}</p>
                    </div>
                  </div>

                  {/* STAT SHEET */}
                  <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                    {allStats.map((stat, idx) => (
                      <div key={stat.isExotic ? `exo-${stat.effectId}` : `stat-${stat.effectId}`} className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${stat.isExotic ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#090d16]/30 border-white/5'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{EFFECT_MAP[stat.effectId] || stat.name}</span>
                            {stat.isExotic && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">EXO</span>}
                          </div>
                          <span className="text-[9px] text-slate-500 font-semibold">Poids {stat.weight}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 w-12 shrink-0">Actuel:</span>
                          <input
                            type="number"
                            value={stat.currentValue}
                            onChange={e => updateStatValue(idx, parseInt(e.target.value) || 0)}
                            className="w-16 bg-[#070a12] border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-semibold text-center focus:outline-none focus:border-purple-500/40"
                          />
                          {!stat.isExotic && (
                            <>
                              <span className="text-[10px] text-slate-500">/ Max: <span className="text-purple-400 font-bold">{stat.baseMax}</span></span>
                              {goalMode === 'overstat' && overstatIndex === idx && (
                                <span className="text-[10px] text-amber-400 font-bold">→ Cible: {stat.targetValue}</span>
                              )}
                            </>
                          )}
                          {stat.isExotic && (
                            <span className="text-[10px] text-slate-500">/ Cible: <span className="text-amber-400 font-bold">{stat.targetValue}</span></span>
                          )}
                        </div>
                        {/* Progress bar */}
                        {stat.targetValue > 0 && (
                          <div className="h-1.5 bg-[#070a12] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.round((stat.currentValue / stat.targetValue) * 100))}%`,
                                background: stat.currentValue >= stat.targetValue
                                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                                  : 'linear-gradient(90deg, #a855f7, #c084fc)',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-slate-500 text-sm">
                  Impossible de charger les détails de cet item.
                </div>
              )}
            </div>
          )}

          {/* GOAL MODE SELECTOR */}
          {itemFull && stats.length > 0 && (
            <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Conseil Expert
              </h3>

              {/* CONSEIL EXPERT */}
              {mageAdvice && !mageAdvice.isWorthMaging && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-[10px] font-semibold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {mageAdvice.advice}
                  </p>
                </div>
              )}

              {mageAdvice && mageAdvice.isWorthMaging && mageAdvice.recommendedGoals.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Objectifs recommandés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mageAdvice.recommendedGoals.map(goal => {
                      const preset = suggestions.find(p => p.id === goal.id);
                      return (
                        <button
                          key={goal.id}
                          onClick={() => preset ? preset.action() : handleGoalModeChange('perfect')}
                          className="group px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/15 text-white hover:text-purple-300"
                        >
                          <span className="mr-1">{goal.label}</span>
                          {goal.description && <span className="opacity-70">{goal.description}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {mageAdvice && mageAdvice.isWorthMaging && mageAdvice.advice && (
                <p className="text-[10px] text-slate-500 mb-3 italic">{mageAdvice.advice}</p>
              )}

              {/* Configuration manuelle */}
              <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Mode manuel</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(['perfect', 'overstat', 'exotic'] as GoalMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => handleGoalModeChange(mode)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                      goalMode === mode
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                        : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode === 'perfect' ? 'Jet Parfait' : mode === 'overstat' ? 'Over-stat' : 'Exotique'}
                  </button>
                ))}
              </div>

              {goalMode === 'overstat' && normalStats.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={overstatIndex ?? ''}
                    onChange={e => {
                      const idx = parseInt(e.target.value);
                      setOverstatIndex(idx);
                      setOverstatTargetValue(stats[idx]?.baseMax ?? 0);
                    }}
                    className="bg-[#070a12] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/40"
                  >
                    <option value="" disabled>Choisir une stat</option>
                    {normalStats.map(s => (
                      <option key={s.effectId} value={stats.indexOf(s)}>{s.name}</option>
                    ))}
                  </select>
                  {overstatIndex !== null && (
                    <>
                      <span className="text-xs text-slate-400">→</span>
                      <input
                        type="number"
                        value={overstatTargetValue}
                        onChange={e => setOverstatTargetValue(parseInt(e.target.value) || 0)}
                        className="w-16 bg-[#070a12] border border-amber-500/30 rounded px-1.5 py-1 text-xs text-amber-400 font-bold text-center focus:outline-none"
                        placeholder="Cible"
                      />
                    </>
                  )}
                </div>
              )}

              {goalMode === 'exotic' && (
                <div className="flex flex-col gap-2">
                  <select
                    value=""
                    onChange={e => {
                      const id = parseInt(e.target.value);
                      if (id) addExoticLine(id);
                    }}
                    className="bg-[#070a12] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40 w-full"
                  >
                    <option value="" disabled>Ajouter une stat exotique…</option>
                    {EXOTIC_EFFECTS
                      .filter(e => !stats.some(s => s.effectId === e.effectId))
                      .map(e => (
                        <option key={e.effectId} value={e.effectId}>
                          {e.name} (Poids {e.weight})
                        </option>
                      ))}
                  </select>
                  {exoticLines.length === 0 && (
                    <p className="text-[10px] text-slate-500 italic">Aucune stat exotique ajoutée.</p>
                  )}
                  <div className="flex flex-col gap-1.5 mt-1">
                    {exoticLines.map(line => (
                      <div key={line.effectId} className="flex items-center gap-2">
                        <button
                          onClick={() => removeExoticLine(line.effectId)}
                          className="text-rose-400 hover:text-rose-300 text-xs font-bold mr-1"
                          title="Retirer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="text-xs text-amber-400 font-bold w-20">{line.name}</span>
                        <span className="text-[10px] text-slate-400">Cible:</span>
                        <input
                          type="number"
                          value={line.targetValue}
                          onChange={e => updateExoticTarget(line.effectId, parseInt(e.target.value) || 0)}
                          className="w-14 bg-[#070a12] border border-amber-500/30 rounded px-1.5 py-0.5 text-xs text-amber-400 font-bold text-center focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ANALYSE DE RENTABILITÉ */}
          {itemFull && stats.length > 0 && (
            <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Analyse de Rentabilité
              </h3>
              <div className="flex flex-col gap-2.5">
                {/* Coût estimé des runes */}
                <div className="bg-[#090d16]/30 rounded-lg p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-slate-500 font-semibold">Coût estimé des runes</span>
                    <span className="text-sm font-black text-white">{costToGoal.totalCost.toLocaleString('fr-FR')} K</span>
                  </div>
                  {costToGoal.breakdown.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {costToGoal.breakdown.map(b => (
                        <div key={b.name} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">{b.name} ×{b.gap}</span>
                          <span className="text-slate-500">
                            {b.runeName ? `${b.runeName} (${b.unitPrice} K/unité) → ${b.cost.toLocaleString('fr-FR')} K` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prix de vente estimé */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-semibold shrink-0">Prix de vente estimé (HDV) :</span>
                  <input
                    type="number"
                    value={estimatedSalePrice || ''}
                    onChange={e => setEstimatedSalePrice(parseInt(e.target.value) || 0)}
                    placeholder="ex: 50000"
                    className="w-28 bg-[#070a12] border border-white/10 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-purple-500/40"
                  />
                  <span className="text-[10px] text-slate-500">K</span>
                </div>

                {/* Bilan rentabilité */}
                {estimatedSalePrice > 0 && (
                  <div className={`rounded-lg p-3 border text-xs font-bold ${
                    estimatedSalePrice >= costToGoal.totalCost
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    {estimatedSalePrice >= costToGoal.totalCost ? (
                      <>✅ Rentable — Bénéfice estimé : <span className="text-emerald-300">+{(estimatedSalePrice - costToGoal.totalCost).toLocaleString('fr-FR')} K</span></>
                    ) : (
                      <>❌ À perte — Déficit estimé : <span className="text-rose-300">-{(costToGoal.totalCost - estimatedSalePrice).toLocaleString('fr-FR')} K</span></>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RUNE PLAN */}
          {itemFull && neededRunes.length > 0 && (
            <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Plan de runes estimé</h3>
              <div className="flex flex-col gap-1.5">
                {neededRunes.map(r => (
                  <div key={r.name} className="flex items-center justify-between text-xs bg-[#090d16]/30 px-3 py-1.5 rounded-lg border border-white/5">
                    <span className="text-slate-200 font-semibold">{r.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 font-bold">{r.currentGap} × Poids {r.weight}</span>
                      <span className="text-[10px] text-slate-500">≈ {r.estimatedWeight.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-slate-500 mt-1 text-right">
                  Poids total estimé: <span className="text-purple-400 font-bold">{neededRunes.reduce((a, r) => a + r.estimatedWeight, 0).toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {/* GESTIONNAIRE DE PRIX DES RUNES */}
          {itemFull && (
            <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
              <button
                onClick={() => setRunePriceManagerOpen(!runePriceManagerOpen)}
                className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-purple-400">💎</span> Gérer les prix des runes
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.5 rounded-full">Collaboratif</span>
                  <span className="text-[9px]">{runePriceManagerOpen ? '▲' : '▼'}</span>
                </span>
              </button>

              {runePriceManagerOpen && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                    {RUNE_NAMES.map(runeName => {
                      const price = runePrices[runeName] ?? 0;
                      return (
                        <div key={runeName} className="flex items-center gap-1.5 bg-[#090d16]/30 rounded-lg px-2 py-1.5 border border-white/5">
                          <span className="text-[10px] font-semibold text-slate-300 w-10 shrink-0">{runeName}</span>
                          <input
                            type="number"
                            min={0}
                            value={price || ''}
                            placeholder="0"
                            className="w-full bg-[#070a12] border border-white/10 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-purple-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 0) {
                                setAllRunePrices(prev => ({
                                  ...prev,
                                  [selectedServer]: { ...(prev[selectedServer] ?? {}), [runeName]: val },
                                }));
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5">
                      {syncInProgress ? (
                        <span className="text-[9px] text-yellow-400 animate-pulse">⟳ Synchronisation...</span>
                      ) : lastSyncTime ? (
                        <span className="text-[9px] text-slate-500">Dernière synchro: {lastSyncTime}</span>
                      ) : null}
                    </div>
                    <button
                      onClick={handleForceSync}
                      disabled={syncInProgress}
                      className="text-[9px] text-slate-500 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {syncInProgress ? '⟳' : '↻'} Forcer la synchro
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500 italic mt-2 text-center">
                    Les prix saisis ici sont partagés avec tous les artisans du serveur <span className="text-slate-300 font-semibold">{selectedServer}</span>.
                  </p>
                </>
              )}
            </div>
          )}

        </div>

        {/* ─── RIGHT PANEL: FM Assistant ─── */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {!itemFull ? (
            <div className="glass-panel rounded-xl p-16 text-center border border-white/5 shadow-xl flex flex-col items-center justify-center h-full">
              <Wand2 className="h-12 w-12 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm max-w-md">
                Recherchez un équipement dans le panneau de gauche pour démarrer l'assistant de Forgemagie.
              </p>
            </div>
          ) : (
            <>
              {/* PUITS + RECOMMENDATION + RUNE LOGGER */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* PUITS DISPLAY */}
                <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl flex flex-col items-center text-center">
                  <div className="relative flex items-center justify-center h-28 w-28 rounded-full border-4 border-dashed border-purple-500/30 bg-[#070a12]/50 shadow-inner">
                    <div className={`absolute inset-2 rounded-full transition-all duration-500 blur-sm ${puits > 0 ? 'bg-purple-500/10 animate-pulse' : ''}`} />
                    <div className="flex flex-col items-center relative z-10">
                      <span className={`text-4xl font-black transition-colors ${puits > 0 ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'text-slate-600'}`}>
                        {puits}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Puits</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2">
                    {puits > 0 ? 'Puits actif — les SN consomment du puits' : 'Aucun puits — les SN feront sauter des stats'}
                  </span>
                </div>

                {/* RUNE RECOMMENDATION */}
                <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl flex flex-col items-center justify-center">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Rune recommandée</h3>
                  {recommendedRune ? (
                    <div className={`text-center ${recommendedRune.message ? 'max-w-[220px]' : ''}`}>
                      {recommendedRune.message ? (
                        <>
                          <div className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            recommendedRune.priority === 'exo-puits' ? 'bg-amber-500/10 text-amber-400' :
                            recommendedRune.priority === 'exo-tentative' ? 'bg-emerald-500/10 text-emerald-400' :
                            'bg-sky-500/10 text-sky-400'
                          }`}>
                            {recommendedRune.priority === 'exo-puits' ? '📖 Générer du Puits' :
                             recommendedRune.priority === 'exo-tentative' ? '🎯 Tenter l\'Exo' :
                             '🔧 Réparation'}
                          </div>
                          <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">{recommendedRune.message}</p>
                        </>
                      ) : (
                        <>
                          <span className="text-lg font-black text-white">{recommendedRune.stat?.name}</span>
                          <div className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            recommendedRune.priority === 'puits' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-purple-500/10 text-purple-400'
                          }`}>
                            {recommendedRune.priority === 'puits' ? 'Priorité puits (sacrifice)' : 'Écart max'}
                          </div>
                          {recommendedRune.stat && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Actuel: {recommendedRune.stat.currentValue} / Cible: {recommendedRune.stat.targetValue}
                              {recommendedRune.stat.currentValue < recommendedRune.stat.targetValue && (
                                <> &bull; <span className="text-purple-400">+{recommendedRune.stat.targetValue - recommendedRune.stat.currentValue} restant</span></>
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">Toutes les stats sont à l'objectif</p>
                  )}
                </div>

                {/* COMPLETION STATUS */}
                <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl flex flex-col items-center justify-center">
                  {completionStats ? (
                    <>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Avancement</h3>
                      <span className="text-3xl font-black text-white">{completionStats.avgPct}%</span>
                      {completionStats.isComplete ? (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> Item Excellent !
                        </div>
                      ) : completionStats.allAbove95 ? (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                          <AlertTriangle className="h-3 w-3" /> Proche du max, attention
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 mt-1">En cours…</p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-500 text-xs">Chargez un item</p>
                  )}
                </div>
              </div>

              {/* RUNE LOGGER */}
              <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-400" /> Passage de rune
                </h3>

                <div className="flex flex-col gap-3">
                  {/* Step 1: Select stat to rune */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-semibold">Stat à runer:</span>
                    <select
                      value={selectedRuneStat ?? ''}
                      onChange={e => { setSelectedRuneStat(parseInt(e.target.value)); setSelectedDropStat(null); }}
                      className="bg-[#070a12] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/40 flex-1 min-w-[120px]"
                    >
                      <option value="" disabled>Choisir une stat</option>
                      {stats.map(s => (
                        <option key={`${s.effectId}-${s.isExotic}`} value={s.effectId}>
                          {s.name} ({s.currentValue}→{s.targetValue})
                        </option>
                      ))}
                    </select>
                    {selectedRuneStat !== null && (
                      <>
                        <span className="text-[10px] text-slate-400">×</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={selectedRuneQty}
                          onChange={e => setSelectedRuneQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-12 bg-[#070a12] border border-white/10 rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-purple-500/40"
                        />
                      </>
                    )}
                  </div>

                  {/* Step 2: Result buttons */}
                  {selectedRuneStat !== null && (
                    <>
                      <div className="flex gap-2">
                        <button onClick={() => applyRuneResult('sc')} className="flex-1 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all">
                          Succès Critique (SC)
                        </button>
                        <button onClick={() => applyRuneResult('sn')} className="flex-1 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 text-xs font-bold transition-all">
                          Succès Neutre (SN)
                        </button>
                        <button onClick={() => applyRuneResult('ec')} className="flex-1 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-all">
                          Échec Critique (EC)
                        </button>
                      </div>

                      {/* SN or EC: stat drop selector */}
                      {(selectedDropStat !== null || ecDropLines.length > 0) && (
                        <div className="bg-[#090d16]/30 border border-amber-500/20 rounded-xl p-3">
                          <p className="text-[10px] text-amber-400 font-semibold mb-2">Stats impactées (baisse):</p>
                          {/* For simplicity, show the overall drop interface */}
                          <div className="flex flex-col gap-1.5">
                            {stats.map((s, i) => (
                              <label key={s.effectId} className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={ecDropLines.some(l => l.index === i)}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setEcDropLines(prev => [...prev, { index: i, newValue: Math.max(0, s.currentValue - 1) }]);
                                    } else {
                                      setEcDropLines(prev => prev.filter(l => l.index !== i));
                                    }
                                  }}
                                  className="accent-purple-500"
                                />
                                <span className="text-slate-300 w-20">{s.name}</span>
                                <span className="text-slate-500">({s.currentValue}) →</span>
                                <input
                                  type="number"
                                  value={ecDropLines.find(l => l.index === i)?.newValue ?? s.currentValue}
                                  onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    setEcDropLines(prev => prev.map(l => l.index === i ? { ...l, newValue: val } : l));
                                  }}
                                  className="w-14 bg-[#070a12] border border-rose-500/30 rounded px-1 py-0.5 text-xs text-white text-center focus:outline-none"
                                />
                              </label>
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-500 mt-2">
                            Pour SN sans puits ou EC: cochez les stats qui ont baissé et leur nouvelle valeur.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* HISTORY + UNDO + RESET */}
              <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Historique (5 dernières runes)</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUndo}
                      disabled={runeLog.length === 0}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/5 bg-[#151f32] text-[10px] font-bold text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <Undo2 className="h-3 w-3" /> Annuler
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/5 bg-rose-500/10 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 transition-all"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {runeLog.length === 0 ? (
                    <div className="text-center py-6 text-slate-600 text-xs italic">Aucune rune passée</div>
                  ) : (
                    runeLog.slice(0, 5).map(entry => (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between p-2 rounded-lg text-[10px] border ${
                          entry.type === 'sc' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' :
                          entry.type === 'sn' ? 'bg-purple-500/5 border-purple-500/20 text-purple-300' :
                          'bg-rose-500/5 border-rose-500/20 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            entry.type === 'sc' ? 'bg-emerald-400' : entry.type === 'sn' ? 'bg-purple-400' : 'bg-rose-400'
                          }`} />
                          <span className="font-semibold">{entry.runeName}</span>
                          {entry.droppedStats.length > 0 && (
                            <span className="text-slate-500">-{entry.droppedStats.map(d => `${d.name}(-${d.weight})`).join(', ')}</span>
                          )}
                        </div>
                        <span className="font-bold">
                          {entry.puitsChange > 0 ? `+${entry.puitsChange}` : entry.puitsChange < 0 ? `${entry.puitsChange}` : '±0'} puits
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COMPLETION ALERT */}
              {completionStats?.isComplete && (
                <div className="rounded-xl p-4 bg-emerald-950/20 border border-emerald-500/20 shadow-lg flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-400">Item Excellent !</p>
                    <p className="text-xs text-emerald-300/70">
                      Toutes les statistiques sont à 95%+ de leur maximum et le puits est épuisé. 
                      Il est fortement conseillé de s'arrêter ici pour ne pas briser le jet.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    {searchFocused && searchResults.length > 0 && createPortal(
      <div
        data-search-dropdown
        style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        className="bg-[#0f1420] border border-white/10 rounded-xl shadow-xl max-h-[280px] overflow-y-auto z-[9999]"
      >
        {searchResults.filter(item => {
          const t = item.type.toLowerCase();
          return ['épée','hache','arc','bâton','baguette','marteau','pioche','pelle','dague',
                  'anneau','amulette','ceinture','bottes','chapeau','cape','bouclier','dofus']
            .some(ft => t.includes(ft));
        }).map(item => {
          return (
            <button
              key={item._id}
              onClick={() => handleSelectItem(item)}
              className="w-full flex items-center gap-3 p-3 hover:bg-purple-500/10 transition-colors border-b border-white/5 last:border-0"
            >
              <ItemImage item={item} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10 shrink-0" />
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                <p className="text-[10px] text-slate-400">{item.type} &bull; Lvl {item.level}</p>
              </div>
            </button>
          );
        })}
      </div>,
      document.body
    )}
    </>
  );
}
