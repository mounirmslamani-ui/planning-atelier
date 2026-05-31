import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Factory } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'login' | 'signup';

const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('مرحبا بك');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success('تم إنشاء الحساب');
      }
    } catch (err: any) {
      toast.error(err?.message || 'خطأ في المصادقة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Factory className="h-10 w-10 text-primary" />
          <h1 className="font-heading text-lg font-bold uppercase tracking-wider">برمجة الورشة</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="email@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">كلمة المرور</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '...' : mode === 'login' ? 'دخول' : 'إنشاء'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(m => (m === 'login' ? 'signup' : 'login'))}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === 'login' ? 'إنشاء حساب جديد' : 'لدي حساب — تسجيل الدخول'}
        </button>
      </div>
    </div>
  );
};

export default AuthPage;
