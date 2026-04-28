import React, { useMemo, useState, useCallback } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PriorityBadge from '@/components/orders/PriorityBadge';
import { Download, Pencil, Trash2, Check, X } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { getOrderGlobalStatus } from '@/lib/stepProgress';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import type { Order, OrderPriority } from '@/types/planning';

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

function getSeriesPrefix(orderNumber: string): string {
  const m = orderNumber.match(/[FP]/i);
  return m ? m[0].toUpperCase() : 'Z';
}
function getYearKey(orderNumber: string): string {
  const m = orderNumber.match(/(\d{2})\s*\//);
  return m ? m[1] : '99';
}

type Row = {
  order: Order;
  clientName: string;
  statusLabel: string;
  deliveryDateOrProgress: string;
  series: string;
};

const PendingInvoicingPage: React.FC = () => {
  const {
    orders, clients, operators, steps, productionRecords,
    deliveredOrders, deliveryEntries, qcEntries,
    absenceOperationId, absenceOrderId,
    updateOrder, deleteOrder,
  } = usePlanning();

  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Order>>({});

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '—';

  // Build flat row list
  const rows = useMemo<Row[]>(() => {
    const deliveredById = new Map(deliveredOrders.map(d => [d.orderId, d]));
    const deliveryReadyIds = new Set(deliveryEntries.map(d => d.orderId));
    const qcIds = new Set(qcEntries.map(q => q.orderId));
    const result: Row[] = [];

    for (const order of orders) {
      if (order.id === absenceOrderId) continue;
      const delivered = deliveredById.get(order.id);
      let statusLabel = '';
      let deliveryDateOrProgress = '';

      if (delivered) {
        if (delivered.invoiceNumber) continue;
        statusLabel = STATUS_LABELS['delivered-pending-invoice'];
        deliveryDateOrProgress = formatDateFR(delivered.deliveryDate);
      } else if (deliveryReadyIds.has(order.id)) {
        statusLabel = STATUS_LABELS['ready-for-delivery'];
        deliveryDateOrProgress = '—';
      } else if (qcIds.has(order.id)) {
        statusLabel = STATUS_LABELS['awaiting-qc'];
        deliveryDateOrProgress = '—';
      } else {
        const globalStatus = getOrderGlobalStatus(order.id, steps, productionRecords, absenceOperationId);
        if (globalStatus === 'En cours') {
          statusLabel = STATUS_LABELS['in-progress'];
          deliveryDateOrProgress = 'قيد الإنجاز';
        } else if (globalStatus === 'En attente') {
          if (order.priority === 'P4') {
            statusLabel = STATUS_LABELS['p4'];
            deliveryDateOrProgress = 'معلقة';
          } else {
            statusLabel = STATUS_LABELS['on-hold'];
            deliveryDateOrProgress = 'قيد الانتظار';
          }
        } else {
          continue; // Terminée without delivery → skip
        }
      }

      result.push({
        order,
        clientName: getClientName(order.clientId),
        statusLabel,
        deliveryDateOrProgress,
        series: getSeriesPrefix(order.orderNumber),
      });
    }
    return result;
  }, [orders, deliveredOrders, deliveryEntries, qcEntries, steps, productionRecords, absenceOperationId, absenceOrderId, clients]);

  // Sort/filter
  const accessors = useMemo(() => ({
    orderNumber: (r: Row) => r.order.orderNumber,
    orderDate: (r: Row) => r.order.orderDate,
    clientName: (r: Row) => r.clientName,
    designation: (r: Row) => r.order.designation,
    quantity: (r: Row) => r.order.quantity,
    clientRepresentative: (r: Row) => r.order.clientRepresentative || '',
    priority: (r: Row) => r.order.priority || '',
    deliveryDeadline: (r: Row) => r.order.deliveryDeadline || '',
    statusLabel: (r: Row) => r.statusLabel,
  }), []);

  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } =
    useTableSortFilter<Row>(rows, accessors);

  const isFilteredOrSorted = sortKey !== null || Object.values(filters).some(Boolean);

  // Group only when not filtered/sorted
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

  // Edit handlers
  const startEdit = useCallback((order: Order) => {
    setEditingId(order.id);
    setDraft({
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      clientId: order.clientId,
      designation: order.designation,
      quantity: order.quantity,
      clientRepresentative: order.clientRepresentative,
      priority: order.priority,
      deliveryDeadline: order.deliveryDeadline,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft({});
  }, []);

  const saveEdit = useCallback((order: Order) => {
    updateOrder({ ...order, ...draft } as Order);
    setEditingId(null);
    setDraft({});
  }, [draft, updateOrder]);

  const handleDelete = useCallback((order: Order) => {
    confirm(
      `Supprimer la commande ${order.orderNumber} ?`,
      () => deleteOrder(order.id),
      { description: 'Cette commande sera supprimée définitivement de la base de données.', variant: 'destructive' }
    );
  }, [confirm, deleteOrder]);

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

  const totalRows = processed.length;
  const totalCols = 10 + OPERATOR_COLUMNS.length + 3 + 1; // +1 actions column
  const priorityOptions: OrderPriority[] = ['P1', 'P2', 'P3', 'P4'];

  // Render a data row (edit mode or view mode)
  const renderDataRow = (row: Row, clientNameOverride?: string) => {
    const { order, statusLabel, deliveryDateOrProgress } = row;
    const clientName = clientNameOverride ?? row.clientName;
    const isEditing = editingId === order.id;
    const opIds = operatorIdsForOrder(order.id);

    return (
      <TableRow key={order.id}>
        <TableCell className="font-heading text-sm whitespace-nowrap">
          {isEditing ? (
            <Input value={draft.orderNumber ?? ''} onChange={e => setDraft(d => ({ ...d, orderNumber: e.target.value }))} className="h-8 w-28" />
          ) : order.orderNumber}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {isEditing ? (
            <Input type="date" value={draft.orderDate ?? ''} onChange={e => setDraft(d => ({ ...d, orderDate: e.target.value }))} className="h-8 w-36" />
          ) : formatDateFR(order.orderDate)}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {isEditing ? (
            <Select value={draft.clientId ?? ''} onValueChange={v => setDraft(d => ({ ...d, clientId: v }))}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : clientName}
        </TableCell>
        <TableCell className="text-sm max-w-48">
          {isEditing ? (
            <Input value={draft.designation ?? ''} onChange={e => setDraft(d => ({ ...d, designation: e.target.value }))} className="h-8 w-56" />
          ) : <span className="truncate block" title={order.designation}>{order.designation}</span>}
        </TableCell>
        <TableCell className="text-sm text-center">
          {isEditing ? (
            <Input type="number" value={draft.quantity ?? 0} onChange={e => setDraft(d => ({ ...d, quantity: Number(e.target.value) }))} className="h-8 w-20" />
          ) : order.quantity}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {isEditing ? (
            <Input value={draft.clientRepresentative ?? ''} onChange={e => setDraft(d => ({ ...d, clientRepresentative: e.target.value }))} className="h-8 w-36" />
          ) : (order.clientRepresentative || '—')}
        </TableCell>
        <TableCell>
          {isEditing ? (
            <Select value={draft.priority ?? ''} onValueChange={v => setDraft(d => ({ ...d, priority: v as OrderPriority }))}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {priorityOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : <PriorityBadge priority={order.priority} className="" />}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {isEditing ? (
            <Input type="date" value={draft.deliveryDeadline ?? ''} onChange={e => setDraft(d => ({ ...d, deliveryDeadline: e.target.value }))} className="h-8 w-36" />
          ) : (order.deliveryDeadline ? formatDateFR(order.deliveryDeadline) : '—')}
        </TableCell>
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
        <TableCell className="text-center whitespace-nowrap">
          <div className="flex items-center justify-center gap-1">
            {isEditing ? (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => saveEdit(order)} title="Enregistrer">
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit} title="Annuler">
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(order)} title="Modifier">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(order)} title="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

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
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} filterMode="date" />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="الزبون" columnKey="clientName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientName || ''} onFilter={handleFilter} filterMode="select" filterOptions={[...new Set(rows.map(r => r.clientName))].sort()} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="ممثل الزبون" columnKey="clientRepresentative" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientRepresentative || ''} onFilter={handleFilter} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="درجة الاستعجال" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} filterMode="select" filterOptions={['P1', 'P2', 'P3', 'P4']} />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="أجل التسليم" columnKey="deliveryDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDeadline || ''} onFilter={handleFilter} filterMode="date" />
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <ColumnHeader label="تاريخ التسليم/تقدم الأشغال" columnKey="statusLabel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.statusLabel || ''} onFilter={handleFilter} filterMode="select" filterOptions={[...new Set(rows.map(r => r.statusLabel))].sort()} />
              </TableHead>
              {OPERATOR_COLUMNS.map(name => (
                <TableHead key={name} className="text-xs font-semibold whitespace-nowrap text-center">{name}</TableHead>
              ))}
              <TableHead className="text-xs font-semibold whitespace-nowrap">معالجة حرارية</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">مناولة</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">المواد الأولية المستعملة</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap text-center">إجراءات</TableHead>
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
        </Table>
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default PendingInvoicingPage;
