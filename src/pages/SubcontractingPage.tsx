import React, { useMemo, useState, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePromptDialog from '@/components/DatePromptDialog';
import { dbUpdateStep } from '@/lib/supabase-data';

type ColumnKey = 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'plannedDeadline' | 'subcontractingDeadline' | 'subcontractor';

const SubcontractingPage: React.FC = () => {
  const { orders, clients, steps, operations, subcontractors, updateStep, absenceOrderId } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pendingDone, setPendingDone] = useState<{ stepIds: string[] } | null>(null);
  const [datePromptOpen, setDatePromptOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const getSubcontractorName = useCallback((id: string | undefined) => {
    if (!id) return '—';
    return subcontractors.find(s => s.id === id)?.companyName || '—';
  }, [subcontractors]);

  // Find all subcontractor steps (operations with category 'subcontractor')
  const subcontractorOpIds = useMemo(() => {
    return new Set(operations.filter(op => op.category === 'subcontractor').map(op => op.id));
  }, [operations]);

  const subcontractingRows = useMemo(() => {
    const subSteps = steps.filter(s => subcontractorOpIds.has(s.operationId));

    const orderMap = new Map<string, { deadline: string; done: boolean; stepIds: string[]; subcontractorId: string | undefined }>();
    subSteps.forEach(s => {
      const existing = orderMap.get(s.orderId);
      if (!existing) {
        orderMap.set(s.orderId, {
          deadline: s.subcontractingDeadline || s.endDate || '',
          done: s.subcontractingDone ?? false,
          stepIds: [s.id],
          subcontractorId: s.subcontractorId,
        });
      } else {
        if ((s.subcontractingDeadline || s.endDate || '') > existing.deadline) {
          existing.deadline = s.subcontractingDeadline || s.endDate || '';
        }
        if (!(s.subcontractingDone ?? false)) existing.done = false;
        existing.stepIds.push(s.id);
        // Use first non-empty subcontractorId
        if (!existing.subcontractorId && s.subcontractorId) {
          existing.subcontractorId = s.subcontractorId;
        }
      }
    });

    const rows = Array.from(orderMap.entries()).map(([orderId, info]) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || order.id === absenceOrderId) return null;
      return { order, ...info };
    }).filter(Boolean) as { order: typeof orders[0]; deadline: string; done: boolean; stepIds: string[]; subcontractorId: string | undefined }[];

    // Sort by displayOrder (Cn) from "Commandes en cours"
    rows.sort((a, b) => (a.order.displayOrder ?? 9999) - (b.order.displayOrder ?? 9999));
    return rows;
  }, [steps, orders, subcontractorOpIds, absenceOrderId]);

  const filteredRows = useMemo(() => {
    let result = subcontractingRows.filter(r => !r.done);

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
          case 'subcontractor': return getSubcontractorName(r.subcontractorId).toLowerCase().includes(lv);
          default: return true;
        }
      });
    });

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
          case 'subcontractor': cmp = getSubcontractorName(a.subcontractorId).localeCompare(getSubcontractorName(b.subcontractorId)); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [subcontractingRows, filters, sortKey, sortDir, getClientName, getSubcontractorName]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const applyDone = async (stepIds: string[], done: boolean, receivedDate?: string) => {
    const updatedSteps = stepIds.map(id => {
      const step = steps.find(s => s.id === id);
      return step ? { ...step, subcontractingDone: done, subcontractingReceivedDate: done ? receivedDate : undefined } : null;
    }).filter(Boolean) as typeof steps;

    const saved = await Promise.all(updatedSteps.map(dbUpdateStep));
    if (saved.some(ok => !ok)) return;
    updatedSteps.forEach(updateStep);
  };

  const toggleDone = (stepIds: string[], currentDone: boolean) => {
    if (currentDone) {
      applyDone(stepIds, false);
      return;
    }
    setPendingDone({ stepIds });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Sous-traitance" description="Suivi des opérations sous-traitées planifiées" />
      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">Cn</TableHead>
              <TableHead><ColumnHeader label="N° Commande" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Date" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Client" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Désignation" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-center"><ColumnHeader label="Qté." columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Priorité" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Sous-traitant" columnKey="subcontractor" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.subcontractor || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Délai promis" columnKey="plannedDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.plannedDeadline || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Délai sous-traitance" columnKey="subcontractingDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.subcontractingDeadline || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-center w-16">Fait</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  Aucune sous-traitance planifiée ✓
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row, idx) => (
                <TableRow key={row.order.id} className={row.done ? 'opacity-60' : ''}>
                  <TableCell className="text-center text-muted-foreground font-mono text-xs">{row.order.displayOrder ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{row.order.orderNumber}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.order.orderDate) || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{getClientName(row.order.clientId)}</TableCell>
                  <TableCell className="text-sm">{row.order.designation}</TableCell>
                  <TableCell className="text-center text-sm">{row.order.quantity}</TableCell>
                  <TableCell>
                    <PriorityBadge priority={row.order.priority} />
                  </TableCell>
                  <TableCell className="text-sm font-medium">{getSubcontractorName(row.subcontractorId)}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.order.plannedDeadline) || '—'}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.deadline) || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={row.done}
                      onCheckedChange={() => toggleDone(row.stepIds, row.done)}
                      title={row.done ? `Reçu le ${formatDateFR(steps.find(s => row.stepIds.includes(s.id))?.subcontractingReceivedDate) || '—'}` : 'Sous-traitance effectuée'}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!pendingDone && !datePromptOpen}
        title="Confirmez-vous cette action ?"
        onConfirm={() => setDatePromptOpen(true)}
        onCancel={() => setPendingDone(null)}
      />

      {pendingDone && datePromptOpen && (
        <DatePromptDialog
          open={datePromptOpen}
          label="Date de réception de la sous-traitance"
          defaultDate={today}
          onConfirm={(date) => {
            applyDone(pendingDone.stepIds, true, date);
            setDatePromptOpen(false);
            setPendingDone(null);
          }}
          onCancel={() => {
            setDatePromptOpen(false);
            setPendingDone(null);
          }}
        />
      )}
    </div>
  );
};

export default SubcontractingPage;
