import { useState, memo, useCallback } from 'react';
import type { FC } from 'react';
import { Check } from 'lucide-react';

interface QuickPriceInputProps {
  x1?: number | null;
  x10?: number | null;
  x100?: number | null;
  x1000?: number | null;
  onSetPrices: (x1: number, x10: number, x100: number, x1000: number) => void;
}

const QuickPriceInput: FC<QuickPriceInputProps> = ({ x1, x10, x100, x1000, onSetPrices }) => {
  const [values, setValues] = useState({
    x1: x1 ?? 0,
    x10: x10 ?? 0,
    x100: x100 ?? 0,
    x1000: x1000 ?? 0,
  });

  const doSave = useCallback(() => {
    const { x1: p1, x10: p10, x100: p100, x1000: p1000 } = values;
    if (p1 || p10 || p100 || p1000) {
      onSetPrices(p1, p10, p100, p1000);
    }
  }, [values, onSetPrices]);

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
            onChange={e => {
              const v = e.target.valueAsNumber;
              if (!isNaN(v) && v >= 0) setValues(prev => ({ ...prev, [lot]: v }));
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-14 bg-[#070a12] border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={handleSave}
        className="h-7 w-7 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 rounded flex items-center justify-center transition-colors shrink-0"
      >
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      </button>
    </div>
  );
};

export default memo(QuickPriceInput);
