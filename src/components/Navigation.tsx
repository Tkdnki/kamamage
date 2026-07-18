import { Coins, Hammer, Sparkles, Wand2, ShoppingCart, LogIn, LogOut, User, Settings, Beef } from 'lucide-react';
import { useServer, SERVER_CATEGORIES } from '../context/ServerContext';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import type { ViewType } from '../context/NavigationContext';

export type { ViewType } from '../context/NavigationContext';

export default function Navigation() {
  const { selectedServer, setSelectedServer } = useServer();
  const { activeView, setActiveView } = useNavigation();

  const tabs = [
    {
      id: 'hdv' as ViewType,
      label: 'Prix HDV',
      icon: Coins,
      description: 'Inventaire & Ressources',
      color: 'from-amber-500 to-yellow-500',
      activeColor: 'text-amber-400 border-amber-500',
    },
    {
      id: 'crafts' as ViewType,
      label: 'Rentabilité Crafts',
      icon: Hammer,
      description: 'Calculateur de bénéfices',
      color: 'from-emerald-500 to-teal-500',
      activeColor: 'text-emerald-400 border-emerald-500',
    },
    {
      id: 'forgemagie' as ViewType,
      label: 'Forgemagie',
      icon: Wand2,
      description: 'Calculateur de puits',
      color: 'from-purple-500 to-indigo-500',
      activeColor: 'text-purple-400 border-purple-500',
    },
    {
      id: 'elevage' as ViewType,
      label: 'Élevage',
      icon: Beef,
      description: 'Rentabilité montures',
      color: 'from-orange-500 to-amber-500',
      activeColor: 'text-orange-400 border-orange-500',
    },
    {
      id: 'shopping' as ViewType,
      label: 'Liste de courses',
      icon: ShoppingCart,
      description: 'Panier d\'ingrédients',
      color: 'from-rose-500 to-pink-500',
      activeColor: 'text-rose-400 border-rose-500',
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#070a12]/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveView('hdv')}>
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/20">
            <Sparkles className="h-5.5 w-5.5 text-slate-950 animate-pulse-glow" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
              KAMA<span className="text-white font-medium">MAGE</span>
            </span>
            <p className="text-[10px] tracking-widest text-slate-400 uppercase -mt-1 font-bold">Dofus Companion</p>
          </div>
        </div>

          {/* Desktop Navigation */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Auth Button */}
            <AuthButton />

            {/* Server Selector */}
            <select
            value={selectedServer}
            onChange={e => setSelectedServer(e.target.value)}
            className="bg-[#0c101d]/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500/40 appearance-none cursor-pointer"
            title="Serveur"
          >
            {SERVER_CATEGORIES.map(cat => (
              <optgroup key={cat.label} label={cat.label}>
                {cat.servers.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <nav className="flex space-x-1 sm:space-x-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id)}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-300 group ${
                    isActive
                      ? 'bg-white/5 text-white shadow-inner border border-white/10'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  )}
                  
                  <Icon className={`h-4.5 w-4.5 transition-transform duration-300 group-hover:scale-110 ${
                    isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-amber-300'
                  }`} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

function AuthButton() {
  const { user, profile, loading, signInWithDiscord, signOut } = useAuth();
  const { setActiveView } = useNavigation();

  if (loading) return null;

  if (!user) {
    return (
      <button
        onClick={signInWithDiscord}
        className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-[#5865F2] hover:bg-[#4752c4] px-3 py-1.5 rounded-lg transition-all shadow-lg shadow-[#5865F2]/20"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Connexion</span>
      </button>
    );
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all">
        <User className="h-3.5 w-3.5 text-purple-400" />
        <span className="hidden sm:inline max-w-[100px] truncate">{profile?.pseudo ?? user.email}</span>
      </button>
      <div className="absolute right-0 top-full mt-1 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="bg-[#0c101d] border border-white/10 rounded-lg py-1 shadow-xl">
          <div className="px-3 py-1.5 text-[10px] text-slate-500 border-b border-white/5">
            Score: <span className="text-purple-400 font-bold">{profile?.score ?? 0}</span>
            {profile?.role === 'admin' && (
              <span className="ml-1.5 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.5 rounded-full">Admin</span>
            )}
          </div>
          <button
            onClick={() => setActiveView('profile')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Settings className="h-3 w-3" /> Profil
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-rose-400 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-3 w-3" /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
