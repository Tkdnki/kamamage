import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDofus } from '../context/DofusContext';
import type { PriceData } from '../context/DofusContext';
import { useAuth } from '../context/AuthContext';
import { searchItems, normalize, fuzzyFindItem } from '../services/api';
import type { DofusItem } from '../data/mockData';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { getHdvName, getHdvCategoryForItem } from '../data/hdvCategories';
import { getPriceRecord } from '../lib/pricing';
import { normalizeName } from '../lib/petXp';
import { compressImage } from '../lib/imageUtils';
import { Camera, X, Copy, Check, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon, Clock, ListChecks, Key, Target, SlidersHorizontal } from 'lucide-react';

// Espacement obligatoire dans la file d'attente : pause systématique de 2.5s
// entre deux images distinctes pour lisser les appels vers l'API IA et ne pas
// déclencher le rate-limit RPM du provider (modèle Qwen 27B : latence élevée).
const QUEUE_THROTTLE_MS = 2500;

// Pause minimale avant de re-tenter l'image courante après une erreur 429
// (Rate Limit RNA/TPM) : courte mais suffisante pour laisser la fenêtre Groq se
// réinitialiser partiellement avant le prochain essai de la MÊME image.
const RATE_LIMIT_RETRY_DELAY_MS = 8000;

// Nombre max de réessais (503) pour la MÊME image avant de l'abandonner.
// NB : le 429 (Rate Limit RPM/TPM) ne compte PAS dans ce quota : c'est une pause
// globale de l'API (fenêtre glissante 60s de Groq), pas une erreur propre à l'image.
const MAX_RETRIES = 3;

// Nombre max de réessais après un timeout client (60s) sur la MÊME image
// avant de l'abandonner (auto-skip). L'IA vision peut dépasser la fenêtre
// de 60s sous charge : on re-tente au lieu de perdre l'image.
const MAX_TIMEOUT_RETRIES = 3;

// Backoff de base exponentiel pour l'erreur 503 (Over Capacity / Surcharge Groq) :
// délai plus long pour laisser les serveurs Groq récupérer avant la nouvelle
// tentative : Math.pow(2, retries - 1) * 5000 → retry 1 → 5s, retry 2 → 10s,
// retry 3 → 20s.
const GROQ_OVERLOAD_BASE_DELAY_MS = 5000;

// Durée de pause automatique de la file après un 429 de type RPM/TPM (Rate
// Limit par minute) : on attend que la fenêtre glissante 60s de Groq se
// réinitialise complètement avant de re-tenter la MÊME image. Reprise
// automatique après 65s, ou au clic.
// NB : ce délai ne s'applique PAS au quota QUOTIDIEN (TPD/RPD) — voir le flag
// `isDailyLimit` transmis par le backend, qui stoppe la file définitivement.
const RPM_QUOTA_PAUSE_MS = 65000;

// Durée de pause automatique de la file après épuisement des retries (503) :
// reprise automatique après 30s, ou immédiatement au clic.
const QUOTA_PAUSE_MS = 30000;

// Pause asynchrone bloquante : l'appelant DOIT faire `await sleep(ms)` pour
// que la boucle d'envoi attende réellement la fin du délai avant de relancer.
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ScanItem {
  name: string;
  prices: {
    x1: number;
    x10: number;
    x100: number;
    x1000: number;
  };
}

interface TokenInfo {
  remaining: number;
  limit: number;
  used: number;
}

interface ScanRecipeResult {
  items: ScanItem[];
  tokens?: TokenInfo;
}

interface QueueEntry {
  dataUrl: string;
  base64: string;
}

interface HdvScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQueue?: ScannerQueueItem[];
  /** Mode "Scan forcé" : item ciblé par l'utilisateur. Les prix extraits lui
   *  sont attribués de force, sans dépendre de l'OCR du nom. */
  targetedItem?: ScannerQueueItem | null;
  /** Titre personnalisé affiché dans l'en-tête de la modale. */
  title?: string;
  /** Méthode de scan pré-sélectionnée à l'ouverture (défaut : "full"). */
  initialScanMode?: 'full' | 'stale';
}

