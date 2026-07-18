import { useRef, useState, useCallback, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { LogIn, Send, CheckCircle2, AlertCircle, Coins } from 'lucide-react';

interface PriceSubmitFormProps {
  itemKey: string;
  category: 'rune' | 'hdv';
  lot?: string;
  currentPrice?: number;
  onSubmitted?: () => void;
}

const LOT_FACTORS = [
  { label: 'x1', factor: 1 },
  { label: 'x10', factor: 10 },
  { label: 'x100', factor: 100 },
  { label: 'x1000', factor: 1000 },
] as const;

function PriceSubmitFormInner({ itemKey, category, lot, currentPrice, onSubmitted }: PriceSubmitFormProps) {
  const { user, loading: authLoading, signInWithDiscord } = useAuth();
  const { selectedServer } = useServer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="flex items-center justify-between gap-2 bg-[#090d16]/40 rounded-lg px-3 py-2 border border-white/5">
        <span className="text-[10px] text-slate-400">Connectez-vous pour soumettre un prix</span>
        <button
          onClick={signInWithDiscord}
          className="flex items-center gap-1 text-[10px] text-white bg-[#5865F2] hover:bg-[#4752c4] px-2.5 py-1 rounded-lg font-bold transition-colors"
        >
          <LogIn className="h-3 w-3" /> Connexion
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Prix soumis — en attente de validation
      </div>
    );
  }

  const getPriceValue = () => {
    if (!inputRef.current) return 0;
    const raw = inputRef.current.value;
    if (raw === '' || raw === '-' || raw === '.') return 0;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleSubmit = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const val = getPriceValue();
    if (val <= 0) {
      setError('Prix invalide');
      return;
    }

    setSubmitting(true);
    setError('');

    const { error: err } = await supabase.from('price_submissions').insert({
      server_name: selectedServer,
      category,
      item_key: itemKey,
      lot: lot ?? null,
      price: val,
      submitted_by: user.id,
      status: 'pending',
    });

    setSubmitting(false);

    if (err) {
      if (err.code === '23505') {
        setError('Vous avez déjà soumis un prix pour cet item');
      } else {
        setError(err.message);
      }
      return;
    }

    setSuccess(true);
    onSubmitted?.();
  }, [selectedServer, category, itemKey, lot, user, onSubmitted]);

  const applyLot = useCallback((e: React.MouseEvent, factor: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inputRef.current) return;
    const current = getPriceValue();
    inputRef.current.value = String(current * factor);
    setError('');
    setSuccess(false);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="number"
            min={0}
            defaultValue={currentPrice ? String(currentPrice) : ''}
            placeholder="Prix"
            onKeyDown={e => {
              if (e.key === 'Enter') e.preventDefault();
              e.stopPropagation();
            }}
            className="w-full bg-[#070a12] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-right focus:outline-none focus:border-purple-500/40 [appearance:textfield]"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500">K</span>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-1 text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Send className={`h-3 w-3 ${submitting ? 'animate-pulse' : ''}`} />
          {submitting ? '...' : 'Soumettre'}
        </button>
      </div>

      <div className="flex items-center gap-1">
        <Coins className="h-3 w-3 text-slate-500 shrink-0" />
        {LOT_FACTORS.map(({ label, factor }) => (
          <button
            key={label}
            type="button"
            onClick={e => applyLot(e, factor)}
            className="text-[10px] font-bold text-slate-400 hover:text-white bg-[#090d16]/60 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/40 px-2 py-1 rounded-md transition-all"
          >
            {label}
          </button>
        ))}
        <span className="text-[8px] text-slate-600 ml-1">raccourcis lot</span>
      </div>

      {error && (
        <span className="flex items-center gap-1 text-[9px] text-rose-400">
          <AlertCircle className="h-3 w-3" /> {error}
        </span>
      )}
    </div>
  );
}

const PriceSubmitForm = memo(PriceSubmitFormInner);
export default PriceSubmitForm;
