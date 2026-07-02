import React, { useState, useMemo, useCallback } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateFR } from '@/lib/utils';
import { usePlanning } from '@/context/PlanningContext';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import { computeAllValuesByKey } from '@/hooks/useTableSortFilter';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import type { Order } from '@/types/planning';

type ColumnKey = 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'plannedDeadline';

interface PendingOrdersTableProps {
  filterFn: (order: Order) => boolean;
  emptyMessage: string;
}

const PendingOrdersTable: React.FC<PendingOrdersTableProps> = ({ filterFn, emptyMessage }) => {
  const { orders, clients, absenceOrderId } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);

  const filteredOrders = useMemo(() => {
    let result = orders.filter(o => o.id !== absenceOrderId).filter(filterFn);

    // Apply text filters
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      result = result.filter(o => {
        switch (key as ColumnKey) {
          case 'orderNumber': return o.orderNumber.toLowerCase().includes(lv);
          case 'orderDate': return o.orderDate.includes(lv);
          case 'client': return getClientName(o.clientId).toLowerCase().includes(lv);
          case 'designation': return o.designation.toLowerCase().includes(lv);
          case 'quantity': return String(o.quantity).includes(lv);
          case 'priority': return (o.priority || '').toLowerCase().includes(lv);
          case 'plannedDeadline': return o.plannedDeadline.includes(lv);
          default: return true;
        }
      });
    });

    // Sort
    if (sortKey && sortDir) {
      const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortKey as ColumnKey) {
          case 'orderNumber': cmp = a.orderNumber.localeCompare(b.orderNumber); break;
          case 'orderDate': cmp = a.orderDate.localeCompare(b.orderDate); break;
          case 'client': cmp = getClientName(a.clientId).localeCompare(getClientName(b.clientId)); break;
          case 'designation': cmp = a.designation.localeCompare(b.designation); break;
          case 'quantity': cmp = a.quantity - b.quantity; break;
          case 'priority': cmp = (priorityRank[a.priority || 'P4'] ?? 3) - (priorityRank[b.priority || 'P4'] ?? 3); break;
          case 'plannedDeadline': cmp = a.plannedDeadline.localeCompare(b.plannedDeadline); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [orders, filters, sortKey, sortDir, getClientName, filterFn]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
<div className="rounded-lg border bg-card overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
            <TableHead className="text-center"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="أجل التسليم الموعود" columnKey="plannedDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.plannedDeadline || ''} onFilter={handleFilter} /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredOrders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{emptyMessage}</TableCell>
            </TableRow>
          ) : (
            filteredOrders.map((order, idx) => (
              <TableRow key={order.id}>
                <TableCell className="text-center text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                <TableCell className="text-sm">{formatDateFR(order.orderDate) || '—'}</TableCell>
                <TableCell className="text-sm font-medium">{getClientName(order.clientId)}</TableCell>
                <TableCell className="text-sm"><DesignationCell orderId={order.id} designation={order.designation} /></TableCell>
                <TableCell className="text-center text-sm">{order.quantity}</TableCell>
                <TableCell>
                  <PriorityBadge priority={order.priority} />
                </TableCell>
                <TableCell className="text-sm">{formatDateFR(order.plannedDeadline) || '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </table>
    </div>
  );
};

export default PendingOrdersTable;
