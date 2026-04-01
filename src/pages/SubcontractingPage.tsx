import React, { useMemo, useState, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import type { OrderPriority } from '@/types/planning';
import { formatDateFR } from '@/lib/utils';

const priorityColors: Record<OrderPriority, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
};

type ColumnKey = 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'plannedDeadline' | 'subcontractingDeadline';

const SubcontractingPage: React.FC = () => {
  const { orders, clients, steps, operations, updateStep, absenceOrderId } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);

  // Find all subcontractor steps (operations with category 'subcontractor')
  const subcontractorOpIds = useMemo(() => {
    return new Set(operations.filter(op => op.category === 'subcontractor').map(op => op.id));
  }, [operations]);

  const subcontractingRows = useMemo(() => {
    // Get all steps that are subcontractor operations
    const subSteps = steps.filter(s => subcontractorOpIds.has(s.operationId));

    // Group by orderId - one row per order that has subcontracting
    const orderMap = new Map<string, { deadline: string; done: boolean; stepIds: string[] }>();
    subSteps.forEach(s => {
      const existing = orderMap.get(s.orderId);
      if (!existing) {
        orderMap.set(s.orderId, {
          deadline: s.subcontractingDeadline || s.endDate || '',
          done: s.subcontractingDone ?? false,
          stepIds: [s.id],
        });
      } else {
        // Take the latest deadline
        if ((s.subcontractingDeadline || s.endDate || '') > existing.deadline) {
          existing.deadline = s.subcontractingDeadline || s.endDate || '';
        }
        // All must be done for the order to be considered done
        if (!(s.subcontractingDone ?? false)) existing.done = false;
        existing.stepIds.push(s.id);
      }
    });

    return Array.from(orderMap.entries()).map(([orderId, info]) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || order.id === absenceOrderId) return null;
      return { order, ...info };
    }).filter(Boolean) as { order: typeof orders[0]; deadline: string; done: boolean; stepIds: string[] }[];
  }, [steps, orders, subcontractorOpIds]);

  const filteredRows = useMemo(() => {
    let result = [...subcontractingRows];

    // Apply text filters
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      result = result.filter(r => {
        switch (key as ColumnKey) {
          case 'orderNumber': return r.order.orderNumber.toLowerCase().includes(lv);
          case 'orderDate': return r.order.orderDate.includes(lv);
          case 'client': return getClientName(r.order.clientId).toLowerCase().includes(lv);
          case 'designation': return r.order.designation.toLowerCase().includes(lv);
          case 'quantity': return String(r.order.quantity).includes(lv);
          case 'priority': return (r.order.priority || '').toLowerCase().includes(lv);
          case 'plannedDeadline': return r.order.plannedDeadline.includes(lv);
          case 'subcontractingDeadline': return r.deadline.includes(lv);
          default: return true;
        }
      });
    });

    // Sort
    if (sortKey && sortDir) {
      const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      result.sort((a, b) => {
        let cmp = 0;
        switch (sortKey as ColumnKey) {
          case 'orderNumber': cmp = a.order.orderNumber.localeCompare(b.order.orderNumber); break;
          case 'orderDate': cmp = a.order.orderDate.localeCompare(b.order.orderDate); break;
          case 'client': cmp = getClientName(a.order.clientId).localeCompare(getClientName(b.order.clientId)); break;
          case 'designation': cmp = a.order.designation.localeCompare(b.order.designation); break;
          case 'quantity': cmp = a.order.quantity - b.order.quantity; break;
          case 'priority': cmp = (priorityRank[a.order.priority || 'P4'] ?? 3) - (priorityRank[b.order.priority || 'P4'] ?? 3); break;
          case 'plannedDeadline': cmp = a.order.plannedDeadline.localeCompare(b.order.plannedDeadline); break;
          case 'subcontractingDeadline': cmp = a.deadline.localeCompare(b.deadline); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [subcontractingRows, filters, sortKey, sortDir, getClientName]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const toggleDone = (stepIds: string[], currentDone: boolean) => {
    stepIds.forEach(id => {
      const step = steps.find(s => s.id === id);
      if (step) {
        updateStep({ ...step, subcontractingDone: !currentDone });
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Sous-traitance" description="Suivi des opérations sous-traitées planifiées" />
      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead><ColumnHeader label="N° Commande" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Date" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Client" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Désignation" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-center"><ColumnHeader label="Qté." columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Priorité" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Délai promis" columnKey="plannedDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.plannedDeadline || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Délai sous-traitance" columnKey="subcontractingDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.subcontractingDeadline || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-center w-16">Fait</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Aucune sous-traitance planifiée ✓
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row, idx) => (
                <TableRow key={row.order.id} className={row.done ? 'opacity-60' : ''}>
                  <TableCell className="text-center text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{row.order.orderNumber}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.order.orderDate) || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{getClientName(row.order.clientId)}</TableCell>
                  <TableCell className="text-sm">{row.order.designation}</TableCell>
                  <TableCell className="text-center text-sm">{row.order.quantity}</TableCell>
                  <TableCell>
                    {row.order.priority ? (
                      <Badge className={`${priorityColors[row.order.priority]} text-xs`}>{row.order.priority}</Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.order.plannedDeadline) || '—'}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.deadline) || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={row.done}
                      onCheckedChange={() => toggleDone(row.stepIds, row.done)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SubcontractingPage;
