import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDofus } from '../context/DofusContext';
import { useAuth } from '../context/AuthContext';
import { searchItems } from '../services/api';
import type { DofusItem } from '../data/mockData';
import type { ScannerQueueItem } from '../context/NavigationContext';
import { Camera, X, Copy, Check, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon, Clock, ListChecks } from 'lucide-react';

interface ScanItem {
  name: string;
  prices: {
    x1: number;
    x10: number;
    x100: number;
    x1000: number;
  };
}

interface ScanRecipeResult {
  items: ScanItem[];
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

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’`']/g, "'")
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();
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
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Recipe progress tracking
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
  }, []);

  // Re-initialise expectedItems à chaque ouverture ou changement d'initialQueue
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
    while (queueRef.current.length > 0 && !cancelCurrentRef.current) {
      const entry = queueRef.current[0];
      queueRef.current = queueRef.current.slice(1);
      setQueue([...queueRef.current]);

      updateDisplay(entry);
      setIsLoading(true);
      setError(null);

      let scanResult: ScanRecipeResult | null = null;
      let scanError: string | null = null;
      let isRateLimited = false;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const body: Record<string, any> = { image: entry.base64 };
        // Passer le nom attendu pour guider l'IA et permettre la sauvegarde directe
        const unresolvedExpected = expectedItemsRef.current.filter(e => !resolvedIdsRef.current.has(e.expectedId));
        if (unresolvedExpected.length === 1) {
          body.expectedName = unresolvedExpected[0].expectedName;
        }
        const response = await fetch('/api/scan-hdv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 15;
          isRateLimited = true;
          setIsLoading(false);
          setPauseMessage(`Limite de débit atteinte — pause de ${waitSeconds}s...`);
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          setPauseMessage(null);
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
          } else if (data.item_name && data.prices) {
            scanResult = { items: [{ name: data.item_name, prices: data.prices }] };
          } else {
            scanError = 'Format de réponse inattendu';
          }
        }
      } catch (err) {
        scanError = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('[scan] Erreur fetch scan-hdv:', scanError);
      }

      if (cancelCurrentRef.current) {
        setIsLoading(false);
        break;
      }

      if (isRateLimited) continue;

      if (scanError) {
        setResult(null);
        setError(scanError);
        setIsLoading(false);
        await new Promise<void>(resolve => {
          const interval = setInterval(() => {
            if (cancelCurrentRef.current || queueRef.current.length === 0) {
              clearInterval(interval);
              resolve();
            }
          }, 200);
          const onRetry = () => {
            clearInterval(interval);
            queueRef.current = [entry, ...queueRef.current];
            setQueue([...queueRef.current]);
            resolve();
          };
          (window as any).__scannerRetry = onRetry;
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
          const normalizedInput = normalize(item.name);
          let dofusItem: DofusItem | undefined;
          let matchedExpected: ScannerQueueItem | undefined;

          // Étape 1 : correspondre directement avec un item attendu non résolu
          matchedExpected = unresolvedExpected.find(e => normalize(e.expectedName) === normalizedInput);
          if (!matchedExpected) {
            matchedExpected = unresolvedExpected.find(e => {
              const normExpected = normalize(e.expectedName);
              return normExpected.includes(normalizedInput) || normalizedInput.includes(normExpected);
            });
          }
          if (!matchedExpected) {
            const words = normalizedInput.split(/\s+/).filter(Boolean);
            matchedExpected = unresolvedExpected.find(e => {
              const normExpected = normalize(e.expectedName);
              const cover = words.filter(w => normExpected.includes(w)).length;
              return cover >= Math.ceil(words.length / 2);
            });
          }

          if (matchedExpected) {
            // Sauvegarde directe sans passer par DofusDB
            console.log(`[scan] Correspondance directe "${item.name}" → "${matchedExpected.expectedName}" (${matchedExpected.expectedId})`);
            setHdvPrice(matchedExpected.expectedId, item.prices.x1, item.prices.x10, item.prices.x100, item.prices.x1000);
            newResolved.add(matchedExpected.expectedId);
            // Créer un faux DofusItem pour l'affichage
            dofusItem = { _id: matchedExpected.expectedId, name: matchedExpected.expectedName } as DofusItem;
            matched.push({ item, dofusItem });
          } else {
            // Étape 2 : fallback DofusDB (ancien comportement)
            try {
              const dbItems = await searchItems(item.name);
              console.log(`[scan] Fallback DofusDB "${item.name}" → ${dbItems.length} résultat(s)`);
              dofusItem = dbItems.find(i => normalize(i.name) === normalizedInput);
              if (!dofusItem) {
                dofusItem = dbItems.find(i => normalize(i.name).includes(normalizedInput) || normalizedInput.includes(normalize(i.name)));
              }
              if (!dofusItem) {
                const words = normalizedInput.split(/\s+/).filter(Boolean);
                dofusItem = dbItems.find(i => {
                  const normName = normalize(i.name);
                  const cover = words.filter(w => normName.includes(w)).length;
                  return cover >= Math.ceil(words.length / 2);
                });
              }
              if (!dofusItem && dbItems.length > 0) {
                console.warn(`[scan] Fallback : aucun match pour "${item.name}", forçage vers "${dbItems[0].name}"`);
                dofusItem = dbItems[0];
              }
            } catch {}

            if (dofusItem) {
              matched.push({ item, dofusItem });
              setHdvPrice(dofusItem._id, item.prices.x1, item.prices.x10, item.prices.x100, item.prices.x1000);
              if (expectedItemsRef.current.some(e => e.expectedId === dofusItem!._id)) {
                newResolved.add(dofusItem._id);
              }
            } else {
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

        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    if (!cancelCurrentRef.current) {
      processingRef.current = false;
      setIsProcessing(false);
      updateDisplay(null);

      // Auto-close si tous les items attendus sont résolus
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

  if (!isOpen) return null;

  const queueCount = queue.length;
  const resolvedCount = resolvedIds.size;
  const totalExpected = expectedItems.length;

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
          {/* Recipe progress checklist */}
          {totalExpected > 0 && (
            <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="h-4 w-4 text-cyan-400" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Items de la recette ({resolvedCount}/{totalExpected})</span>
              </div>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {expectedItems.map(item => {
                  const done = resolvedIds.has(item.expectedId);
                  return (
                    <div key={item.expectedId} className="flex items-center gap-1.5 text-[11px]">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />
                      )}
                      <span className={done ? 'text-emerald-300 line-through opacity-60 flex-1 truncate' : 'text-slate-300 flex-1 truncate'}>{item.expectedName}</span>
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
                })}
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