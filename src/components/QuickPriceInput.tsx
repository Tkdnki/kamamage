import { memo, useCallback, useRef } from 'react';
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
  const x1Ref = useRef<HTMLInputElement>(null);
  const x10Ref = useRef<HTMLInputElement>(null);
  const x100Ref = useRef<HTMLInputElement>(null);
  const x1000Ref = useRef<HTMLInputElement>(null);

  const collectAndSave = useCallback(() => {
    const p1 = parseInt(x1Ref.current?.value ?? '', 10) || 0;
    const p10 = parseInt(x10Ref.current?.value ?? '', 10) || 0;
    const p100 = parseInt(x100Ref.current?.value ?? '', 10) || 0;
    const p1000 = parseInt(x1000Ref.current?.value ?? '', 10) || 0;
    if (p1 || p10 || p100 || p1000) {
      onSetPrices(p1, p10, p100, p1000);
    }
  }, [onSetPrices]);

  const handleSave = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    collectAndSave();
  }, [collectAndSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      collectAndSave();
    }
  }, [collectAndSave]);

  const lotTypes = ['x1', 'x10', 'x100', 'x1000'] as const;
  const refs = { x1: x1Ref, x10: x10Ref, x100: x100Ref, x1000: x1000Ref };
  const defaults = { x1, x10, x100, x1000 };

  return (
    <div className="flex items-end gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
      {lotTypes.map(lot => (
        <div key={lot} className="flex flex-col items-center">
          <span className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">{lot.replace('x', '×')}</span>
          <input
            ref={refs[lot]}
            type="number"
            min="0"
            defaultValue={defaults[lot] ? String(defaults[lot]) : '0'}
            onClick={e => e.stopPropagation()}
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
