import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { usePlanning } from '@/context/PlanningContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuth } from '@/context/AuthContext';
import { useSubFormLock } from '@/components/orders/SubFormLock';
import { formatDateFR } from '@/lib/utils';
import {
  getQCControlled, getQCAccepted, getQCRemaining, getQCPending, isQCForceClosed,
  getDeliveredQty, getDeliverableRemaining, isDeliveryForceClosed, getDeliveryRemaining,
} from '@/lib/orderFlow';
import { Badge } from '@/components/ui/badge';
import SearchableSelect from '@/components/ui/searchable-select';
import type { Order, QCDecision, QualityControlEntry, DeliveredOrder, SalePriceStatus } from '@/types/planning';

const decisionLabels: Record<QCDecision, string> = {
  'conforme': 'مطابق للمواصفات',
  'reprise-retouche': 'إعادة/تعديل',
  'conforme-derogation': 'مطابق للمواصفات بصفة استثنائية',
  'non-conforme': 'غير مطابق للمواصفات',
};

const PRICE_META: Record<SalePriceStatus, { emoji: string; label: string }> = {
  'gratuit': { emoji: '⚪', label: 'Gratuit' },
  'non-calcule': { emoji: '🔴', label: 'Prix non calculé' },
  'non-valide': { emoji: '🟠', label: 'Prix non validé' },
  'valide': { emoji: '🟢', label: 'Prix validé' },
};

interface Props {
  order: Order;
}

