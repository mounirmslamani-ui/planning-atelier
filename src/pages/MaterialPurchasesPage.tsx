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
import { buildOutOfPreparationFlowSet } from '@/lib/preparationFilter';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import { computeAllValuesByKey } from '@/hooks/useTableSortFilter';
import ResourceStatusPill from '@/components/ResourceStatusPill';
import type { ResourceItem } from '@/types/planning';

const MaterialPurchasesPage: React.FC = () => {
  const { orders, clients, steps, absenceOrderId, absenceOperationId, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, productionRecords } = usePlanning();
  const excludedIds = useMemo(() => buildOutOfPreparationFlowSet({ orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId }), [orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const { selectedClientName } = useGlobalClientFilter();

  /** Per-item purchase list: only items whose OWN status is missing/partial are listed. */
  const rowsWithItems = useMemo(() => {
    const WORSE: Record<string, number> = { 'partiel': 1, 'non-disponible': 2 };
    const perOrder = new Map<string, Map<string, ResourceItem>>();
    steps.filter(s => s.operationId !== absenceOperationId).forEach(s => {
      if (s.rawMaterialNotApplicable) return;
      const order = orders.find(o => o.id === s.orderId);
      if (!order || order.id === absenceOrderId || excludedIds.has(order.id)) return;
      (s.rawMaterialItems || []).forEach(item => {
        const label = (item?.label || '').trim();
        if (!label) return;
        if (item.status !== 'non-disponible' && item.status !== 'partiel') return;
        let bucket = perOrder.get(order.id);
        if (!bucket) { bucket = new Map(); perOrder.set(order.id, bucket); }
        const existing = bucket.get(label);
        if (!existing || (WORSE[item.status] ?? 0) > (WORSE[existing.status] ?? 0)) {
          bucket.set(label, { id: item.id, label, status: item.status });
        }
      });
    });
    return Array.from(perOrder.entries()).map(([orderId, bucket]) => {
      const order = orders.find(o => o.id === orderId)!;
      return { orderId, order, items: Array.from(bucket.values()) };
    }) as any[];
  }, [steps, orders, absenceOrderId, absenceOperationId, excludedIds]);

  const rows = rowsWithItems;

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
    exportTableToExcel('مشتريات المواد الأولية', filteredRows.map((r: any) => ({
      '#': r.order.displayOrder ?? '—',
      'رقم الطلبية': r.order.orderNumber,
      Client: getClientName(r.order.clientId),
      Désignation: r.order.designation,
      'الكمية': r.order.quantity,
      Priorité: r.order.priority || '—',
      'المواد الأولية المطلوبة': r.items && r.items.length > 0 ? r.items.map((i: ResourceItem) => `${i.label} (${i.status === 'non-disponible' ? 'non disponible' : 'partiellement disponible'})`).join('\n') : '—',
      'أجل التسليم الموعود': formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—',
    })), [8, 20, 24, 45, 10, 12, 30, 16]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="مشتريات المواد الأولية" description="Étapes dont la matière n'est pas encore disponible" />
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
              <TableHead>المواد الأولية المطلوبة </TableHead>
              <TableHead>أجل التسليم الموعود</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Toutes les matières sont disponibles ✓</TableCell></TableRow>
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
                      {r.items.map((it: ResourceItem) => (
                        <div key={it.id} className="flex items-center gap-1">
                          <ResourceStatusPill value={it.status} readOnly />
                          <span>{it.label}</span>
                        </div>
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

export default MaterialPurchasesPage;
