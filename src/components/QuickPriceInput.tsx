import { useState, useEffect, memo, useCallback, useRef } from 'react';
import type { FC } from 'react';
import { Check } from 'lucide-react';

interface QuickPriceInputProps {
  x1?: number | null;
  x10?: number | null;
  x100?: number | null;
  x1000?: number | null;
  onSetPrices: (x1: number, x10: number, x100: number, x1000: number) => void;
  disabled?: boolean;
}

const QuickPriceInput: FC<QuickPriceInputProps> = ({ x1, x10, x100, x1000, onSetPrices, disabled }) => {
  const [values, setValues] = useState({
    x1: x1 ?? 0,
    x10: x10 ?? 0,
    x100: x100 ?? 0,
    x1000: x1000 ?? 0,
  });

  // Synchronisation quand les prix externes changent (ex : données serveur chargées après montage)
  useEffect(() => {
    setValues(prev => {
      const next = { x1: x1 ?? 0, x10: x10 ?? 0, x100: x100 ?? 0, x1000: x1000 ?? 0 };
      // Évite de perdre un brouillon si les valeurs externes n'ont pas changé
      if (prev.x1 === next.x1 && prev.x10 === next.x10 && prev.x100 === next.x100 && prev.x1000 === next.x1000) return prev;
      return next;
    });
  }, [x1, x10, x100, x1000]);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  const doSave = useCallback(() => {
    if (disabled) return;
    onSetPrices(values.x1, values.x10, values.x100, values.x1000);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1200);
  }, [values, onSetPrices, disabled]);

  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    doSave();
  }, [doSave]);

  const handleBlur = useCallback(() => {
    doSave();
  }, [doSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      doSave();
    }
  }, [doSave]);

  const handleChange = useCallback((lot: 'x1' | 'x10' | 'x100' | 'x1000') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setValues(prev => ({ ...prev, [lot]: 0 }));
    } else {
      const v = e.target.valueAsNumber;
      if (!isNaN(v) && v >= 0) setValues(prev => ({ ...prev, [lot]: v }));
    }
  }, []);

  const lotTypes = ['x1', 'x10', 'x100', 'x1000'] as const;

  return (
    <div className="flex items-end gap-1.5 mt-1.5">
      {lotTypes.map(lot => (
        <div key={lot} className="flex flex-col items-center">
          <span className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">{lot.replace('x', '×')}</span>
          <input
            type="number"
            min="0"
            value={values[lot]}
            onChange={handleChange(lot)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            title={disabled ? 'Connectez-vous pour modifier les prix' : ''}
            className="w-14 bg-[#070a12] border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-900/50"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={handleSave}
        disabled={disabled}
        title={disabled ? 'Connectez-vous pour modifier les prix' : ''}
        className={`h-7 w-7 rounded flex items-center justify-center transition-all duration-300 shrink-0 border ${
          saved
            ? 'bg-emerald-500/30 border-emerald-400/60 scale-110'
            : 'bg-emerald-500/10 hover:bg-emerald-500/25 border-emerald-500/30 hover:scale-105'
        } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:scale-100`}
      >
        <Check className={`h-3.5 w-3.5 transition-colors duration-300 ${saved ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'text-emerald-400'}`} />
      </button>
    </div>
  );
};

export default memo(QuickPriceInput);
