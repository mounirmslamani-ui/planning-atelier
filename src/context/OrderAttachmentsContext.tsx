import React, { createContext, useCallback, useContext, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Image as ImageIcon, Eye, Download } from 'lucide-react';

const BUCKET = 'order-attachments';

interface AttachmentRow {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
}

interface Ctx {
  openAttachments: (orderId: string, designation?: string) => void;
}

const OrderAttachmentsContext = createContext<Ctx | null>(null);

export const OrderAttachmentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [designation, setDesignation] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('order_attachments')
      .select('id, file_path, file_name, file_type')
      .eq('order_id', id)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      setRows([]);
      setThumbs({});
      return;
    }
    const list = (data ?? []) as AttachmentRow[];
    setRows(list);

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
  }, []);

  const openAttachments = useCallback((id: string, label?: string) => {
    setOrderId(id);
    setDesignation(label || '');
    setOpen(true);
    setRows([]);
    setThumbs({});
    void load(id);
  }, [load]);

  const handleView = async (row: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 120);
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (row: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 120, { download: row.file_name });
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <OrderAttachmentsContext.Provider value={{ openAttachments }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading whitespace-normal break-words">
              {designation || 'الملفات المرفقة'}
            </DialogTitle>
          </DialogHeader>

          {loading && <p className="text-xs text-muted-foreground">جاري التحميل...</p>}
          {!loading && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">لا توجد ملفات مرفقة لهذه الطلبية.</p>
          )}

          <div className="space-y-2 max-h-80 overflow-y-auto">
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
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </OrderAttachmentsContext.Provider>
  );
};

export function useOrderAttachments(): Ctx {
  const ctx = useContext(OrderAttachmentsContext);
  if (!ctx) return { openAttachments: () => {} };
  return ctx;
}
