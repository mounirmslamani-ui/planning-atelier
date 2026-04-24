import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateFR } from '@/lib/utils';
import { usePlanning } from '@/context/PlanningContext';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';

interface SubcontractorTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SubcontractorTableDialog: React.FC<SubcontractorTableDialogProps> = ({ open, onOpenChange }) => {
  const { steps, orders, clients, operations, subcontractors, absenceOperationId } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const subSteps = useMemo(() => {
    let result = steps
      .filter(s => s.subcontractorId && s.operationId !== absenceOperationId)
      .map(s => {
        const order = orders.find(o => o.id === s.orderId);
        const client = order ? clients.find(c => c.id === order.clientId) : null;
        const operation = operations.find(o => o.id === s.operationId);
        const sub = subcontractors.find(sc => sc.id === s.subcontractorId);
        return {
          ...s,
          orderNumber: order?.orderNumber || '—',
          orderDate: order?.orderDate || '',
          clientName: client?.name || '—',
          designation: order?.designation || '',
          quantity: order?.quantity || 0,
          priority: order?.priority,
          plannedDeadline: order?.plannedDeadline || '',
          operationName: operation?.name || '',
          subcontractorName: sub?.companyName || '—',
        };
      });

    // Apply filters
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
          case 'operation': return r.operationName.toLowerCase().includes(lv);
          case 'subcontractor': return r.subcontractorName.toLowerCase().includes(lv);
          case 'startDate': return r.startDate.includes(lv);
          case 'endDate': return r.endDate.includes(lv);
          default: return true;
        }
      });
    });

    // Sort
    if (sortKey && sortDir) {
      const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case 'orderNumber': cmp = a.orderNumber.localeCompare(b.orderNumber); break;
          case 'orderDate': cmp = a.orderDate.localeCompare(b.orderDate); break;
          case 'client': cmp = a.clientName.localeCompare(b.clientName); break;
          case 'designation': cmp = a.designation.localeCompare(b.designation); break;
          case 'quantity': cmp = a.quantity - b.quantity; break;
          case 'priority': cmp = (priorityRank[a.priority || 'P4'] ?? 3) - (priorityRank[b.priority || 'P4'] ?? 3); break;
          case 'plannedDeadline': cmp = a.plannedDeadline.localeCompare(b.plannedDeadline); break;
          case 'operation': cmp = a.operationName.localeCompare(b.operationName); break;
          case 'subcontractor': cmp = a.subcontractorName.localeCompare(b.subcontractorName); break;
          case 'startDate': cmp = a.startDate.localeCompare(b.startDate); break;
          case 'endDate': cmp = a.endDate.localeCompare(b.endDate); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [steps, orders, clients, operations, subcontractors, filters, sortKey, sortDir]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const cols = [
    { key: 'orderNumber', label: '#' },
    { key: 'orderDate', label: 'التاريخ' },
    { key: 'client', label: 'الزبون' },
    { key: 'designation', label: 'التعيين' },
    { key: 'quantity', label: 'الكمية' },
    { key: 'priority', label: 'الأولوية' },
    { key: 'plannedDeadline', label: 'أجل التسليم الموعود' },
    { key: 'operation', label: 'العملية' },
    { key: 'subcontractor', label: 'مناول' },
    { key: 'startDate', label: 'تاريخ البداية' },
    { key: 'endDate', label: 'تاريخ النهاية' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Sous-traitances programmées</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {cols.map(c => (
                  <TableHead key={c.key}>
                    <ColumnHeader label={c.label} columnKey={c.key} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters[c.key] || ''} onFilter={handleFilter} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subSteps.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Aucune sous-traitance programmée</TableCell></TableRow>
              ) : subSteps.map((r, idx) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-mono">{r.orderNumber}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(r.orderDate) || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.clientName}</TableCell>
                  <TableCell className="text-sm">{r.designation}</TableCell>
                  <TableCell className="text-center text-sm">{r.quantity}</TableCell>
                  <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                  <TableCell className="text-sm">{formatDateFR(r.plannedDeadline) || '—'}</TableCell>
                  <TableCell className="text-sm">{r.operationName}</TableCell>
                  <TableCell className="text-sm font-medium">{r.subcontractorName}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(r.startDate)} {r.startTime}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(r.endDate)} {r.endTime}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubcontractorTableDialog;
