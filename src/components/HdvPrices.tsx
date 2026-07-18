import { useState, useEffect, useMemo } from 'react';
import { useDofus } from '../context/DofusContext';
import type { PriceData } from '../context/DofusContext';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { searchItems } from '../services/api';
import { fetchHdvPricesWithAuthor } from '../lib/sync';
import type { DofusItem } from '../data/mockData';
import { Search, Plus, Trash2, X, Coins, TrendingDown, Sparkles, Star, ChevronDown, ChevronUp } from 'lucide-react';
import ItemImage from './ItemImage';

export default function HdvPrices() {
  const { user } = useAuth();
  const { 
    hdvPrices, 
    trackedItemIds, 
    trackItem, 
    untrackItem, 
    getItemById, 
    setHdvPrice 
  } = useDofus();
  const { pendingHdvItem, clearPendingHdvItem } = useNavigation();
  const { selectedServer: server } = useServer();

  const [activeHdvItem, setActiveHdvItem] = useState<DofusItem | null>(null);
  const [isTrackedListOpen, setIsTrackedListOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DofusItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Open consultation panel when navigated from crafts (no auto-track)
  useEffect(() => {
    if (pendingHdvItem && pendingHdvItem._id) {
      const full = getItemById(pendingHdvItem._id);
      setActiveHdvItem(full ?? (pendingHdvItem as DofusItem));
      clearPendingHdvItem();
    }
  }, [pendingHdvItem]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await searchItems(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Price data for the active item
  const activePrices: PriceData = activeHdvItem
    ? hdvPrices[activeHdvItem._id] || { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0 }
    : { x1: 0, x10: 0, x100: 0, x1000: 0, unitAverage: 0 };
  const [activeAuthor, setActiveAuthor] = useState<string | null>(null);

  // Fetch author directly from Supabase for the active item
  useEffect(() => {
    if (!activeHdvItem) { setActiveAuthor(null); return; }
    fetchHdvPricesWithAuthor(server).then(data => {
      const entry = data[activeHdvItem._id];
      setActiveAuthor(entry?.author ?? null);
    });
  }, [activeHdvItem?._id, server]);

  const displayAuthor = activePrices.author ?? activeAuthor;

  const handleActivePriceChange = (lot: 'x1' | 'x10' | 'x100' | 'x1000', valString: string) => {
    if (!activeHdvItem) return;
    const val = valString === '' ? 0 : Math.max(0, parseInt(valString, 10));
    if (lot === 'x1') setHdvPrice(activeHdvItem._id, val, activePrices.x10, activePrices.x100, activePrices.x1000);
    if (lot === 'x10') setHdvPrice(activeHdvItem._id, activePrices.x1, val, activePrices.x100, activePrices.x1000);
    if (lot === 'x100') setHdvPrice(activeHdvItem._id, activePrices.x1, activePrices.x10, val, activePrices.x1000);
    if (lot === 'x1000') setHdvPrice(activeHdvItem._id, activePrices.x1, activePrices.x10, activePrices.x100, val);
  };

  const isActiveTracked = activeHdvItem ? trackedItemIds.includes(activeHdvItem._id) : false;

  // Lot analysis for active item
  type LotEntry = { label: string; lot: number; total: number };
  const lotAnalysis = useMemo(() => {
    const entries: LotEntry[] = [];
    if (activePrices.x1 > 0) entries.push({ label: '1', lot: 1, total: activePrices.x1 });
    if (activePrices.x10 > 0) entries.push({ label: '10', lot: 10, total: activePrices.x10 });
    if (activePrices.x100 > 0) entries.push({ label: '100', lot: 100, total: activePrices.x100 });
    if (activePrices.x1000 > 0) entries.push({ label: '1000', lot: 1000, total: activePrices.x1000 });

    const analyzed = entries.map(e => ({ ...e, unitPrice: e.total / e.lot }));
    const best = analyzed.length > 0 ? analyzed.reduce((a, b) => a.unitPrice < b.unitPrice ? a : b) : null;

    return { analyzed, best };
  }, [activePrices.x1, activePrices.x10, activePrices.x100, activePrices.x1000]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* LEFT PANEL: SEARCH & DISCOVERY (4 cols) */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -z-10" />
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
            <Search className="h-5 w-5 text-dofus-accent" />
            Rechercher un item
          </h2>


          <div className="relative">
            <input
              type="text"
              placeholder="Ex: Gelano, Fer, Bois..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#080d16] border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-dofus-accent/60 transition-colors"
            />
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3.5 text-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* SEARCH RESULTS */}
        {searchQuery.trim() && (
          <div className="glass-panel rounded-xl p-4 max-h-[500px] overflow-y-auto flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Résultats ({searchResults.length})
              </span>
              {isLoading && (
                <div className="h-4 w-4 border-2 border-dofus-accent border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {searchResults.length === 0 && !isLoading ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Aucun objet trouvé.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {searchResults.map((item) => {
                  const isActive = activeHdvItem?._id === item._id;
                  return (
                    <div 
                      key={item._id}
                      onClick={() => { setActiveHdvItem(item); setSearchQuery(''); }}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors group cursor-pointer ${
                        isActive
                          ? 'bg-dofus-accent/10 border-dofus-accent/30'
                          : 'bg-[#090d16]/60 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <ItemImage item={item} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10" />
                          <span className="absolute -bottom-1 -right-1 text-[8px] bg-dofus-accent text-slate-950 font-bold px-1 rounded z-10">
                            Lvl {item.level}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white group-hover:text-dofus-accent transition-colors">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-400 capitalize">{item.type}</p>
                        </div>
                      </div>

                      <ChevronRightIcon className="h-4 w-4 text-slate-600 group-hover:text-dofus-accent transition-colors" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT PANEL (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* CONSULTATION PANEL */}
        {activeHdvItem ? (
          <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <ItemImage item={activeHdvItem} className="h-14 w-14 bg-[#151f32]/85 rounded-xl p-1 border border-white/10" imgClassName="h-12 w-12 object-contain" />
                  <span className="absolute -bottom-1 -right-1 text-[9px] bg-dofus-accent text-slate-950 font-bold px-1.5 py-0.5 rounded">
                    Lvl {activeHdvItem.level}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{activeHdvItem.name}</h3>
                  <span className="inline-block text-[10px] text-dofus-accent bg-dofus-accent/10 px-2 py-0.5 rounded-full capitalize mt-1 font-semibold">
                    {activeHdvItem.type}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Track button */}
                {isActiveTracked ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg font-bold">
                    <Star className="h-3.5 w-3.5 fill-emerald-400" /> Suivie
                  </span>
                ) : (
                  <button
                    onClick={() => trackItem(activeHdvItem)}
                    className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg font-bold transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" /> Suivre cette ressource
                  </button>
                )}
                {/* Close */}
                <button
                  onClick={() => setActiveHdvItem(null)}
                  className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  title="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Price inputs */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md mb-1">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wider">Lot x1</label>
                <input
                  type="number"
                  value={activePrices.x1 || ''}
                  placeholder="Prix"
                  disabled={!user}
                  title={!user ? 'Veuillez vous connecter pour renseigner ou modifier les prix' : (displayAuthor ? `Modifié par ${displayAuthor}` : '')}
                  onChange={(e) => handleActivePriceChange('x1', e.target.value)}
                  className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs font-semibold text-white focus:outline-none focus:border-dofus-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wider">Lot x10</label>
                <input
                  type="number"
                  value={activePrices.x10 || ''}
                  placeholder="Prix"
                  disabled={!user}
                  title={!user ? 'Veuillez vous connecter pour renseigner ou modifier les prix' : (displayAuthor ? `Modifié par ${displayAuthor}` : '')}
                  onChange={(e) => handleActivePriceChange('x10', e.target.value)}
                  className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs font-semibold text-white focus:outline-none focus:border-dofus-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wider">Lot x100</label>
                <input
                  type="number"
                  value={activePrices.x100 || ''}
                  placeholder="Prix"
                  disabled={!user}
                  title={!user ? 'Veuillez vous connecter pour renseigner ou modifier les prix' : (displayAuthor ? `Modifié par ${displayAuthor}` : '')}
                  onChange={(e) => handleActivePriceChange('x100', e.target.value)}
                  className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs font-semibold text-white focus:outline-none focus:border-dofus-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wider">Lot x1000</label>
                <input
                  type="number"
                  value={activePrices.x1000 || ''}
                  placeholder="Prix"
                  disabled={!user}
                  title={!user ? 'Veuillez vous connecter pour renseigner ou modifier les prix' : (displayAuthor ? `Modifié par ${displayAuthor}` : '')}
                  onChange={(e) => handleActivePriceChange('x1000', e.target.value)}
                  className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs font-semibold text-white focus:outline-none focus:border-dofus-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            {displayAuthor && (
              <p className="text-[9px] text-slate-600 mb-3">Modifié par {displayAuthor}</p>
            )}

            {/* Optimisation & Unit average */}
            <div className="flex flex-col md:flex-row gap-4 border-t border-white/5 pt-3">
              {lotAnalysis.analyzed.length > 1 && (
                <div className="flex-1 bg-[#0c101d]/40 rounded-lg border border-white/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Optimisation d'achat</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {lotAnalysis.analyzed.map(a => {
                      const isBest = lotAnalysis.best && a.label === lotAnalysis.best.label;
                      return (
                        <span
                          key={a.label}
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            isBest
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-[#151f32] text-slate-400 border border-white/5'
                          }`}
                        >
                          Lot {a.label} : {a.unitPrice.toFixed(1)} K/u
                        </span>
                      );
                    })}
                    {lotAnalysis.best && (
                      <span className="text-[11px] text-emerald-400 font-bold ml-1">
                        ← Le plus rentable : Lot de {lotAnalysis.best.label}
                      </span>
                    )}
                  </div>
                  {lotAnalysis.analyzed.length >= 2 && lotAnalysis.best && (() => {
                    const ref = lotAnalysis.analyzed.find(a => a.lot === 1) ?? lotAnalysis.analyzed[0];
                    if (!ref || ref.label === lotAnalysis.best.label) return null;
                    const saving = ((ref.unitPrice - lotAnalysis.best.unitPrice) / ref.unitPrice) * 100;
                    if (saving <= 0) return null;
                    return (
                      <p className="text-[11px] text-emerald-400/80 mt-1.5 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        Lot de {lotAnalysis.best.label} vous fait économiser {saving.toFixed(1)}% par rapport au lot de {ref.label}
                      </p>
                    );
                  })()}
                </div>
              )}

              <div className="md:ml-auto flex items-center gap-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Prix Moyen / u</p>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-extrabold text-dofus-accent">
                    {activePrices.unitAverage > 0 ? activePrices.unitAverage.toLocaleString() : '-'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">K</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty state when no active item */
          <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Coins className="h-12 w-12 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm max-w-sm mb-2">
                Recherchez une ressource ou cliquez sur un ingrédient depuis l'onglet Crafts pour consulter et saisir ses prix.
              </p>
              <p className="text-xs text-slate-500">
                Utilisez la liste de suivi ci-dessous pour accéder rapidement à vos ressources favorites.
              </p>
            </div>
          </div>
        )}

        {/* COLLAPSIBLE TRACKED ITEMS LIST */}
        <div className="glass-panel rounded-xl border border-white/5 shadow-xl overflow-hidden">
          {/* Toggle header */}
          <button
            onClick={() => setIsTrackedListOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Star className={`h-4 w-4 ${trackedItemIds.length > 0 ? 'text-amber-400' : 'text-slate-600'}`} />
              <span className="text-sm font-bold text-white">Liste de suivi</span>
              <span className="bg-[#151f32] text-xs text-dofus-accent border border-dofus-accent/20 px-2 py-0.5 rounded-full font-bold">
                {trackedItemIds.length}
              </span>
            </div>
            {isTrackedListOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {/* Collapsible body */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              isTrackedListOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-5 pb-4">
              {trackedItemIds.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl bg-[#090d16]/30">
                  Aucune ressource suivie. Ajoutez-en une depuis le panneau de consultation ou la recherche.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {trackedItemIds.map((itemId) => {
                    const item = getItemById(itemId);
                    if (!item) return null;
                    const p = hdvPrices[itemId];
                    const isActive = activeHdvItem?._id === itemId;
                    return (
                      <div
                        key={itemId}
                        onClick={() => setActiveHdvItem(item)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-dofus-accent/10 border-dofus-accent/30'
                            : 'bg-[#090d16]/40 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <ItemImage item={item} className="h-9 w-9 bg-[#151f32]/80 rounded-lg p-0.5 border border-white/10 shrink-0" imgClassName="h-7 w-7 object-contain" />
                          <div>
                            <p className={`text-sm font-semibold leading-tight transition-colors ${
                              isActive ? 'text-dofus-accent' : 'text-white'
                            }`}>
                              {item.name}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${
                              p?.unitAverage ? 'text-dofus-accent font-bold' : 'text-slate-500'
                            }`}>
                              {p?.unitAverage ? `${p.unitAverage.toLocaleString()} K/u` : 'Aucun prix'}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); untrackItem(itemId); }}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Retirer du suivi"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
