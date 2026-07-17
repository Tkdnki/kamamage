import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export const SERVER_CATEGORIES: { label: string; servers: string[] }[] = [
  { label: 'Pionnier', servers: ['Brial', 'Rafal', 'Salar'] },
  { label: 'Pionnier monocompte', servers: ['Dakal', 'Mikhal', 'Kourial'] },
  { label: 'Classique', servers: ['Hell Mina', 'Tal Kasha', 'Tylezia', 'Imagiro', 'Orukam'] },
  { label: 'Classique monocompte', servers: ['Draconiros'] },
  { label: 'Épique', servers: ['Ombre'] },
];

export const ALL_SERVERS = SERVER_CATEGORIES.flatMap(c => c.servers);

interface ServerContextType {
  selectedServer: string;
  setSelectedServer: (server: string) => void;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export function ServerProvider({ children }: { children: ReactNode }) {
  const [selectedServer, setSelectedServer] = useLocalStorage('kamamage_server', 'Draconiros');

  return (
    <ServerContext.Provider value={{ selectedServer, setSelectedServer }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
}
