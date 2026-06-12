import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Factory } from 'lucide-react';
import { toast } from 'sonner';

const AuthPage: React.FC = () => {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !password) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('resolve-user-email', {
        body: { display_name: displayName.trim() },
      });
      if (error) {
        let serverMsg: string | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const parsed = await ctx.json();
            serverMsg = parsed?.error;
          }
        } catch { /* ignore */ }
        throw new Error(serverMsg || 'اسم المستخدم غير موجود');
      }
      const email = (data as any)?.email;
      if (!email) throw new Error('اسم المستخدم غير موجود');

      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      toast.success('مرحبا بك');
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
          <p className="text-sm text-muted-foreground">تسجيل الدخول</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" dir="rtl">
          <div>
            <label className="mb-1 block text-sm font-medium">اسم المستخدم</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">كلمة المرور</label>
            <input
              type="password"
              required
              minLength={4}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;
