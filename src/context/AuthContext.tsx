import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface Profile {
  id: string;
  pseudo: string;
  serveur: string | null;
  score: number;
  role: 'user' | 'admin';
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  needsPseudo: boolean;
  signInWithDiscord: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updatePseudo: (pseudo: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPseudo, setNeedsPseudo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile(data);
      setNeedsPseudo(!data.pseudo || data.pseudo === user?.email);
    }
  }

  const updatePseudo = async (pseudo: string): Promise<{ error?: string }> => {
    if (!user) return { error: 'Non connecté' };
    if (!pseudo.trim()) return { error: 'Le pseudo ne peut pas être vide' };
    const { error } = await supabase
      .from('profiles')
      .update({ pseudo: pseudo.trim() })
      .eq('id', user.id);
    if (error) return { error: error.message };
    setProfile(prev => prev ? { ...prev, pseudo: pseudo.trim() } : prev);
    setNeedsPseudo(false);
    return {};
  };

  const signInWithDiscord = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'discord' });
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, needsPseudo,
      signInWithDiscord, signInWithGoogle, signOut, updatePseudo,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
