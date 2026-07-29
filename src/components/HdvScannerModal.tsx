import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDofus } from '../context/DofusContext';
import { useAuth } from '../context/AuthContext';
import { searchItems } from '../services/api';
import type { DofusItem } from '../data/mockData';
import { Camera, X, Upload, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon, Clock } from 'lucide-react';

interface ScanResult {
  item_name: string;
  prices: {
    x1: number;
    x10: number;
    x100: number;
    x1000: number;
  };
}

interface QueueEntry {
  dataUrl: string;
  base64: string;
}

interface HdvScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

export default function HdvScannerModal({ isOpen, onClose }: HdvScannerModalProps) {
  const { setHdvPrice } = useDofus();
  const { user } = useAuth();

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pauseMessage, setPauseMessage] = useState<string | null>(null);

  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [matchedItem, setMatchedItem] = useState<DofusItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchAttempted, setMatchAttempted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      setMatchedItem(null);
      setError(null);
      setMatchAttempted(false);
    } else {
      setImageData(null);
      setResult(null);
      setMatchedItem(null);
      setError(null);
      setMatchAttempted(false);
    }
  }, []);

  const reset = useCallback(() => {
    queueRef.current = [];
    processingRef.current = false;
    cancelCurrentRef.current = true;
    setQueue([]);
    setIsProcessing(false);
    setPauseMessage(null);
    setImageData(null);
    setIsLoading(false);
    setResult(null);
    setMatchedItem(null);
    setError(null);
    setMatchAttempted(false);
    setToast(null);
  }, []);

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

      let scanResult: ScanResult | null = null;
      let scanError: string | null = null;
      let isRateLimited = false;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch('/api/scan-hdv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: entry.base64 }),
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
          continue;
        }

        const data: ScanResult = await response.json();
        scanResult = data;
      } catch (err) {
        scanError = err instanceof Error ? err.message : 'Erreur inconnue';
      }

      if (cancelCurrentRef.current) break;

      if (isRateLimited) continue;

      if (scanError) {
        setResult(null);
        setError(scanError);
        setIsLoading(false);
        // Wait for user interaction before continuing
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

        // Fuzzy matching
        const normalizedInput = normalize(scanResult.item_name);
        setMatchAttempted(true);
        let matched: DofusItem | undefined;

        try {
          const items = await searchItems(scanResult.item_name);
          matched = items.find(i => normalize(i.name) === normalizedInput);
          if (!matched) {
            matched = items.find(i => normalize(i.name).includes(normalizedInput) || normalizedInput.includes(normalize(i.name)));
          }
          if (!matched && items.length > 0) {
            matched = items[0];
          }
        } catch {}

        if (matched) {
          setMatchedItem(matched);
          // Auto-save
          setHdvPrice(
            matched._id,
            scanResult.prices.x1,
            scanResult.prices.x10,
            scanResult.prices.x100,
            scanResult.prices.x1000,
          );
          showToast('success', `✅ ${matched.name} : prix mis à jour sur Supabase !`);

          // Clear display briefly before next item
          await new Promise(resolve => setTimeout(resolve, 600));
        } else {
          // Item not matched — keep displayed for manual action
        }
      }
    }

    if (!cancelCurrentRef.current) {
      processingRef.current = false;
      setIsProcessing(false);
      updateDisplay(null);
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

  const handleRetry = () => {
    if (typeof (window as any).__scannerRetry === 'function') {
      (window as any).__scannerRetry();
    }
  };

  if (!isOpen) return null;

  const queueCount = queue.length;

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
              <p className="text-[10px] text-slate-400">Import par capture d'écran</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors border border-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
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

          {/* Drop zone — only when no image and nothing in progress */}
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
              <button onClick={handleRetry} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 shrink-0">
                Réessayer
              </button>
            </div>
          )}

          {/* Result */}
          {result && !isLoading && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Item détecté</span>
                  {matchedItem && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                </div>
                <p className="text-sm font-bold text-white mt-1">{result.item_name}</p>
                {matchedItem && (
                  <p className="text-[11px] text-emerald-400 mt-0.5">✓ Auto-sauvegardé — {matchedItem.name}</p>
                )}
                {matchAttempted && !matchedItem && (
                  <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Aucune correspondance trouvée sur DofusDB
                  </p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(['x1', 'x10', 'x100', 'x1000'] as const).map(lot => (
                  <div key={lot} className="flex flex-col items-center p-2 rounded-lg bg-[#070a12] border border-white/5">
                    <span className="text-[8px] text-slate-500 font-bold uppercase">{lot.replace('x', '×')}</span>
                    <span className="text-sm font-extrabold text-white mt-0.5">
                      {result.prices[lot]?.toLocaleString() || '0'}
                    </span>
                  </div>
                ))}
              </div>

              {!matchedItem && (
                <button
                  onClick={() => {
                    if (typeof (window as any).__scannerQueueRetry === 'function') {
                      (window as any).__scannerQueueRetry();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Upload className="h-4 w-4" />
                  Passer au suivant
                </button>
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