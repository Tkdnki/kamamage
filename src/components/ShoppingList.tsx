import { useNavigation } from '../context/NavigationContext';
import ItemImage from './ItemImage';
import { ShoppingCart, Trash2, RotateCcw, Sparkles, CheckCircle2 } from 'lucide-react';

export default function ShoppingList() {
  const { shoppingCart, updateCartGathered, resetCart } = useNavigation();

  const entries = Object.values(shoppingCart);
  const totalRemaining = entries.reduce((sum, e) => sum + Math.max(0, e.quantityNeeded - e.quantityGathered), 0);
  const allDone = entries.length > 0 && totalRemaining === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-rose-400" />
              Liste de courses
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {entries.length} ressource{entries.length > 1 ? 's' : ''}
              {entries.length > 0 && ` — ${totalRemaining} à récolter/acheter`}
            </p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={resetCart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/5 bg-rose-500/10 text-[11px] font-bold text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Vider le panier
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {entries.length === 0 ? (
        <div className="glass-panel rounded-xl border border-white/5 shadow-xl p-16 text-center flex flex-col items-center">
          <ShoppingCart className="h-12 w-12 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm max-w-sm mb-1">
            Votre liste de courses est vide.
          </p>
          <p className="text-xs text-slate-500">
            Ajoutez des ingrédients depuis l'onglet <strong className="text-emerald-400">Rentabilité Crafts</strong> en cliquant sur "Ajouter au panier".
          </p>
        </div>
      ) : (
        <>
          {/* All done banner */}
          {allDone && (
            <div className="rounded-xl p-4 bg-emerald-950/20 border border-emerald-500/20 shadow-lg flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0" />
              <p className="text-sm font-bold text-emerald-400">Tout est récolté !</p>
            </div>
          )}

          {/* Item list */}
          <div className="flex flex-col gap-2">
            {entries.map(entry => {
              const done = entry.quantityGathered >= entry.quantityNeeded;
              const remaining = Math.max(0, entry.quantityNeeded - entry.quantityGathered);
              return (
                <div
                  key={entry.item._id}
                  className={`glass-panel rounded-xl p-4 border border-white/5 shadow-xl flex items-center justify-between gap-4 transition-colors ${
                    done ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ItemImage item={entry.item} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10 shrink-0" />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold leading-tight truncate ${done ? 'text-slate-500 line-through' : 'text-white'}`}>
                        {entry.item.name}
                      </p>
                      <p className="text-[10px] text-slate-500 capitalize mt-0.5">
                        {entry.item.type} &bull; Lvl {entry.item.level}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {/* Quantity info */}
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-semibold">Quantité</p>
                      <p className="text-sm font-black text-white">
                        {entry.quantityNeeded}
                        {entry.quantityGathered > 0 && (
                          <span className="text-xs text-slate-500 font-normal"> / {entry.quantityGathered} fait</span>
                        )}
                      </p>
                    </div>

                    {/* Checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={e => {
                          const checked = e.target.checked;
                          updateCartGathered(entry.item._id, checked ? entry.quantityNeeded : 0);
                        }}
                        className="h-5 w-5 rounded accent-rose-500 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold select-none">
                        {done ? 'Fait' : 'Marquer'}
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
