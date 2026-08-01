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
  /** Surligne en rouge les champs dont le prix est à 0 (prix manquant). */
  warnEmpty?: boolean;
}

const QuickPriceInput: FC<QuickPriceInputProps> = ({ x1, x10, x100, x1000, onSetPrices, disabled, warnEmpty }) => {
  const [values, setValues] = useState({
    x1: x1 ?? 0,
    x10: x10 ?? 0,
    x100: x100 ?? 0,
    x1000: x1000 ?? 0,
  });
  // Dernière valeur connue comme "persistée" (soit envoyée via doSave, soit adoptée
  // depuis les props). Tant que le brouillon local en diffère, une sauvegarde est due.
  const lastSavedRef = useRef(values);
  const rootRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  const changeTimer = useRef<ReturnType<typeof setTimeout>>();

  const doSave = useCallback(() => {
    if (disabled) return;
    console.log('[QuickPriceInput] Saving...', { localDraft: values, lastSaved: lastSavedRef.current });
    const last = lastSavedRef.current;
    if (values.x1 === last.x1 && values.x10 === last.x10 && values.x100 === last.x100 && values.x1000 === last.x1000) return;
    lastSavedRef.current = values;
    onSetPrices(values.x1, values.x10, values.x100, values.x1000);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1200);
  }, [values, onSetPrices, disabled]);
  // Référence toujours à jour de doSave pour le debounce de handleChange : la fonction
  // appelée depuis le setTimeout lit la dernière closure, jamais annulée par un re-rendu.
  const doSaveRef = useRef(doSave);
  useEffect(() => {
    doSaveRef.current = doSave;
  });

  // Synchronisation des props externes (poll Supabase, scan ciblé, rechargement DofusDB).
  // On n'adopte la valeur distante QUE si l'utilisateur n'édite pas un champ (aucun input
  // du composant n'a le focus). Pendant une saisie, le brouillon local n'est jamais écrasé.
  useEffect(() => {
    const root = rootRef.current;
    const active = document.activeElement;
    if (root && active instanceof HTMLInputElement && root.contains(active)) return;
    const next = { x1: x1 ?? 0, x10: x10 ?? 0, x100: x100 ?? 0, x1000: x1000 ?? 0 };
    setValues(prev => {
      const same = prev.x1 === next.x1 && prev.x10 === next.x10 && prev.x100 === next.x100 && prev.x1000 === next.x1000;
      return same ? prev : next;
    });
    lastSavedRef.current = next;
  }, [x1, x10, x100, x1000]);

  const flushSave = useCallback(() => {
    if (changeTimer.current) clearTimeout(changeTimer.current);
    doSaveRef.current();
  }, []);

  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    flushSave();
  }, [flushSave]);

  const handleBlur = useCallback(() => {
    flushSave();
  }, [flushSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      flushSave();
    }
  }, [flushSave]);

  const handleChange = useCallback((lot: 'x1' | 'x10' | 'x100' | 'x1000') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setValues(prev => ({ ...prev, [lot]: 0 }));
    } else {
      const v = e.target.valueAsNumber;
      if (!isNaN(v) && v >= 0) setValues(prev => ({ ...prev, [lot]: v }));
    }
    // Sauvegarde debounced (500 ms) : évite de perdre la saisie si l'utilisateur quitte
    // le champ sans blur (navigation, clic ailleurs) et évite tout spam Supabase.
    if (changeTimer.current) clearTimeout(changeTimer.current);
    changeTimer.current = setTimeout(() => doSaveRef.current(), 500);
  }, []);

  // Ménage des timers au démontage
  useEffect(() => {
    return () => {
      if (changeTimer.current) clearTimeout(changeTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const lotTypes = ['x1', 'x10', 'x100', 'x1000'] as const;

  return (
    <div ref={rootRef} className="flex items-end gap-1.5 mt-1.5">
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
            className={`w-14 bg-[#070a12] border rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-900/50 ${
              warnEmpty && values[lot] <= 0 ? 'border-red-500/60 text-rose-300' : 'border-white/10 text-white'
            }`}
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
