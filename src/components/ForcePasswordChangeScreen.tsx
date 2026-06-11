import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Factory } from 'lucide-react';

const ForcePasswordChangeScreen: React.FC = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd1.length < 6) { toast.error('كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل'); return; }
    if (pwd1 !== pwd2) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd1 });
      if (error) throw error;
      if (profile) {
        await supabase.from('profiles').update({ force_password_change: false }).eq('id', profile.id);
      }
      await refreshProfile();
      toast.success('تم تغيير كلمة المرور');
    } catch (err: any) {
      toast.error(err?.message || 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Factory className="h-10 w-10 text-primary" />
          <h1 className="font-heading text-lg font-bold">تغيير كلمة المرور إلزامي</h1>
          <p className="text-sm text-muted-foreground text-center">يجب عليك تغيير كلمة المرور قبل المتابعة</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">كلمة المرور الجديدة</label>
            <input type="password" required minLength={6} value={pwd1} onChange={e => setPwd1(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">تأكيد كلمة المرور</label>
            <input type="password" required minLength={6} value={pwd2} onChange={e => setPwd2(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {loading ? '...' : 'حفظ'}
          </button>
          <button type="button" onClick={() => signOut()} className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-2">
            تسجيل الخروج
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForcePasswordChangeScreen;
