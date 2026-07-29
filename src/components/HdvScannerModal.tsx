import { useState, useEffect, useCallback, useRef } from 'react';
import { useDofus } from '../context/DofusContext';
import { useAuth } from '../context/AuthContext';
import { searchItems } from '../services/api';
import type { DofusItem } from '../data/mockData';
import { Camera, X, Upload, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react';

interface ScanResult {
  item_name: string;
  prices: {
    x1: number;
    x10: number;
    x100: number;
    x1000: number;
  };
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

export default function HdvScannerModal({ isOpen, onClose }: HdvScannerModalProps) {
  const { setHdvPrice } = useDofus();
  const { user } = useAuth();

  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [matchedItem, setMatchedItem] = useState<DofusItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [matchAttempted, setMatchAttempted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
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
          if (file) processFile(file);
          return;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const processFile = (file: File) => {
    setError(null);
    setResult(null);
    setMatchedItem(null);
    setMatchAttempted(false);
    setToast(null);

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image (PNG, JPG, etc.)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('L\'image ne doit pas dépasser 10 Mo');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setImageData(dataUrl);
      analyzeImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
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

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const analyzeImage = async (base64: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/scan-hdv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });

      if (!response.ok) {
        const errData = await response.json();
        const msg = errData.detail ? `${errData.error} — ${errData.detail}` : (errData.error || 'Erreur lors de l\'analyse');
        throw new Error(msg);
      }

      const scanResult: ScanResult = await response.json();
      setResult(scanResult);

      // Fuzzy matching
      await matchItem(scanResult.item_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  const matchItem = async (itemName: string) => {
    setMatchAttempted(true);
    const normalizedInput = normalize(itemName);

    try {
      const items = await searchItems(itemName);

      // Try exact match first
      let best: DofusItem | undefined = items.find(i => normalize(i.name) === normalizedInput);
      if (!best) {
        // Try substring: le nom recherché est contenu dans le nom de l'item
        best = items.find(i => normalize(i.name).includes(normalizedInput) || normalizedInput.includes(normalize(i.name)));
      }
      if (!best && items.length > 0) {
        best = items[0];
      }

      if (best) {
        setMatchedItem(best);
      }
    } catch {
      // DofusDB indisponible — on garde le nom texte sans ID
    }
  };

  const handleSave = () => {
    if (!matchedItem || !result) return;

    setHdvPrice(
      matchedItem._id,
      result.prices.x1,
      result.prices.x10,
      result.prices.x100,
      result.prices.x1000,
    );

    setToast({ type: 'success', message: `✅ Prix de ${matchedItem.name} mis à jour sur Supabase !` });
  };

  const handleRetry = () => {
    if (imageData) {
      const base64 = imageData.split(',')[1];
      analyzeImage(base64);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#0c101d] border border-slate-700/50 rounded-2xl shadow-2xl">
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
          {/* Drop zone — only when no image loaded */}
          {!imageData && (
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
              <button
                onClick={() => { setImageData(null); setResult(null); setMatchedItem(null); setError(null); setMatchAttempted(false); }}
                className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors border border-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-slate-400 font-semibold">Analyse par intelligence artificielle...</p>
              <p className="text-[10px] text-slate-500">Gemini 1.5 Flash analyse la capture d'écran</p>
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
              {/* Item identification */}
              <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Item détecté</span>
                  {matchedItem && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                </div>
                <p className="text-sm font-bold text-white mt-1">{result.item_name}</p>
                {matchedItem && (
                  <p className="text-[11px] text-emerald-400 mt-0.5">Correspondance : {matchedItem.name}</p>
                )}
                {matchAttempted && !matchedItem && (
                  <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Aucune correspondance trouvée sur DofusDB
                  </p>
                )}
              </div>

              {/* Prices */}
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

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={!matchedItem || !user}
                title={!user ? 'Connectez-vous pour sauvegarder' : !matchedItem ? 'Item non identifié' : ''}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
              >
                <Upload className="h-4 w-4" />
                {!user ? 'Connectez-vous pour sauvegarder' : !matchedItem ? 'Item non identifié' : 'Sauvegarder les prix'}
              </button>
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
    </div>
  );
}