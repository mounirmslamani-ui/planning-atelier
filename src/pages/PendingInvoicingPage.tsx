import React, { useMemo } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import PriorityBadge from '@/components/orders/PriorityBadge';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { getOrderGlobalStatus } from '@/lib/stepProgress';

// Fixed operator name columns (must match operator names in DB)
const OPERATOR_COLUMNS = [
  'محمود', 'بلال', 'صالح', 'عبد الرزاق', 'حمزة',
  'عمر', 'ياسين', 'معاذ', 'عادل', 'يوسف',
];

const STATUS_LABELS: Record<string, string> = {
  'delivered-pending-invoice': 'مسلمة (في انتظار الفوترة)',
  'ready-for-delivery': 'جاهزة للتسليم',
  'awaiting-qc': 'في انتظار مراقبة الجودة',
  'in-progress': 'قيد الإنجاز',
  'on-hold': 'قيد الانتظار',
  'p4': 'P4 - معلقة',
};

// Determine series prefix from order number ("F" or "P" or other)
function getSeriesPrefix(orderNumber: string): string {
  const m = orderNumber.match(/[FP]/i);
  return m ? m[0].toUpperCase() : 'Z';
}

// Extract leading year (e.g. "25/" or "26/") from order number for chronological sort
function getYearKey(orderNumber: string): string {
  const m = orderNumber.match(/(\d{2})\s*\//);
  return m ? m[1] : '99';
}

const PendingInvoicingPage: React.FC = () => {
  const {
    orders, clients, operators, steps, productionRecords,
    deliveredOrders, deliveryEntries, qcEntries,
    absenceOperationId, absenceOrderId,
  } = usePlanning();

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '—';

  // Build set of order ids matching the pending-invoicing criteria
  const filteredOrders = useMemo(() => {
    const deliveredById = new Map(deliveredOrders.map(d => [d.orderId, d]));
    const deliveryReadyIds = new Set(deliveryEntries.map(d => d.orderId));
    const qcIds = new Set(qcEntries.map(q => q.orderId));

    const result: { order: typeof orders[number]; statusLabel: string; deliveryDateOrProgress: string }[] = [];

    for (const order of orders) {
      if (order.id === absenceOrderId) continue;

      const delivered = deliveredById.get(order.id);
      // Already delivered : keep only if invoice still pending
      if (delivered) {
        if (!delivered.invoiceNumber) {
          result.push({
            order,
            statusLabel: STATUS_LABELS['delivered-pending-invoice'],
            deliveryDateOrProgress: formatDateFR(delivered.deliveryDate),
          });
        }
        continue;
      }

      if (deliveryReadyIds.has(order.id)) {
        result.push({ order, statusLabel: STATUS_LABELS['ready-for-delivery'], deliveryDateOrProgress: '—' });
        continue;
      }
      if (qcIds.has(order.id)) {
        result.push({ order, statusLabel: STATUS_LABELS['awaiting-qc'], deliveryDateOrProgress: '—' });
        continue;
      }

      const globalStatus = getOrderGlobalStatus(order.id, steps, productionRecords, absenceOperationId);
      if (globalStatus === 'En cours') {
        result.push({ order, statusLabel: STATUS_LABELS['in-progress'], deliveryDateOrProgress: 'قيد الإنجاز' });
        continue;
      }
      if (globalStatus === 'En attente') {
        // Distinguish P4 (on-hold by priority) from regular pending
        if (order.priority === 'P4') {
          result.push({ order, statusLabel: STATUS_LABELS['p4'], deliveryDateOrProgress: 'معلقة' });
        } else {
          result.push({ order, statusLabel: STATUS_LABELS['on-hold'], deliveryDateOrProgress: 'قيد الانتظار' });
        }
      }
    }

    return result;
  }, [orders, deliveredOrders, deliveryEntries, qcEntries, steps, productionRecords, absenceOperationId, absenceOrderId]);

  // Group by client, then series (F/P), then sort by year (25 before 26) then full order number
  const grouped = useMemo(() => {
    const byClient = new Map<string, typeof filteredOrders>();
    for (const item of filteredOrders) {
      const key = item.order.clientId || '__no_client__';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(item);
    }

    const groups: { clientId: string; clientName: string; series: { prefix: string; rows: typeof filteredOrders }[] }[] = [];
    const sortedClientIds = [...byClient.keys()].sort((a, b) =>
      getClientName(a).localeCompare(getClientName(b))
    );
    for (const clientId of sortedClientIds) {
      const items = byClient.get(clientId)!;
      const bySeries = new Map<string, typeof filteredOrders>();
      for (const it of items) {
        const prefix = getSeriesPrefix(it.order.orderNumber);
        if (!bySeries.has(prefix)) bySeries.set(prefix, []);
        bySeries.get(prefix)!.push(it);
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
  }, [filteredOrders, clients]);

  // Build operator-id lookup by Arabic name
  const operatorIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of operators) {
      map.set(op.name.trim(), op.id);
    }
    return map;
  }, [operators]);

  // For a given order, return set of operator ids that worked on it (via steps)
  const operatorIdsForOrder = (orderId: string): Set<string> => {
    const ids = new Set<string>();
    for (const s of steps) {
      if (s.orderId !== orderId) continue;
      if (s.operationId === absenceOperationId) continue;
      if (s.operatorId) ids.add(s.operatorId);
    }
    return ids;
  };

  // Detect if an order has subcontracting / heat-treatment steps
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
        for (const { order, statusLabel, deliveryDateOrProgress } of serie.rows) {
          const opIds = operatorIdsForOrder(order.id);
          const row: Record<string, string | number> = {
            'الزبون': group.clientName,
            'السلسلة': serie.prefix,
            'رقم الطلبية': order.orderNumber,
            'التاريخ': formatDateFR(order.orderDate),
            'التعيين': order.designation,
            'الكمية': order.quantity,
            'ممثل الزبون': order.clientRepresentative || '—',
            'درجة الاستعجال': order.priority || '—',
            'أجل التسليم': order.deliveryDeadline ? formatDateFR(order.deliveryDeadline) : '—',
            'تاريخ التسليم/تقدم الأشغال': `${statusLabel} — ${deliveryDateOrProgress}`,
          };
          for (const opName of OPERATOR_COLUMNS) {
            const opId = operatorIdByName.get(opName);
            row[opName] = opId && opIds.has(opId) ? opName : '';
          }
          row['معالجة حرارية'] = orderHasHeatTreatment(order.id) ? 'نعم' : '';
          row['مناولة'] = orderHasSubcontracting(order.id) ? 'نعم' : '';
          row['المواد الأولية المستعملة'] = rawMaterialsForOrder(order.id);
          exportRows.push(row);
        }
      }
    }
    exportTableToExcel('Commandes non facturées', exportRows);
  };

  const totalRows = filteredOrders.length;
  const totalCols = 10 + OPERATOR_COLUMNS.length + 3; // base + operators + 3 trailing

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="طلبيات في انتظار الفوترة"
          description={`${totalRows} commande(s) en attente de facturation`}
          actions={
            <Button onClick={handleExportExcel} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" /> تصدير Excel
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold whitespace-nowrap">رقم الطلبية</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">التاريخ</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">الزبون</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">التعيين</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">الكمية</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">ممثل الزبون</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">درجة الاستعجال</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">أجل التسليم</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">تاريخ التسليم/تقدم الأشغال</TableHead>
              {OPERATOR_COLUMNS.map(name => (
                <TableHead key={name} className="text-xs font-semibold whitespace-nowrap text-center">{name}</TableHead>
              ))}
              <TableHead className="text-xs font-semibold whitespace-nowrap">معالجة حرارية</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">مناولة</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">المواد الأولية المستعملة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center text-muted-foreground py-8">
                  Aucune commande en attente de facturation.
                </TableCell>
              </TableRow>
            )}
            {grouped.map(group => (
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
                    {serie.rows.map(({ order, statusLabel, deliveryDateOrProgress }) => {
                      const opIds = operatorIdsForOrder(order.id);
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-heading text-sm whitespace-nowrap">{order.orderNumber}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateFR(order.orderDate)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{group.clientName}</TableCell>
                          <TableCell className="text-sm max-w-48 truncate" title={order.designation}>{order.designation}</TableCell>
                          <TableCell className="text-sm text-center">{order.quantity}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{order.clientRepresentative || '—'}</TableCell>
                          <TableCell><PriorityBadge priority={order.priority} className="" /></TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{order.deliveryDeadline ? formatDateFR(order.deliveryDeadline) : '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            <span className="text-muted-foreground">{statusLabel}</span>
                            <br />
                            <span className="font-medium">{deliveryDateOrProgress}</span>
                          </TableCell>
                          {OPERATOR_COLUMNS.map(name => {
                            const opId = operatorIdByName.get(name);
                            const concerned = opId && opIds.has(opId);
                            return (
                              <TableCell key={name} className="text-xs text-center">
                                {concerned ? <span className="font-medium text-primary">{name}</span> : ''}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-xs text-center">{orderHasHeatTreatment(order.id) ? '✓' : ''}</TableCell>
                          <TableCell className="text-xs text-center">{orderHasSubcontracting(order.id) ? '✓' : ''}</TableCell>
                          <TableCell className="text-xs max-w-40 truncate" title={rawMaterialsForOrder(order.id)}>
                            {rawMaterialsForOrder(order.id)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PendingInvoicingPage;
