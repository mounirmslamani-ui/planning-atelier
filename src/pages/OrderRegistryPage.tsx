import React, { useMemo, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import { useCancelOrder } from '@/hooks/useCancelOrder';
import PriorityBadge from '@/components/orders/PriorityBadge';
import type { Order, OrderCategory } from '@/types/planning';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import { generateOrderCode, getOrderRegistryStatus, REGISTRY_STATUS_CLASS } from '@/lib/orderRegistry';
import { computeLastSeriesNumbers } from '@/lib/lastSeriesNumbers';
import { getExportFilename } from '@/lib/excelExport';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import DesignationCell from '@/components/DesignationCell';

const CATEGORIES: OrderCategory[] = ['fabrication', 'prestation', 'divers', 'slamani'];


const OrderRegistryPage: React.FC = () => {
  const {
    orders, clients, addOrder, updateOrder,
    qcEntries, deliveryEntries, deliveredOrders, productionRecords, steps,
    absenceOrderId, absenceOperationId,
    cancelledOrders, deleteCancelledOrder,
  } = usePlanning();
  const cancelOrder = useCancelOrder();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');
  const [search, setSearch] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [unifiedOrderId, setUnifiedOrderId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<Partial<Order> | null>(null);

  const realOrders = useMemo(
    () => orders.filter(o => o.id !== absenceOrderId),
    [orders, absenceOrderId],
  );

  const cancelledMap = useMemo(() => {
    const m = new Map<string, typeof cancelledOrders[number]>();
    cancelledOrders.forEach(c => m.set(c.orderId, c));
    return m;
  }, [cancelledOrders]);


  const deliveredMap = useMemo(() => {
    const m = new Map<string, typeof deliveredOrders[number]>();
    deliveredOrders.forEach(d => m.set(d.orderId, d));
    return m;
  }, [deliveredOrders]);

  const qcMap = useMemo(() => {
    const m = new Map<string, string>();
    qcEntries.forEach(q => m.set(q.orderId, q.controlDate));
    return m;
  }, [qcEntries]);

  const inferCategoryFromNumber = useCallback((num: string): OrderCategory | null => {
    const m = (num || '').match(/^\d{2}\/([A-Za-z]?)\d+$/);
    if (!m) return null;
    const p = m[1].toUpperCase();
    if (p === 'F') return 'fabrication';
    if (p === 'P') return 'prestation';
    if (p === 'S') return 'slamani';
    if (p === '') return 'divers';
    return null;
  }, []);

  const filteredByCat = useMemo(() => {
    return realOrders.filter(o => {
      const cat = o.category || inferCategoryFromNumber(o.orderNumber) || 'fabrication';
      return cat === activeCat;
    });
  }, [realOrders, activeCat, inferCategoryFromNumber]);

  const baseList = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const list = lower
      ? filteredByCat.filter(o =>
          o.orderNumber.toLowerCase().includes(lower) ||
          (o.designation || '').toLowerCase().includes(lower) ||
          (clients.find(c => c.id === o.clientId)?.name || '').toLowerCase().includes(lower))
      : filteredByCat;
    return [...list].sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'fr', { numeric: true }));
  }, [filteredByCat, search, clients]);

  const accessors = useMemo(() => ({
    orderNumber: (o: Order) => o.orderNumber,
    orderDate: (o: Order) => o.orderDate,
    clientName: (o: Order) => clients.find(c => c.id === o.clientId)?.name || '',
    designation: (o: Order) => o.designation,
    quantity: (o: Order) => o.quantity,
    priority: (o: Order) => o.priority || '',
    clientRepresentative: (o: Order) => o.clientRepresentative || '',
    observation: (o: Order) => o.observation || o.instructions || '',
    status: (o: Order) => cancelledMap.has(o.id)
      ? 'ملغاة'
      : getOrderRegistryStatus(o, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId),
    deliveryDeadline: (o: Order) => o.deliveryDeadline || o.plannedDeadline || '',
    drawingModel: (o: Order) => o.drawingModel || '',
    qcDate: (o: Order) => qcMap.get(o.id) || '',
    deliveryDate: (o: Order) => deliveredMap.get(o.id)?.deliveryDate || '',
    invoiceDate: (o: Order) => deliveredMap.get(o.id)?.invoiceDate || '',
    invoiceNumber: (o: Order) => deliveredMap.get(o.id)?.invoiceNumber || '',
  }), [clients, cancelledMap, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId, qcMap, deliveredMap]);

  const { processed: displayed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(baseList, accessors);

  const allValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    (Object.keys(accessors) as (keyof typeof accessors)[]).forEach(k => {
      map[k as string] = [...new Set(baseList.map(o => {
        const v = accessors[k](o); return v == null ? '' : String(v);
      }).filter(Boolean))].sort();
    });
    return map;
  }, [baseList, accessors]);



  const handleAdd = () => {
    const code = generateOrderCode(activeCat, realOrders);
    const today = new Date().toISOString().split('T')[0];
    setCreateDraft({
      orderNumber: code,
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
      category: activeCat,
    });
  };


  const lastSeriesNumbers = useMemo(() => computeLastSeriesNumbers(realOrders), [realOrders]);

  const handleExportExcel = useCallback(() => {
    const rows = displayed.map(o => {
      const status = getOrderRegistryStatus(o, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
      const delivered = deliveredMap.get(o.id);
      return {
        'رقم الطلبية': o.orderNumber,
        'التاريخ': formatDateFR(o.orderDate),
        'الزبون': clients.find(c => c.id === o.clientId)?.name || '',
        'التعيين': o.designation,
        'الكمية': o.quantity,
        'الأولوية': o.priority || '',
        'ممثل الزبون': o.clientRepresentative || '',
        'ملاحظات/تعليمات': o.instructions || o.observation || '',
        'الحالة': status,
        'أجل التسليم': formatDateFR(o.deliveryDeadline || o.plannedDeadline),
        'مخطط/نموذج': o.drawingModel || '',
        'تاريخ مراقبة الجودة': qcMap.get(o.id) ? formatDateFR(qcMap.get(o.id)!) : '',
        'تاريخ التسليم': delivered ? formatDateFR(delivered.deliveryDate) : '',
        'تاريخ الفوترة': delivered?.invoiceNumber ? formatDateFR(delivered.deliveryDate) : '',
        'رقم الفاتورة': delivered?.invoiceNumber || '',
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, ORDER_CATEGORY_LABEL[activeCat]);
    XLSX.writeFile(wb, getExportFilename(`Registre_${ORDER_CATEGORY_LABEL[activeCat]}`));
  }, [displayed, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId, deliveredMap, qcMap, clients, activeCat]);


  return (
   <div className="p-6 space-y-4">
      <PageHeader title="سجل الطلبيات" description="السجل الكامل للطلبيات (4 فئات)" />



      <Tabs value={activeCat} onValueChange={v => setActiveCat(v as OrderCategory)}>
<div className="flex flex-wrap items-center gap-2 mb-2">
   <div className="flex-1" />
  <Button onClick={handleAdd} size="sm"><Plus className="w-4 h-4 mr-1" /> <span className="font-bold">إضافة طلبية</span></Button>
    <Button size="sm" variant="outline" onClick={handleExportExcel}><Download className="w-4 h-4 ml-1" />تصدير Excel</Button>
</div>

<div className="flex justify-end mb-2">
  <TabsList>
    {CATEGORIES.map(c => (
      <TabsTrigger key={c} value={c}>
        {ORDER_CATEGORY_LABEL[c]}
        <span className="mr-2 text-xs font-medium">
          ({c === 'fabrication' ? lastSeriesNumbers.lastF
            : c === 'prestation' ? lastSeriesNumbers.lastP
            : c === 'slamani' ? lastSeriesNumbers.lastS
            : lastSeriesNumbers.lastNum})
        </span>
      </TabsTrigger>
    ))}
  </TabsList>
</div>

{CATEGORIES.map(c => (
  <TabsContent key={c} value={c} className="mt-4 space-y-3">

            <div className="border rounded-lg overflow-auto" dir="rtl">
              <table className="w-full caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs w-px whitespace-nowrap"><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.orderNumber} /></TableHead>
                    <TableHead className="text-xs w-px whitespace-nowrap"><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} allValues={allValuesByKey.orderDate} /></TableHead>
                    <TableHead className="text-xs w-px whitespace-nowrap"><ColumnHeader label="الزبون" columnKey="clientName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientName || ''} onFilter={handleFilter} allValues={allValuesByKey.clientName} /></TableHead>
                    <TableHead className="text-xs" style={{ minWidth: 200 }}><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} allValues={allValuesByKey.designation} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} allValues={allValuesByKey.quantity} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} allValues={allValuesByKey.priority} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="أجل التسليم" columnKey="deliveryDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDeadline || ''} onFilter={handleFilter} allValues={allValuesByKey.deliveryDeadline} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="ممثل الزبون" columnKey="clientRepresentative" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientRepresentative || ''} onFilter={handleFilter} allValues={allValuesByKey.clientRepresentative} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="مخطط/نموذج" columnKey="drawingModel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.drawingModel || ''} onFilter={handleFilter} allValues={allValuesByKey.drawingModel} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="ملاحظات/تعليمات تقنية" columnKey="observation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.observation || ''} onFilter={handleFilter} allValues={allValuesByKey.observation} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="متابعة تقدم إنجاز الطلبية" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.status || ''} onFilter={handleFilter} allValues={allValuesByKey.status} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="تاريخ مراقبة الجودة" columnKey="qcDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.qcDate || ''} onFilter={handleFilter} allValues={allValuesByKey.qcDate} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="تاريخ التسليم" columnKey="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDate || ''} onFilter={handleFilter} allValues={allValuesByKey.deliveryDate} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="تاريخ الفوترة" columnKey="invoiceDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.invoiceDate || ''} onFilter={handleFilter} allValues={allValuesByKey.invoiceDate} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="رقم الفاتورة" columnKey="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.invoiceNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.invoiceNumber} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-sm text-muted-foreground py-8">لا توجد طلبيات</TableCell>
                    </TableRow>
                  )}
                  {displayed.map(o => {
                    const isCancelled = cancelledMap.has(o.id);
                    const status: any = isCancelled ? 'ملغاة' : getOrderRegistryStatus(o, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
                    const statusClass = isCancelled
                      ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : (REGISTRY_STATUS_CLASS as any)[status] || '';
                    const delivered = deliveredMap.get(o.id);
                    return (
                      <TableRow key={o.id} className={isCancelled ? 'opacity-60' : ''}>
                        <TableCell className="w-px whitespace-nowrap">
                          <button
                            type="button"
                            className="text-sm font-heading underline-offset-2 hover:underline text-primary"
                            title="فتح بطاقة متابعة الطلبية"
                            onClick={() => setUnifiedOrderId(o.id)}
                          >
                            {o.orderNumber}
                          </button>
                        </TableCell>
                        <TableCell className="w-px whitespace-nowrap"><span className="text-xs">{o.orderDate ? formatDateFR(o.orderDate) : '—'}</span></TableCell>
                        <TableCell className="w-px whitespace-nowrap"><span className="text-sm">{clients.find(cl => cl.id === o.clientId)?.name || '—'}</span></TableCell>
                        <TableCell style={{ minWidth: 200 }}><DesignationCell orderId={o.id} designation={o.designation || '—'} className="text-sm whitespace-normal break-words block" /></TableCell>
                        <TableCell><span className="text-sm">{o.quantity ?? '—'}</span></TableCell>
                        <TableCell><PriorityBadge priority={o.priority} /></TableCell>
                        <TableCell><span className="text-xs">{o.deliveryDeadline || o.plannedDeadline ? formatDateFR(o.deliveryDeadline || o.plannedDeadline) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{o.clientRepresentative || '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{o.drawingModel || '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{o.observation || o.instructions || '—'}</span></TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                            {status}
                          </span>
                        </TableCell>
                        <TableCell><span className="text-xs">{qcMap.get(o.id) ? formatDateFR(qcMap.get(o.id)!) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{delivered?.deliveryDate ? formatDateFR(delivered.deliveryDate) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{delivered?.invoiceDate ? formatDateFR(delivered.invoiceDate) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{delivered?.invoiceNumber || '—'}</span></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <CancelOrderDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (data) => {
          if (!cancelTarget) return;
          const ok = await cancelOrder(cancelTarget.id, data);
          if (ok) setCancelTarget(null);
        }}
        orderLabel={cancelTarget?.orderNumber || ''}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <OrderUnifiedSheet
        orderId={unifiedOrderId}
        open={!!unifiedOrderId}
        onOpenChange={(open) => { if (!open) setUnifiedOrderId(null); }}
      />

      <OrderUnifiedSheet
        orderId={null}
        open={!!createDraft}
        onOpenChange={(open) => { if (!open) setCreateDraft(null); }}
        createMode
        initialDraft={createDraft || undefined}
        onCreated={() => setCreateDraft(null)}
      />
    </div>
  );
};

export default OrderRegistryPage;
