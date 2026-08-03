import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type AccessLevel } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { UserPlus, UserMinus, UserX, KeyRound, Eye, EyeOff } from 'lucide-react';
import SearchableSelect from '@/components/ui/searchable-select';

const PasswordField: React.FC<{ value: string; onChange: (v: string) => void; id?: string }> = ({ value, onChange, id }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="ps-9"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute inset-y-0 start-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
        aria-label={show ? 'إخفاء' : 'إظهار'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

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
  libelle_fr: string | null;
  libelle_ar: string | null;
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
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);

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
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setSuspendTarget(p)}>
                        <UserX className="ml-1 h-3 w-3" />{p.status === 'suspended' ? 'إلغاء التعليق' : 'تعليق'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setResetTarget(p)}>
                        <KeyRound className="ml-1 h-3 w-3" />إعادة تعيين كلمة المرور
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
        <h2 className="p-3 text-lg font-bold border-b">تشخيص — صلاحياتي الخام (المستخدم المتصل)</h2>
        <table className="w-full text-xs font-mono">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-right">tableau</th>
              <th className="p-2 text-right">formulaire</th>
              <th className="p-2 text-right">sous_formulaire</th>
              <th className="p-2 text-right">champ_bouton</th>
              <th className="p-2 text-right">niveau_acces</th>
            </tr>
          </thead>
          <tbody>
            {rights.filter(r => r.user_id === session.user.id).map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">[{r.tableau}] ({r.tableau.length})</td>
                <td className="p-2">[{r.formulaire}] ({r.formulaire.length})</td>
                <td className="p-2">[{r.sous_formulaire}] ({r.sous_formulaire.length})</td>
                <td className="p-2">[{r.champ_bouton}] ({r.champ_bouton.length})</td>
                <td className="p-2">{r.niveau_acces}</td>
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
              <th className="p-2 text-center w-12">#</th>
              <th className="p-2 text-right min-w-[280px]">الصلاحية</th>
              {orderedProfiles.map(p => (
                <th key={p.id} className="p-2 text-center min-w-[140px]">{p.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.map(row => (
              <tr key={row.id} className="border-t">
                <td className="p-2 text-center text-muted-foreground">{row.ordre}</td>
                <td
                  className="p-2"
                  title={[row.tableau, row.formulaire, row.sous_formulaire, row.champ_bouton].map(v => v || '—').join(' / ')}
                >
                  <div>{row.libelle_ar || row.champ_bouton || row.formulaire || row.tableau || '—'}</div>
                  {row.libelle_fr && (
                    <div className="text-xs text-muted-foreground" dir="ltr">{row.libelle_fr}</div>
                  )}
                </td>
                {orderedProfiles.map(p => {
                  if (p.role === 'admin') {
                    return <td key={p.id} className="p-2 text-center font-bold text-primary">ADMIN</td>;
                  }
                  const r = rights.find(x => x.user_id === p.id && matchKey(x, row));
                  const lvl = (r?.niveau_acces ?? 'RO') as AccessLevel;
                  return (
                    <td key={p.id} className="p-2 text-center">
                      <SearchableSelect
                        value={lvl}
                        onValueChange={v => changeLevel(p.id, row, v as AccessLevel)}
                        className="h-8 text-sm px-2 py-1"
                        options={LEVELS.map(l => ({ value: l.value, label: l.label }))}
                      />
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
      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} onDone={load} />
    </div>
  );
};

const ResetPasswordDialog: React.FC<{ target: Profile | null; onClose: () => void; onDone: () => void }> = ({ target, onClose, onDone }) => {
  const [currentPwd, setCurrentPwd] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!target) { setCurrentPwd(''); setPwd(''); setConfirm(''); } }, [target]);

  const submit = async () => {
    if (!target) return;
    if (pwd.length < 6) { toast.error('كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل'); return; }
    if (pwd !== confirm) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-reset-password', {
        body: { user_id: target.id, new_password: pwd },
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
        throw new Error(serverMsg || error.message);
      }
      toast.success('تم تحديث كلمة المرور');
      onClose(); onDone();
    } catch (e: any) {
      toast.error(e?.message || 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>إعادة تعيين كلمة المرور — {target?.display_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">اسم المستخدم</label>
            <Input value={target?.display_name ?? ''} readOnly className="bg-muted cursor-not-allowed" />
          </div>
          <div>
            <label className="mb-1 block text-sm">كلمة المرور الحالية</label>
            <PasswordField value={currentPwd} onChange={setCurrentPwd} />
          </div>
          <div>
            <label className="mb-1 block text-sm">كلمة المرور الجديدة</label>
            <PasswordField value={pwd} onChange={setPwd} />
          </div>
          <div>
            <label className="mb-1 block text-sm">تأكيد كلمة المرور</label>
            <PasswordField value={confirm} onChange={setConfirm} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={loading}>{loading ? '...' : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
