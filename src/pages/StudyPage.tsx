import React, { useMemo, useState, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import type { OrderPriority, ResourceStatus } from '@/types/planning';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePromptDialog from '@/components/DatePromptDialog';
import { dbUpdateOrder, dbUpdateStep } from '@/lib/supabase-data';

const priorityColors: Record<OrderPriority, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
};

const StudyPage: React.FC = () => {
  const { orders, clients, steps, updateStep, updateOrder, absenceOrderId, absenceOperationId } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pendingStudy, setPendingStudy] = useState<{ stepIds: string[] } | null>(null);
  const [datePromptOpen, setDatePromptOpen] = useState(false);
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const today = new Date().toISOString().split('T')[0];

  const rows = useMemo(() => {
    const isStudyBlocked = (status: ResourceStatus | undefined) => status === 'non-disponible' || status === 'partiel';
    const result: { orderId: string; stepIds: string[]; deadline: string; done: boolean }[] = [];
    const orderMap = new Map<string, { stepIds: string[]; deadline: string; done: boolean }>();
    orders
      .filter(o => o.id !== absenceOrderId && isStudyBlocked(o.studyStatus))
      .forEach(o => orderMap.set(o.id, { stepIds: [], deadline: '', done: false }));

    steps.filter(s => s.operationId !== absenceOperationId).forEach(s => {
      const order = orders.find(o => o.id === s.orderId);
      if (!order || !isStudyBlocked(s.studyStatus ?? order.studyStatus)) return;
      const existing = orderMap.get(s.orderId);
      if (!existing) {
        orderMap.set(s.orderId, { stepIds: [s.id], deadline: s.studyDeadline || '', done: false });
      } else {
        existing.stepIds.push(s.id);
        if ((s.studyDeadline || '') > existing.deadline) existing.deadline = s.studyDeadline || '';
      }
    });

    orderMap.forEach((info, orderId) => {
      const order = orders.find(o => o.id === orderId);
      if (order && order.id !== absenceOrderId) result.push({ orderId, ...info });
    });
    return result;
  }, [steps, orders, absenceOrderId, absenceOperationId]);

  const filteredRows = useMemo(() => {
    let list = rows.map(r => ({ ...r, order: orders.find(o => o.id === r.orderId)! })).filter(r => r.order);
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      list = list.filter(r => {
        if (key === 'orderNumber') return r.order.orderNumber.toLowerCase().includes(lv);
        if (key === 'client') return getClientName(r.order.clientId).toLowerCase().includes(lv);
        if (key === 'designation') return r.order.designation.toLowerCase().includes(lv);
        return true;
      });
    });
    return list;
  }, [rows, orders, filters, getClientName]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const markDone = async (orderId: string, stepIds: string[], completedDate: string) => {
    const updatedSteps = stepIds.map(id => {
      const step = steps.find(s => s.id === id);
      return step ? { ...step, studyStatus: 'disponible' as const, studyReady: true, studyDeadline: undefined, studyCompletedDate: completedDate } : null;
    }).filter(Boolean) as typeof steps;
    const order = orders.find(o => o.id === orderId);
    if (!order) return false;
    const updatedOrder = { ...order, studyStatus: 'disponible' as ResourceStatus, studyReady: true };

    const saved = await Promise.all([...updatedSteps.map(dbUpdateStep), dbUpdateOrder(updatedOrder)]);
    if (saved.some(ok => !ok)) return false;

    updatedSteps.forEach(updateStep);
    updateOrder(updatedOrder);
    return true;
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Études" description="Étapes dont l'étude n'est pas encore faite" />
      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead><ColumnHeader label="N° Commande" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Client" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Désignation" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-center">Qté.</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Délai promis</TableHead>
              <TableHead>Date prévue fin étude</TableHead>
              <TableHead className="text-center w-16">Fait</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Toutes les études sont faites ✓</TableCell></TableRow>
            ) : filteredRows.map((r) => (
              <TableRow key={r.orderId}>
                <TableCell className="text-center text-muted-foreground font-mono text-xs">{r.order.displayOrder ?? '—'}</TableCell>
                <TableCell className="text-sm font-medium">{r.order.orderNumber}</TableCell>
                <TableCell className="text-sm">{getClientName(r.order.clientId)}</TableCell>
                <TableCell className="text-sm">{r.order.designation}</TableCell>
                <TableCell className="text-center text-sm">{r.order.quantity}</TableCell>
                <TableCell>{r.order.priority ? <Badge className={`${priorityColors[r.order.priority]} text-xs`}>{r.order.priority}</Badge> : '—'}</TableCell>
                <TableCell className="text-sm">{formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—'}</TableCell>
                <TableCell className="text-sm">{formatDateFR(r.deadline) || '—'}</TableCell>
                <TableCell className="text-center"><Checkbox checked={false} onCheckedChange={() => setPendingStudy({ orderId: r.orderId, stepIds: r.stepIds })} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!pendingStudy && !datePromptOpen}
        title="Confirmez-vous cette action ?"
        onConfirm={() => setDatePromptOpen(true)}
        onCancel={() => {
          setDatePromptOpen(false);
          setPendingStudy(null);
        }}
      />

      {pendingStudy && datePromptOpen && (
        <DatePromptDialog
          open={datePromptOpen}
          label="Date de fin d'étude"
          defaultDate={today}
          onConfirm={async (date) => {
            const saved = await markDone(pendingStudy.orderId, pendingStudy.stepIds, date);
            if (!saved) return;
            setDatePromptOpen(false);
            setPendingStudy(null);
          }}
          onCancel={() => {
            setDatePromptOpen(false);
            setPendingStudy(null);
          }}
        />
      )}
    </div>
  );
};

export default StudyPage;
