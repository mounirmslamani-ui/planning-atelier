import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Printer, Search, AlertCircle } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { getOrderProductionSteps, getStepProgressStatus } from '@/lib/stepProgress';
import type { ResourceStatus } from '@/types/planning';

interface OrderReportDialogProps {
  open: boolean;
  onClose: () => void;
}

const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
};

const statusIndicator = (status?: ResourceStatus): { label: string; color: string } => {
  switch (status) {
    case 'disponible':
      return { label: 'متوفر', color: 'bg-green-500' };
    case 'partiel':
      return { label: 'جزئي', color: 'bg-orange-500' };
    case 'non-applicable':
      return { label: 'غير معني', color: 'bg-gray-400' };
    case 'non-disponible':
    default:
      return { label: 'غير متوفر', color: 'bg-red-500' };
  }
};

const qcDecisionLabel = (decision?: string): string => {
  switch (decision) {
    case 'conforme': return 'مطابق للمواصفات';
    case 'conforme-derogation': return 'مطابق للمواصفات بصفة استثنائية';
    case 'reprise-retouche': return 'إعادة / تعديل';
    case 'non-conforme': return 'غير مطابق';
    default: return '—';
  }
};

const OrderReportDialog: React.FC<OrderReportDialogProps> = ({ open, onClose }) => {
  const planning = usePlanning();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const result = useMemo(() => {
    if (!submitted) return null;
    const target = submitted.trim().toLowerCase();
    const order = planning.orders.find(
      o => o.orderNumber.trim().toLowerCase() === target && o.orderNumber !== 'ABS'
    );
    if (!order) return { found: false as const };

    const client = planning.clients.find(c => c.id === order.clientId);
    const orderSteps = getOrderProductionSteps(order.id, planning.steps, planning.absenceOperationId);
    const records = planning.productionRecords.filter(r => r.orderId === order.id);
    const qcAll = planning.qcEntries
      .filter(q => q.orderId === order.id)
      .sort((a, b) => (a.controlDate || '').localeCompare(b.controlDate || ''));
    const qcFirst = qcAll[0];
    const qcSecond = qcAll[1];
    const delivered = planning.deliveredOrders.find(d => d.orderId === order.id);
    const deliveryEntry = planning.deliveryEntries.find(d => d.orderId === order.id);

    // Global status
    let globalStatus = 'قيد الانتظار';
    if (delivered?.invoiceNumber) globalStatus = 'مفوترة';
    else if (delivered) globalStatus = 'مسلمة في انتظار الفوترة';
    else if (deliveryEntry) globalStatus = 'جاهزة للتسليم';
    else if (qcAll.length > 0) globalStatus = 'منتهية في انتظار مراقبة الجودة';
    else if (orderSteps.length > 0) {
      const allDone = orderSteps.every(s => getStepProgressStatus(s, records) === 'Terminée');
      const anyStarted = orderSteps.some(s => getStepProgressStatus(s, records) !== 'Non entamée');
      if (allDone) globalStatus = 'منتهية في انتظار مراقبة الجودة';
      else if (anyStarted) globalStatus = 'قيد الإنجاز';
    }

    // Aggregated needs from steps
    const materialNeeds = Array.from(new Set(orderSteps.flatMap(s => (s.rawMaterialItems || []).map(i => i.label))));
    const toolingNeeds = Array.from(new Set(orderSteps.flatMap(s => (s.specialToolingItems || []).map(i => i.label))));
    const subcontractingSteps = orderSteps.filter(s => s.subcontractorId);

    // Production rows: split by "before first QC" (initial) vs "after first QC" (rework)
    const firstQcAt = qcFirst?.createdAt || qcFirst?.controlDate;
    const productionRows = orderSteps.filter(s => !s.subcontractorId).map(step => {
      const op = planning.operators.find(o => o.id === step.operatorId);
      const operation = planning.operations.find(o => o.id === step.operationId);
      const stepRecords = records.filter(r => r.stepId === step.id);
      const actualMin = stepRecords.reduce((sum, r) => sum + (r.actualDuration || 0), 0);
      const nonBillableH = stepRecords.reduce((sum, r) => sum + (r.nonBillableHours || 0), 0);
      const billableH = stepRecords.reduce(
        (sum, r) => sum + (r.billableHours ?? ((r.actualDuration || 0) / 60)),
        0
      );
      const isPostFirstQC = !!firstQcAt && !!step.startDate && step.startDate > (firstQcAt.split('T')[0] || '');
      return {
        step,
        operatorName: op?.name || '—',
        operationName: operation?.name || '—',
        allocatedH: ((step.estimatedDuration || 0) / 60).toFixed(2),
        actualH: (actualMin / 60).toFixed(2),
        nonBillableH: nonBillableH.toFixed(2),
        billableH: billableH.toFixed(2),
        hasDeduction: nonBillableH > 0,
        isPostFirstQC,
      };
    });
    const initialProduction = productionRows.filter(r => !r.isPostFirstQC);
    const reworkProduction = productionRows.filter(r => r.isPostFirstQC);

    const totalActualH = records.reduce((s, r) => s + (r.actualDuration || 0), 0) / 60;
    const totalNonBillableH = records.reduce((s, r) => s + (r.nonBillableHours || 0), 0);
    const totalBillableH = records.reduce(
      (s, r) => s + (r.billableHours ?? ((r.actualDuration || 0) / 60)),
      0
    );

    return {
      found: true as const,
      order, client, orderSteps, records,
      qcFirst, qcSecond, delivered, deliveryEntry,
      globalStatus, materialNeeds, toolingNeeds, subcontractingSteps,
      initialProduction, reworkProduction,
      totalActualH, totalNonBillableH, totalBillableH,
    };
  }, [submitted, planning]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(search);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    setSearch('');
    setSubmitted('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-none print:shadow-none print:border-0">
        <DialogHeader className="print:hidden">
          <DialogTitle className="text-xl font-bold">تقرير الوضعية</DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="flex gap-2 print:hidden">
          <Input
            placeholder="رقم الطلبية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-right"
            dir="rtl"
            autoFocus
          />
          <Button type="submit" className="gap-2">
            <Search className="w-4 h-4" /> بحث
          </Button>
        </form>

        {/* Results */}
        {result && !result.found && (
          <div className="flex items-center gap-3 p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>رقم الطلبية غير موجود.</span>
          </div>
        )}

        {result?.found && (
          <div id="order-report-printable" className="space-y-5" dir="rtl">
            {/* Print button */}
            <div className="flex justify-between items-center print:hidden">
              <h2 className="text-lg font-bold">
                تقرير الطلبية: {result.order.orderNumber}
              </h2>
              <Button onClick={handlePrint} variant="outline" className="gap-2">
                <Printer className="w-4 h-4" /> طباعة PDF
              </Button>
            </div>

            {/* Header (visible in print) */}
            <div className="hidden print:block border-b pb-2 mb-3">
              <h1 className="text-2xl font-bold">تقرير وضعية الطلبية</h1>
            </div>

            {/* Order info */}
            <section className="grid grid-cols-2 gap-3 p-3 rounded-md border bg-muted/30">
              <div><strong>رقم الطلبية:</strong> {result.order.orderNumber}</div>
              <div><strong>الزبون:</strong> {result.client?.name || '—'}</div>
              <div><strong>التعيين:</strong> {result.order.designation}</div>
              <div><strong>الكمية:</strong> {result.order.quantity}</div>
              <div><strong>تاريخ الطلبية:</strong> {formatDate(result.order.orderDate)}</div>
              <div><strong>الأجل المتوقع:</strong> {formatDate(result.order.plannedDeadline)}</div>
            </section>

            {/* Global status */}
            <section className="p-3 rounded-md border-2 border-primary bg-primary/5">
              <div className="text-sm text-muted-foreground mb-1">الوضعية العامة</div>
              <div className="text-xl font-bold text-primary">{result.globalStatus}</div>
            </section>

            {/* Étude */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">الدراسة</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-3 h-3 rounded-full ${statusIndicator(result.order.studyStatus).color}`} />
                  <span>{result.order.studyStatus === 'disponible' ? 'منتهية' : 'غير منتهية'}</span>
                </div>
                <div><strong>تاريخ الإنهاء:</strong> {
                  formatDate(result.orderSteps.find(s => s.studyCompletedDate)?.studyCompletedDate)
                }</div>
              </div>
            </section>

            {/* Matière première */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">المادة الأولية</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-3 h-3 rounded-full ${statusIndicator(result.order.materialStatus).color}`} />
                  <span>{statusIndicator(result.order.materialStatus).label}</span>
                  <span className="ms-4"><strong>تاريخ الشراء:</strong> {formatDate(result.order.materialReceivedDate)}</span>
                </div>
                <div>
                  <strong>الاحتياجات:</strong>{' '}
                  {result.materialNeeds.length > 0 ? result.materialNeeds.join('، ') : '—'}
                </div>
              </div>
            </section>

            {/* Outillage */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">العدة</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-3 h-3 rounded-full ${statusIndicator(result.order.toolingStatus).color}`} />
                  <span>{statusIndicator(result.order.toolingStatus).label}</span>
                  <span className="ms-4"><strong>تاريخ الشراء:</strong> {
                    formatDate(result.orderSteps.find(s => s.toolingReceivedDate)?.toolingReceivedDate)
                  }</span>
                </div>
                <div>
                  <strong>الاحتياجات:</strong>{' '}
                  {result.toolingNeeds.length > 0 ? result.toolingNeeds.join('، ') : '—'}
                </div>
              </div>
            </section>

            {/* Sous-traitance */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">المناولة</h3>
              {result.subcontractingSteps.length === 0 ? (
                <div className="text-sm text-muted-foreground">لا توجد عمليات مناولة.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-1">العملية</th>
                      <th className="text-right p-1">المناول</th>
                      <th className="text-right p-1">الوضعية</th>
                      <th className="text-right p-1">تاريخ الاستلام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.subcontractingSteps.map(s => {
                      const sub = planning.subcontractors.find(x => x.id === s.subcontractorId);
                      const op = planning.operations.find(o => o.id === s.operationId);
                      return (
                        <tr key={s.id} className="border-b">
                          <td className="p-1">{op?.name || '—'}</td>
                          <td className="p-1">{sub?.companyName || '—'}</td>
                          <td className="p-1">{s.subcontractingDone ? 'منتهية' : 'قيد الانجاز'}</td>
                          <td className="p-1">{formatDate(s.subcontractingReceivedDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* Production initiale */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">الإنتاج (المراحل الأولية)</h3>
              {result.initialProduction.length === 0 ? (
                <div className="text-sm text-muted-foreground">لا توجد مراحل.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right p-1">العملية</th>
                      <th className="text-right p-1">العامل</th>
                      <th className="text-right p-1">المدة المخصصة (سا)</th>
                       <th className="text-right p-1">المدة المستهلكة (سا)</th>
                       <th className="text-right p-1">المستقطعة (سا)</th>
                       <th className="text-right p-1">القابلة للفوترة (سا)</th>
                       <th className="text-right p-1">متابعة تقدم إنجاز الطلبية</th>
                     </tr>
                   </thead>
                   <tbody>
                     {result.initialProduction.map(row => (
                       <tr key={row.step.id} className="border-b">
                         <td className="p-1">{row.operationName}</td>
                         <td className="p-1">{row.operatorName}</td>
                         <td className="p-1">{row.allocatedH}</td>
                         <td className="p-1">{row.actualH}</td>
                         <td className="p-1">
                           {row.hasDeduction ? (
                             <span className="rounded px-1.5 py-0.5 text-xs bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
                               {row.nonBillableH}
                             </span>
                           ) : '0.00'}
                         </td>
                         <td className="p-1 font-medium">{row.billableH}</td>
                         <td className="p-1">{getStepProgressStatus(row.step, result.records)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               )}
             </section>

             {/* Synthèse facturation */}
             <section className="p-3 rounded-md border">
               <h3 className="font-bold mb-2 border-b pb-1">حصيلة الساعات والفوترة</h3>
               <div className="grid grid-cols-3 gap-2 text-sm">
                 <div className="p-2 rounded-md bg-muted/40">
                   <div className="text-xs text-muted-foreground">المدة المستهلكة</div>
                   <div className="font-bold">{result.totalActualH.toFixed(2)} سا</div>
                 </div>
                 <div className="p-2 rounded-md bg-orange-100 dark:bg-orange-950/30">
                   <div className="text-xs text-orange-900 dark:text-orange-200">الساعات المستقطعة</div>
                   <div className="font-bold text-orange-900 dark:text-orange-200">{result.totalNonBillableH.toFixed(2)} سا</div>
                 </div>
                 <div className="p-2 rounded-md bg-muted/40">
                   <div className="text-xs text-muted-foreground">الساعات القابلة للفوترة</div>
                   <div className="font-bold">{result.totalBillableH.toFixed(2)} سا</div>
                 </div>
               </div>
             </section>


            {/* QC 1 */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">مراقبة الجودة (1)</h3>
              {!result.qcFirst ? (
                <div className="text-sm text-muted-foreground">لم يتم بعد.</div>
              ) : (
                <div className="text-sm space-y-1">
                  <div><strong>تاريخ المراقبة:</strong> {formatDate(result.qcFirst.controlDate)}</div>
                  <div><strong>القرار:</strong> {qcDecisionLabel(result.qcFirst.decision)}</div>
                  {result.qcFirst.reworkNotes && (
                    <div><strong>ملاحظات:</strong> {result.qcFirst.reworkNotes}</div>
                  )}
                </div>
              )}
            </section>

            {/* Cycle correction */}
            {(result.reworkProduction.length > 0 || result.qcSecond) && (
              <section className="p-3 rounded-md border-2 border-orange-400 bg-orange-50/50 dark:bg-orange-950/20">
                <h3 className="font-bold mb-2 border-b pb-1">دورة التعديل / الإعادة</h3>
                {result.qcFirst?.reworkNotes && (
                  <div className="text-sm mb-2">
                    <strong>الاحتياجات:</strong> {result.qcFirst.reworkNotes}
                  </div>
                )}
                {result.reworkProduction.length > 0 && (
                  <table className="w-full text-sm mb-2">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-right p-1">العملية</th>
                        <th className="text-right p-1">العامل</th>
                        <th className="text-right p-1">المدة المخصصة (سا)</th>
                        <th className="text-right p-1">المدة المستهلكة (سا)</th>
                        <th className="text-right p-1">المستقطعة (سا)</th>
                        <th className="text-right p-1">القابلة للفوترة (سا)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.reworkProduction.map(row => (
                        <tr key={row.step.id} className="border-b">
                          <td className="p-1">{row.operationName}</td>
                          <td className="p-1">{row.operatorName}</td>
                          <td className="p-1">{row.allocatedH}</td>
                          <td className="p-1">{row.actualH}</td>
                          <td className="p-1">
                            {row.hasDeduction ? (
                              <span className="rounded px-1.5 py-0.5 text-xs bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
                                {row.nonBillableH}
                              </span>
                            ) : '0.00'}
                          </td>
                          <td className="p-1 font-medium">{row.billableH}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {result.qcSecond && (
                  <div className="text-sm space-y-1 border-t pt-2">
                    <div className="font-bold">مراقبة الجودة (2)</div>
                    <div><strong>التاريخ:</strong> {formatDate(result.qcSecond.controlDate)}</div>
                    <div><strong>القرار:</strong> {qcDecisionLabel(result.qcSecond.decision)}</div>
                  </div>
                )}
              </section>
            )}

            {/* Logistique */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">اللوجستيك (التسليم)</h3>
              <div className="text-sm space-y-1">
                <div>
                  <strong>متابعة تقدم إنجاز الطلبية:</strong>{' '}
                  {result.delivered ? 'مسلمة' : result.deliveryEntry ? 'جاهزة للتسليم' : 'غير جاهزة'}
                </div>
                {result.delivered && (
                  <div><strong>تاريخ التسليم:</strong> {formatDate(result.delivered.deliveryDate)}</div>
                )}
              </div>
            </section>

            {/* Finance */}
            <section className="p-3 rounded-md border">
              <h3 className="font-bold mb-2 border-b pb-1">الفوترة</h3>
              <div className="text-sm space-y-1">
                <div>
                  <strong>متابعة تقدم إنجاز الطلبية:</strong>{' '}
                  {result.delivered?.invoiceNumber ? 'مفوترة' : result.delivered ? 'في انتظار الفوترة' : '—'}
                </div>
                {result.delivered?.invoiceNumber && (
                  <div><strong>رقم الفاتورة:</strong> {result.delivered.invoiceNumber}</div>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderReportDialog;
