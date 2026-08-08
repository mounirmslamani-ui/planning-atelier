import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Image as ImageIcon, Trash2, Upload, Download, Eye } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const BUCKET = 'order-attachments';

interface AttachmentRow {
  id: string;
  order_id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface Props {
  orderId: string;
  readOnly?: boolean;
}

const sanitize = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);

const OrderAttachmentsPanel: React.FC<Props> = ({ orderId, readOnly = false }) => {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AttachmentRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('order_attachments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error('تعذر تحميل الملفات المرفقة');
      return;
    }
    const list = (data ?? []) as AttachmentRow[];
    setRows(list);

    // Miniatures via URLs signées temporaires (images uniquement)
    const images = list.filter(r => (r.file_type || '').startsWith('image/'));
    if (images.length) {
      const entries = await Promise.all(
        images.map(async r => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(r.file_path, 3600);
          return [r.id, signed?.signedUrl ?? ''] as const;
        }),
      );
      setThumbs(Object.fromEntries(entries.filter(([, u]) => u)));
    } else {
      setThumbs({});
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly) return;
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id ?? null;
    let ok = 0;
    for (const file of Array.from(files)) {
      const path = `${orderId}/${crypto.randomUUID()}-${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        toast.error(`تعذر رفع الملف: ${file.name}`);
        continue;
      }
      const { error: insErr } = await supabase.from('order_attachments').insert({
        order_id: orderId,
        file_path: path,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: uid,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(`تعذر تسجيل الملف: ${file.name}`);
        continue;
      }
      ok++;
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    if (ok > 0) toast.success(`تم رفع ${ok} ملف`);
    await load();
  };

  const handleDownload = async (row: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 120, { download: row.file_name });
    if (error || !data?.signedUrl) {
      toast.error('تعذر تحميل الملف');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleView = async (row: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 120);
    if (error || !data?.signedUrl) {
      toast.error('تعذر فتح الملف');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const confirmDelete = async (row: AttachmentRow | null) => {
    if (!row || readOnly) return;
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([row.file_path]);
    if (stErr) {
      toast.error('تعذر حذف الملف من المخزن');
      return;
    }
    const { error: dbErr } = await supabase.from('order_attachments').delete().eq('id', row.id);
    if (dbErr) {
      toast.error('تعذر حذف السجل');
      return;
    }
    toast.success('تم حذف الملف');
    setPendingDelete(null);
    await load();
  };

  return (
    <div className="pt-3 border-t space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>الملفات المرفقة (صور / PDF)</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => void handleFiles(e.target.files)}
            disabled={readOnly || uploading}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={readOnly || uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-4 h-4 ms-1" />
            {uploading ? 'جاري الرفع...' : 'إضافة ملفات'}
          </Button>
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">جاري التحميل...</p>}
      {!loading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">لا توجد ملفات مرفقة.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map(row => {
          const isImage = (row.file_type || '').startsWith('image/');
          return (
            <div key={row.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-muted overflow-hidden">
                {isImage && thumbs[row.id] ? (
                  <img src={thumbs[row.id]} alt={row.file_name} className="w-full h-full object-cover" />
                ) : isImage ? (
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <FileText className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <span className="flex-1 text-xs truncate" title={row.file_name}>{row.file_name}</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => void handleView(row)} title="عرض">
                <Eye className="w-4 h-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => void handleDownload(row)} title="تحميل">
                <Download className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={readOnly}
                onClick={() => setPendingDelete(row)}
                title="حذف"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderAttachmentsPanel;
