import React, { useRef, useState } from 'react';
import { Download, Eye, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { useOrderItemPurchases, useStockSupplierId } from '@/hooks/useMaterialReferences';
import {
  openPurchaseFile,
  usePurchaseFiles,
  useUploadPurchaseFiles,
} from '@/hooks/usePurchaseDocuments';
import type { PurchaseFile } from '@/hooks/usePurchaseDocuments';

/** Même droit que les prix d'achat matière (rights_catalog n° 30). */
const PURCHASE_RIGHT = { tableau: 'أسعار شراء المواد الأولية' };

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR') : '');

interface DialogProps {
  purchaseId: string;
  title: string;
  subtitle: string;
  canUpload: boolean;
  onClose: () => void;
}

const PurchaseDocumentsDialog: React.FC<DialogProps> = ({ purchaseId, title, subtitle, canUpload, onClose }) => {
  const files = usePurchaseFiles(purchaseId);
  const upload = useUploadPurchaseFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const list = files.data ?? [];

  const handleFiles = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    try {
      const res = await upload.mutateAsync({ purchaseId, files: Array.from(picked) });
      if (res.ok > 0) toast.success(`تم رفع ${res.ok} ملف`);
      res.failed.forEach(name => toast.error(`تعذر رفع الملف: ${name}`));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openFile = async (f: PurchaseFile, download: boolean) => {
    if (!(await openPurchaseFile(f, download))) toast.error('تعذر فتح الملف');
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm whitespace-normal break-words">{title}</DialogTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {files.isLoading && <p className="text-xs text-muted-foreground">جاري التحميل...</p>}
        {files.isError && <p className="text-xs text-destructive">تعذر تحميل الملفات المرفقة</p>}
        {!files.isLoading && !files.isError && list.length === 0 && (
          <p className="text-xs text-muted-foreground">لا توجد وثائق مرفقة لهذه الفاتورة.</p>
        )}

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {list.map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded-md border p-2">
              <FileText className="w-6 h-6 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-xs truncate" title={f.fileName}>{f.fileName}</span>
              <Button type="button" size="icon" variant="ghost" title="عرض" onClick={() => void openFile(f, false)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" title="تحميل" onClick={() => void openFile(f, true)}>
                <Download className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {canUpload && (
          <div>
            <Input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => void handleFiles(e.target.files)}
              disabled={upload.isPending}
            />
            <Button type="button" size="sm" variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
              <Upload className="w-4 h-4 ms-1" />
              {upload.isPending ? 'جاري الرفع...' : 'إضافة ملفات'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface Props {
  /** id de la ligne matière/composant (ResourceItem.id) */
  orderItemId?: string;
  className?: string;
}

/**
 * Titres cliquables (N° de facture / BL) des sources d'achat d'une ligne : un lien par source, qui ouvre
 * les pièces jointes de l'achat. Les sources « Stock magasin » n'ont pas de pièce d'achat et sont ignorées.
 * N'affiche rien sans droit de lecture.
 */
const PurchaseDocumentLinks: React.FC<Props> = ({ orderItemId, className }) => {
  const { hasAccess } = useAuth();
  const level = hasAccess(PURCHASE_RIGHT);
  const purchases = useOrderItemPurchases(level === 'denied' ? null : (orderItemId ?? null));
  const stockQ = useStockSupplierId();
  const [openId, setOpenId] = useState<string | null>(null);

  const stockId = stockQ.data ?? null;
  const sources = (purchases.data ?? []).filter(p => !(stockId && p.supplierId === stockId));
  if (level === 'denied' || sources.length === 0) return null;

  const current = sources.find(p => p.purchaseId === openId);
  const titleOf = (ref: string | null) => ref?.trim() || 'فاتورة / BL';

  return (
    <>
      <div className={cn('flex flex-wrap gap-x-3 gap-y-0.5', className)}>
        {sources.map(p => (
          <button
            key={p.purchaseId}
            type="button"
            className="inline-flex max-w-full items-center gap-1 text-[11px] text-primary hover:underline"
            title="عرض الفاتورة / وصل التسليم المرفق"
            onClick={e => { e.stopPropagation(); setOpenId(p.purchaseId); }}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{titleOf(p.documentRef)}</span>
          </button>
        ))}
      </div>
      {current && (
        <PurchaseDocumentsDialog
          purchaseId={current.purchaseId}
          title={titleOf(current.documentRef)}
          subtitle={[current.supplierName, fmtDate(current.date)].filter(Boolean).join(' — ')}
          canUpload={level === 'RW'}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
};

export default PurchaseDocumentLinks;
