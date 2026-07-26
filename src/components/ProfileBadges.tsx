import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchUserStats } from '../lib/sync';
import type { UserStats } from '../lib/sync';
import { Lock, CheckCircle, Sprout, Package, Crown, TrendingUp } from 'lucide-react';

const BADGES = [
  {
    id: 'apprentice',
    icon: Sprout,
    title: 'Apprenti Marchand',
    description: 'Avoir renseigné au moins 1 prix',
    condition: (s: UserStats) => s.pricesCount >= 1,
    progress: (s: UserStats) => Math.min(s.pricesCount, 1),
    max: 1,
  },
  {
    id: 'regular',
    icon: Package,
    title: 'Négociant Régulier',
    description: 'Avoir renseigné au moins 25 prix',
    condition: (s: UserStats) => s.pricesCount >= 25,
    progress: (s: UserStats) => Math.min(s.pricesCount, 25),
    max: 25,
  },
  {
    id: 'legend',
    icon: Crown,
    title: 'Légende KamaMage',
    description: 'Avoir renseigné plus de 100 prix',
    condition: (s: UserStats) => s.pricesCount >= 100,
    progress: (s: UserStats) => Math.min(s.pricesCount, 100),
    max: 100,
  },
];

export default function ProfileBadges() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetchUserStats(user.id).then(data => {
      setStats(data ?? { pricesCount: 0 });
      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-purple-400" />
          Statistiques de Contribution
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#0c101d]/60 border border-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-amber-400" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prix renseignés</span>
            </div>
            <p className="text-2xl font-extrabold text-white">{stats.pricesCount}</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-amber-400" />
          Vos Badges d'Activité
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BADGES.map(badge => {
            const unlocked = badge.condition(stats);
            const progress = badge.progress(stats);
            const Icon = badge.icon;
            const pct = Math.round((progress / badge.max) * 100);

            return (
              <div
                key={badge.id}
                className={`rounded-lg border p-4 transition-all ${
                  unlocked
                    ? 'bg-[#0c101d]/60 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                    : 'bg-[#0c101d]/30 border-white/5 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    unlocked
                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                      : 'bg-slate-800/50 border border-white/5 text-slate-500'
                  }`}>
                    {unlocked ? <Icon className="h-4.5 w-4.5" /> : <Lock className="h-4 w-4" />}
                  </div>
                  {unlocked && (
                    <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 shrink-0">
                      <CheckCircle className="h-3 w-3" /> Débloqué
                    </span>
                  )}
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${unlocked ? 'text-white' : 'text-slate-400'}`}>
                    {badge.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">{badge.description}</p>

                    {!unlocked && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-0.5">
                          <span>{progress} / {badge.max}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500/60 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}