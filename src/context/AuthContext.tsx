import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AccessLevel = 'RW' | 'RO' | 'delegate' | 'denied';

export interface Profile {
  id: string;
  display_name: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  force_password_change: boolean;
}

export interface RightRow {
  id: string;
  user_id: string;
  tableau: string;
  formulaire: string;
  sous_formulaire: string;
  champ_bouton: string;
  niveau_acces: AccessLevel;
}

interface RightKey {
  tableau?: string;
  formulaire?: string;
  sous_formulaire?: string;
  champ_bouton?: string;
}

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  rights: RightRow[];
  hasAccess: (key: RightKey) => AccessLevel;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export const AuthProvider: React.FC<{ session: Session; children: React.ReactNode }> = ({ session, children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rights, setRights] = useState<RightRow[]>([]);

  const load = useCallback(async () => {
    const userId = session.user.id;
    const [pRes, rRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_rights').select('*').eq('user_id', userId),
    ]);
    setProfile((pRes.data as Profile) ?? null);
    setRights((rRes.data as RightRow[]) ?? []);
  }, [session.user.id]);

  useEffect(() => { void load(); }, [load]);

  const isAdmin = profile?.role === 'admin';

  const hasAccess = useCallback((key: RightKey): AccessLevel => {
    if (isAdmin) return 'RW';
    const t = key.tableau ?? '';
    const f = key.formulaire ?? '';
    const sf = key.sous_formulaire ?? '';
    const cb = key.champ_bouton ?? '';
    const found = rights.find(r => r.tableau === t && r.formulaire === f && r.sous_formulaire === sf && r.champ_bouton === cb);
    return (found?.niveau_acces as AccessLevel) ?? 'denied';
  }, [isAdmin, rights]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    session, profile, isAdmin, rights, hasAccess, refreshProfile: load, signOut,
  }), [session, profile, isAdmin, rights, hasAccess, load, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = (): AuthCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
};