const PartialQCDelivery: React.FC<Props> = ({ order }) => {
  const {
    qcEntries, deliveredOrders, deliveryEntries,
    addQCSession, updateQCEntry, deleteQCEntry,
    addDeliveredSession, updateDeliveredOrder, deleteDeliveredOrder,
  } = usePlanning();


  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const { hasAccess } = useAuth();
  const canSaveQc = hasAccess({ tableau: '', formulaire: '', sous_formulaire: 'مراقبة الجودة والتسليم', champ_bouton: 'سجل مراقبة الجودة' }) === 'RW';
  const canAddDelivery = hasAccess({ tableau: '', formulaire: '', sous_formulaire: '', champ_bouton: 'التسليم' }) === 'RW';
  const canDeleteSession = hasAccess({ tableau: '', formulaire: '', sous_formulaire: '', champ_bouton: 'حذف جلسة' }) === 'RW';

  // Per-section RBAC locks (QC and Delivery sub-forms are independent)
  const qcLock = useSubFormLock(canSaveQc);
  const delLock = useSubFormLock(canAddDelivery);

  // Placeholder = auto-created entry with no real session data (no decision, no qty, not force-closed, no pending).
  // It exists only to mark the order as "pending QC" for the QualityControlPage; never displayed here.
  const isPlaceholderQc = (q: QualityControlEntry) =>
    !q.decision && !q.controlledQty && !q.acceptedQty && !q.rejectedQty && !q.forceClosed && !q.pendingQty;
  // A pending row = partial lot sent to QC, awaiting a decision.
  const isPendingQc = (q: QualityControlEntry) =>
    !q.decision && !q.controlledQty && !q.forceClosed && (q.pendingQty ?? 0) > 0;
  const orderQc = useMemo(
    () => qcEntries
      .filter(q => q.orderId === order.id && !isPlaceholderQc(q))
      .sort((a, b) => a.controlDate.localeCompare(b.controlDate)),
    [qcEntries, order.id],
  );
  const placeholderQc = useMemo(
    () => qcEntries.find(q => q.orderId === order.id && isPlaceholderQc(q)),
    [qcEntries, order.id],
  );
  const orderDelivered = useMemo(
    () => deliveredOrders.filter(d => d.orderId === order.id).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)),
    [deliveredOrders, order.id],
  );

  const qty = order.quantity;
  const controlled = getQCControlled(order.id, qcEntries, qty);
  const accepted = getQCAccepted(order.id, qcEntries, qty);
  const pending = getQCPending(order.id, qcEntries);
  const qcRemaining = getQCRemaining(order, qcEntries);
  const qcForceClosed = isQCForceClosed(order.id, qcEntries);

  const shipped = getDeliveredQty(order.id, deliveredOrders, qty);
  const deliverable = getDeliverableRemaining(order, qcEntries, deliveredOrders, deliveryEntries);
  const deliveryRemaining = getDeliveryRemaining(order, deliveredOrders);
  const deliveryForceClosed = isDeliveryForceClosed(order.id, deliveredOrders);

  // ─── New QC session form state ───
  const today = new Date().toISOString().split('T')[0];
  const [showQcForm, setShowQcForm] = useState(false);
  const [qcDate, setQcDate] = useState(today);
  const [qcControlled, setQcControlled] = useState<number>(qcRemaining || qty);
  const [qcAccepted, setQcAccepted] = useState<number>(qcRemaining || qty);
  const [qcDecision, setQcDecision] = useState<QCDecision | ''>('');
  const [qcNotes, setQcNotes] = useState('');
  const [isSubmittingQc, setIsSubmittingQc] = useState(false);
  const [isSubmittingDel, setIsSubmittingDel] = useState(false);

  const hasConformeDecision = orderQc.some(q => q.decision === 'conforme' || q.decision === 'conforme-derogation');

  const openQcForm = () => {
    setQcDate(today);
    setQcControlled(qcRemaining);
    setQcAccepted(qcRemaining);
    setQcDecision('');
    setQcNotes('');
    setShowQcForm(true);
  };

  const submitQcSession = () => {
    if (isSubmittingQc) return;
    if (!qcDecision) { toast.error('اختر القرار'); return; }
    if (qcControlled <= 0 || qcControlled > qcRemaining) {
      toast.error(`الكمية يجب أن تكون بين 1 و ${qcRemaining}`);
      return;
    }
    if (qcAccepted < 0 || qcAccepted > qcControlled) {
      toast.error('الكمية المقبولة غير صحيحة');
      return;
    }
    setIsSubmittingQc(true);
    try {
      const isAcceptDecision = qcDecision === 'conforme' || qcDecision === 'conforme-derogation';
      const acceptedFinal = isAcceptDecision ? qcAccepted : 0;
      addQCSession({
        id: crypto.randomUUID(),
        orderId: order.id,
        controlDate: qcDate,
        decision: qcDecision,
        reworkNotes: qcNotes || undefined,
        controlledQty: qcControlled,
        acceptedQty: acceptedFinal,
        rejectedQty: qcControlled - acceptedFinal,
        createdAt: new Date().toISOString(),
      });
      if (placeholderQc) deleteQCEntry(placeholderQc.id);
      setShowQcForm(false);
      toast.success('تم تسجيل جلسة المراقبة');
    } finally {
      setIsSubmittingQc(false);
    }
  };

  const forceCloseQC = () => {
    confirm(
      `هل تؤكد إقفال CQ يدوياً لهذه الطلبية ؟ (${controlled}/${qty} مراقَب)`,
      () => {
        // Insert a synthetic closing entry so the flag is persisted on a row.
        addQCSession({
          id: crypto.randomUUID(),
          orderId: order.id,
          controlDate: today,
          decision: 'conforme',
          reworkNotes: 'Clôture forcée (administrateur)',
          controlledQty: 0,
          acceptedQty: 0,
          rejectedQty: 0,
          forceClosed: true,
          createdAt: new Date().toISOString(),
        });
        if (placeholderQc) deleteQCEntry(placeholderQc.id);
        toast.success('تم إقفال مراقبة الجودة');
      },
      undefined,
    );
  };

  // ─── New delivery session form state ───
  const [showDelForm, setShowDelForm] = useState(false);
  const [delDate, setDelDate] = useState(today);
  const [delQty, setDelQty] = useState<number>(deliverable || qty);
  const [delInvoice, setDelInvoice] = useState('');
  const [delInvoiceDate, setDelInvoiceDate] = useState('');

  const openDelForm = () => {
    setDelDate(today);
    setDelQty(deliverable);
    setDelInvoice('');
    setDelInvoiceDate('');
    setShowDelForm(true);
  };

  const submitDeliverySession = () => {
    if (isSubmittingDel) return;
    if (delQty <= 0 || delQty > deliverable) {
      toast.error(`الكمية يجب أن تكون بين 1 و ${deliverable}`);
      return;
    }
    setIsSubmittingDel(true);
    try {
      addDeliveredSession({
        id: crypto.randomUUID(),
        orderId: order.id,
        deliveryDate: delDate,
        salePriceStatus: 'non-calcule',
        deliveredQty: delQty,
        invoiceNumber: delInvoice.trim() || undefined,
        invoiceDate: delInvoiceDate || undefined,
      });
      setShowDelForm(false);
      toast.success('تم تسجيل جلسة التسليم');
    } finally {
      setIsSubmittingDel(false);
    }
  };

  const forceCloseDelivery = () => {
    confirm(
      `هل تؤكد إقفال التسليم يدوياً لهذه الطلبية ؟ (${shipped}/${qty} مسلَّم)`,
      () => {
        addDeliveredSession({
          id: crypto.randomUUID(),
          orderId: order.id,
          deliveryDate: today,
          salePriceStatus: 'non-calcule',
          deliveredQty: 0,
          forceClosed: true,
          observation: 'Clôture forcée (administrateur)',
        });
        toast.success('تم إقفال التسليم');
      },
      undefined,
    );
  };

  const askDelete = (label: string, fn: () => void) => {
    confirm(`هل أنت متأكد من حذف ${label} ؟`, fn, { variant: 'destructive' });
  };

  return (
    <>
      {/* ───────── QC SECTION ───────── */}
      <section>
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h3 className="font-bold">سجل مراقبة الجودة</h3>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>الإجمالي: <b className="text-foreground">{qty}</b></span>
            <span>مراقَب: <b className="text-foreground">{controlled}</b></span>
            <span>مقبول: <b className="text-foreground">{accepted}</b></span>
            {pending > 0 && (
              <span>في الانتظار: <b className="text-amber-600">{pending}</b></span>
            )}
            <span>متبقّي: <b className={qcRemaining > 0 ? 'text-amber-600' : 'text-green-600'}>{qcRemaining}</b></span>
            {qcForceClosed && (
              <span className="inline-flex items-center gap-1 text-blue-600">
                <Lock className="w-3 h-3" /> مُقفَل
              </span>
            )}
            <qcLock.EditButton size="sm" />
          </div>
        </div>

        <fieldset disabled={qcLock.locked} className="border-0 p-0 m-0 disabled:opacity-70">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-right p-2">تاريخ المراقبة</th>
                <th className="text-right p-2 w-24">الكمية المراقبة</th>
                <th className="text-right p-2 w-24">الكمية المقبولة</th>
                <th className="text-right p-2">القرار</th>
                <th className="text-right p-2">ملاحظات وتعليمات</th>
                <th className="text-right p-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {orderQc.length === 0 && !showQcForm && (
                <tr>
                  <td colSpan={6} className="p-3 text-center text-muted-foreground text-sm">
                    لا توجد جلسات مراقبة بعد.
                  </td>
                </tr>
              )}
              {orderQc.map(q => {
                const editing = !qcLock.locked && !q.forceClosed;
                const pendingRow = isPendingQc(q);
                const pendingMax = q.pendingQty ?? 0;
                const displayControlled = q.controlledQty ?? (pendingRow ? pendingMax : 0);
                const displayAccepted = q.acceptedQty ?? (pendingRow ? pendingMax : 0);
                return (
                <tr key={q.id} className={`border-t ${pendingRow ? 'bg-amber-50/40' : ''}`}>
                  <td className="p-2">
                    {editing ? (
                      <Input
                        type="date"
                        value={q.controlDate}
                        onChange={e => updateQCEntry({ ...q, controlDate: e.target.value })}
                        className="h-8 text-xs w-36"
                      />
                    ) : formatDateFR(q.controlDate)}
                  </td>
                  <td className="p-2 text-center">
                    {editing ? (
                      <Input
                        type="number" min={0} max={pendingRow ? pendingMax : undefined}
                        value={displayControlled}
                        onChange={e => {
                          let v = Math.max(0, parseInt(e.target.value) || 0);
                          if (pendingRow) v = Math.min(v, pendingMax);
                          updateQCEntry({ ...q, controlledQty: v });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    ) : (q.controlledQty ?? qty)}
                  </td>
                  <td className="p-2 text-center">
                    {editing ? (
                      <Input
                        type="number" min={0}
                        value={displayAccepted}
                        onChange={e => {
                          const accepted = Math.max(0, parseInt(e.target.value) || 0);
                          const ctrl = q.controlledQty ?? (pendingRow ? pendingMax : 0);
                          updateQCEntry({ ...q, acceptedQty: accepted, rejectedQty: Math.max(0, ctrl - accepted) });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    ) : (q.acceptedQty ?? (q.decision === 'conforme' || q.decision === 'conforme-derogation' ? qty : 0))}
                  </td>
                  <td className="p-2 text-xs">
                    {pendingRow && (
                      <Badge variant="outline" className="me-2 border-amber-400 text-amber-700 bg-amber-50">
                        في انتظار المراقبة ({pendingMax})
                      </Badge>
                    )}
                    {editing ? (
                      <SearchableSelect
                        className="w-full mt-1 h-8 text-xs px-2 py-1.5"
                        value={q.decision || ''}
                        onValueChange={v => updateQCEntry({ ...q, decision: (v || undefined) as QCDecision | undefined })}
                        placeholder="—"
                        options={[
                          { value: '', label: '—' },
                          { value: 'conforme', label: 'مطابق للمواصفات' },
                          { value: 'reprise-retouche', label: 'إعادة/تعديل' },
                          { value: 'conforme-derogation', label: 'مطابق للمواصفات بصفة استثنائية' },
                          { value: 'non-conforme', label: 'غير مطابق للمواصفات' },
                        ]}
                      />
                    ) : (q.decision ? decisionLabels[q.decision] : '—')}
                  </td>
                  <td className="p-2 text-xs">
                    <Input
                      value={q.reworkNotes || ''}
                      onChange={e => updateQCEntry({ ...q, reworkNotes: e.target.value || undefined })}
                      placeholder="..."
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    {(canDeleteSession || pendingRow) && (
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          const title = pendingRow
                            ? `هل تؤكد حذف اللوت في انتظار المراقبة بتاريخ ${formatDateFR(q.controlDate)} (الكمية: ${pendingMax}) ؟`
                            : `هل تؤكد حذف جلسة المراقبة بتاريخ ${formatDateFR(q.controlDate)} (المراقَب: ${q.controlledQty ?? qty}) ؟`;
                          confirm(title, () => { deleteQCEntry(q.id); toast.success('تم الحذف'); }, { variant: 'destructive' });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
                );
              })}
              {showQcForm && (
                <tr className="border-t bg-primary/5">
                  <td className="p-2">
                    <Input type="date" value={qcDate} onChange={e => setQcDate(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="p-2">
                    <Input type="number" min={1} max={qcRemaining}
                      value={qcControlled}
                      onChange={e => setQcControlled(Math.max(0, parseInt(e.target.value) || 0))}
                      className="h-8 text-xs text-center" />
                  </td>
                  <td className="p-2">
                    <Input type="number" min={0} max={qcControlled}
                      value={qcAccepted}
                      onChange={e => setQcAccepted(Math.max(0, parseInt(e.target.value) || 0))}
                      className="h-8 text-xs text-center" />
                  </td>
                  <td className="p-2">
                    <SearchableSelect
                      className="w-full h-8 text-xs px-2 py-1.5"
                      value={qcDecision}
                      onValueChange={v => setQcDecision(v as QCDecision)}
                      placeholder="— Choisir —"
                      options={[
                        { value: '', label: '— Choisir —' },
                        { value: 'conforme', label: 'مطابق للمواصفات' },
                        { value: 'reprise-retouche', label: 'إعادة/تعديل' },
                        { value: 'conforme-derogation', label: 'مطابق للمواصفات بصفة استثنائية' },
                        { value: 'non-conforme', label: 'غير مطابق للمواصفات' },
                      ]}
                    />
                  </td>
                  <td className="p-2">
                    <Input value={qcNotes} onChange={e => setQcNotes(e.target.value)} placeholder="ملاحظات..." className="h-8 text-xs" />
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => { submitQcSession(); qcLock.lock(); }} disabled={isSubmittingQc}>حفظ</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowQcForm(false)}>إلغاء</Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex gap-2 justify-end">
          {qcRemaining > 0 && !qcForceClosed && !showQcForm && canSaveQc && (
            <Button size="sm" variant="outline" onClick={openQcForm}>
              <Plus className="w-4 h-4 ms-1" />
              إضافة مراقبة جودة
            </Button>
          )}
          {qcRemaining > 0 && !qcForceClosed && canForceCloseQc && (
            <Button size="sm" variant="outline" className="text-blue-700 border-blue-300" onClick={forceCloseQC}>
              <Lock className="w-4 h-4 ms-1" />
              إقفال CQ يدوياً
            </Button>
          )}
        </div>
        </fieldset>
      </section>


      {/* ───────── DELIVERY SECTION ───────── */}
      <section className="mt-4">
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h3 className="font-bold">سجل التسليم</h3>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>مقبول من CQ: <b className="text-foreground">{accepted}</b></span>
            <span>مسلَّم: <b className="text-foreground">{shipped}</b></span>
            <span>جاهز للتسليم: <b className={deliverable > 0 ? 'text-amber-600' : 'text-foreground'}>{deliverable}</b></span>
            <span>متبقّي: <b className={deliveryRemaining > 0 ? 'text-amber-600' : 'text-green-600'}>{deliveryRemaining}</b></span>
            {deliveryForceClosed && (
              <span className="inline-flex items-center gap-1 text-blue-600">
                <Lock className="w-3 h-3" /> مُقفَل
              </span>
            )}
            <delLock.EditButton size="sm" />
          </div>
        </div>

        <fieldset disabled={delLock.locked} className="border-0 p-0 m-0 disabled:opacity-70">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-right p-2">تاريخ التسليم</th>
                <th className="text-right p-2 w-24">الكمية المسلَّمة</th>
                <th className="text-right p-2">رقم الفاتورة</th>
                <th className="text-right p-2">تاريخ الفاتورة</th>
                <th className="text-right p-2">ثمن البيع</th>
                <th className="text-right p-2">ملاحظات وتعليمات</th>
                <th className="text-right p-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {orderDelivered.length === 0 && !showDelForm && (
                <tr>
                  <td colSpan={7} className="p-3 text-center text-muted-foreground text-sm">
                    لا توجد جلسات تسليم بعد.
                  </td>
                </tr>
              )}
              {orderDelivered.map(d => (
                <tr key={d.id} className={`border-t ${d.forceClosed ? 'bg-blue-50/40' : ''}`}>
                  <td className="p-2">
                    <Input
                      type="date"
                      value={d.deliveryDate}
                      onChange={e => updateDeliveredOrder({ ...d, deliveryDate: e.target.value })}
                      className="h-8 text-xs w-36"
                    />
                  </td>
                  <td className="p-2 text-center">
                    {d.forceClosed ? (
                      <span className="text-xs italic text-blue-600">إقفال</span>
                    ) : !delLock.locked ? (
                      <Input
                        type="number" min={0}
                        value={d.deliveredQty ?? 0}
                        onChange={e => updateDeliveredOrder({ ...d, deliveredQty: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="h-8 text-xs text-center"
                      />
                    ) : (d.deliveredQty ?? qty)}
                  </td>
                  <td className="p-2">
                    <Input
                      value={d.invoiceNumber || ''}
                      onChange={e => updateDeliveredOrder({ ...d, invoiceNumber: e.target.value || undefined })}
                      placeholder="—"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="date"
                      value={d.invoiceDate || ''}
                      onChange={e => updateDeliveredOrder({ ...d, invoiceDate: e.target.value || undefined })}
                      className="h-8 text-xs w-36"
                    />
                  </td>
                  <td className="p-2 text-xs">
                    {!delLock.locked && !d.forceClosed ? (
                      <SearchableSelect
                        className="w-full h-8 text-xs px-2 py-1.5"
                        value={d.salePriceStatus}
                        onValueChange={v => updateDeliveredOrder({ ...d, salePriceStatus: v as SalePriceStatus })}
                        options={[
                          { value: 'gratuit', label: '⚪ Gratuit' },
                          { value: 'non-calcule', label: '🔴 Prix non calculé' },
                          { value: 'non-valide', label: '🟠 Prix non validé' },
                          { value: 'valide', label: '🟢 Prix validé' },
                        ]}
                      />
                    ) : (<>{PRICE_META[d.salePriceStatus].emoji} {PRICE_META[d.salePriceStatus].label}</>)}
                  </td>
                  <td className="p-2">
                    <Input
                      value={d.observation || ''}
                      onChange={e => updateDeliveredOrder({ ...d, observation: e.target.value || undefined })}
                      placeholder="..."
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    {canDeleteSession && (
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => confirm(`هل تؤكد حذف جلسة التسليم بتاريخ ${formatDateFR(d.deliveryDate)} (الكمية: ${d.deliveredQty ?? qty}) ؟`, () => { deleteDeliveredOrder(d.id); toast.success('تم الحذف'); }, { variant: 'destructive' })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {showDelForm && (
                <tr className="border-t bg-primary/5">
                  <td className="p-2">
                    <Input type="date" value={delDate} onChange={e => setDelDate(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="p-2">
                    <Input type="number" min={1} max={deliverable}
                      value={delQty}
                      onChange={e => setDelQty(Math.max(0, parseInt(e.target.value) || 0))}
                      className="h-8 text-xs text-center" />
                  </td>
                  <td className="p-2">
                    <Input value={delInvoice} onChange={e => setDelInvoice(e.target.value)} placeholder="—" className="h-8 text-xs" />
                  </td>
                  <td className="p-2">
                    <Input type="date" value={delInvoiceDate} onChange={e => setDelInvoiceDate(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">—</td>
                  <td className="p-2 text-xs text-muted-foreground">—</td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => { submitDeliverySession(); delLock.lock(); }} disabled={isSubmittingDel}>حفظ</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowDelForm(false)}>إلغاء</Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex gap-2 justify-end items-center">
          {deliverable > 0 && !deliveryForceClosed && !hasConformeDecision && (
            <span className="text-xs text-amber-600 me-auto">
              لا يمكن التسليم قبل الحصول على قرار مطابقة من مراقبة الجودة
            </span>
          )}
          {deliverable > 0 && !deliveryForceClosed && !showDelForm && hasConformeDecision && canAddDelivery && (
            <Button size="sm" variant="outline" onClick={openDelForm}>
              <Plus className="w-4 h-4 ms-1" />
              إضافة تسليم
            </Button>
          )}
          {deliveryRemaining > 0 && !deliveryForceClosed && canForceCloseDelivery && (
            <Button size="sm" variant="outline" className="text-blue-700 border-blue-300" onClick={forceCloseDelivery}>
              <Lock className="w-4 h-4 ms-1" />
              إقفال التسليم يدوياً
            </Button>
          )}
        </div>
        </fieldset>
      </section>


      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        variant={confirmState.variant}
      />
    </>
  );
};

export default PartialQCDelivery;
