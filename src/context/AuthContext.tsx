import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { fetchUserStats } from '../lib/sync';

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
  computedScore: number;
  loading: boolean;
  needsPseudo: boolean;
  signInWithDiscord: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updatePseudo: (pseudo: string) => Promise<{ error?: string }>;
  refreshUserStats: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [computedScore, setComputedScore] = useState(0);
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

  const refreshUserStats = async () => {
    if (!user) return;
    const stats = await fetchUserStats(user.id);
    if (stats) setComputedScore(stats.pricesCount * 10 + stats.votesCount * 2);
  };

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
    fetchUserStats(userId).then(stats => {
      if (stats) setComputedScore(stats.pricesCount * 10 + stats.votesCount * 2);
    });
  }

  const updatePseudo = async (pseudo: string): Promise<{ error?: string }> => {
    if (!user) return { error: 'Non connecté' };
    if (!pseudo.trim()) return { error: 'Le pseudo ne peut pas être vide' };
    const { error } = await supabase
      .from('profiles')
      .update({ pseudo: pseudo.trim() })
      .eq('id', user.id);
    if (error) {
      const msg = error.message;
      if (msg.includes('duplicate key') || msg.includes('unique')) {
        return { error: 'Ce pseudo est déjà pris.' };
      }
      return { error: msg };
    }
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

  const signInWithEmail = async (email: string, password: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  const signUpWithEmail = async (email: string, password: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, computedScore, loading, needsPseudo,
      signInWithDiscord, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, updatePseudo, refreshUserStats,
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
