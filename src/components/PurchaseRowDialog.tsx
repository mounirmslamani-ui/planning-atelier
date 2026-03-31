import React, { useState, useMemo } from 'react';
import { formatDateFR } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePlanning } from '@/context/PlanningContext';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import type { OrderPriority } from '@/types/planning';

const priorityColors: Record<OrderPriority, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
  'P5': 'bg-muted text-muted-foreground',
};

interface PurchaseRowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  type: 'material' | 'tooling';
}

const PurchaseRowDialog: React.FC<PurchaseRowDialogProps> = ({ open, onOpenChange, title, type }) => {
  const { orders, clients } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const pendingOrders = useMemo(() => {
    let result = orders
      .filter(o => o.id !== 'order-absence')
      .filter(o => type === 'material' ? !o.materialAvailable : !o.toolingAvailable)
      .map(o => {
        const client = clients.find(c => c.id === o.clientId);
        return { ...o, clientName: client?.name || '—' };
      });

    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      result = result.filter(r => {
        switch (key) {
          case 'orderNumber': return r.orderNumber.toLowerCase().includes(lv);
          case 'orderDate': return r.orderDate.includes(lv);
          case 'client': return r.clientName.toLowerCase().includes(lv);
          case 'designation': return r.designation.toLowerCase().includes(lv);
          case 'quantity': return String(r.quantity).includes(lv);
          case 'priority': return (r.priority || '').toLowerCase().includes(lv);
          case 'plannedDeadline': return r.plannedDeadline.includes(lv);
          default: return true;
        }
      });
    });

    if (sortKey && sortDir) {
      const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 };
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case 'orderNumber': cmp = a.orderNumber.localeCompare(b.orderNumber); break;
          case 'orderDate': cmp = a.orderDate.localeCompare(b.orderDate); break;
          case 'client': cmp = a.clientName.localeCompare(b.clientName); break;
          case 'designation': cmp = a.designation.localeCompare(b.designation); break;
          case 'quantity': cmp = a.quantity - b.quantity; break;
          case 'priority': cmp = (priorityRank[a.priority || 'P5'] ?? 4) - (priorityRank[b.priority || 'P5'] ?? 4); break;
          case 'plannedDeadline': cmp = a.plannedDeadline.localeCompare(b.plannedDeadline); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [orders, clients, filters, sortKey, sortDir, type]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>
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
              {pendingOrders.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun achat en attente</TableCell></TableRow>
              ) : pendingOrders.map((o, idx) => (
                <TableRow key={o.id}>
                  <TableCell className="text-center text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(o.orderDate)}</TableCell>
                  <TableCell className="text-sm font-medium">{o.clientName}</TableCell>
                  <TableCell className="text-sm">{o.designation}</TableCell>
                  <TableCell className="text-center text-sm">{o.quantity}</TableCell>
                  <TableCell>{o.priority ? <Badge className={`${priorityColors[o.priority]} text-xs`}>{o.priority}</Badge> : '—'}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(o.plannedDeadline)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseRowDialog;
