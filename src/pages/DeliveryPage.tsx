import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import type { DeliveryEntry, DeliveredOrder, OrderCategory } from '@/types/planning';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { toast } from 'sonner';
import { OrderNumberLink } from '@/context/OrderSheetContext';

const DeliveryPage: React.FC = () => {
  const { deliveryEntries, qcEntries, deliveredOrders, orders, clients } = usePlanning();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');

  // Build a unified list: one entry per order that has deliverable qty
  // (accepted by QC but not yet shipped) and is not force-closed.
  type Row = {
    id: string; orderId: string; controlDate: string;
    decision: 'conforme' | 'conforme-derogation';
    accepted: number; shipped: number; deliverable: number;
  };

  const allRows = React.useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    // Seed from legacy deliveryEntries (back-compat) and QC entries
    for (const q of qcEntries) {
      if (q.decision !== 'conforme' && q.decision !== 'conforme-derogation') continue;
      const order = getOrder(q.orderId);
      if (!order) continue;
      const accepted = qcEntries
        .filter(x => x.orderId === order.id)
        .reduce((s, x) => {
          if (x.acceptedQty != null) return s + x.acceptedQty;
          if (x.decision === 'conforme' || x.decision === 'conforme-derogation') return s + order.quantity;
          return s;
        }, 0);
      const shipped = deliveredOrders
        .filter(d => d.orderId === order.id)
        .reduce((s, d) => s + (d.deliveredQty ?? order.quantity), 0);
      const forceClosed = deliveredOrders.some(d => d.orderId === order.id && d.forceClosed);
      const deliverable = Math.max(0, accepted - shipped);
      if (forceClosed || deliverable <= 0) continue;
      if (!map.has(order.id)) {
        map.set(order.id, {
          id: q.id, orderId: order.id, controlDate: q.controlDate,
          decision: q.decision, accepted, shipped, deliverable,
        });
      }
    }
    return Array.from(map.values());
  }, [qcEntries, deliveredOrders, orders]);

  const filteredEntries = React.useMemo(
    () => allRows.filter(e => inferCategoryFromOrderNumber(getOrder(e.orderId)?.orderNumber) === activeCat),
    [allRows, activeCat, orders]
  );
  const catCount = (cat: OrderCategory) =>
    allRows.filter(e => inferCategoryFromOrderNumber(getOrder(e.orderId)?.orderNumber) === cat).length;


  const accessors = {
    priority: (e: Row) => getOrder(e.orderId)?.priority || '',
    orderNumber: (e: Row) => getOrder(e.orderId)?.orderNumber || '',
    orderDate: (e: Row) => getOrder(e.orderId)?.orderDate || '',
    client: (e: Row) => getClientName(getOrder(e.orderId)?.clientId || ''),
    designation: (e: Row) => getOrder(e.orderId)?.designation || '',
    quantity: (e: Row) => e.deliverable,
    deadline: (e: Row) => getOrder(e.orderId)?.plannedDeadline || '',
    controlDate: (e: Row) => e.controlDate,
    decision: (e: Row) => e.decision === 'conforme' ? 'مطابق للمواصفات' : 'مطابق للمواصفات بصفة استثنائية',
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(filteredEntries, accessors);

  const allValuesByKey = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    (Object.keys(accessors) as (keyof typeof accessors)[]).forEach(k => {
      map[k as string] = [...new Set(filteredEntries.map(e => {
        const v = accessors[k](e); return v == null ? '' : String(v);
      }).filter(Boolean))].sort();
    });
    return map;
  }, [filteredEntries]);

  const handleExportExcel = () => {
    exportTableToExcel('طلبيات جاهزة للتسليم', processed.map(entry => {
      const order = getOrder(entry.orderId);
      return {
        Priorité: order?.priority || '—',
        'رقم الطلبية': order?.orderNumber || '—',
        Date: order ? formatDateFR(order.orderDate) : '—',
        Client: order ? getClientName(order.clientId) : '—',
        Désignation: order?.designation || '—',
        'Qté à livrer': entry.deliverable,
        'Qté totale': order?.quantity ?? '—',
        Délais: order ? formatDateFR(order.plannedDeadline) : '—',
        'تاريخ مراقبة الجودة': formatDateFR(entry.controlDate),
        Décision: entry.decision === 'conforme' ? 'مطابق للمواصفات' : 'مطابق للمواصفات بصفة استثنائية',
      };
    }), [12, 20, 14, 24, 45, 10, 10, 14, 16, 26]);
  };


  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="طلبيات جاهزة للتسليم"
          description={
            <span className="flex items-center gap-2">
              <span className="font-bold text-lg">{deliveryEntries.length}</span>
              <span>عدد الطلبيات الجاهزة للتسليم</span>
            </span>
          }
        />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 ml-1" /> تصدير Excel
          </Button>
        </div>
        <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as OrderCategory)} className="w-full">
          <div className="flex w-full justify-end mt-2">
            <TabsList className="justify-end">
              {(['fabrication','prestation','divers','slamani'] as OrderCategory[]).map(c => (
                <TabsTrigger key={c} value={c}>
                  {ORDER_CATEGORY_LABEL[c]}
                  <span className="ml-2 text-xs text-muted-foreground">({catCount(c)})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.orderNumber} /></TableHead>
              <TableHead><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} allValues={allValuesByKey.orderDate} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} allValues={allValuesByKey.client} /></TableHead>
              <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} allValues={allValuesByKey.designation} /></TableHead>
              <TableHead><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} allValues={allValuesByKey.quantity} /></TableHead>
              <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} allValues={allValuesByKey.priority} /></TableHead>
              <TableHead><ColumnHeader label="أجل التسليم" columnKey="deadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deadline || ''} onFilter={handleFilter} allValues={allValuesByKey.deadline} /></TableHead>
              <TableHead><ColumnHeader label="تاريخ مراقبة الجودة" columnKey="controlDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.controlDate || ''} onFilter={handleFilter} allValues={allValuesByKey.controlDate} /></TableHead>
              <TableHead><ColumnHeader label="قرار" columnKey="decision" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.decision || ''} onFilter={handleFilter} allValues={allValuesByKey.decision} /></TableHead>
             </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(entry => {
              const order = getOrder(entry.orderId);
              if (!order) return null;
              return (
                <TableRow key={entry.id}>
                  <TableCell className="font-heading text-sm">
                    <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateFR(order.orderDate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {getClientName(order.clientId)}
                  </TableCell>
                  <TableCell className="text-sm" style={{ minWidth: 200 }}>
                    <DesignationCell orderId={order.id} designation={order.designation} className="text-sm whitespace-normal break-words block" />
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.quantity}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={order.priority} className="" />
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateFR(order.plannedDeadline)}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateFR(entry.controlDate)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-normal/15 text-normal">
                      {entry.decision === 'conforme' ? 'مطابق للمواصفات' : 'مطابق للمواصفات بصفة استثنائية'}
                    </Badge>
                  </TableCell>
                 </TableRow>
              );
            })}
            {deliveryEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Aucune commande à livrer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="هل تؤكد هذه العملية؟"
        description={pending ? `La commande sera transférée vers 'طلبيات مسلمة' avec la date du ${formatDateFR(pending.date)}.` : ''}
        onConfirm={handleConfirmTransfer}
        onCancel={handleCancelTransfer}
        confirmLabel="Oui, transférer"
        cancelLabel="Non"
      />
    </div>
  );
};

export default DeliveryPage;
