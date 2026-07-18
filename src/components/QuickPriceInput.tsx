import { memo, useCallback, useRef } from 'react';
import type { FC } from 'react';
import { Check } from 'lucide-react';

const LOT_FACTORS = { x1: 1, x10: 10, x100: 100, x1000: 1000 } as const;

interface QuickPriceInputProps {
  currentPrice?: number | null;
  onSetPrice: (value: number) => void;
}

const QuickPriceInput: FC<QuickPriceInputProps> = ({ currentPrice, onSetPrice }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const getInputValue = useCallback((): number => {
    const input = inputRef.current;
    if (!input) return 0;
    return parseInt(input.value, 10) || 0;
  }, []);

  const handleLotClick = useCallback((lot: keyof typeof LOT_FACTORS) => {
    const input = inputRef.current;
    if (!input) return;
    const currentValue = parseInt(input.value, 10) || 0;
    input.value = String(currentValue + LOT_FACTORS[lot]);
  }, []);

  const handleSave = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const val = getInputValue();
    if (val > 0) onSetPrice(val);
  }, [getInputValue, onSetPrice]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = getInputValue();
      if (val > 0) onSetPrice(val);
    }
  }, [getInputValue, onSetPrice]);

  return (
    <div className="flex items-center gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
      <div className="flex gap-0.5">
        {(Object.keys(LOT_FACTORS) as Array<keyof typeof LOT_FACTORS>).map(lot => (
          <button
            key={lot}
            type="button"
            onClick={e => { e.stopPropagation(); e.preventDefault(); handleLotClick(lot); }}
            className="px-1.5 py-0.5 text-[9px] font-bold bg-[#151f32] border border-white/10 rounded hover:border-amber-500/30 hover:bg-amber-500/5 text-slate-400 hover:text-amber-400 transition-colors"
          >
            {lot.replace('x', '×')}
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        type="number"
        defaultValue={currentPrice ? String(currentPrice) : ''}
        placeholder="Px"
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
        className="w-16 bg-[#070a12] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={handleSave}
        className="h-5 w-5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 rounded flex items-center justify-center transition-colors shrink-0"
      >
        <Check className="h-3 w-3 text-emerald-400" />
      </button>
    </div>
  );
};

export default memo(QuickPriceInput);
