import React, { useState, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDateFR } from '@/lib/utils';
import { usePlanning } from '@/context/PlanningContext';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import type { Order, OrderPriority } from '@/types/planning';

const priorityColors: Record<OrderPriority, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
  'P5': 'bg-muted text-muted-foreground',
};

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
      const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 };
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortKey as ColumnKey) {
          case 'orderNumber': cmp = a.orderNumber.localeCompare(b.orderNumber); break;
          case 'orderDate': cmp = a.orderDate.localeCompare(b.orderDate); break;
          case 'client': cmp = getClientName(a.clientId).localeCompare(getClientName(b.clientId)); break;
          case 'designation': cmp = a.designation.localeCompare(b.designation); break;
          case 'quantity': cmp = a.quantity - b.quantity; break;
          case 'priority': cmp = (priorityRank[a.priority || 'P5'] ?? 4) - (priorityRank[b.priority || 'P5'] ?? 4); break;
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead><ColumnHeader label="Date" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="Client" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="Désignation" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
            <TableHead className="text-center"><ColumnHeader label="Qté." columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="Priorité" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
            <TableHead><ColumnHeader label="Délai promis" columnKey="plannedDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.plannedDeadline || ''} onFilter={handleFilter} /></TableHead>
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
                <TableCell className="text-sm">{order.designation}</TableCell>
                <TableCell className="text-center text-sm">{order.quantity}</TableCell>
                <TableCell>
                  {order.priority ? (
                    <Badge className={`${priorityColors[order.priority]} text-xs`}>{order.priority}</Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-sm">{formatDateFR(order.plannedDeadline) || '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default PendingOrdersTable;
