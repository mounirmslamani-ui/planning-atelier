import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

export const REFERENCE_COUNTS: Record<string, number> = {
  orders: 1581, production_records: 3088, production_steps: 2452, material_suppliers: 1065,
  delivered_orders: 1230, quality_control_entries: 1513, order_attachments: 260, user_rights: 100, profiles: 5,
};
export type TableRecap = { table: string; exported: number; actual: number | null; initial: number | null; reference: number | null; matches: boolean; error?: string };
type StoredFile = { path: string; size: number | null; mime: string | null; created_at: string; url: string | null };
export type ExportProgress = { tables: number; tableTotal: number; current: string; files: Record<string, { done: number; total: number; percent: number }> };
export async function backupRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('backup-export', { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    const details = response ? await response.json().catch(() => null) : null;
    throw new Error(details?.error || 'تعذر الاتصال بخدمة التصدير');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function jsonDownload(data: unknown, name: string) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), name);
}
export function manifestCsv(bucket: string, files: Omit<StoredFile, 'url'>[]): string {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return '\uFEFF' + ['bucket,chemin,taille,type MIME,date de création', ...files.map(f =>
    [bucket, f.path, f.size, f.mime, f.created_at].map(escape).join(','))].join('\r\n');
}
export function countsMatch(exported: number, actual: number | null, initial: number | null) {
  return actual !== null && initial !== null && exported === actual && actual === initial;
}
export async function exportBackup(onProgress: (p: ExportProgress) => void, onTable: (r: TableRecap) => void) {
  const catalog = await backupRequest<{ tables: string[]; buckets: string[] }>({ action: 'catalog' });
  const progress: ExportProgress = { tables: 0, tableTotal: catalog.tables.length, current: '', files: {} };
  const update = () => onProgress({ ...progress, files: { ...progress.files } });
  const tables: TableRecap[] = [], failures: string[] = [];
  for (const table of catalog.tables) {
    progress.current = table; update();
    const recap: TableRecap = { table, exported: 0, actual: null, initial: null, reference: REFERENCE_COUNTS[table] ?? null, matches: false };
    try {
      const rows: unknown[] = [];
      let offset = 0;
      while (true) {
        const page = await backupRequest<{ rows: unknown[]; count: number }>({ action: 'table', table, offset });
        if (recap.initial === null) recap.initial = page.count;
        rows.push(...page.rows); recap.exported = rows.length;
        if (page.rows.length < 1000) break;
        offset += 1000;
      }
      recap.actual = (await backupRequest<{ count: number }>({ action: 'count', table })).count;
      recap.matches = countsMatch(recap.exported, recap.actual, recap.initial);
      jsonDownload(rows, `${table}.json`);
      if (!recap.matches) failures.push(`${table}: اختلاف عدد السجلات أثناء التصدير`);
    } catch (e) {
      recap.error = e instanceof Error ? e.message : 'فشل تصدير الجدول';
      failures.push(`${table}: ${recap.error}`);
    }
    tables.push(recap); onTable(recap); progress.tables++; update();
  }
  const storage: { bucket: string; listed: number; exported: number; failed: string[] }[] = [];
  for (const bucket of catalog.buckets) {
    const zip = new JSZip(), files: StoredFile[] = [], failed: string[] = [];
    progress.current = bucket; progress.files[bucket] = { done: 0, total: 0, percent: 0 }; update();
    try {
      const folders = [''];
      for (let i = 0; i < folders.length; i++) {
        let offset = 0;
        while (true) {
          const page = await backupRequest<{ files: StoredFile[]; folders: string[]; hasMore: boolean }>({ action: 'files', bucket, prefix: folders[i], offset });
          files.push(...page.files); folders.push(...page.folders);
          if (!page.hasMore) break;
          offset += 1000;
        }
      }
      progress.files[bucket] = { done: 0, total: files.length, percent: 0 }; update();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          if (!file.url) throw new Error('تعذر إنشاء رابط الملف');
          const response = await fetch(file.url);
          if (!response.ok) throw new Error('تعذر تنزيل الملف');
          const blob = await response.blob();
          if (file.size !== null && blob.size !== Number(file.size)) throw new Error('حجم الملف غير مطابق');
          zip.file(file.path, blob);
        } catch (e) { failed.push(file.path); failures.push(`${bucket}/${file.path}: ${e instanceof Error ? e.message : 'فشل تنزيل الملف'}`); }
        progress.files[bucket] = { done: i + 1, total: files.length, percent: files.length ? (i + 1) / files.length * 90 : 90 }; update();
      }
      zip.file('manifest.csv', manifestCsv(bucket, files));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, meta => {
        progress.files[bucket] = { done: files.length, total: files.length, percent: 90 + meta.percent / 10 }; update();
      });
      download(blob, `${bucket}.zip`);
    } catch (e) { failures.push(`${bucket}: ${e instanceof Error ? e.message : 'فشل تصدير الملفات'}`); }
    storage.push({ bucket, listed: files.length, exported: files.length - failed.length, failed });
  }
  jsonDownload({ generated_at: new Date().toISOString(), tables, storage, errors: failures }, 'recap.json');
  return failures;
}