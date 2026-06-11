import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import AuthPage from '@/pages/AuthPage';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ForcePasswordChangeScreen from '@/components/ForcePasswordChangeScreen';
import { toast } from 'sonner';

const Inner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, signOut } = useAuth();

  useEffect(() => {
    if (profile?.status === 'suspended') {
      toast.error('تم تعليق حسابك. يرجى الاتصال بالمسؤول.');
      void signOut();
    }
  }, [profile, signOut]);

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (profile.status === 'suspended') return null;
  if (profile.force_password_change) return <ForcePasswordChangeScreen />;
  return <>{children}</>;
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return <AuthPage />;
  return (
    <AuthProvider session={session}>
      <Inner>{children}</Inner>
    </AuthProvider>
  );
};

export default AuthGate;
