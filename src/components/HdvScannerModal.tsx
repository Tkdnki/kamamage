import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDofus } from '../context/DofusContext';
import { useAuth } from '../context/AuthContext';
import { searchItems, normalize, fuzzyFindItem } from '../services/api';
import type { DofusItem } from '../data/mockData';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { getHdvName, getHdvCategoryForItem } from '../data/hdvCategories';
import { Camera, X, Copy, Check, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon, Clock, ListChecks, Key } from 'lucide-react';

// Cooldown systématique entre chaque scan d'image : le modèle Vision Groq
// (qwen/qwen3.6-27b, tier on_demand) est limité à 8000 TPM. À ~3000 tokens par
// image, on ne peut envoyer que ~2,5 requêtes/minute => ~25s entre deux envois.
const SCAN_COOLDOWN_SECONDS = 25;

// Nombre max de réessais (429/503) pour la MÊME image avant de l'abandonner.
const MAX_RETRIES = 3;

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
}

const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1024;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
  });
};

export default function HdvScannerModal({ isOpen, onClose, initialQueue }: HdvScannerModalProps) {
  const { setHdvPrice } = useDofus();
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

  // Suivi des items de recette attendus
  const [expectedItems, setExpectedItems] = useState<ScannerQueueItem[]>([]);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const expectedItemsRef = useRef<ScannerQueueItem[]>([]);
  const resolvedIdsRef = useRef<Set<string>>(new Set());
  const recipeDoneRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<QueueEntry[]>([]);
  const processingRef = useRef(false);
  const cancelCurrentRef = useRef(false);

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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setPauseMessage(null);
    return true;
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
  }, []);

  useEffect(() => {
    if (isOpen && initialQueue && initialQueue.length > 0) {
      setExpectedItems(initialQueue);
      expectedItemsRef.current = initialQueue;
      setResolvedIds(new Set());
      resolvedIdsRef.current = new Set();
      setCopiedId(null);
      recipeDoneRef.current = false;
    } else if (isOpen) {
      setExpectedItems([]);
      expectedItemsRef.current = [];
      setResolvedIds(new Set());
      resolvedIdsRef.current = new Set();
      setCopiedId(null);
    }
  }, [isOpen, initialQueue]);

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

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

      if (!processingRef.current) {
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
    while (queueRef.current.length > 0 && !cancelCurrentRef.current) {
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
        const unresolvedExpected = expectedItemsRef.current.filter(e => !resolvedIdsRef.current.has(e.expectedId));
        if (unresolvedExpected.length > 0) {
          body.expectedName = unresolvedExpected[0].expectedName;
        }
        console.log('[scan] 📤 Envoi image à /api/scan-hdv. Suggéré:', body.expectedName || '(aucun)');

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
          let retryAfter: number | undefined;
          try {
            const errData = await response.json();
            if (typeof errData?.retryAfter === 'number') retryAfter = errData.retryAfter;
          } catch { /* corps non JSON */ }
          if (retryAfter === undefined) {
            const header = response.headers.get('Retry-After');
            const parsed = header ? parseFloat(header) : NaN;
            if (!Number.isNaN(parsed)) retryAfter = parsed;
          }
          retries += 1;
          const waitSeconds = Math.max(retryAfter ?? 15, 5);
          setIsLoading(false);

          // Trop d'échecs consécutifs pour cette image : on l'abandonne et on
          // force le passage à la suivante (auto-skip) au lieu de boucler.
          if (retries >= MAX_RETRIES) {
            retries = 0;
            setError('API indisponible, passage à l\'image suivante.');
            console.error('[scan] 🛑 API indisponible après', MAX_RETRIES, 'tentatives — image abandonnée.');
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }

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
        scanError = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('[scan] ❌ Erreur fetch scan-hdv:', scanError);
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

        const matched: { item: ScanItem; dofusItem: DofusItem }[] = [];
        const unmatched: string[] = [];
        const newResolved = new Set(resolvedIdsRef.current);
        const unresolvedExpected = expectedItemsRef.current.filter(e => !newResolved.has(e.expectedId));

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
            
            setHdvPrice(matchedExpected.expectedId, item.prices.x1, item.prices.x10, item.prices.x100, item.prices.x1000);
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
              setHdvPrice(dofusItem._id, item.prices.x1, item.prices.x10, item.prices.x100, item.prices.x1000);
              if (expectedItemsRef.current.some(e => e.expectedId === dofusItem!._id)) {
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

        // Cooldown systématique entre chaque image pour rester sous le quota
        // Groq (~8000 TPM). Attendu uniquement s'il reste des images à traiter.
        if (queueRef.current.length > 0) {
          await waitWithCountdown(SCAN_COOLDOWN_SECONDS, 'Pause entre deux scans — prochain scan dans');
        }
      }
    }

    if (!cancelCurrentRef.current) {
      processingRef.current = false;
      setIsProcessing(false);
      updateDisplay(null);

      if (expectedItemsRef.current.length > 0 && !recipeDoneRef.current && expectedItemsRef.current.every(e => resolvedIdsRef.current.has(e.expectedId))) {
        recipeDoneRef.current = true;
        showToast('success', 'Prix de la recette mis à jour sur Supabase !');
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
  const resolvedCount = resolvedIds.size;
  const totalExpected = expectedItems.length;
  const remainingExpected = expectedItems.filter(item => !resolvedIds.has(item.expectedId));
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
              <h2 className="text-sm font-bold text-white">Scan HDV</h2>
              <p className="text-[10px] text-slate-400">{totalExpected > 0 ? 'Scan de recette' : 'Import par capture d\'écran'}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors border border-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
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
                  <p className="text-[11px] text-slate-500 italic">Tous les items de la recette ont été scannés.</p>
                ) : (
                  remainingExpected.map(item => {
                    const category = getHdvName(item.type) ?? getHdvCategoryForItem(item.expectedName, item.expectedId);
                    return (
                      <div key={item.expectedId} className="flex items-center gap-1.5 text-[11px]">
                        <div className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-300 truncate block">{item.expectedName}</span>
                          {category && (
                            <span className="text-[9px] text-slate-500 truncate block">{category}</span>
                          )}
                        </div>
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

          {/* Queue status */}
          {(queueCount > 0 || isProcessing) && (
            <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold ${
              pauseMessage
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-cyan-500/5 border-cyan-500/20 text-cyan-300'
            }`}>
              {pauseMessage ? (
                <Clock className="h-4 w-4 shrink-0 animate-pulse" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              )}
              <span>{pauseMessage || `${queueCount} image${queueCount > 1 ? 's' : ''} restante${queueCount > 1 ? 's' : ''} dans la file d'attente`}</span>
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

          {/* Pause / Rate limit */}
          {pauseMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Clock className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />
              <p className="text-xs font-semibold text-amber-300">{pauseMessage}</p>
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