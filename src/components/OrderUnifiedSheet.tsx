import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, RotateCcw, FileText, Ban, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePlanning } from '@/context/PlanningContext';

import { getOrderRegistryStatus, REGISTRY_STATUS_CLASS } from '@/lib/orderRegistry';

import { formatDateFR } from '@/lib/utils';
import PriorityBadge from '@/components/orders/PriorityBadge';
import OrderTrackingSheet from '@/components/OrderTrackingSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useReintegrateOrder } from '@/hooks/useReintegrateOrder';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import { useCancelOrder } from '@/hooks/useCancelOrder';
import { useConfirm } from '@/hooks/use-confirm';
import type { Order, OrderPriority, QCDecision, QualityControlEntry } from '@/types/planning';
import { usePlanningEditor, StepsEditorTable, ResourcesEditorTable, PlanningEditorDialogs } from '@/components/planning/PlanningEditor';

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'info' | 'resources' | 'steps' | 'qc';
  createMode?: boolean;
  initialDraft?: Partial<Order>;
  onCreated?: (order: Order) => void;
}

const TAB_TITLES = {
  info: 'معلومات الطلب والزبون',
  resources: 'تحضير الطلبية والموارد',
  steps: 'مراحل الإنجاز والتوقيت',
  qc: 'مراقبة الجودة والتسليم',
} as const;

const decisionLabels: Record<QCDecision, string> = {
  'conforme': 'مطابق للمواصفات',
  'reprise-retouche': 'إعادة/تعديل',
  'conforme-derogation': 'مطابق للمواصفات بصفة استثنائية',
  'non-conforme': 'غير مطابق للمواصفات',
};

// Sub-component for a single QC entry row — extracted to respect React Hooks rules (no hooks in .map())
interface QCEntryRowProps {
  q: QualityControlEntry;
  onSave: (q: QualityControlEntry, localDate: string, localDecision: QCDecision | '', localNotes: string) => void;
}

const QCEntryRow: React.FC<QCEntryRowProps> = ({ q, onSave }) => {
  const [localDate, setLocalDate] = useState(q.controlDate);
  const [localDecision, setLocalDecision] = useState<QCDecision | ''>(q.decision || '');
  const [localNotes, setLocalNotes] = useState(q.reworkNotes || '');

  return (
    <tr className="border-t">
      <td className="p-2">
        <Input
          type="date"
          value={localDate}
          onChange={e => setLocalDate(e.target.value)}
          className="w-36 text-xs h-8"
        />
      </td>
      <td className="p-2">
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          value={localDecision}
          onChange={e => setLocalDecision(e.target.value as QCDecision)}
        >
          <option value="">— Choisir —</option>
          <option value="conforme">مطابق للمواصفات</option>
          <option value="reprise-retouche">إعادة/تعديل</option>
          <option value="conforme-derogation">مطابق للمواصفات بصفة استثنائية</option>
          <option value="non-conforme">غير مطابق للمواصفات</option>
        </select>
        {localDecision && (
          <span className="block mt-1 text-[10px] text-muted-foreground">
            {decisionLabels[localDecision as QCDecision]}
          </span>
        )}
      </td>
      <td className="p-2">
        <Input
          value={localNotes}
          onChange={e => setLocalNotes(e.target.value)}
          placeholder="ملاحظات..."
          className="text-xs h-8"
        />
      </td>
      <td className="p-2">
        <Button size="sm" variant="outline" onClick={() => onSave(q, localDate, localDecision, localNotes)}>
          حفظ
        </Button>
      </td>
    </tr>
  );
};

