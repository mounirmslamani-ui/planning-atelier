import React, { useMemo } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { getOrderGlobalStatus } from '@/lib/stepProgress';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import type { Order, SalePriceStatus, OrderCategory } from '@/types/planning';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import { cn } from '@/lib/utils';
import { isReintegratedOrder } from '@/lib/reintegration';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { TC_LEVELS, TC_LONG, tcShort } from '@/lib/technicalComplexity';

const OPERATOR_COLUMNS = [
  'عادل', 'محمود العيشي', 'بلال', 'محمود بن قيطون', 'عبد الرزاق',
  'حمزة', 'عمر', 'صالح', 'ياسين', 'معاذ', 'يوسف', 'معالجة حرارية', 'عبد النور',
];

function formatMinutesToHM(minutes: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  return `${h}h${mm}`;
}

const STATUS_LABELS: Record<string, string> = {
  'delivered-pending-invoice': 'مسلمة (في انتظار الفوترة)',
  'ready-for-delivery': 'جاهزة للتسليم',
  'awaiting-qc': 'في انتظار مراقبة الجودة',
  'in-progress': 'قيد الإنجاز',
  'on-hold': 'قيد الانتظار',
  'p4': 'P4 - معلقة',
};

function getSeriesPrefix(orderNumber: string): string {
  const m = orderNumber.match(/[FP]/i);
  return m ? m[0].toUpperCase() : 'Z';
}
function getYearKey(orderNumber: string): string {
  const m = orderNumber.match(/(\d{2})\s*\//);
  return m ? m[1] : '99';
}

type DeliveryKey = 'delivered' | 'ready-for-delivery' | 'awaiting-qc' | 'in-progress' | 'on-hold';
type PriceKey = SalePriceStatus;

const DELIVERY_BUTTONS: { key: DeliveryKey; label: string }[] = [
  { key: 'delivered', label: 'مسلمة' },
  { key: 'ready-for-delivery', label: 'جاهزة للتسليم' },
  { key: 'awaiting-qc', label: 'في انتظار مراقبة الجودة' },
  { key: 'in-progress', label: 'طلبيات في طور الإنجاز' },
  { key: 'on-hold', label: 'طلبيات قيد الانتظار' },
];

const PRICE_BUTTONS: { key: PriceKey; label: string }[] = [
  { key: 'gratuit', label: 'مجانا' },
  { key: 'non-calcule', label: 'ثمن غير محسوب' },
  { key: 'non-valide', label: 'ثمن غير مصادق عليه' },
  { key: 'valide', label: 'ثمن مصادق عليه' },
];

const PRICE_LABELS: Record<SalePriceStatus, string> = {
  'gratuit': 'مجانا',
  'non-calcule': 'ثمن غير محسوب',
  'non-valide': 'ثمن غير مصادق عليه',
  'valide': 'ثمن مصادق عليه',
};

type Row = {
  order: Order;
  clientName: string;
  statusLabel: string;
  deliveryDateOrProgress: string;
  series: string;
  deliveryKey: DeliveryKey;
  priceStatus: PriceKey;
};

const PendingInvoicingPage: React.FC = () => {
  const {
    orders, clients, operators, steps, productionRecords,
    deliveredOrders, deliveryEntries, qcEntries,
    absenceOperationId, absenceOrderId,
  } = usePlanning();

  const [deliveryFilter, setDeliveryFilter] = React.useState<Set<DeliveryKey>>(
    () => new Set(DELIVERY_BUTTONS.map(b => b.key))
  );
  const [priceFilter, setPriceFilter] = React.useState<Set<PriceKey>>(
    () => new Set(PRICE_BUTTONS.map(b => b.key))
  );
  const [activeCat, setActiveCat] = React.useState<Extract<OrderCategory, 'fabrication' | 'prestation'>>('fabrication');

  const allDeliveryActive = deliveryFilter.size === DELIVERY_BUTTONS.length;
  const allPriceActive = priceFilter.size === PRICE_BUTTONS.length;

  const toggleDelivery = (k: DeliveryKey) => {
    setDeliveryFilter(prev => {
      const next = new Set(prev);
      if (next.size === DELIVERY_BUTTONS.length) return new Set([k]);
      if (next.has(k)) next.delete(k); else next.add(k);
      if (next.size === 0) return new Set(DELIVERY_BUTTONS.map(b => b.key));
      return next;
    });
  };
  const togglePrice = (k: PriceKey) => {
    setPriceFilter(prev => {
      const next = new Set(prev);
      if (next.size === PRICE_BUTTONS.length) return new Set([k]);
      if (next.has(k)) next.delete(k); else next.add(k);
      if (next.size === 0) return new Set(PRICE_BUTTONS.map(b => b.key));
      return next;
    });
  };
  const selectAllDelivery = () => setDeliveryFilter(new Set(DELIVERY_BUTTONS.map(b => b.key)));
  const selectAllPrice = () => setPriceFilter(new Set(PRICE_BUTTONS.map(b => b.key)));

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '—';

  const rows = useMemo<Row[]>(() => {
    const deliveredById = new Map(deliveredOrders.map(d => [d.orderId, d]));
    const deliveryReadyIds = new Set(deliveryEntries.map(d => d.orderId));
    const qcIds = new Set(qcEntries.map(q => q.orderId));
    const result: Row[] = [];

    for (const order of orders) {
      if (order.id === absenceOrderId) continue;
      if (isReintegratedOrder(order)) continue;
      const delivered = deliveredById.get(order.id);
      let statusLabel = '';
      let deliveryDateOrProgress = '';
      let deliveryKey: DeliveryKey;
      let priceStatus: PriceKey = 'non-calcule';

      if (delivered) {
        if (delivered.invoiceNumber) continue;
        statusLabel = STATUS_LABELS['delivered-pending-invoice'];
        deliveryDateOrProgress = formatDateFR(delivered.deliveryDate);
        deliveryKey = 'delivered';
        priceStatus = delivered.salePriceStatus;
      } else if (deliveryReadyIds.has(order.id)) {
        statusLabel = STATUS_LABELS['ready-for-delivery'];
        deliveryDateOrProgress = '—';
        deliveryKey = 'ready-for-delivery';
      } else if (qcIds.has(order.id)) {
        statusLabel = STATUS_LABELS['awaiting-qc'];
        deliveryDateOrProgress = '—';
        deliveryKey = 'awaiting-qc';
      } else {
        const globalStatus = getOrderGlobalStatus(order.id, steps, productionRecords, absenceOperationId);
        if (globalStatus === 'En cours') {
          statusLabel = STATUS_LABELS['in-progress'];
          deliveryDateOrProgress = 'قيد الإنجاز';
          deliveryKey = 'in-progress';
        } else if (globalStatus === 'En attente') {
          if (order.priority === 'P4') {
            statusLabel = STATUS_LABELS['p4'];
            deliveryDateOrProgress = 'معلقة';
          } else {
            statusLabel = STATUS_LABELS['on-hold'];
            deliveryDateOrProgress = 'قيد الانتظار';
          }
          deliveryKey = 'on-hold';
        } else {
          continue;
        }
      }

      result.push({
        order,
        clientName: getClientName(order.clientId),
        statusLabel,
        deliveryDateOrProgress,
        series: getSeriesPrefix(order.orderNumber),
        deliveryKey,
        priceStatus,
      });
    }
    return result;
  }, [orders, deliveredOrders, deliveryEntries, qcEntries, steps, productionRecords, absenceOperationId, absenceOrderId, clients]);

  const buttonFilteredRows = useMemo(
    () => rows.filter(r =>
      deliveryFilter.has(r.deliveryKey) &&
      priceFilter.has(r.priceStatus) &&
      inferCategoryFromOrderNumber(r.order.orderNumber) === activeCat
    ),
    [rows, deliveryFilter, priceFilter, activeCat]
  );

  const catCount = (cat: 'fabrication' | 'prestation') =>
    rows.filter(r => inferCategoryFromOrderNumber(r.order.orderNumber) === cat).length;

  const accessors = useMemo(() => ({
    orderNumber: (r: Row) => r.order.orderNumber,
    orderDate: (r: Row) => r.order.orderDate,
    clientName: (r: Row) => r.clientName,
    designation: (r: Row) => r.order.designation,
    quantity: (r: Row) => r.order.quantity,
    clientRepresentative: (r: Row) => r.order.clientRepresentative || '',
    priority: (r: Row) => r.order.priority || '',
    complexity: (r: Row) => r.order.technicalComplexity || '',
    deliveryDeadline: (r: Row) => r.order.deliveryDeadline || '',
    statusLabel: (r: Row) => r.statusLabel,
    priceStatus: (r: Row) => r.priceStatus,
  }), []);

  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } =
    useTableSortFilter<Row>(buttonFilteredRows, accessors);

  const allValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    (Object.keys(accessors) as (keyof typeof accessors)[]).forEach(k => {
      map[k as string] = [...new Set(buttonFilteredRows.map(r => {
        const v = accessors[k](r); return v == null ? '' : String(v);
      }).filter(Boolean))].sort();
    });
    return map;
  }, [buttonFilteredRows, accessors]);

  const isFilteredOrSorted = sortKey !== null || Object.values(filters).some(Boolean);

  const grouped = useMemo(() => {
    const byClient = new Map<string, Row[]>();
    for (const item of processed) {
      const key = item.order.clientId || '__no_client__';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(item);
    }
    const groups: { clientId: string; clientName: string; series: { prefix: string; rows: Row[] }[] }[] = [];
    const sortedClientIds = [...byClient.keys()].sort((a, b) => getClientName(a).localeCompare(getClientName(b)));
    for (const clientId of sortedClientIds) {
      const items = byClient.get(clientId)!;
      const bySeries = new Map<string, Row[]>();
      for (const it of items) {
        if (!bySeries.has(it.series)) bySeries.set(it.series, []);
        bySeries.get(it.series)!.push(it);
      }
      const series = [...bySeries.keys()].sort().map(prefix => ({
        prefix,
        rows: bySeries.get(prefix)!.sort((a, b) => {
          const ya = getYearKey(a.order.orderNumber);
          const yb = getYearKey(b.order.orderNumber);
          if (ya !== yb) return ya.localeCompare(yb);
          return a.order.orderNumber.localeCompare(b.order.orderNumber);
        }),
      }));
      groups.push({ clientId, clientName: getClientName(clientId), series });
    }
    return groups;
  }, [processed, clients]);

  const operatorIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of operators) map.set(op.name.trim(), op.id);
    return map;
  }, [operators]);

  const operatorIdsForOrder = (orderId: string): Set<string> => {
    const ids = new Set<string>();
    for (const s of steps) {
      if (s.orderId !== orderId) continue;
      if (s.operationId === absenceOperationId) continue;
      if (s.operatorId) ids.add(s.operatorId);
    }
    return ids;
  };

  const operatorDurationForOrder = (orderId: string, operatorId: string): number => {
    let total = 0;
    for (const s of steps) {
      if (s.orderId !== orderId) continue;
      if (s.operatorId !== operatorId) continue;
      if (s.operationId === absenceOperationId) continue;
      total += s.estimatedDuration || 0;
    }
    return total;
  };

  const orderHasSubcontracting = (orderId: string): boolean =>
    steps.some(s => s.orderId === orderId && !!s.subcontractorId);
  const orderHasHeatTreatment = (orderId: string): boolean =>
    steps.some(s => s.orderId === orderId && (s.specialToolingNeeds || []).some(n => /حرار|trait|heat/i.test(n)));
  const rawMaterialsForOrder = (orderId: string): string => {
    const mats = new Set<string>();
    for (const s of steps) {
      if (s.orderId !== orderId) continue;
      (s.rawMaterialNeeds || []).forEach(m => mats.add(m));
    }
    return [...mats].join(', ') || '—';
  };

  const handleExportExcel = () => {
    const exportRows: Record<string, string | number>[] = [];
    for (const group of grouped) {
      for (const serie of group.series) {
        for (const { order, statusLabel, deliveryDateOrProgress, priceStatus } of serie.rows) {
          const opIds = operatorIdsForOrder(order.id);
          const row: Record<string, string | number> = {
            'الزبون': group.clientName,
            'السلسلة': serie.prefix,
            'رقم الطلبية': order.orderNumber,
            'التاريخ': formatDateFR(order.orderDate),
            'التعيين': order.designation,
            'الكمية': order.quantity,
            'ممثل الزبون': order.clientRepresentative || '—',
            'الأولوية': order.priority || '—',
            'مستوى التعقيد التقني': TC_LONG[order.technicalComplexity || ''] || '—',
            'أجل التسليم': order.deliveryDeadline ? formatDateFR(order.deliveryDeadline) : '—',
            'تاريخ التسليم/تقدم الأشغال': `${statusLabel} — ${deliveryDateOrProgress}`,
            'ثمن البيع': PRICE_LABELS[priceStatus],
          };
          for (const opName of OPERATOR_COLUMNS) {
            const opId = operatorIdByName.get(opName);
            row[opName] = opId && opIds.has(opId) ? opName : '';
          }
          row['معالجة حرارية'] = orderHasHeatTreatment(order.id) ? 'نعم' : '';
          row['مناولة'] = orderHasSubcontracting(order.id) ? 'نعم' : '';
          
          exportRows.push(row);
        }
      }
    }
    exportTableToExcel('Commandes non facturées', exportRows);
  };

  const totalRows = processed.length;
  // 10 base cols + operators + 2 (heat/subc)
  const totalCols = 11 + OPERATOR_COLUMNS.length + 2;

  const deliveredByOrderId = useMemo(
    () => new Map(deliveredOrders.map(d => [d.orderId, d])),
    [deliveredOrders]
  );

  const renderDataRow = (row: Row, clientNameOverride?: string) => {
    const { order, statusLabel, deliveryDateOrProgress, priceStatus } = row;
    const clientName = clientNameOverride ?? row.clientName;
    const opIds = operatorIdsForOrder(order.id);
    const delivered = deliveredByOrderId.get(order.id);

    return (
      <TableRow key={order.id}>
        <TableCell className="font-heading text-sm whitespace-nowrap">
          <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} />
        </TableCell>
        <TableCell className="text-xs whitespace-nowrap">{formatDateFR(order.orderDate)}</TableCell>
        <TableCell className="text-sm whitespace-nowrap">{clientName}</TableCell>
        <TableCell className="text-sm" style={{ minWidth: 200 }}>
          <DesignationCell orderId={order.id} designation={order.designation} className="text-sm whitespace-normal break-words block" />
        </TableCell>
        <TableCell className="text-sm text-center">{order.quantity}</TableCell>
        <TableCell><PriorityBadge priority={order.priority} className="" /></TableCell>
        <TableCell className="text-xs whitespace-nowrap text-center" title={TC_LONG[order.technicalComplexity || ''] || ''}>{tcShort(order.technicalComplexity)}</TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {order.deliveryDeadline ? formatDateFR(order.deliveryDeadline) : '—'}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">{order.clientRepresentative || '—'}</TableCell>
        <TableCell className="text-xs whitespace-nowrap">
          <span className="text-muted-foreground">{statusLabel}</span>
          <br />
          <span className="font-medium">{deliveryDateOrProgress}</span>
        </TableCell>
        <TableCell className="text-xs whitespace-nowrap">
          {delivered ? (
            <span className="font-medium">{PRICE_LABELS[priceStatus]}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        {OPERATOR_COLUMNS.map(name => {
          const opId = operatorIdByName.get(name);
          const totalMinutes = opId ? operatorDurationForOrder(order.id, opId) : 0;
          return (
            <TableCell key={name} className="text-xs text-center">
              {totalMinutes > 0 ? <span className="font-medium text-primary">{formatMinutesToHM(totalMinutes)}</span> : ''}
            </TableCell>
          );
        })}
        <TableCell className="text-xs text-center">{orderHasHeatTreatment(order.id) ? '✓' : ''}</TableCell>
        <TableCell className="text-xs text-center">{orderHasSubcontracting(order.id) ? '✓' : ''}</TableCell>
      </TableRow>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="طلبيات في انتظار الإنجاز و الفوترة"
          description={`${totalRows} commande(s) en attente de facturation`}
        />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>

        {/* Filter buttons — cross-filter (Delivery × Price) */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground min-w-20">تسليم:</span>
            <Button
              size="sm"
              variant={allDeliveryActive ? 'default' : 'outline'}
              className={cn('h-7 text-xs', allDeliveryActive && 'bg-primary text-primary-foreground')}
              onClick={selectAllDelivery}
            >
              جميع الطلبيات
            </Button>
            {DELIVERY_BUTTONS.map(b => {
              const active = !allDeliveryActive && deliveryFilter.has(b.key);
              return (
                <Button
                  key={b.key}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className={cn('h-7 text-xs', active && 'bg-blue-600 text-white hover:bg-blue-700')}
                  onClick={() => toggleDelivery(b.key)}
                >
                  {b.label}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground min-w-20">ثمن البيع:</span>
            <Button
              size="sm"
              variant={allPriceActive ? 'default' : 'outline'}
              className={cn('h-7 text-xs', allPriceActive && 'bg-primary text-primary-foreground')}
              onClick={selectAllPrice}
            >
              جميع الطلبيات
            </Button>
            {PRICE_BUTTONS.map(b => {
              const active = !allPriceActive && priceFilter.has(b.key);
              return (
                <Button
                  key={b.key}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className={cn('h-7 text-xs', active && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                  onClick={() => togglePrice(b.key)}
                >
                  {b.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as 'fabrication' | 'prestation')} dir="rtl" className="flex-none mb-2 w-full">
        <TabsList className="justify-start">
          {(['fabrication','prestation'] as const).map(c => (
            <TabsTrigger key={c} value={c}>
              {ORDER_CATEGORY_LABEL[c]}
              <span className="mr-2 text-xs text-muted-foreground">({catCount(c)})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.orderNumber} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} allValues={allValuesByKey.orderDate} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="الزبون" columnKey="clientName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientName || ''} onFilter={handleFilter} allValues={allValuesByKey.clientName} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} allValues={allValuesByKey.designation} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} allValues={allValuesByKey.quantity} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="درجة الاستعجال" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} allValues={allValuesByKey.priority} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="مستوى التعقيد التقني" columnKey="complexity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.complexity || ''} onFilter={handleFilter} allValues={TC_LEVELS as unknown as string[]} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="أجل التسليم" columnKey="deliveryDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDeadline || ''} onFilter={handleFilter} allValues={allValuesByKey.deliveryDeadline} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="ممثل الزبون" columnKey="clientRepresentative" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientRepresentative || ''} onFilter={handleFilter} allValues={allValuesByKey.clientRepresentative} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="تاريخ التسليم/تقدم الأشغال" columnKey="statusLabel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.statusLabel || ''} onFilter={handleFilter} allValues={allValuesByKey.statusLabel} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="ثمن البيع" columnKey="priceStatus" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priceStatus || ''} onFilter={handleFilter} allValues={allValuesByKey.priceStatus} />
              </TableHead>
              {OPERATOR_COLUMNS.map(name => (
                <TableHead key={name} className="text-xs font-semibold whitespace-nowrap text-center">{name}</TableHead>
              ))}
              <TableHead className="text-xs font-semibold whitespace-nowrap">معالجة حرارية</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">مناولة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center text-muted-foreground py-8">
                  Aucune commande en attente de facturation.
                </TableCell>
              </TableRow>
            )}
            {!isFilteredOrSorted && grouped.map(group => (
              <React.Fragment key={group.clientId}>
                <TableRow className="bg-primary/10 hover:bg-primary/15">
                  <TableCell colSpan={totalCols} className="font-bold text-sm py-2 text-right">
                    🏢 {group.clientName}
                  </TableCell>
                </TableRow>
                {group.series.map(serie => (
                  <React.Fragment key={`${group.clientId}-${serie.prefix}`}>
                    <TableRow className="bg-accent/20 hover:bg-accent/30">
                      <TableCell colSpan={totalCols} className="text-xs font-semibold py-1 text-right text-muted-foreground">
                        Série {serie.prefix}xxx ({serie.rows.length})
                      </TableCell>
                    </TableRow>
                    {serie.rows.map(row => renderDataRow(row, group.clientName))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
            {isFilteredOrSorted && processed.map(row => renderDataRow(row))}
          </TableBody>
        </table>
      </div>
    </div>
  );
};

export default PendingInvoicingPage;
