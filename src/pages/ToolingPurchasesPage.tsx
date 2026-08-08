import React, { useMemo, useState, useCallback } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import { formatDateFR } from '@/lib/utils';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import { computeAllValuesByKey } from '@/hooks/useTableSortFilter';
import { buildOutOfPreparationFlowSet } from '@/lib/preparationFilter';

const ToolingPurchasesPage: React.FC = () => {
  const { orders, clients, steps, absenceOrderId, absenceOperationId, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, productionRecords } = usePlanning();
  const excludedIds = useMemo(() => buildOutOfPreparationFlowSet({ orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId }), [orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const { selectedClientName } = useGlobalClientFilter();

  const rows = useMemo(() => {
    const isToolingBlocked = (status: any) => status === 'non-disponible' || status === 'partiel';
    const orderMap = new Map<string, { stepIds: string[] }>();
    orders
      .filter(o => o.id !== absenceOrderId && !excludedIds.has(o.id) && isToolingBlocked(o.toolingStatus))
      .forEach(o => orderMap.set(o.id, { stepIds: [] }));
    steps.filter(s => s.operationId !== absenceOperationId).forEach(s => {
      const order = orders.find(o => o.id === s.orderId);
      if (!order || excludedIds.has(order.id) || !isToolingBlocked(s.toolingStatus ?? order.toolingStatus)) return;
      const existing = orderMap.get(s.orderId);
      if (!existing) {
        orderMap.set(s.orderId, { stepIds: [s.id] });
      } else {
        existing.stepIds.push(s.id);
      }
    });
    return Array.from(orderMap.entries()).map(([orderId, info]) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || order.id === absenceOrderId) return null;
      return { orderId, order, ...info };
    }).filter(Boolean) as any[];
  }, [steps, orders, absenceOrderId, absenceOperationId, excludedIds]);

  const rowsWithItems = useMemo(() => rows.map(r => {
    const set = new Set<string>();
    r.stepIds.forEach((sid: string) => {
      const step = steps.find(s => s.id === sid);
      (step?.specialToolingNeeds || []).forEach(v => {
        const t = (v || '').trim();
        if (t) set.add(t);
      });
    });
    return { ...r, items: Array.from(set) };
  }), [rows, steps]);

  const filteredRows = useMemo(() => {
    let list = [...rowsWithItems];
    const effective = selectedClientName ? { ...filters, client: selectedClientName } : filters;
    Object.entries(effective).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      list = list.filter((r: any) => {
        if (key === 'displayOrder') return String(r.order.displayOrder ?? '').includes(val);
        if (key === 'orderNumber') return r.order.orderNumber.toLowerCase().includes(lv);
        if (key === 'client') {
          if (selectedClientName) return getClientName(r.order.clientId) === selectedClientName;
          return getClientName(r.order.clientId).toLowerCase().includes(lv);
        }
        if (key === 'designation') return r.order.designation.toLowerCase().includes(lv);
        if (key === 'quantity') return String(r.order.quantity).includes(val);
        if (key === 'priority') { const vals = val.split('|').filter(Boolean); return vals.includes(r.order.priority as string); }
        return true;
      });
    });
    return list;
  }, [rowsWithItems, filters, getClientName, selectedClientName]);


  const purchaseAccessors = useMemo(() => ({
    displayOrder: (r: any) => String(r.order.displayOrder ?? ''),
    orderNumber: (r: any) => r.order.orderNumber,
    client: (r: any) => getClientName(r.order.clientId),
    designation: (r: any) => r.order.designation,
    quantity: (r: any) => String(r.order.quantity),
    priority: (r: any) => r.order.priority || '',
  }), [getClientName]);

  const allValuesByKey = useMemo(() => {
    const effective = selectedClientName ? { ...filters, client: `${selectedClientName}|` } : filters;
    return computeAllValuesByKey(rows, purchaseAccessors, effective);
  }, [rows, purchaseAccessors, filters, selectedClientName]);


  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleExportExcel = () => {
    exportTableToExcel('مشتريات العدة', filteredRows.map((r: any) => ({
      '#': r.order.displayOrder ?? '—',
      'رقم الطلبية': r.order.orderNumber,
      Client: getClientName(r.order.clientId),
      Désignation: r.order.designation,
      'الكمية': r.order.quantity,
      Priorité: r.order.priority || '—',
      'الصنف المطلوب': r.items && r.items.length > 0 ? r.items.join('\n') : '—',
      'أجل التسليم الموعود': formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—',
    })), [8, 20, 24, 45, 10, 12, 30, 16]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="مشتريات العدة" description="Étapes dont l'outillage n'est pas encore disponible" />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center"><ColumnHeader label="ترتيب" columnKey="displayOrder" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.displayOrder || ''} onFilter={handleFilter} allValues={allValuesByKey.displayOrder} /></TableHead>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.orderNumber} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} allValues={allValuesByKey.client} /></TableHead>
                <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} allValues={allValuesByKey.designation} /></TableHead>
                <TableHead className="text-center"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} allValues={allValuesByKey.quantity} /></TableHead>
                <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} allValues={allValuesByKey.priority} /></TableHead>
              <TableHead>الصنف المطلوب</TableHead>
              <TableHead>أجل التسليم الموعود</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Tout l'outillage est disponible ✓</TableCell></TableRow>
            ) : filteredRows.map((r: any) => (
              <TableRow key={r.orderId}>
                <TableCell className="text-center text-muted-foreground font-mono text-xs">{r.order.displayOrder ?? '—'}</TableCell>
                <TableCell className="text-sm font-medium"><OrderNumberLink orderId={r.order.id} orderNumber={r.order.orderNumber} /></TableCell>
                <TableCell className="text-sm">{getClientName(r.order.clientId)}</TableCell>
                <TableCell className="text-sm"><DesignationCell orderId={r.order.id} designation={r.order.designation} /></TableCell>
                <TableCell className="text-center text-sm">{r.order.quantity}</TableCell>
                <TableCell><PriorityBadge priority={r.order.priority} /></TableCell>
                <TableCell className="text-sm">
                  {r.items && r.items.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {r.items.map((it: string, idx: number) => (
                        <div key={idx}>{it}</div>
                      ))}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-sm">{formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
};

export default ToolingPurchasesPage;