export default function HdvScannerModal({ isOpen, onClose, initialQueue, targetedItem, title, initialScanMode }: HdvScannerModalProps) {
  const { setHdvPrice, hdvPrices, setIsScanning } = useDofus();
  const { user } = useAuth();

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pauseMessage, setPauseMessage] = useState<string | null>(null);

  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScanRecipeResult | null>(null);
  const [matchedItems, setMatchedItems] = useState<{ item: ScanItem; dofusItem: DofusItem }[]>([]);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [groqKey, setGroqKey] = useState(() => {
    try { return localStorage.getItem('user_groq_key') || ''; } catch { return ''; }
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Un scan est "en cours" dès qu'une image est en file ou que le traitement est
  // actif (y compris pendant les pauses quota). On le signale au DofusContext
  // pour suspendre le polling Supabase en arrière-plan le temps du scan.
  const isScanningActive = isProcessing || queue.length > 0;
  useEffect(() => {
    setIsScanning(isScanningActive);
  }, [isScanningActive, setIsScanning]);

  // Sécurité : si la modale est démontée en plein scan, on relâche le flag.
  useEffect(() => {
    return () => setIsScanning(false);
  }, [setIsScanning]);

  // Double méthode de scan : "full" = tous les items attendus, "stale" = uniquement
  // les prix manquants ou obsolètes (> 10 jours).
  const [scanMode, setScanMode] = useState<'full' | 'stale'>('full');

  // Suivi des items de recette attendus
  const [expectedItems, setExpectedItems] = useState<ScannerQueueItem[]>([]);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const expectedItemsRef = useRef<ScannerQueueItem[]>([]);
  const activeExpectedRef = useRef<ScannerQueueItem[]>([]);
  const resolvedIdsRef = useRef<Set<string>>(new Set());
  const recipeDoneRef = useRef(false);
  const targetedItemRef = useRef<ScannerQueueItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<QueueEntry[]>([]);
  const processingRef = useRef(false);
  const cancelCurrentRef = useRef(false);

  // File en PAUSE (quota IA 429 épuisé) : reprise auto après QUOTA_PAUSE_MS
  // ou immédiatement au clic sur le bouton de reprise.
  const [quotaPaused, setQuotaPaused] = useState(false);
  // Décompte dynamique affiché dans le bandeau de pause (ex: 45 → 0).
  const [quotaPauseCountdown, setQuotaPauseCountdown] = useState(0);
  const resumeRef = useRef<(() => void) | null>(null);
  // Intervalle de décompte de la pause quota : nettoyé à la reprise automatique
  // (compteur à 0), au clic sur "Reprendre" et au reset du modal.
  const quotaCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Verrou SYNCHRONE de pause quota : contrairement à l'état React `quotaPaused`
  // (associé à un rendu différé), un ref est lisible immédiatement par la boucle
  // d'envoi et par `addToQueue`, même à l'intérieur d'une closure de boucle.
  // C'est ce verrou qui garantit qu'aucune image n'est envoyée pendant la fenêtre
  // de réinitialisation RPM/TPM.
  const quotaPausedRef = useRef(false);

  const resumeScan = useCallback(() => {
    resumeRef.current?.();
    resumeRef.current = null;
  }, []);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Attend `seconds` secondes en affichant un compte à rebours dans `pauseMessage`.
  // Retourne false si la file a été annulée pendant l'attente (fermeture du modal).
  const waitWithCountdown = useCallback(async (seconds: number, baseMessage: string): Promise<boolean> => {
    const total = Math.max(1, Math.round(seconds));
    for (let i = total; i >= 1; i--) {
      if (cancelCurrentRef.current) return false;
      setPauseMessage(`${baseMessage} ${i}s...`);
      await sleep(1000);
    }
    setPauseMessage(null);
    return true;
  }, []);

  // Met la file en PAUSE tant que le quota IA (429) n'est pas rétabli : reprise
  // automatique après `ms` (décompte dynamique via `quotaPauseCountdown`), ou
  // immédiatement au clic sur le bouton "Reprendre".
  // Retourne false si la file a été annulée (fermeture du modal) pendant la pause.
  const waitForQuotaResume = useCallback(async (ms: number, baseMessage: string): Promise<boolean> => {
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    // Le verrou est posé SYNCHRONEMENT, avant toute promesse : même si le rendu
    // React est différé, la boucle d'envoi et `addToQueue` voient immédiatement
    // la pause active via `quotaPausedRef`.
    setQuotaPaused(true);
    setQuotaPauseCountdown(totalSeconds);
    setPauseMessage(baseMessage);
    quotaPausedRef.current = true;
    // Purge d'un éventuel résolveur résiduel d'une pause précédente pour éviter
    // qu'un clic "Reprendre" ne débloque par erreur un timer déjà expiré.
    resumeRef.current = null;

    await new Promise<void>(resolve => {
      // Décompte affiché chaque seconde : quand il atteint 0, la pause se lève
      // automatiquement (nettoyage de l'intervalle + résolution de la promesse),
      // ce qui relance la file d'attente.
      let secondsLeft = totalSeconds;
      if (quotaCountdownIntervalRef.current) clearInterval(quotaCountdownIntervalRef.current);
      quotaCountdownIntervalRef.current = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft > 0) {
          setQuotaPauseCountdown(secondsLeft);
        } else {
          setQuotaPauseCountdown(0);
          if (quotaCountdownIntervalRef.current) clearInterval(quotaCountdownIntervalRef.current);
          quotaCountdownIntervalRef.current = null;
          resumeRef.current = null;
          resolve();
        }
      }, 1000);

      // Filet de sécurité : même si l'intervalle était perturbé, la promesse se
      // résout automatiquement au bout de `ms` (reprise auto garantie).
      const timer = setTimeout(() => {
        if (quotaCountdownIntervalRef.current) clearInterval(quotaCountdownIntervalRef.current);
        quotaCountdownIntervalRef.current = null;
        resumeRef.current = null;
        resolve();
      }, ms);

      // Le clic "Reprendre" court-circuite l'intervalle ET le timer.
      resumeRef.current = () => {
        if (quotaCountdownIntervalRef.current) clearInterval(quotaCountdownIntervalRef.current);
        quotaCountdownIntervalRef.current = null;
        clearTimeout(timer);
        resolve();
      };
    });

    setQuotaPaused(false);
    setQuotaPauseCountdown(0);
    setPauseMessage(null);
    quotaPausedRef.current = false;
    return !cancelCurrentRef.current;
  }, []);

  const updateDisplay = useCallback((entry: QueueEntry | null) => {
    if (entry) {
      setImageData(entry.dataUrl);
      setResult(null);
      setMatchedItems([]);
      setUnmatchedNames([]);
      setError(null);
    } else {
      setImageData(null);
      setResult(null);
      setMatchedItems([]);
      setUnmatchedNames([]);
      setError(null);
    }
  }, []);

  const reset = useCallback(() => {
    queueRef.current = [];
    processingRef.current = false;
    cancelCurrentRef.current = true;
    recipeDoneRef.current = false;
    setQueue([]);
    setIsProcessing(false);
    setPauseMessage(null);
    setImageData(null);
    setIsLoading(false);
    setResult(null);
    setMatchedItems([]);
    setUnmatchedNames([]);
    setError(null);
    setToast(null);
    setExpectedItems([]);
    expectedItemsRef.current = [];
    setResolvedIds(new Set());
    resolvedIdsRef.current = new Set();
    setCopiedId(null);
    setTokenInfo(null);
    setScanMode('full');
    activeExpectedRef.current = [];
    targetedItemRef.current = null;
    if (quotaCountdownIntervalRef.current) clearInterval(quotaCountdownIntervalRef.current);
    quotaCountdownIntervalRef.current = null;
    setQuotaPaused(false);
    setQuotaPauseCountdown(0);
    quotaPausedRef.current = false;
    resumeRef.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setScanMode(initialScanMode ?? 'full');
    targetedItemRef.current = targetedItem ?? null;
    if (targetedItem) {
      // Mode scan ciblé : l'unique item attendu EST l'item ciblé.
      setExpectedItems([targetedItem]);
      expectedItemsRef.current = [targetedItem];
      setResolvedIds(new Set());
      resolvedIdsRef.current = new Set();
      setCopiedId(null);
      recipeDoneRef.current = false;
    } else if (initialQueue && initialQueue.length > 0) {
      setExpectedItems(initialQueue);
      expectedItemsRef.current = initialQueue;
      setResolvedIds(new Set());
      resolvedIdsRef.current = new Set();
      setCopiedId(null);
      recipeDoneRef.current = false;
    } else {
      setExpectedItems([]);
      expectedItemsRef.current = [];
      setResolvedIds(new Set());
      resolvedIdsRef.current = new Set();
      setCopiedId(null);
    }
  }, [isOpen, initialQueue, targetedItem, initialScanMode]);

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

    // Recherche un prix dans le store global via la clé NORMALISÉE du nom
  // (insensible casse/accents) ou la clé `pet:<nom>` héritée des anciennes
  // versions. `getPriceRecord` ne teste que les clés brutes (expectedId/_id/id/
  // name) et peut donc rater un prix stocké sous le nom normalisé (Familiers).
  const lookupPriceByNormalizedName = useCallback((item: ScannerQueueItem): PriceData | undefined => {
    const rawName = item.expectedName ?? item.name;
    if (!rawName) return undefined;
    const norm = normalizeName(rawName);
    return hdvPrices[norm] ?? hdvPrices[`pet:${norm}`];
  }, [hdvPrices]);

  // Un prix est "à actualiser" s'il est absent OU si aucun lot (x1/x10/x100/x1000)
  // n'a un prix strictement positif : la présence d'un prix = au moins UN lot > 0
  // dans le store hydraté par consolidated_prices. Un item avec un prix connu mais
  // ancien n'est donc pas "à actualiser" (fraîcheur ≠ présence).
  const isPriceStaleOrMissing = useCallback((item: ScannerQueueItem): boolean => {
    const p = getPriceRecord(item, hdvPrices) ?? lookupPriceByNormalizedName(item);
    if (!p) return true;
    const hasAnyPrice = p.x1 > 0 || p.x10 > 0 || p.x100 > 0 || p.x1000 > 0 || (p.unitAverage ?? 0) > 0;
    return !hasAnyPrice;
  }, [hdvPrices, lookupPriceByNormalizedName]);

  const getItemAgeLabel = useCallback((item: ScannerQueueItem): string => {
    const p = getPriceRecord(item, hdvPrices);
    if (!p) return 'Prix absent';
    const hasAnyPrice = p.x1 > 0 || p.x10 > 0 || p.x100 > 0 || p.x1000 > 0 || (p.unitAverage ?? 0) > 0;
    if (!hasAnyPrice) return 'Prix absent';
    if (!p.updatedAt) return 'Date inconnue';
    const ageDays = Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
    if (Number.isNaN(ageDays)) return 'Date inconnue';
    return ageDays <= 0 ? "Aujourd'hui" : `Il y a ${ageDays} j`;
  }, [hdvPrices]);

  // Liste effective des items à scanner selon la méthode choisie.
  const activeExpected = useMemo<ScannerQueueItem[]>(
    () => (scanMode === 'stale' ? expectedItems.filter(isPriceStaleOrMissing) : expectedItems),
    [expectedItems, scanMode, isPriceStaleOrMissing]
  );

  useEffect(() => {
    activeExpectedRef.current = activeExpected;
  }, [activeExpected]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addToQueue(file);
          return;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const addToQueue = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image (PNG, JPG, etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const compressed = await compressImage(dataUrl);
      const base64 = compressed.split(',')[1];
      const entry: QueueEntry = { dataUrl: compressed, base64 };

      setQueue(prev => {
        const next = [...prev, entry];
        queueRef.current = next;
        return next;
      });

      setError(null);

      // Verrou : jamais de nouvelle boucle de traitement tant qu'une pause quota
      // (429) est active OU qu'une boucle est déjà en cours. Les images ajoutées
      // pendant la pause restent en file et seront traitées par la boucle existante
      // à sa reprise. Aucun trigger de rendu/état ne peut donc relancer un envoi
      // tant que `quotaPausedRef` est levé.
      if (!processingRef.current && !quotaPausedRef.current) {
        processingRef.current = true;
        cancelCurrentRef.current = false;
        setIsProcessing(true);
        setTimeout(() => processQueue(), 50);
      }
    };
    reader.readAsDataURL(file);
  };

  const processQueue = async () => {
    // Compteur de réessais (429/503) de l'image COURANTE : persiste à travers
    // les re-queues de la même image, remis à zéro après un succès.
    let retries = 0;
    // Compteur de timeouts (AbortError 60s) de l'image COURANTE : même logique.
    let timeoutRetries = 0;
    while (queueRef.current.length > 0 && !cancelCurrentRef.current) {
      // Filet de sécurité STRICT : si une pause quota (429) est active (verrou
      // synchrone), on interrompt immédiatement l'itération courante. Aucune
      // image ne peut donc être envoyée tant que la fenêtre RPM/TPM n'est pas
      // réinitialisée, même si un trigger externe relançait la boucle.
      if (quotaPausedRef.current) {
        console.warn('[scan] 🚦 Pause quota (429) active — itération interrompue, aucune image envoyée.');
        break;
      }
      const entry = queueRef.current[0];
      queueRef.current = queueRef.current.slice(1);
      setQueue([...queueRef.current]);

      updateDisplay(entry);
      setIsLoading(true);
      setError(null);

      let scanResult: ScanRecipeResult | null = null;
      let scanError: string | null = null;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        const body: Record<string, any> = { image: entry.base64 };
        if (targetedItemRef.current) {
          // Mode scan ciblé : on indique au backend l'item précis à scanner.
          // Le nom/ID final sera forcé à cet item, l'IA ne doit PAS deviner le nom.
          body.targetedItemId = targetedItemRef.current.expectedId;
          body.targetedItemName = targetedItemRef.current.expectedName;
          body.expectedName = targetedItemRef.current.expectedName;
          console.log('[scan] 🎯 Envoi scan CIBLÉ à /api/scan-hdv :', body.targetedItemName, '(', body.targetedItemId, ')');
        } else {
          const unresolvedExpected = activeExpectedRef.current.filter(e => !resolvedIdsRef.current.has(e.expectedId));
          if (unresolvedExpected.length > 0) {
            body.expectedName = unresolvedExpected[0].expectedName;
          }
          console.log('[scan] 📤 Envoi image à /api/scan-hdv. Suggéré:', body.expectedName || '(aucun)');
        }

        const response = await fetch('/api/scan-hdv', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(groqKey.trim() ? { 'x-custom-groq-key': groqKey.trim() } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.status === 429 || response.status === 503) {
          const isRateLimit = response.status === 429;
          let retryAfter: number | undefined;
          // `isDailyLimit` (flag backend) : le quota QUOTIDIEN Groq (TPD/RPD)
          // est atteint — la clé est bloquée jusqu'à minuit UTC.
          let isDailyLimit = false;
          try {
            const errData = await response.json();
            if (typeof errData?.retryAfter === 'number') retryAfter = errData.retryAfter;
            if (errData?.isDailyLimit === true) isDailyLimit = true;
          } catch { /* corps non JSON */ }
          if (retryAfter === undefined) {
            const header = response.headers.get('Retry-After');
            const parsed = header ? parseFloat(header) : NaN;
            if (!Number.isNaN(parsed)) retryAfter = parsed;
          }
          setIsLoading(false);

          // ── 429 QUOTA QUOTIDIEN (TPD/RPD) : arrêt définitif de la file ──────
          // Aucune pause temporaire ne peut aider : la clé est bloquée jusqu'à
          // minuit UTC. On stoppe la file et on affiche un message explicite
          // invitant l'utilisateur à fournir sa propre clé API Groq.
          if (isRateLimit && isDailyLimit) {
            console.error('[scan] ❌ Quota IA QUOTIDIEN épuisé (TPD/RPD) — file arrêtée.');
            showToast('error', 'Quota IA quotidien épuisé. Utilisez votre propre clé API Groq pour continuer.');
            setError('Quota IA quotidien épuisé. Veuillez renseigner votre propre clé API Groq ci-dessus pour continuer.');
            break;
          }

          // ── 429 (Rate Limit RPM/TPM) : PAUSE GLOBALE, hors retries de l'image ──
          // Le 429 ne compte PAS dans le quota d'essais de l'image : il reflète une
          // pause globale de l'API (fenêtre glissante 60s RPM/TPM de Groq), pas une
          // erreur propre à l'image. On met donc la file en pause immédiatement
          // (reprise auto après ~65s, ou au clic) pour laisser la fenêtre se
          // réinitialiser complètement avant de re-tenter la MÊME image.
          if (isRateLimit) {
            console.warn('[scan] ⏳ 429 Rate Limit (RPM/TPM) — pause globale de la file (retries de l\'image préservés).');
            showToast('error', 'Quota IA (RPM) atteint. Pause de 65s...');
            // Pause minimale garantie de 8s (RATE_LIMIT_RETRY_DELAY_MS), le cas
            // échéant étendue à la fenêtre RPM complète (RPM_QUOTA_PAUSE_MS).
            const pauseMs = Math.max(
              (retryAfter ?? 0) * 1000,
              RATE_LIMIT_RETRY_DELAY_MS,
              RPM_QUOTA_PAUSE_MS,
            );
            const resumed = await waitForQuotaResume(pauseMs, 'Scan en pause - Quota IA (RPM) atteint.');
            if (!resumed) break;
            // On re-pousse la MÊME image en tête de file : pas d'auto-skip.
            queueRef.current = [entry, ...queueRef.current];
            setQueue([...queueRef.current]);
            continue;
          }

          // ── 503 (Over Capacity / Surcharge Groq) : réessai propre à l'image ──
          retries += 1;

          // Alerte discrète pour expliquer la pause à l'utilisateur.
          showToast('error', 'Surcharge IA (503). Pause de quelques secondes...');

          // Coupe-circuit anti-boucle infinie : après MAX_RETRIES échecs (503)
          // consécutifs sur la MÊME image, on NE SAUTE PAS les images suivantes
          // en chaîne. On met la file en PAUSE (reprise auto dans QUOTA_PAUSE_MS
          // ou au clic) puis on re-tente la MÊME image.
          if (retries >= MAX_RETRIES) {
            retries = 0;
            console.error('Nombre maximum de tentatives atteint. Mise en pause de la file.');
            const resumed = await waitForQuotaResume(QUOTA_PAUSE_MS, 'Scan en pause - Surcharge IA (503).');
            if (!resumed) break;
            // On re-pousse la MÊME image en tête de file : pas d'auto-skip.
            queueRef.current = [entry, ...queueRef.current];
            setQueue([...queueRef.current]);
            continue;
          }

          // EXPONENTIAL BACKOFF pour 503 : Math.pow(2, retries - 1) * 5000 → 5s,
          // 10s, 20s : pause plus longue pour laisser les serveurs Groq récupérer.
          // Si la route renvoie un champ `retryAfter` (JSON ou header), on l'utilise
          // exactement via le setTimeout bloquant ci-dessous.
          const backoffDelay = Math.pow(2, retries - 1) * GROQ_OVERLOAD_BASE_DELAY_MS;
          const waitSeconds = Math.max(backoffDelay / 1000, retryAfter ?? 0);
          const waited = await waitWithCountdown(waitSeconds, 'Surcharge API — attente de');
          if (!waited) break;
          // On re-pousse la MÊME image en tête de file : pas d'auto-skip.
          queueRef.current = [entry, ...queueRef.current];
          setQueue([...queueRef.current]);
          continue;
        }

        if (!response.ok) {
          const errData = await response.json();
          scanError = errData.detail ? `${errData.error} — ${errData.detail}` : (errData.error || 'Erreur lors de l\'analyse');
        } else {
          const data = await response.json();

          if (data.items && Array.isArray(data.items)) {
            scanResult = data as ScanRecipeResult;
            setTokenInfo(data.tokens || null);
          } else if (data.item_name && data.prices) {
            scanResult = { items: [{ name: data.item_name, prices: data.prices }] };
          } else {
            scanError = 'Format de réponse inattendu';
          }
        }
      } catch (err) {
        // Timeout client (60s) : l'AbortController a coupé la requête car l'IA
        // n'a pas répondu à temps (charge élevée). Ce n'est PAS une erreur fatale :
        // on re-pousse la MÊME image en tête de file et on réessaie, sans afficher
        // le message technique "signal is aborted" à l'utilisateur.
        const isAbort =
          (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && /abort/i.test(err.message));

        if (isAbort) {
          timeoutRetries += 1;
          setIsLoading(false);
          if (timeoutRetries < MAX_TIMEOUT_RETRIES) {
            console.warn(`[scan] ⏱️ Timeout (60s) — réessai ${timeoutRetries}/${MAX_TIMEOUT_RETRIES} de la même image`);
            showToast('error', 'Réponse IA trop lente, nouvel essai...');
            const waited = await waitWithCountdown(5, 'Nouvel essai dans');
            if (!waited || cancelCurrentRef.current) break;
            // On re-pousse la MÊME image en tête de file : pas d'auto-skip.
            queueRef.current = [entry, ...queueRef.current];
            setQueue([...queueRef.current]);
            continue;
          }
          scanError = `Scan trop long (60s max) après ${MAX_TIMEOUT_RETRIES} essais. Image ignorée.`;
          console.error(`[scan] ⏱️ Timeout (60s) définitif pour cette image après ${MAX_TIMEOUT_RETRIES} réessais.`);
        } else {
          scanError = err instanceof Error ? err.message : 'Erreur inconnue';
          console.error('[scan] ❌ Erreur fetch scan-hdv:', scanError);
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (cancelCurrentRef.current) {
        setIsLoading(false);
        break;
      }

      // Ici l'image courante est consommée (succès ou erreur non-quota) :
      // la prochaine itération concerne une nouvelle image.
      retries = 0;
      timeoutRetries = 0;

      if (scanError) {
        setResult(null);
        setError(scanError);
        setIsLoading(false);
        console.error('[scan] Erreur d\'analyse, auto-skip dans 10s:', scanError);
        const skipTimer = setTimeout(() => {
          (window as any).__scannerSkip = true;
        }, 10000);
        await new Promise<void>(resolve => {
          const interval = setInterval(() => {
            if (cancelCurrentRef.current || queueRef.current.length === 0 || (window as any).__scannerSkip) {
              clearInterval(interval);
              clearTimeout(skipTimer);
              (window as any).__scannerSkip = false;
              resolve();
            }
          }, 200);
        });
        continue;
      }

      if (scanResult) {
        setResult(scanResult);
        setIsLoading(false);

        // ── MODE SCAN CIBLÉ : attribution FORCÉE à l'item ciblé ─────────────
        // Le nom/ID viennent de la file (`targetedItem`), on ignore totalement
        // ce que l'IA a pu lire dans l'image (échecs d'OCR contournés).
        if (targetedItemRef.current) {
          const t = targetedItemRef.current;
          const first = scanResult.items[0];
          const prices = first?.prices ?? { x1: 0, x10: 0, x100: 0, x1000: 0 };
          console.log(`[scan] 🎯 Scan forcé : prix attribués à "${t.expectedName}" (ID ${t.expectedId})`, prices);
          setHdvPrice(t.expectedId, prices.x1, prices.x10, prices.x100, prices.x1000, { explicit: true });

          const newResolved = new Set(resolvedIdsRef.current);
          newResolved.add(t.expectedId);
          resolvedIdsRef.current = newResolved;
          setResolvedIds(newResolved);
          setMatchedItems([{
            item: { name: t.expectedName, prices },
            dofusItem: { _id: t.expectedId, name: t.expectedName, type: t.type } as DofusItem,
          }]);
          setUnmatchedNames([]);
        } else {
        const matched: { item: ScanItem; dofusItem: DofusItem }[] = [];
        const unmatched: string[] = [];
        const newResolved = new Set(resolvedIdsRef.current);
        const unresolvedExpected = activeExpectedRef.current.filter(e => !newResolved.has(e.expectedId));

        for (const item of scanResult.items) {
          const normalizedOcr = normalize(item.name);
          let matchedExpected: ScannerQueueItem | undefined;

          // =========================================================================
          // CORRESPONDANCE STRICTE PAR NORMALISATION BILATÉRALE OBLIGATOIRE
          // =========================================================================

          // 1. File d'attente d'items attendus (expectedItems)
          if (unresolvedExpected.length > 0) {
            // Comparaison bilatérale : normalize(expectedName) === normalize(ocrName)
            matchedExpected = unresolvedExpected.find(e => normalize(e.expectedName) === normalizedOcr);

            // S'il n'y a qu'un SEUL item attendu restant dans la file, l'image scannée lui correspond impérativement
            if (!matchedExpected && unresolvedExpected.length === 1) {
              matchedExpected = unresolvedExpected[0];
              console.log(`[scan] 🎯 Item unique attendu restant : OCR "${item.name}" -> Nom exact "${matchedExpected.expectedName}" (${matchedExpected.expectedId})`);
            }
          }

          if (matchedExpected) {
            // Sauvegarde directe avec l'expectedId et l'expectedName EXACTS de la file
            console.log(`[scan] ✅ Match bilatéral réussi (file d'attente): OCR "${item.name}" -> Nom exact "${matchedExpected.expectedName}" (ID "${matchedExpected.expectedId}")`, item.prices);
            
            setHdvPrice(matchedExpected.expectedId, item.prices.x1, item.prices.x10, item.prices.x100, item.prices.x1000, { explicit: true });
            newResolved.add(matchedExpected.expectedId);

            const dofusItem = { _id: matchedExpected.expectedId, name: matchedExpected.expectedName } as DofusItem;
            matched.push({ item, dofusItem });
          } else {
            // 2. Recherche DofusDB
            console.log(`[scan] 🔍 Recherche DofusDB pour OCR "${item.name}" (nom normalisé: "${normalizedOcr}")...`);
            let dofusItem: DofusItem | undefined;

            try {
              const dbItems = await searchItems(item.name);

              // Normalisation bilatérale stricte : normalize(dbItem.name) === normalize(ocrName)
              dofusItem = dbItems.find(i => normalize(i.name) === normalizedOcr);

              // Fallback : tolérance Levenshtein (1-2 fautes max, noms > 6 caractères)
              if (!dofusItem) {
                const fuzzyResult = fuzzyFindItem(dbItems, normalizedOcr);
                if (fuzzyResult) {
                  console.warn(`[scan] ⚠️ Correction automatique d'une faute OCR : "${item.name}" -> "${fuzzyResult.item.name}" (distance: ${fuzzyResult.distance})`);
                  dofusItem = fuzzyResult.item;
                }
              }

              if (!dofusItem) {
                console.warn(`[scan] ⚠️ Aucun match exact par normalisation bilatérale dans DofusDB pour "${item.name}". Résultats retournés:`, dbItems.map(i => `${i.name} (norm: ${normalize(i.name)})`));
              }
            } catch (err) {
              console.error(`[scan] ❌ Erreur recherche DofusDB pour "${item.name}":`, err);
            }

            if (dofusItem) {
              // Intégrité des données : On conserve l'objet complet avec son nom d'origine issu de DofusDB (ex: "Casque de l'Écumouth")
              console.log(`[scan] ✅ Match bilatéral DofusDB réussi : OCR "${item.name}" -> Nom DofusDB exact "${dofusItem.name}" (ID "${dofusItem._id}")`, item.prices);
              setHdvPrice(dofusItem._id, item.prices.x1, item.prices.x10, item.prices.x100, item.prices.x1000, { explicit: true });
              if (activeExpectedRef.current.some(e => e.expectedId === dofusItem!._id)) {
                newResolved.add(dofusItem._id);
              }
              matched.push({ item, dofusItem });
            } else {
              console.warn(`[scan] 🛑 Item non reconnu avec certitude : "${item.name}". Ignoré pour éviter toute écriture erronée en base.`);
              unmatched.push(item.name);
            }
          }
        }

        resolvedIdsRef.current = newResolved;
        setResolvedIds(newResolved);
        setMatchedItems(matched);
        setUnmatchedNames(unmatched);

        if (matched.length > 0 && expectedItemsRef.current.length === 0) {
          showToast('success', `${matched.length} prix mis à jour sur Supabase !`);
        }

        if (unmatched.length > 0) {
          showToast('error', `${unmatched.length} item${unmatched.length > 1 ? 's' : ''} non trouvé${unmatched.length > 1 ? 's' : ''} — passage au suivant`);
        }
        }

        // Queue Throttling : pause systématique de 2s entre deux images distinctes
        // pour lisser les appels vers l'API IA et éviter le rate-limit RPM.
        // Attendu uniquement s'il reste des images à traiter.
        if (queueRef.current.length > 0) {
          await sleep(QUEUE_THROTTLE_MS);
        }
      }
    }

    if (!cancelCurrentRef.current) {
      processingRef.current = false;
      setIsProcessing(false);
      updateDisplay(null);

      if (activeExpectedRef.current.length > 0 && !recipeDoneRef.current && activeExpectedRef.current.every(e => resolvedIdsRef.current.has(e.expectedId))) {
        recipeDoneRef.current = true;
        showToast('success', targetedItemRef.current
          ? `Prix de "${targetedItemRef.current.expectedName}" mis à jour !`
          : 'Prix de la recette mis à jour sur Supabase !');
        setTimeout(() => onClose(), 1200);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addToQueue(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

for (const file of Array.from(e.dataTransfer.files)) {
        if (file.type.startsWith('image/')) {
          addToQueue(file);
        }
      }
  };

  const handleSaveGroqKey = (value: string) => {
    setGroqKey(value);
    try { localStorage.setItem('user_groq_key', value); } catch {}
  };

  if (!isOpen) return null;

  const queueCount = queue.length;
  // TOTAL de ressources ciblées — indépendant du mode de scan : toujours
  // l'ensemble initial (expectedItems), jamais la liste filtrée active.
  const totalExpectedCount = expectedItems.length;
  // Ressources qui N'ONT PAS encore de prix (ou dont le prix est obsolète) :
  // ce sont elles qui alimentent le mode "Scan à actualiser".
  const staleCount = expectedItems.filter(isPriceStaleOrMissing).length;
  const totalExpected = activeExpected.length;
  const resolvedCount = activeExpected.filter(item => resolvedIds.has(item.expectedId)).length;
  const remainingExpected = activeExpected.filter(item => !resolvedIds.has(item.expectedId));
  const remainingCount = remainingExpected.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#0c101d] border border-slate-700/50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-[#0c101d] z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
              <Camera className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{title ?? 'Scan HDV'}</h2>
              <p className="text-[10px] text-slate-400">
                {targetedItem ? 'Scan ciblé (forcé)' : totalExpected > 0 ? 'Scan de recette' : 'Import par capture d\'écran'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors border border-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Targeted mode banner */}
          {targetedItem && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <Target className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-emerald-300 truncate">
                Scan forcé pour : {targetedItem.expectedName}
              </p>
            </div>
          )}

          {/* Token quota gauge */}
          {tokenInfo && tokenInfo.limit > 0 && (() => {
            const pct = (tokenInfo.remaining / tokenInfo.limit) * 100;
            const color = pct < 5 ? 'bg-rose-500' : pct < 20 ? 'bg-amber-500' : 'bg-cyan-500';
            const textColor = pct < 5 ? 'text-rose-300' : pct < 20 ? 'text-amber-300' : 'text-cyan-300';
            const barColor = pct < 5 ? 'bg-rose-400' : pct < 20 ? 'bg-amber-400' : 'bg-cyan-400';
            return (
              <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${color}/10 ${textColor}`}>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Tokens Groq</span>
                    <span className="text-[10px] font-mono">{tokenInfo.remaining.toLocaleString()} / {tokenInfo.limit.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: pct + '%' }} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Groq API Key */}
          <div className="rounded-xl border border-white/5">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="flex items-center gap-2 w-full p-2.5 text-left hover:bg-white/5 rounded-xl transition-colors"
            >
              <Key className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px] text-slate-400 flex-1">
                {groqKey.trim() ? 'Clé API personnelle active' : 'Utiliser votre propre clé API Groq'}
              </span>
              {groqKey.trim() && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            </button>
            {showKeyInput && (
              <div className="px-2.5 pb-2.5">
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => handleSaveGroqKey(e.target.value)}
                  placeholder="gsk_... (optionnel — vide = clé par défaut)"
                  className="w-full bg-[#070a12] border border-white/10 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 transition-colors font-mono"
                />
                <p className="text-[10px] text-slate-600 mt-1.5">
                  {groqKey.trim()
                    ? 'Votre clé personnelle est utilisée. Les quotas partagés ne seront pas impactés.'
                    : 'Si vide, la clé par défaut du serveur sera utilisée.'}
                </p>
              </div>
            )}
          </div>

          {/* Double méthode de scan */}
          {totalExpectedCount > 0 && !targetedItem && (
            <div className="p-3 rounded-xl bg-slate-800/30 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Méthode de scan</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setScanMode('full')}
                  className={`flex flex-col items-start gap-0.5 p-2.5 rounded-lg border text-left transition-colors ${
                    scanMode === 'full'
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                      : 'bg-[#070a12] border-white/10 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <ListChecks className="h-3 w-3" /> Scan complet
                  </span>
                  <span className="text-[9px] opacity-80">{totalExpectedCount} item{totalExpectedCount > 1 ? 's' : ''}</span>
                </button>
                <button
                  onClick={() => setScanMode('stale')}
                  className={`flex flex-col items-start gap-0.5 p-2.5 rounded-lg border text-left transition-colors ${
                    scanMode === 'stale'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-[#070a12] border-white/10 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Prix à actualiser
                  </span>
                  <span className="text-[9px] opacity-80">{staleCount} item{staleCount > 1 ? 's' : ''}</span>
                </button>
              </div>
              {scanMode === 'stale' && staleCount === 0 && (
                <p className="mt-2 text-[10px] text-emerald-400 font-semibold">
                  Tous les items de cette section ont au moins un prix saisi !
                </p>
              )}
            </div>
          )}

          {/* Recipe progress checklist */}
          {totalExpected > 0 && (
            <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="h-4 w-4 text-cyan-400" />
                {remainingCount > 0 ? (
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Items de la recette (scannés : {resolvedCount}/{totalExpected} — restants : {remainingCount})</span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Recette terminée ({resolvedCount}/{totalExpected})
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {remainingCount === 0 ? (
                  scanMode === 'stale' && staleCount === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">Tous les items de cette section ont au moins un prix saisi.</p>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">Tous les items de la recette ont été scannés.</p>
                  )
                ) : (
                  remainingExpected.map(item => {
                    const category = getHdvName(item.type) ?? getHdvCategoryForItem(item.expectedName, item.expectedId);
                    const stale = isPriceStaleOrMissing(item);
                    const ageLabel = getItemAgeLabel(item);
                    return (
                      <div key={item.expectedId} className="flex items-center gap-1.5 text-[11px]">
                        <div className={`h-3.5 w-3.5 rounded-full border shrink-0 ${stale ? 'border-amber-500/60' : 'border-emerald-500/60'}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-300 truncate block">{item.expectedName}</span>
                          {category && (
                            <span className="text-[9px] text-slate-500 truncate block">{category}</span>
                          )}
                        </div>
                        <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                          stale
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {ageLabel}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.expectedName); setCopiedId(item.expectedId); setTimeout(() => setCopiedId(null), 1500); }}
                          className="opacity-30 hover:opacity-100 transition-opacity shrink-0 p-0.5"
                          title="Copier le nom"
                        >
                          {copiedId === item.expectedId ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-slate-400" />
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Queue status : UNIQUEMENT le compteur d'images en file. Le message de
              pause est rendu par le bandeau "Pause / Rate limit" ci-dessous, seul
              bandeau global, pour éviter l'affichage en double. */}
          {!pauseMessage && (queueCount > 0 || isProcessing) && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold bg-cyan-500/5 border-cyan-500/20 text-cyan-300">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>{`${queueCount} image${queueCount > 1 ? 's' : ''} restante${queueCount > 1 ? 's' : ''} dans la file d'attente`}</span>
            </div>
          )}

          {/* Drop zone */}
          {!imageData && !isLoading && queueCount === 0 && (
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-slate-600/50 bg-[#070a12]/50 hover:border-slate-500 hover:bg-[#070a12]'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={`p-3 rounded-full ${isDragging ? 'bg-cyan-500/20' : 'bg-slate-800'} transition-colors`}>
                <ImageIcon className={`h-6 w-6 ${isDragging ? 'text-cyan-400' : 'text-slate-500'}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-300">
                  {isDragging ? 'Déposez l\'image ici' : 'Glissez-déposez ou cliquez'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  ou utilisez <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300 font-mono border border-slate-600">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300 font-mono border border-slate-600">V</kbd>
                </p>
                <p className="text-[10px] text-slate-600 mt-2">PNG, JPG • Max 10 Mo</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* Image preview */}
          {imageData && (
            <div className="relative rounded-xl overflow-hidden border border-slate-700/50 bg-[#070a12]">
              <img src={imageData} alt="Aperçu" className="w-full max-h-64 object-contain" />
              {isLoading && (
                <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && !imageData && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-slate-400 font-semibold">Analyse par intelligence artificielle...</p>
            </div>
          )}

          {/* Pause / Rate limit : UNIQUE bandeau de pause global (429/503) avec
              décompte dynamique et bouton "Reprendre". */}
          {pauseMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Clock className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />
              <p className="text-xs font-semibold text-amber-300 flex-1">
                {quotaPaused
                  ? `${pauseMessage} Reprise automatique dans ${quotaPauseCountdown}s ou au clic.`
                  : pauseMessage}
              </p>
              {quotaPaused && (
                <button
                  type="button"
                  onClick={resumeScan}
                  className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                >
                  Reprendre
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-rose-300">Erreur d'analyse</p>
                <p className="text-[11px] text-rose-400/80 mt-0.5 max-h-40 overflow-y-auto break-words whitespace-pre-wrap select-text">{error}</p>
              </div>
            </div>
          )}

          {/* Result */}
          {result && !isLoading && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {result.items.length} item{result.items.length > 1 ? 's' : ''} détecté{result.items.length > 1 ? 's' : ''}
                  </span>
                  {matchedItems.length > 0 && (
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      {matchedItems.length} enregistré{matchedItems.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {result.items.map((item, idx) => {
                    const matched = matchedItems.find(m => m.item === item);
                    return (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#070a12] border border-white/5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {matched ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          )}
                          <span className="text-xs text-white truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(['x1', 'x10', 'x100', 'x1000'] as const).map(lot => (
                            <span key={lot} className="text-[9px] font-bold text-slate-400">
                              {item.prices[lot]?.toLocaleString() || '0'}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {unmatchedNames.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                  <p className="font-semibold mb-1">{unmatchedNames.length} item{unmatchedNames.length > 1 ? 's' : ''} non reconnu{unmatchedNames.length > 1 ? 's' : ''} :</p>
                  <ul className="list-disc list-inside text-[10px] text-amber-400/80 space-y-0.5">
                    {unmatchedNames.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div className={`p-3 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}>
              {toast.message}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}