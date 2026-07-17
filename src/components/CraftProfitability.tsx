import { useState, useEffect, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useDofus } from '../context/DofusContext';
import { useNavigation } from '../context/NavigationContext';
import { DOFUS_JOBS } from '../data/mockData';
import { fetchCraftsByJob } from '../services/api';
import type { CraftItem, NormalizedRecipeIngredient } from '../services/api';
import {
  Flame, Trees, Pickaxe, Scissors, Droplets, Fish, Bone,
  Wrench, Shield, Footprints, Gem, Wand2, Wheat, Heart,
  TrendingUp, TrendingDown, AlertTriangle, Coins, Sparkles, Loader2, Search,
  ShoppingCart, Check, Pencil
} from 'lucide-react';
import ItemImage from './ItemImage';

const JOB_ICONS: { [key: string]: ComponentType<any> } = {
  'Alchimiste': Droplets, 'Bijoutier': Gem, 'Bricoleur': Wrench,
  'Bûcheron': Trees, 'Chasseur': Bone, 'Cordonnier': Footprints,
  'Éleveur': Heart, 'Façonneur': Shield, 'Forgeron': Flame,
  'Mineur': Pickaxe, 'Paysan': Wheat, 'Pêcheur': Fish,
  'Sculpteur': Wand2, 'Tailleur': Scissors
};

