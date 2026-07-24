import { Analytics } from '@vercel/analytics/react';
import Navigation from './components/Navigation';
import HdvPrices from './components/HdvPrices';
import CraftProfitability from './components/CraftProfitability';
import LevelingAdvisor from './components/LevelingAdvisor';
import ElevageCalculator from './components/ElevageCalculator';
import ForgemagieHelper from './components/ForgemagieHelper';
import ShoppingList from './components/ShoppingList';
import ProfileSettings from './components/ProfileSettings';
import PseudoSetupModal from './components/PseudoSetupModal';
import { DofusProvider } from './context/DofusContext';
import { ServerProvider } from './context/ServerContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { AuthProvider } from './context/AuthContext';
import { useServer } from './context/ServerContext';

function AppContent() {
  const { activeView } = useNavigation();
  const { selectedServer } = useServer();

  return (
    <div className="flex flex-col min-h-screen">
      <Analytics />
      <Navigation />
      
      <main className="flex-grow">
        {activeView === 'hdv' && <HdvPrices />}
        {activeView === 'crafts' && <CraftProfitability key={selectedServer} />}
        {activeView === 'leveling' && <LevelingAdvisor key={selectedServer} />}
        {activeView === 'forgemagie' && <ForgemagieHelper />}
        {activeView === 'elevage' && <ElevageCalculator />}
        {activeView === 'shopping' && <ShoppingList />}
        {activeView === 'profile' && <ProfileSettings />}
      </main>

      <PseudoSetupModal />
      <footer className="border-t border-slate-700/50 py-6 text-center text-xs text-slate-500 bg-slate-900/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="mb-1">
            &copy; {new Date().getFullYear()} <strong>KamaMage</strong> &bull; Conçu avec passion pour les artisans et forgemages de Dofus.
          </p>
          <p className="text-slate-600">
            Ce site n'est pas affilié à Ankama Games. Les illustrations et données de Dofus sont la propriété exclusive d'Ankama.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ServerProvider>
      <AuthProvider>
        <DofusProvider>
          <NavigationProvider>
            <AppContent />
          </NavigationProvider>
        </DofusProvider>
      </AuthProvider>
    </ServerProvider>
  );
}
