import { useMemo, useState, useRef, useEffect } from 'react';
import { useDofus } from '../context/DofusContext';
import { ENCLOS_LEVELS, CARBURANT_TYPES, CARBURANT_TAILLES, HDV_ITEM_IDS, getCarburantDisplayName } from '../lib/elevage/constants';
import { computeTable, findOptimalLevel } from '../lib/elevage/calculations';
import type { MontureType, ElevageRow } from '../lib/elevage/calculations';
import { Sparkles, Beef, Lightbulb, AlertTriangle, Coins, TrendingUp, TrendingDown, Info, Target } from 'lucide-react';

export default function ElevageCalculator() {
  const { hdvPrices } = useDofus();

  const [montureType, setMontureType] = useState<MontureType>('muldo');

  const [carbType, setCarbType] = useState(CARBURANT_TYPES[3].id);
  const [carbTaille, setCarbTaille] = useState(CARBURANT_TAILLES[2].id);

  const [enclosIndex, setEnclosIndex] = useState(ENCLOS_LEVELS.length - 1);
  const enclosCount = ENCLOS_LEVELS[enclosIndex].count;

  const optimalRowRef = useRef<HTMLTableRowElement>(null);

  const carburantType = CARBURANT_TYPES.find(t => t.id === carbType) ?? CARBURANT_TYPES[3];
  const carburantTaille = CARBURANT_TAILLES.find(t => t.id === carbTaille) ?? CARBURANT_TAILLES[2];

  const runeItemId = montureType === 'muldo' ? HDV_ITEM_IDS.rune.muldo : HDV_ITEM_IDS.rune.volkorne;
  const carburantItemId = HDV_ITEM_IDS.carburant(carbType, carbTaille);

  const runePrice = hdvPrices[runeItemId]?.unitAverage ?? 0;
  const carburantPrice = hdvPrices[carburantItemId]?.unitAverage ?? 0;
  const filetPrice = hdvPrices[HDV_ITEM_IDS.filet_capture]?.unitAverage ?? 0;

  const hasMissingPrices = !runePrice || !filetPrice || !carburantPrice;

  const rows = useMemo<ElevageRow[]>(() => {
    if (hasMissingPrices) return [];
    return computeTable(montureType, runePrice, carburantPrice, filetPrice, enclosCount);
  }, [montureType, runePrice, carburantPrice, filetPrice, enclosCount, hasMissingPrices]);

  const optimal = useMemo(() => findOptimalLevel(rows), [rows]);

  useEffect(() => {
    if (optimalRowRef.current) {
      optimalRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [optimal?.level]);

  const missingItems: string[] = [];
  if (!filetPrice) missingItems.push('Filet de capture');
  if (!runePrice) missingItems.push(montureType === 'muldo' ? 'Rune Ga Pme' : 'Rune Ga PA');
  if (!carburantPrice) missingItems.push(getCarburantDisplayName(carburantType.label, carburantTaille.id));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* Guide block */}
      <div className="glass-panel rounded-xl p-5 sm:p-6 border border-amber-500/20 shadow-xl bg-gradient-to-r from-[#0f1421] to-[#151f32]">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          Comment optimiser vos gains ?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-[9px] font-extrabold">1</span>
              Capture
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Capturez des <strong className="text-slate-200">Volkornes</strong> ou <strong className="text-slate-200">Muldos</strong> Gen 1.
            </p>
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-[9px] font-extrabold">2</span>
              XP
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Utilisez des <strong className="text-slate-200">consommables</strong> pour atteindre le niveau optimal.
            </p>
          </div>
          <div className="bg-[#090d16]/60 rounded-lg p-3 border border-white/5">
            <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-[9px] font-extrabold">3</span>
              Brisage
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Brisez-les en <strong className="text-slate-200">HDV</strong> pour extraire vos runes et générer des bénéfices.
            </p>
          </div>
        </div>
      </div>

      {/* Calculator panel */}
      <div className="glass-panel rounded-xl p-5 sm:p-6 border border-white/5 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Beef className="h-5 w-5 text-amber-400" />
          Simulateur de Brisage : Muldos &amp; Volkornes
        </h2>

        {/* Type toggle */}
        <div className="flex flex-wrap items-center gap-4 mb-5 border-b border-white/5 pb-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monture</span>
          <div className="flex bg-[#0c101d] rounded-lg border border-white/10 p-0.5">
            <button
              onClick={() => setMontureType('muldo')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                montureType === 'muldo' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Muldo
            </button>
            <button
              onClick={() => setMontureType('volkorne')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                montureType === 'volkorne' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Volkorne
            </button>
          </div>
          <span className="ml-auto text-[10px] text-slate-500 bg-[#151f32] px-2 py-0.5 rounded-full font-semibold">
            Rune cible : {montureType === 'muldo' ? 'Ga Pme' : 'Ga PA'}
          </span>
        </div>

        {/* Configuration grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 block">Type de carburant</label>
            <select
              value={carbType}
              onChange={e => setCarbType(e.target.value)}
              className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500/40"
            >
              {CARBURANT_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 block">Taille</label>
            <select
              value={carbTaille}
              onChange={e => setCarbTaille(e.target.value)}
              className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500/40"
            >
              {CARBURANT_TAILLES.map(t => (
                <option key={t.id} value={t.id}>{t.label} — {t.xp.toLocaleString()} XP</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 block">Niveau éleveur</label>
            <select
              value={enclosIndex}
              onChange={e => setEnclosIndex(Number(e.target.value))}
              className="w-full bg-[#070a12] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500/40"
            >
              {ENCLOS_LEVELS.map((el, i) => (
                <option key={i} value={i}>{el.title} (Niveau {el.level}) — {el.count} enclos</option>
              ))}
            </select>
          </div>
        </div>

        {/* Prix HDV */}
        <div className="bg-[#090d16]/40 border border-white/5 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Coins className="h-3 w-3" /> Prix HDV
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-slate-400">Filet : <span className={`font-bold ${filetPrice ? 'text-slate-200' : 'text-amber-400'}`}>{filetPrice ? `${filetPrice.toLocaleString()} K` : 'Manquant'}</span></span>
            <span className="text-slate-400">Rune : <span className={`font-bold ${runePrice ? 'text-slate-200' : 'text-amber-400'}`}>{runePrice ? `${runePrice.toLocaleString()} K` : 'Manquant'}</span></span>
            <span className="text-slate-400">{getCarburantDisplayName(carburantType.label, carburantTaille.id)} : <span className={`font-bold ${carburantPrice ? 'text-slate-200' : 'text-amber-400'}`}>{carburantPrice ? `${carburantPrice.toLocaleString()} K` : 'Manquant'}</span></span>
          </div>
        </div>

        {hasMissingPrices && (
          <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-400">Prix HDV manquants</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Renseignez les prix suivants dans l'onglet <strong>Prix HDV</strong> pour activer les calculs : {missingItems.join(', ')}.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="glass-panel rounded-xl border border-white/5 shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-bold text-white text-md flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Tableau des bénéfices
          </h3>
          {optimal && !hasMissingPrices && (
            <span className="text-[10px] bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              Niveau recommandé : {optimal.level}
            </span>
          )}
        </div>

        {rows.length === 0 && !hasMissingPrices && (
          <div className="p-12 text-center text-slate-500 text-sm">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Aucune donnée à afficher. Vérifiez les prix et la configuration.
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-[#0c101d]/50">
                  <th className="text-left py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Niveau</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">XP cumulée</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Carbu/monture</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Probabilité</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Gain espéré</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Bénéfice net</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">% Bénéfice</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Bénéfice total</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Extraits</th>
                  <th className="text-right py-3 px-3 text-slate-400 font-bold uppercase tracking-wider">Heures</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isOptimal = optimal && row.level === optimal.level;
                  return (
                    <tr
                      key={row.level}
                      ref={isOptimal ? optimalRowRef : undefined}
                      className={`border-b border-white/5 transition-colors ${
                        isOptimal
                          ? 'bg-emerald-500/15 border-y-2 border-emerald-500/40'
                          : row.netProfit >= 0
                          ? 'hover:bg-white/[0.02]'
                          : 'hover:bg-white/[0.02] opacity-60'
                      }`}
                    >
                      <td className={`py-2.5 px-3 font-bold ${isOptimal ? 'text-emerald-400' : 'text-white'}`}>
                        <span className="flex items-center gap-1.5">
                          {row.level}
                          {isOptimal && (
                            <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                              <Sparkles className="h-2.5 w-2.5" />
                              Recommandé
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-3 text-slate-300 font-mono">{row.cumulatedXp.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-slate-300 font-mono">{row.fuelCostPerMount.toLocaleString()} K</td>
                      <td className="text-right py-2.5 px-3 text-slate-300 font-mono">{(row.runeProb * 100).toFixed(2)}%</td>
                      <td className={`text-right py-2.5 px-3 font-mono ${isOptimal ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {Math.round(row.expectedGain).toLocaleString()} K
                      </td>
                      <td className={`text-right py-2.5 px-3 font-bold font-mono ${
                        row.netProfit >= 0 ? (isOptimal ? 'text-emerald-400' : 'text-emerald-400/80') : 'text-rose-400/70'
                      }`}>
                        <span className="flex items-center justify-end gap-1">
                          {row.netProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {row.netProfit >= 0 ? '+' : ''}{Math.round(row.netProfit).toLocaleString()} K
                        </span>
                      </td>
                      <td className={`text-right py-2.5 px-3 font-mono ${isOptimal ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {(row.benefitPercent * 100).toFixed(1)}%
                      </td>
                      <td className={`text-right py-2.5 px-3 font-mono ${isOptimal ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {Math.round(row.totalCycleProfit).toLocaleString()} K
                      </td>
                      <td className="text-right py-2.5 px-3 text-slate-300 font-mono">{row.extraitsRequired.toFixed(1)}</td>
                      <td className="text-right py-2.5 px-3 text-slate-300 font-mono">{row.hoursToLevel.toFixed(1)}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info note */}
      {!hasMissingPrices && rows.length > 0 && (
        <div className="glass-panel rounded-xl p-4 sm:p-5 border border-white/5 shadow-xl">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-white mb-1">Info Brisage</h4>
              <p className="text-[12px] text-slate-400 leading-relaxed">
                Bien que le gain des runes PA (Volkornes) et PM (Muldos) soit garanti au niveau 100,
                il est tout à fait possible d'obtenir ces runes en brisant les montures à des niveaux inférieurs.
                Le calculateur vous indique ici le <strong className="text-slate-200">meilleur compromis rentabilité/temps</strong>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