export default function CraftProfitability() {
  const { hdvPrices, setHdvPrice, trackItem } = useDofus();
  const { navigateToHdvItem, addIngredientsToCart } = useNavigation();

  const [activeJob, setActiveJob] = useState<string>('Paysan');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  const [craftItems, setCraftItems] = useState<CraftItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCraftItems([]);
    setSelectedItemId(null);
    setEditingIngredientId(null);
    setSearchQuery('');
    setIsLoadingItems(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchCraftsByJob(activeJob)
      .then(items => {
        setCraftItems(items);
        if (items.length > 0) {
          setSelectedItemId(items[0]._id);
        }
      })
      .finally(() => setIsLoadingItems(false));
  }, [activeJob]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return craftItems;
    const q = searchQuery.toLowerCase();
    return craftItems.filter(item => item.name.toLowerCase().includes(q));
  }, [craftItems, searchQuery]);

  const selectedItem = selectedItemId
    ? craftItems.find(item => item._id === selectedItemId) ?? craftItems[0] ?? null
    : craftItems[0] ?? null;

  const activeIngredients: NormalizedRecipeIngredient[] = selectedItem?.ingredients ?? [];

  const handleJobChange = (jobName: string) => {
    setActiveJob(jobName);
  };

  // ─── Calcul de la rentabilité ───────────────────────────────────────────────

  interface EnrichedIngredient extends NormalizedRecipeIngredient {
    unitPrice: number;
    totalPrice: number;
    isMissing: boolean;
    bestSource: string;
  }

  function getBestUnitPrice(itemId: string): { price: number; isMissing: boolean; source: string } {
    const p = hdvPrices[itemId];
    if (!p) return { price: 0, isMissing: true, source: '' };

    const candidates: { price: number; label: string }[] = [];
    if (p.x1 > 0) candidates.push({ price: p.x1, label: 'x1' });
    if (p.x10 > 0) candidates.push({ price: p.x10 / 10, label: 'x10' });
    if (p.x100 > 0) candidates.push({ price: p.x100 / 100, label: 'x100' });
    if (p.x1000 > 0) candidates.push({ price: p.x1000 / 1000, label: 'x1000' });

    if (candidates.length === 0) return { price: 0, isMissing: true, source: '' };

    const best = candidates.reduce((a, b) => a.price < b.price ? a : b);
    return { price: best.price, isMissing: false, source: best.label };
  }

  const handleQuickLotChange = (ingredientId: string, lotType: 'x1' | 'x10' | 'x100' | 'x1000', value: number) => {
    const safeValue = isNaN(value) || value < 0 ? 0 : value;
    const current = hdvPrices[ingredientId];
    const x1 = lotType === 'x1' ? safeValue : (current?.x1 ?? 0);
    const x10 = lotType === 'x10' ? safeValue : (current?.x10 ?? 0);
    const x100 = lotType === 'x100' ? safeValue : (current?.x100 ?? 0);
    const x1000 = lotType === 'x1000' ? safeValue : (current?.x1000 ?? 0);
    setHdvPrice(ingredientId, x1, x10, x100, x1000);
  };

  const getCraftStats = (item: CraftItem, ingredients: NormalizedRecipeIngredient[]) => {
    let totalCost = 0;
    let hasMissingPrices = false;

    const enriched: EnrichedIngredient[] = ingredients.map(ing => {
      const { price, isMissing, source } = getBestUnitPrice(ing.id);
      if (isMissing) hasMissingPrices = true;
      const totalPrice = price * ing.quantity;
      totalCost += totalPrice;
      return { ...ing, unitPrice: price, totalPrice, isMissing, bestSource: source };
    });

    const { price: sellPrice, isMissing: isSellPriceMissing } = getBestUnitPrice(item._id);
    const benefit = sellPrice - totalCost;
    const roi = totalCost > 0 ? Math.round((benefit / totalCost) * 100) : 0;

    return { enriched, totalCost, hasMissingPrices, sellPrice, isSellPriceMissing, benefit, roi };
  };

  const stats = selectedItem ? getCraftStats(selectedItem, activeIngredients) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* JOBS GRID */}
      <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-dofus-accent" />
          Sélectionner un métier
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {DOFUS_JOBS.map(job => {
            const Icon = JOB_ICONS[job] || Sparkles;
            const isActive = activeJob === job;
            return (
              <button
                key={job}
                onClick={() => handleJobChange(job)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-300 ${
                  isActive
                    ? 'bg-dofus-accent/10 border-dofus-accent text-dofus-accent shadow-glow-amber'
                    : 'bg-[#090d16]/40 border-white/5 text-slate-400 hover:text-white hover:border-white/10 hover:bg-[#151f32]/20'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'animate-pulse-glow text-dofus-accent' : ''}`} />
                <span className="text-xs font-semibold">{job}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: CRAFTABLE ITEMS LIST */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass-panel rounded-xl p-5 border border-white/5 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-white text-md">Objets Craftables ({craftItems.length})</h3>
              <span className="text-[10px] text-slate-400 font-bold bg-[#151f32] px-2 py-0.5 rounded uppercase tracking-wider">
                {activeJob}
              </span>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrer les crafts…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-dofus-accent/40"
              />
            </div>

            {isLoadingItems ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
                <Loader2 className="h-5 w-5 animate-spin text-dofus-accent" />
                Chargement des crafts…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                {searchQuery.trim()
                  ? 'Aucun craft ne correspond à votre recherche.'
                  : 'Aucun objet craftable trouvé pour ce métier.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredItems.map(item => {
                  const isSelected = selectedItem?._id === item._id;
                  const itemStats = getCraftStats(item, item.ingredients);

                  return (
                    <button
                      key={item._id}
                      onClick={() => { setSelectedItemId(item._id); setEditingIngredientId(null); }}
                      className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all duration-300 group ${
                        isSelected
                          ? 'bg-dofus-accent/5 border-dofus-accent/40 shadow-inner'
                          : 'bg-[#090d16]/30 border-white/5 hover:border-white/10 hover:bg-[#151f32]/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <ItemImage item={item} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10" />
                          <span className="absolute -bottom-1 -right-1 text-[8px] bg-[#070a12] text-slate-300 font-bold px-1 rounded border border-white/10">
                            {item.level}
                          </span>
                        </div>
                        <div>
                          <h4 className={`text-sm font-semibold transition-colors leading-tight ${isSelected ? 'text-dofus-accent' : 'text-slate-200 group-hover:text-white'}`}>
                            {item.name}
                          </h4>
                          <span className="text-[9px] text-slate-400 capitalize">{item.type}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {itemStats.hasMissingPrices ? (
                          <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" /> Prix ?
                          </span>
                        ) : itemStats.isSellPriceMissing ? (
                          <span className="text-[9px] text-slate-500 bg-[#151f32] px-2 py-0.5 rounded-full font-bold">
                            Prix Vente ?
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            itemStats.benefit >= 0
                              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                          }`}>
                            {itemStats.benefit >= 0 ? '+' : ''}{Math.round(itemStats.benefit).toLocaleString()} K
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: CALCULATION WORKBENCH */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {selectedItem && stats ? (
            <div className="glass-panel rounded-xl border border-white/5 shadow-xl p-5 flex flex-col gap-6 relative">
              <div className="absolute top-0 right-0 w-48 h-48 bg-dofus-accent/3 rounded-full blur-3xl -z-10" />

              {/* Header item — clickable name */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-4">
                  <div className="relative shadow-lg">
                    <ItemImage item={selectedItem} className="h-16 w-16 bg-[#151f32]/85 rounded-xl p-1 border border-white/10" imgClassName="h-12 w-12 object-contain" />
                    <span className="absolute -bottom-1.5 -right-1.5 text-xs bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black px-2 py-0.5 rounded-md shadow-md">
                      Lvl {selectedItem.level}
                    </span>
                  </div>
                  <div>
                    <h3
                      className="text-xl font-bold text-white leading-tight cursor-pointer hover:text-amber-400 transition-colors"
                      onClick={() => navigateToHdvItem({ _id: selectedItem._id, name: selectedItem.name, type: selectedItem.type, level: selectedItem.level, imgUrl: selectedItem.imgUrl })}
                    >
                      {selectedItem.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 capitalize font-medium">
                      {selectedItem.type} &bull; Métier {activeJob}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addIngredientsToCart(activeIngredients.map(ing => ({
                      id: ing.id, name: ing.name, type: ing.type, level: ing.level, imgUrl: ing.imgUrl, quantity: ing.quantity
                    })))}
                    className="flex items-center gap-1.5 bg-[#151f32] hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-slate-300 hover:text-rose-400 text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Ajouter au panier
                  </button>
                  <button
                    onClick={() => trackItem({
                      _id: selectedItem._id,
                      name: selectedItem.name,
                      type: selectedItem.type,
                      level: selectedItem.level,
                      imgUrl: selectedItem.imgUrl,
                      dofusdbId: selectedItem.dofusdbId,
                    })}
                    className="bg-[#151f32] hover:bg-dofus-accent/10 border border-white/10 hover:border-dofus-accent/20 text-slate-300 hover:text-dofus-accent text-xs font-bold py-2 px-3 rounded-lg transition-all self-start sm:self-auto"
                  >
                    Suivre en HDV
                  </button>
                </div>
              </div>

              {/* Ingrédients */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Ingrédients requis</h4>

                {activeIngredients.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl">
                    Aucune recette trouvée pour cet item.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {stats.enriched.map(ing => (
                      <div
                        key={ing.id}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          ing.isMissing ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#090d16]/30 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateToHdvItem({ _id: ing.id, name: ing.name, type: ing.type, level: ing.level, imgUrl: ing.imgUrl })}>
                          <ItemImage item={ing} className="h-10 w-10 bg-[#151f32]/80 rounded-lg p-1 border border-white/10 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-white leading-tight hover:text-amber-400 transition-colors">{ing.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Quantité : <span className="text-dofus-accent font-bold">x{ing.quantity}</span>
                              {ing.type && <span className="ml-2 opacity-60 capitalize">{ing.type}</span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          {(ing.isMissing || editingIngredientId === ing.id) ? (
                            <div className="flex flex-col items-end gap-1.5 w-full sm:w-auto">
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> {ing.isMissing ? 'Prix manquant' : 'Modification'}
                              </span>
                              <div className="flex items-end gap-2">
                                <div className="grid grid-cols-4 gap-1.5">
                                  {(['x1', 'x10', 'x100', 'x1000'] as const).map(lot => {
                                    const currentVal = hdvPrices[ing.id]?.[lot];
                                    return (
                                      <div key={lot} className="flex flex-col items-center">
                                        <span className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">{lot.replace('x', '×')}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={currentVal ?? ''}
                                          placeholder="0"
                                          className="w-16 bg-[#070a12] border border-amber-500/30 rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          onChange={e => {
                                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                            if (!isNaN(val) && val >= 0) handleQuickLotChange(ing.id, lot, val);
                                          }}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                                <button
                                  onClick={() => setEditingIngredientId(null)}
                                  className="h-7 w-7 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 rounded flex items-center justify-center transition-colors shrink-0"
                                >
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-right group cursor-pointer" onClick={() => setEditingIngredientId(ing.id)}>
                              <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                                <span className="text-[10px] text-slate-400">
                                  <span className="font-bold text-slate-300">{ing.unitPrice.toFixed(1)}</span>
                                  <span className="text-slate-500"> K/u</span>
                                </span>
                                <span className="text-[10px] text-slate-500">× {ing.quantity}</span>
                                <span className="text-xs font-extrabold text-dofus-accent">
                                  {ing.totalPrice.toLocaleString()}
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold">K</span>
                                <Pencil className="h-3 w-3 text-slate-500 group-hover:text-slate-300 transition-colors ml-0.5" />
                              </div>
                              {ing.bestSource && (
                                <span className="text-[9px] text-slate-500 mt-0.5 block text-right">
                                  via <span className="text-slate-400 font-semibold">{ing.bestSource}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Résumé économique */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                <div className="flex flex-col gap-4 bg-[#090d16]/30 p-4 border border-white/5 rounded-xl">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Coût de fabrication</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-2xl font-extrabold text-white">{stats.totalCost.toLocaleString()}</span>
                      <span className="text-xs text-dofus-accent font-bold">Kamas</span>
                    </div>
                    {stats.hasMissingPrices && (
                      <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="h-3 w-3" /> Coût incomplet (prix manquants)
                      </p>
                    )}
                  </div>

                  {/* Prix de vente auto (plus de champ manuel) */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prix de vente (HDV)</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      {stats.isSellPriceMissing ? (
                        <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Inconnu — cliquez sur le nom de l'objet pour le renseigner
                        </p>
                      ) : (
                        <>
                          <span className="text-2xl font-extrabold text-dofus-accent">
                            {Math.round(stats.sellPrice).toLocaleString()}
                          </span>
                          <span className="text-xs text-dofus-accent font-bold">K</span>
                          {stats.isSellPriceMissing === false && (
                            <span className="text-[9px] text-slate-500 ml-1 font-semibold">(via {getBestUnitPrice(selectedItem._id).source})</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex flex-col justify-between gap-3 shadow-lg ${
                  stats.hasMissingPrices
                    ? 'bg-slate-900/40 border-white/5 text-slate-500'
                    : stats.isSellPriceMissing
                    ? 'bg-[#151f32]/20 border-white/5 text-slate-400'
                    : stats.benefit >= 0
                    ? 'bg-emerald-950/20 border-emerald-500/20 shadow-glow-emerald text-emerald-400'
                    : 'bg-rose-950/20 border-rose-500/20 shadow-glow-rose text-rose-400'
                }`}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bénéfice Net Estimé</span>
                    {stats.hasMissingPrices ? (
                      <div className="text-sm font-semibold text-amber-400 mt-2">
                        Renseignez tous les prix pour calculer le bénéfice.
                      </div>
                    ) : stats.isSellPriceMissing ? (
                      <div className="text-sm font-semibold text-slate-400 mt-2">
                        Prix de vente inconnu. Cliquez sur le nom de l'objet en haut pour l'ajouter.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        {stats.benefit >= 0
                          ? <TrendingUp className="h-6 w-6 text-emerald-400" />
                          : <TrendingDown className="h-6 w-6 text-rose-400" />}
                        <span className="text-3xl font-black">
                          {stats.benefit >= 0 ? '+' : ''}{Math.round(stats.benefit).toLocaleString()}
                        </span>
                        <span className="text-sm font-bold">K</span>
                      </div>
                    )}
                  </div>

                  {!stats.hasMissingPrices && !stats.isSellPriceMissing && (
                    <div className="flex justify-between items-center text-xs font-bold border-t border-white/5 pt-2.5 mt-2.5">
                      <span>Rendement (ROI) :</span>
                      <span className={`text-sm ${stats.benefit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.roi > 0 ? '+' : ''}{stats.roi}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-16 text-center border border-white/5 shadow-xl flex flex-col items-center justify-center">
              <Coins className="h-12 w-12 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">
                Sélectionnez un objet dans le panneau de gauche pour voir sa recette et calculer le coût de craft.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