const OrderUnifiedSheet: React.FC<Props> = ({ orderId, open, onOpenChange, initialTab = 'info', createMode = false, initialDraft, onCreated }) => {
  const {
    orders, clients, steps,
    productionRecords, qcEntries, deliveryEntries, deliveredOrders,
updateOrder, addOrder, addQCEntry, updateQCEntry, addDeliveryEntry, deleteQCEntry,
    updateDeliveredOrder, addDeliveredOrder, deleteDeliveryEntry,
    absenceOperationId, deleteOrder,
  } = usePlanning();

  const existingOrder = useMemo(() => orders.find(o => o.id === orderId) || null, [orders, orderId]);

  const [tab, setTab] = useState<string>(initialTab);
  const [draft, setDraft] = useState<Partial<Order>>({});
  
  const [printOpen, setPrintOpen] = useState(false);

  const reintegration = useReintegrateOrder();
  const cancelOrder = useCancelOrder();
  const [cancelTarget, setCancelTarget] = useState<boolean>(false);
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setDraft(createMode && initialDraft ? { ...initialDraft } : {});
    }
  }, [open, initialTab, orderId, createMode, initialDraft]);

  // Synthesize the "order" we work with: existing one, or a draft skeleton in create mode.
  const order: Order | null = useMemo(() => {
    if (existingOrder) return existingOrder;
    if (!createMode) return null;
    const today = new Date().toISOString().split('T')[0];
    return {
      id: 'new',
      orderNumber: '',
      orderDate: today,
      clientId: '',
      designation: '',
      quantity: 1,
      priority: 'undetermined',
      plannedDeadline: today,
      materialAvailable: false,
      toolingAvailable: false,
      studyReady: false,
      materialStatus: 'non-disponible',
      toolingStatus: 'non-disponible',
      studyStatus: 'non-disponible',
      ...initialDraft,
    } as Order;
  }, [existingOrder, createMode, initialDraft]);

  const editor = usePlanningEditor(order, open && !createMode);

  if (!order) return null;

  const clientName = clients.find(c => c.id === (draft.clientId ?? order.clientId))?.name || '—';
  const status = createMode
    ? 'قيد الانتظار' as const
    : getOrderRegistryStatus(order, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
  const orderQc = createMode ? [] : qcEntries.filter(q => q.orderId === order.id);
  const orderDelivery = createMode ? [] : deliveryEntries.filter(d => d.orderId === order.id);
  const orderDelivered = createMode ? undefined : deliveredOrders.find(d => d.orderId === order.id);
  const canReintegrate = !createMode && !!(orderQc.length || orderDelivery.length || orderDelivered);

  const merged: Order = { ...order, ...draft };

  const saveInfo = () => {
    if (createMode) {
      if (!merged.orderNumber || !merged.orderNumber.trim()) {
        toast.error('رقم الطلبية مطلوب');
        return;
      }
      const newOrder: Order = { ...merged, id: crypto.randomUUID() };
      addOrder(newOrder);
      onCreated?.(newOrder);
      setDraft({});
      onOpenChange(false);
      toast.success(`تم إنشاء الطلبية ${newOrder.orderNumber}`);
      return;
    }
    if (Object.keys(draft).length === 0) { onOpenChange(false); return; }
    updateOrder({ ...order, ...draft });
    setDraft({});
    toast.success('تم حفظ معلومات الطلبية');
  };

  // QC save handler — handles decision workflow (delivery transfer, rework, etc.)
  const handleQCSave = (
    q: QualityControlEntry,
    localDate: string,
    localDecision: QCDecision | '',
    localNotes: string,
  ) => {
    const controlDate = localDate || new Date().toISOString().split('T')[0];
    if (localDecision && localDecision !== q.decision) {
      if (localDecision === 'conforme' || localDecision === 'conforme-derogation') {
        addDeliveryEntry({
          id: crypto.randomUUID(),
          orderId: q.orderId,
          controlDate,
          decision: localDecision as 'conforme' | 'conforme-derogation',
          movedAt: new Date().toISOString(),
        });
        deleteQCEntry(q.id);
        toast.success('تم نقل الطلبية إلى قائمة التسليم');
      } else {
        updateQCEntry({ ...q, controlDate, decision: localDecision, reworkNotes: localNotes });
        toast.success('تم حفظ قرار مراقبة الجودة');
      }
    } else {
      updateQCEntry({ ...q, controlDate, reworkNotes: localNotes });
      toast.success('تم حفظ سجل مراقبة الجودة');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[794px] h-[1123px] max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0"
          dir="rtl"
        >
          {/* HEADER */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b bg-card">
<div className="flex flex-col gap-1">
  <div className="flex items-start justify-between gap-4">
    <DialogTitle className="text-2xl font-bold">
      {createMode
        ? `إنشاء طلبية جديدة${merged.orderNumber ? ` — ${merged.orderNumber}` : ''}`
        : `بطاقة متابعة إنجاز الطلبية — ${order.orderNumber}`}
    </DialogTitle>
    <div className="flex items-center gap-2 flex-shrink-0">
      {!createMode && (
        <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
          <Printer className="w-4 h-4 ms-1" />
          طباعة البطاقة
        </Button>
      )}
    </div>
  </div>
  {!createMode && (
    <div className="w-full flex flex-col gap-y-1 text-base text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4">
        <span>الزبون: <span className="text-foreground font-bold text-lg">{clientName}</span></span>
        <span>الكمية: <span className="text-foreground font-bold text-lg">{order.quantity}</span></span>
        <PriorityBadge priority={(order.priority || 'undetermined') as OrderPriority} />
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${REGISTRY_STATUS_CLASS[status]}`}>
          {status}
        </span>
      </div>
     <span className="w-full block text-right">
  <span className="text-base font-normal text-muted-foreground">التعيين: </span>
  <span className="text-foreground text-lg font-bold">{order.designation}</span>
</span>
    </div>
  )}
</div>
          </DialogHeader>

          {/* TABS */}
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
            {!createMode && (
              <TabsList className="mx-6 mt-3 grid grid-cols-4">
                <TabsTrigger value="info">{TAB_TITLES.info}</TabsTrigger>
                <TabsTrigger value="resources">{TAB_TITLES.resources}</TabsTrigger>
                <TabsTrigger value="steps">{TAB_TITLES.steps}</TabsTrigger>
                <TabsTrigger value="qc">{TAB_TITLES.qc}</TabsTrigger>
              </TabsList>
            )}

            <div className="flex-1 overflow-auto px-6 py-4">
              {/* TAB 1 — INFO */}
              <TabsContent value="info" className="mt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>رقم الطلبية</Label>
                    <Input
                      value={merged.orderNumber || ''}
                      onChange={e => setDraft(d => ({ ...d, orderNumber: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>تاريخ إستلام الطلبية</Label>
                    <Input
                      type="date"
                      value={merged.orderDate || ''}
                      onChange={e => setDraft(d => ({ ...d, orderDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>الزبون</Label>
                    <Select
                      value={merged.clientId || ''}
                      onValueChange={v => setDraft(d => ({ ...d, clientId: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>ممثل الزبون</Label>
                    <Input
                      value={merged.clientRepresentative || ''}
                      onChange={e => setDraft(d => ({ ...d, clientRepresentative: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>التعيين / Désignation</Label>
                    <Input
                      value={merged.designation || ''}
                      onChange={e => setDraft(d => ({ ...d, designation: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      value={merged.quantity ?? 0}
                      onChange={e => setDraft(d => ({ ...d, quantity: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label>الأولوية</Label>
                    <Select
                      value={merged.priority || 'undetermined'}
                      onValueChange={v => setDraft(d => ({ ...d, priority: v as OrderPriority }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['P1', 'P2', 'P3', 'P4', 'undetermined'] as OrderPriority[]).map(p => (
                          <SelectItem key={p} value={p}>{p === 'undetermined' ? 'غير محدد' : p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>أجل التسليم</Label>
                    <Input
                      type="date"
                      value={merged.deliveryDeadline || merged.plannedDeadline || ''}
                      onChange={e => setDraft(d => ({ ...d, deliveryDeadline: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>مخطط / نموذج</Label>
                    <Select
                      value={merged.drawingModel || ''}
                      onValueChange={v => setDraft(d => ({ ...d, drawingModel: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="مخطط">مخطط</SelectItem>
                        <SelectItem value="نموذج">نموذج</SelectItem>
                        <SelectItem value="مخطط+نموذج">مخطط+نموذج</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات/تعليمات تقنية</Label>
                    <Textarea
                      rows={2}
                      value={merged.instructions || ''}
                      onChange={e => setDraft(d => ({ ...d, instructions: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات</Label>
                    <Textarea
                      rows={2}
                      value={merged.observation || ''}
                      onChange={e => setDraft(d => ({ ...d, observation: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => { setDraft({}); onOpenChange(false); }}>إلغاء</Button>
                  <Button onClick={saveInfo} disabled={!createMode && Object.keys(draft).length === 0}>حفظ</Button>
                </div>
              </TabsContent>

              {/* TAB 2 — RESOURCES (editable in place) */}
              <TabsContent value="resources" className="mt-0 space-y-3">
                <ResourcesEditorTable editor={editor} />
                <p className="text-xs text-muted-foreground">
                  ⓘ كل مرحلة لها مواردها المستقلة. لا تأثير من مرحلة على أخرى.
                </p>
              </TabsContent>

              {/* TAB 3 — STEPS (editable in place, with full planning logic) */}
              <TabsContent value="steps" className="mt-0 space-y-3">
                <StepsEditorTable editor={editor} />
              </TabsContent>

              {/* TAB 4 — QC + DELIVERY */}
              <TabsContent value="qc" className="mt-0 space-y-4">
                <section>
                  <h3 className="font-bold mb-2">سجل مراقبة الجودة</h3>
                  {orderQc.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 border rounded-md text-center">
                      لا يوجد تسجيل لمراقبة الجودة لهذه الطلبية بعد.
                    </p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-right p-2">تاريخ المراقبة</th>
                            <th className="text-right p-2">القرار</th>
                            <th className="text-right p-2">ملاحظات</th>
                            <th className="text-right p-2 w-24">حفظ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderQc.map(q => (
                            <QCEntryRow key={q.id} q={q} onSave={handleQCSave} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="font-bold mb-2">التسليم</h3>
                  {orderDelivered ? (
                    <div className="border rounded-md p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <Label className="text-xs">تاريخ التسليم</Label>
                        <Input
                          type="date"
                          value={orderDelivered.deliveryDate || ''}
                          onChange={e => updateDeliveredOrder({ ...orderDelivered, deliveryDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">رقم الفاتورة</Label>
                        <Input
                          value={orderDelivered.invoiceNumber || ''}
                          onChange={e => updateDeliveredOrder({ ...orderDelivered, invoiceNumber: e.target.value || undefined })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">تاريخ الفاتورة</Label>
                        <Input
                          type="date"
                          value={orderDelivered.invoiceDate || ''}
                          onChange={e => updateDeliveredOrder({ ...orderDelivered, invoiceDate: e.target.value || undefined })}
                        />
                      </div>
                    </div>
                    ) : orderDelivery.length > 0 ? (
                    <div className="border rounded-md p-3 bg-blue-500/5 flex flex-col gap-2">
                      <p className="text-sm">الطلبية جاهزة للتسليم (تاريخ مراقبة الجودة: {formatDateFR(orderDelivery[0].controlDate)}).</p>
                      <div className="flex items-end gap-3">
                        <div>
                          <Label className="text-xs">تاريخ التسليم</Label>
                          <Input
                            type="date"
                            className="h-8 w-40 text-xs"
                            onChange={e => {
                              const date = e.target.value;
                              if (!date) return;
                              const entry = orderDelivery[0];
                              addDeliveredOrder({
                                id: crypto.randomUUID(),
                                orderId: entry.orderId,
                                deliveryDate: date,
                                salePriceStatus: 'non-calcule',
                                observation: undefined,
                              });
                              deleteDeliveryEntry(entry.id);
                              toast.success('تم تسجيل تاريخ التسليم');
                            }}
                          />
                        </div>
                      </div>
                    </div>

Et n'oublie pas d'appliquer aussi les 3 modifications sur DeliveryPage.tsx vues dans le message précédent (supprimer l'en-tête الت
                  ) : (
                    <p className="text-sm text-muted-foreground p-3 border rounded-md text-center">
                      لم يتم تسليم هذه الطلبية بعد.
                    </p>
                  )}
                </section>

                {!orderQc.length && !orderDelivery.length && !orderDelivered && (
                  <div className="border-t pt-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        addQCEntry({ id: crypto.randomUUID(), orderId: order.id, controlDate: today, createdAt: new Date().toISOString() });
                        toast.success('تم إنشاء سجل مراقبة الجودة');
                      }}
                    >
                      <FileText className="w-4 h-4 ms-1" />
                      إنشاء تسجيل مراقبة الجودة
                    </Button>
                  </div>
                )}

                {!createMode && (
                  <div className="border-t pt-4 mt-4 flex gap-3 justify-end">
                    {canReintegrate && (
                      <Button
                        variant="outline"
                        className="text-amber-700 border-amber-300 hover:bg-amber-50 me-auto"
                        onClick={() => reintegration.requestReintegrate(order.id)}
                      >
                        <RotateCcw className="w-4 h-4 ms-1" />
                        إعادة إدماج
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="text-orange-600 border-orange-300 hover:bg-orange-50"
                      onClick={() => setCancelTarget(true)}
                    >
                      <Ban className="w-4 h-4 ms-1" />
                      إلغاء الطلبية
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        confirm(
                          'هل أنت متأكد من محو هذه الطلبية نهائياً؟',
                          () => { deleteOrder(order.id); onOpenChange(false); },
                          { variant: 'destructive' }
                        )
                      }
                    >
                      <Trash2 className="w-4 h-4 ms-1" />
                      محو الطلبية
                    </Button>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Cancel / Delete confirmation dialogs */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        variant={confirmState.variant}
      />

      {cancelTarget && (
        <CancelOrderDialog
          open={cancelTarget}
          onClose={() => setCancelTarget(false)}
          orderLabel={order.orderNumber}
          onConfirm={async (data) => {
            const ok = await cancelOrder(order.id, data);
            if (ok) { setCancelTarget(false); onOpenChange(false); }
          }}
        />
      )}

      {/* Planning editor confirmation dialogs (shared across steps/resources tabs) */}
      <PlanningEditorDialogs editor={editor} order={order} />

      {/* Print sheet (A4) */}
      {printOpen && (
        <OrderTrackingSheet order={order} onClose={() => setPrintOpen(false)} />
      )}

      {/* Reintegration confirmation */}
      <ConfirmDialog
        open={!!reintegration.pending}
        onConfirm={reintegration.confirmReintegrate}
        onCancel={reintegration.cancelReintegrate}
        title="إعادة إدماج الطلبية"
        description={`إعادة إدماج الطلبية ${order.orderNumber} ضمن الطلبيات الحالية مع الحفاظ على سجل المراقبة السابق ؟`}
        confirmLabel="تأكيد"
        cancelLabel="إلغاء"
      />
    </>
  );
};

export default OrderUnifiedSheet;
