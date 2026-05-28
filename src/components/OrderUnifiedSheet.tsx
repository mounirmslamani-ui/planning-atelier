import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, RotateCcw, Settings2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { usePlanning } from '@/context/PlanningContext';
import { computeLastSeriesNumbers } from '@/lib/lastSeriesNumbers';
import { getOrderRegistryStatus, REGISTRY_STATUS_CLASS } from '@/lib/orderRegistry';
import { getOrderProductionSteps, getStepProgressStatus } from '@/lib/stepProgress';
import { formatDateFR } from '@/lib/utils';
import PriorityBadge from '@/components/orders/PriorityBadge';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import OrderTrackingSheet from '@/components/OrderTrackingSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useReintegrateOrder } from '@/hooks/useReintegrateOrder';
import type { Order, OrderPriority } from '@/types/planning';

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

const OrderUnifiedSheet: React.FC<Props> = ({ orderId, open, onOpenChange, initialTab = 'info', createMode = false, initialDraft, onCreated }) => {
  const {
    orders, clients, steps, operators, subcontractors, operations,
    productionRecords, qcEntries, deliveryEntries, deliveredOrders,
    updateOrder, addOrder, addQCEntry, updateDeliveredOrder, addDeliveredOrder,
    absenceOperationId,
  } = usePlanning();

  const existingOrder = useMemo(() => orders.find(o => o.id === orderId) || null, [orders, orderId]);

  const [tab, setTab] = useState<string>(initialTab);
  const [draft, setDraft] = useState<Partial<Order>>({});
  const [planningOpen, setPlanningOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const reintegration = useReintegrateOrder();

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

  if (!order) return null;

  const clientName = clients.find(c => c.id === (draft.clientId ?? order.clientId))?.name || '—';
  const status = createMode
    ? 'قيد الانتظار' as const
    : getOrderRegistryStatus(order, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
  const orderSteps = createMode ? [] : getOrderProductionSteps(order.id, steps, absenceOperationId);
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-[1100px] w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0"
          dir="rtl"
        >
          {/* HEADER */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b bg-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-bold">
                  بطاقة متابعة إنجاز الطلبية — {order.orderNumber}
                </DialogTitle>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>الزبون: <span className="text-foreground font-semibold">{clientName}</span></span>
                  <span>التعيين: <span className="text-foreground">{order.designation}</span></span>
                  <span>الكمية: <span className="text-foreground font-bold">{order.quantity}</span></span>
                  <PriorityBadge priority={(order.priority || 'undetermined') as OrderPriority} />
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${REGISTRY_STATUS_CLASS[status]}`}>
                    {status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canReintegrate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => reintegration.requestReintegrate(order.id)}
                  >
                    <RotateCcw className="w-4 h-4 ms-1" />
                    إعادة إدماج
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
                  <Printer className="w-4 h-4 ms-1" />
                  طباعة البطاقة
                </Button>
              </div>
            </div>

            {/* Compteurs séries */}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { k: 'lastF', label: 'Fabrication (aa/Fxxx)' },
                { k: 'lastP', label: 'Prestation (aa/Pxxx)' },
                { k: 'lastS', label: 'SLAMANI (aa/Sxxx)' },
                { k: 'lastNum', label: 'Divers (aa/xxx)' },
              ].map(({ k, label }) => (
                <div key={k} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="font-mono font-bold text-sm">{(lastSeries as any)[k] || '—'}</div>
                </div>
              ))}
            </div>
          </DialogHeader>

          {/* TABS */}
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-6 mt-3 grid grid-cols-4">
              <TabsTrigger value="info">{TAB_TITLES.info}</TabsTrigger>
              <TabsTrigger value="resources">{TAB_TITLES.resources}</TabsTrigger>
              <TabsTrigger value="steps">{TAB_TITLES.steps}</TabsTrigger>
              <TabsTrigger value="qc">{TAB_TITLES.qc}</TabsTrigger>
            </TabsList>

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
                    <Label>تاريخ الاستلام</Label>
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
                    <Input
                      value={merged.drawingModel || ''}
                      onChange={e => setDraft(d => ({ ...d, drawingModel: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>تعليمات</Label>
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
                  <Button variant="outline" onClick={() => { setDraft({}); onOpenChange(false); }}>إغلاق</Button>
                  <Button onClick={saveInfo} disabled={Object.keys(draft).length === 0}>حفظ</Button>
                </div>
              </TabsContent>

              {/* TAB 2 — RESOURCES */}
              <TabsContent value="resources" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">حالة الموارد لكل مرحلة</h3>
                  <Button size="sm" onClick={() => setPlanningOpen(true)}>
                    <Settings2 className="w-4 h-4 ms-1" />
                    تحرير الموارد والمراحل
                  </Button>
                </div>
                {orderSteps.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                    لا توجد مراحل معرفة بعد. استخدم زر «تحرير الموارد والمراحل» لإضافتها.
                  </p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-right p-2 w-8">#</th>
                          <th className="text-right p-2">العملية</th>
                          <th className="text-right p-2">المادة الأولية</th>
                          <th className="text-right p-2">العدة / خابور</th>
                          <th className="text-right p-2">الدراسة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderSteps.map((s, i) => {
                          const op = operations.find(o => o.id === s.operationId)?.name || '';
                          const tag = (st?: string) => {
                            const color = st === 'disponible' ? 'bg-green-500/15 text-green-700 border-green-500/30'
                              : st === 'partiel' ? 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30'
                              : st === 'non-applicable' ? 'bg-muted text-muted-foreground border-muted-foreground/30'
                              : 'bg-red-500/15 text-red-700 border-red-500/30';
                            return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${color}`}>{st || 'non-disponible'}</span>;
                          };
                          return (
                            <tr key={s.id} className="border-t">
                              <td className="p-2">{i + 1}</td>
                              <td className="p-2 font-medium">{op}</td>
                              <td className="p-2">{tag(s.materialStatus)}</td>
                              <td className="p-2">{tag(s.toolingStatus)}</td>
                              <td className="p-2">{tag(s.studyStatus)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  ⓘ كل مرحلة لها مواردها المستقلة. لا تأثير من مرحلة على أخرى.
                </p>
              </TabsContent>

              {/* TAB 3 — STEPS */}
              <TabsContent value="steps" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">مراحل الإنجاز ({orderSteps.length})</h3>
                  <Button size="sm" onClick={() => setPlanningOpen(true)}>
                    <Settings2 className="w-4 h-4 ms-1" />
                    تحرير المراحل والتخطيط
                  </Button>
                </div>
                {orderSteps.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                    لا توجد مراحل بعد.
                  </p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-right p-2 w-10">#</th>
                          <th className="text-right p-2">العملية</th>
                          <th className="text-right p-2">العامل / المناول</th>
                          <th className="text-right p-2">المدة المقدرة</th>
                          <th className="text-right p-2">البداية</th>
                          <th className="text-right p-2">النهاية</th>
                          <th className="text-right p-2">متابعة تقدم إنجاز الطلبية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderSteps.map((s, i) => {
                          const op = operations.find(o => o.id === s.operationId)?.name || '';
                          const worker = s.subcontractorId
                            ? subcontractors.find(sc => sc.id === s.subcontractorId)?.companyName
                            : operators.find(o => o.id === s.operatorId)?.name;
                          const st = getStepProgressStatus(s, productionRecords);
                          const stCls = st === 'Terminée' ? 'text-green-700' : st === 'En cours' ? 'text-blue-700' : 'text-muted-foreground';
                          const stLabel = st === 'Terminée' ? 'منتهية' : st === 'En cours' ? 'قيد الإنجاز' : 'لم تبدأ';
                          const h = Math.floor(s.estimatedDuration / 60);
                          const m = s.estimatedDuration % 60;
                          return (
                            <tr key={s.id} className="border-t">
                              <td className="p-2">{i + 1}</td>
                              <td className="p-2 font-medium">{op}</td>
                              <td className="p-2">{worker || '—'}</td>
                              <td className="p-2 font-mono">{h}h{String(m).padStart(2, '0')}</td>
                              <td className="p-2 text-xs">{s.startDate ? formatDateFR(s.startDate) : '—'} {s.startTime}</td>
                              <td className="p-2 text-xs">{s.endDate ? formatDateFR(s.endDate) : '—'} {s.endTime}</td>
                              <td className={`p-2 font-bold ${stCls}`}>{stLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
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
                          </tr>
                        </thead>
                        <tbody>
                          {orderQc.map(q => (
                            <tr key={q.id} className="border-t">
                              <td className="p-2">{formatDateFR(q.controlDate)}</td>
                              <td className="p-2 font-semibold">{q.decision || '—'}</td>
                              <td className="p-2">{q.reworkNotes || '—'}</td>
                            </tr>
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
                    <p className="text-sm border rounded-md p-3 bg-blue-500/5">
                      الطلبية في قائمة الانتظار للتسليم (تاريخ التحريك: {formatDateFR(orderDelivery[0].controlDate)}).
                    </p>
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
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Nested existing planning dialog — preserves all complex CRUD logic */}
      {planningOpen && (
        <OrderPlanningDialog
          order={order}
          open={planningOpen}
          onOpenChange={setPlanningOpen}
        />
      )}

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
