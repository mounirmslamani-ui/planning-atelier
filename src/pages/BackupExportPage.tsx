import { useEffect, useState } from 'react';
import { DownloadCloud, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { backupRequest, exportBackup, type ExportProgress, type TableRecap } from '@/lib/backupExport';

export default function BackupExportPage() {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<TableRecap[]>([]);
  const [progress, setProgress] = useState<ExportProgress>({ tables: 0, tableTotal: 46, current: '', files: {} });
  useEffect(() => {
    let active = true;
    backupRequest({ action: 'catalog' }).then(() => { if (active) setAccess('allowed'); }).catch(e => {
      if (active) { setAccess('denied'); setMessage(e.message); }
    });
    return () => { active = false; };
  }, []);
  async function start() {
    setBusy(true); setComplete(false); setErrors([]); setRows([]);
    setProgress({ tables: 0, tableTotal: 46, current: '', files: {} });
    try { setErrors(await exportBackup(setProgress, row => setRows(previous => [...previous, row]))); }
    catch (e) { setErrors([e instanceof Error ? e.message : 'فشل التصدير']); }
    finally { setBusy(false); setComplete(true); }
  }
  if (access === 'loading') return <div className="p-8 text-muted-foreground" dir="rtl">جاري التحقق من الصلاحيات…</div>;
  if (access === 'denied') return <div className="p-8 text-destructive" role="alert" dir="rtl">{message}</div>;
  return <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <h1 className="text-2xl font-heading font-bold flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-primary" />تصدير النسخة الاحتياطية</h1>
      <Button onClick={start} disabled={busy}><DownloadCloud className="h-4 w-4 ml-2" />{busy ? 'جاري التصدير…' : 'تصدير الكل'}</Button>
    </header>
    <section className="space-y-6 border-y border-border py-6">
      <div className="space-y-2"><div className="flex justify-between gap-2"><span>الجداول</span><span dir="ltr">{progress.tables} / {progress.tableTotal}</span></div><Progress value={progress.tables / progress.tableTotal * 100} aria-label="تقدم تصدير الجداول" /></div>
      {['order-attachments', 'purchase-documents'].map(bucket => {
        const p = progress.files[bucket];
        return <div className="space-y-2" key={bucket}><div className="flex justify-between gap-2"><span dir="ltr">{bucket}</span><span dir="ltr">{p ? `${p.done} / ${p.total}` : '—'}</span></div><Progress value={p?.percent ?? 0} aria-label={bucket} /></div>;
      })}
      {busy && <div className="flex gap-2 items-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /><span dir="ltr">{progress.current}</span></div>}
    </section>
    {complete && <section className="py-6" role="status"><h2 className={`font-semibold ${errors.length ? 'text-destructive' : 'text-primary'}`}>{errors.length ? 'اكتمل التصدير مع أخطاء' : 'تم تصدير النسخة الاحتياطية بنجاح'}</h2>{errors.length > 0 && <ul className="mt-3 space-y-2 text-destructive text-sm">{errors.map((e, i) => <li className="break-all" key={i}>{e}</li>)}</ul>}</section>}
    {rows.length > 0 && <div className="overflow-x-auto mt-6"><table className="w-full text-sm"><thead className="bg-muted sticky top-0"><tr>{['الجدول', 'تم تصديره', 'العدد الحالي', 'المرجع', 'النتيجة'].map(label => <th className="p-3 text-right" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.table} className={`border-b border-border ${row.matches ? '' : 'text-destructive'}`}><td className="p-3" dir="ltr">{row.table}</td><td className="p-3">{row.exported}</td><td className="p-3">{row.actual ?? '—'}</td><td className="p-3">{row.reference ?? '—'}</td><td className="p-3">{row.error ? 'فشل' : row.matches ? 'مطابق' : 'غير مطابق'}{row.reference !== null && row.actual !== row.reference && <span className="block text-destructive">مختلف عن المرجع</span>}</td></tr>)}</tbody></table></div>}
  </div>;
}