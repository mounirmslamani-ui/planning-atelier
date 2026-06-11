import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type AccessLevel } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { UserPlus, UserMinus, UserX } from 'lucide-react';

interface Profile {
  id: string;
  display_name: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  force_password_change: boolean;
}
interface CatalogRow {
  id: string;
  ordre: number;
  tableau: string;
  formulaire: string;
  sous_formulaire: string;
  champ_bouton: string;
}
interface RightRow {
  id: string;
  user_id: string;
  tableau: string;
  formulaire: string;
  sous_formulaire: string;
  champ_bouton: string;
  niveau_acces: AccessLevel;
}

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: 'RW', label: 'RW' },
  { value: 'RO', label: 'RO' },
  { value: 'delegate', label: 'بالنيابة' },
  { value: 'denied', label: 'denied' },
];

const matchKey = (a: { tableau: string; formulaire: string; sous_formulaire: string; champ_bouton: string }, b: CatalogRow) =>
  a.tableau === b.tableau && a.formulaire === b.formulaire && a.sous_formulaire === b.sous_formulaire && a.champ_bouton === b.champ_bouton;

const UsersAdminPage: React.FC = () => {
  const { isAdmin, session, profile: meProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [rights, setRights] = useState<RightRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [confirmTwice, setConfirmTwice] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const [p, c, r] = await Promise.all([
      supabase.from('profiles').select('*').order('role', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('rights_catalog').select('*').order('ordre'),
      supabase.from('user_rights').select('*'),
    ]);
    setProfiles((p.data as Profile[]) ?? []);
    setCatalog((c.data as CatalogRow[]) ?? []);
    setRights((r.data as RightRow[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const orderedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.role === 'admin') return -1;
      if (b.role === 'admin') return 1;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [profiles]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const changeLevel = async (userId: string, row: CatalogRow, level: AccessLevel) => {
    const { error } = await supabase
      .from('user_rights')
      .upsert(
        {
          user_id: userId,
          tableau: row.tableau,
          formulaire: row.formulaire,
          sous_formulaire: row.sous_formulaire,
          champ_bouton: row.champ_bouton,
          niveau_acces: level,
        },
        { onConflict: 'user_id,tableau,formulaire,sous_formulaire,champ_bouton' },
      );
    if (error) { toast.error(error.message); return; }
    await supabase.from('audit_log').insert({
      user_id: session.user.id,
      action: 'change_right',
      details: { target_user: userId, key: row as any, level },
    } as any);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.functions.invoke('admin-delete-user', { body: { user_id: deleteTarget.id } });
    if (error) { toast.error(error.message); return; }
    toast.success('تم الحذف');
    setDeleteTarget(null); setConfirmTwice(false);
    await load();
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    const newStatus = suspendTarget.status === 'suspended' ? 'active' : 'suspended';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', suspendTarget.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from('audit_log').insert({
      user_id: session.user.id,
      action: newStatus === 'suspended' ? 'suspend_user' : 'unsuspend_user',
      details: { target_user: suspendTarget.id },
    } as any);
    toast.success(newStatus === 'suspended' ? 'تم تعليق المستخدم' : 'تم إلغاء التعليق');
    setSuspendTarget(null);
    await load();
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المستخدمون</h1>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)}><UserPlus className="ml-2 h-4 w-4" />إضافة مستخدم</Button>
        </div>
      </header>

      <section className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-right">المستخدم</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {orderedProfiles.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.display_name} {p.role === 'admin' && <span className="text-xs text-primary">(ADMIN)</span>}</td>
                <td className="p-3">{p.status === 'active' ? 'مفعّل' : 'معلّق'}</td>
                <td className="p-3">
                  {p.role !== 'admin' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSuspendTarget(p)}>
                        <UserX className="ml-1 h-3 w-3" />{p.status === 'suspended' ? 'إلغاء التعليق' : 'تعليق'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(p)}>
                        <UserMinus className="ml-1 h-3 w-3" />إزالة
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-card overflow-x-auto">
        <h2 className="p-3 text-lg font-bold border-b">جدول الصلاحيات</h2>
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-right">الجدول</th>
              <th className="p-2 text-right">الاستمارة</th>
              <th className="p-2 text-right">الاستمارة الفرعية</th>
              <th className="p-2 text-right">الحقل / الزر</th>
              {orderedProfiles.map(p => (
                <th key={p.id} className="p-2 text-center min-w-[140px]">{p.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.map(row => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.tableau || '—'}</td>
                <td className="p-2">{row.formulaire || '—'}</td>
                <td className="p-2">{row.sous_formulaire || '—'}</td>
                <td className="p-2">{row.champ_bouton || '—'}</td>
                {orderedProfiles.map(p => {
                  if (p.role === 'admin') {
                    return <td key={p.id} className="p-2 text-center font-bold text-primary">ADMIN</td>;
                  }
                  const r = rights.find(x => x.user_id === p.id && matchKey(x, row));
                  const lvl = (r?.niveau_acces ?? 'denied') as AccessLevel;
                  return (
                    <td key={p.id} className="p-2 text-center">
                      <select
                        value={lvl}
                        onChange={e => changeLevel(p.id, row, e.target.value as AccessLevel)}
                        className="rounded border border-input bg-background px-2 py-1 text-sm"
                      >
                        {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />

      <ConfirmDialog
        open={!!deleteTarget && !confirmTwice}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => setConfirmTwice(true)}
        title="تأكيد الحذف"
        description={`هل تريد حذف المستخدم ${deleteTarget?.display_name} ؟`}
        variant="destructive"
      />
      <ConfirmDialog
        open={!!deleteTarget && confirmTwice}
        onCancel={() => { setDeleteTarget(null); setConfirmTwice(false); }}
        onConfirm={handleDelete}
        title="تأكيد نهائي"
        description="هذا الإجراء نهائي ولا يمكن التراجع عنه. هل تريد المتابعة؟"
        variant="destructive"
      />
      <ConfirmDialog
        open={!!suspendTarget}
        onCancel={() => setSuspendTarget(null)}
        onConfirm={handleSuspend}
        title={suspendTarget?.status === 'suspended' ? 'إلغاء التعليق' : 'تعليق المستخدم'}
        description={`هل أنت متأكد من ${suspendTarget?.status === 'suspended' ? 'إعادة تفعيل' : 'تعليق'} حساب ${suspendTarget?.display_name} ؟`}
      />
    </div>
  );
};

const AddUserDialog: React.FC<{ open: boolean; onClose: () => void; onCreated: () => void }> = ({ open, onClose, onCreated }) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!displayName || !email || password.length < 6) {
      toast.error('جميع الحقول مطلوبة، كلمة المرور 6 أحرف على الأقل');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { display_name: displayName, email, password },
      });
      // Extract real server error from FunctionsHttpError context
      if (error) {
        let serverMsg: string | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const parsed = await ctx.json();
            serverMsg = parsed?.error;
          } else if (ctx && typeof ctx.text === 'function') {
            const t = await ctx.text();
            try { serverMsg = JSON.parse(t)?.error; } catch { serverMsg = t; }
          }
        } catch { /* ignore */ }
        throw new Error(serverMsg || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('تم إنشاء المستخدم');
      setDisplayName(''); setEmail(''); setPassword('');
      onClose(); onCreated();
    } catch (e: any) {
      toast.error(e?.message || 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>إضافة مستخدم</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">الاسم</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">البريد الإلكتروني</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">كلمة المرور</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={loading}>{loading ? '...' : 'إنشاء'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UsersAdminPage;
