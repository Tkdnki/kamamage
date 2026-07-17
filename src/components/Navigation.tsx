import { Coins, Hammer, Sparkles, Wand2, ShoppingCart } from 'lucide-react';
import { useServer, SERVER_CATEGORIES } from '../context/ServerContext';
import { useNavigation } from '../context/NavigationContext';
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
