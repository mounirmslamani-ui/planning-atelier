import React, { useMemo, useState, useCallback } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import type { ResourceStatus } from '@/types/planning';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePromptDialog from '@/components/DatePromptDialog';
import { dbUpdateOrder, dbUpdateStep } from '@/lib/supabase-data';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { buildOutOfPreparationFlowSet } from '@/lib/preparationFilter';
import { OrderNumberLink } from '@/context/OrderSheetContext';

const StudyPage: React.FC = () => {
  const { orders, clients, steps, updateStep, updateOrder, absenceOrderId, absenceOperationId, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, productionRecords } = usePlanning();
  const excludedIds = useMemo(() => buildOutOfPreparationFlowSet({ orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId }), [orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pendingStudy, setPendingStudy] = useState<{ orderId: string; stepIds: string[] } | null>(null);
  const [datePromptOpen, setDatePromptOpen] = useState(false);
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const today = new Date().toISOString().split('T')[0];

  const rows = useMemo(() => {
    const isStudyBlocked = (status: ResourceStatus | undefined) => status === 'non-disponible' || status === 'partiel';
    const result: { orderId: string; stepIds: string[]; deadline: string; done: boolean }[] = [];
    const orderMap = new Map<string, { stepIds: string[]; deadline: string; done: boolean }>();
    orders
      .filter(o => o.id !== absenceOrderId && !excludedIds.has(o.id) && isStudyBlocked(o.studyStatus))
      .forEach(o => orderMap.set(o.id, { stepIds: [], deadline: '', done: false }));

    steps.filter(s => s.operationId !== absenceOperationId).forEach(s => {
      const order = orders.find(o => o.id === s.orderId);
      if (!order || excludedIds.has(order.id) || !isStudyBlocked(s.studyStatus ?? order.studyStatus)) return;
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
  }, [steps, orders, absenceOrderId, absenceOperationId, excludedIds]);

  const filteredRows = useMemo(() => {
    let list = rows.map(r => ({ ...r, order: orders.find(o => o.id === r.orderId)! })).filter(r => r.order);
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      list = list.filter(r => {
        if (key === 'displayOrder') return String(r.order.displayOrder ?? '').includes(val);
        if (key === 'orderNumber') return r.order.orderNumber.toLowerCase().includes(lv);
        if (key === 'client') return getClientName(r.order.clientId).toLowerCase().includes(lv);
        if (key === 'designation') return r.order.designation.toLowerCase().includes(lv);
        if (key === 'quantity') return String(r.order.quantity).includes(val);
        if (key === 'priority') { const vals = val.split('|').filter(Boolean); return vals.includes(r.order.priority as string); }
        return true;
      });
    });
    return list;
  }, [rows, orders, filters, getClientName]);

  const allValuesByKey = useMemo(() => {
    const list = rows.map(r => ({ ...r, order: orders.find(o => o.id === r.orderId)! })).filter(r => r.order);
    const get = (r: any, k: string) => {
      switch (k) {
        case 'displayOrder': return String(r.order.displayOrder ?? '');
        case 'orderNumber': return r.order.orderNumber;
        case 'client': return getClientName(r.order.clientId);
        case 'designation': return r.order.designation;
        case 'quantity': return String(r.order.quantity);
        case 'priority': return r.order.priority || '';
        default: return '';
      }
    };
    const keys = ['displayOrder','orderNumber','client','designation','quantity','priority'];
    const map: Record<string, string[]> = {};
    keys.forEach(k => { map[k] = [...new Set(list.map((r: any) => get(r, k)).filter(Boolean))].sort(); });
    return map;
  }, [rows, orders, getClientName]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleExportExcel = () => {
    exportTableToExcel('دراسة', filteredRows.map(r => ({
      '#': r.order.displayOrder ?? '—',
      'رقم الطلبية': r.order.orderNumber,
      Client: getClientName(r.order.clientId),
      Désignation: r.order.designation,
      'الكمية': r.order.quantity,
      Priorité: r.order.priority || '—',
      'أجل التسليم الموعود': formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—',
      'تاريخ نهاية الدراسة المبرمج': formatDateFR(r.deadline) || '—',
      Fait: 'Non',
    })), [8, 20, 24, 45, 10, 12, 16, 22, 10]);
  };

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="دراسة" description="Étapes dont l'étude n'est pas encore faite" actions={
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        } />
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center"><ColumnHeader label="ترتيب" columnKey="displayOrder" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.displayOrder || ''} onFilter={handleFilter} allValues={allValuesByKey.displayOrder} /></TableHead>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.orderNumber} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} allValues={allValuesByKey.client} /></TableHead>
                <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} allValues={allValuesByKey.designation} /></TableHead>
                <TableHead className="text-center"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} allValues={allValuesByKey.quantity} /></TableHead>
                <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} allValues={allValuesByKey.priority} /></TableHead>
              <TableHead>أجل التسليم الموعود</TableHead>
              <TableHead>تاريخ نهاية الدراسة المبرمج</TableHead>
              <TableHead className="text-center w-16">تم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Toutes les études sont faites ✓</TableCell></TableRow>
            ) : filteredRows.map((r) => (
              <TableRow key={r.orderId}>
                <TableCell className="text-center text-muted-foreground font-mono text-xs">{r.order.displayOrder ?? '—'}</TableCell>
                <TableCell className="text-sm font-medium"><OrderNumberLink orderId={r.order.id} orderNumber={r.order.orderNumber} /></TableCell>
                <TableCell className="text-sm">{getClientName(r.order.clientId)}</TableCell>
                <TableCell className="text-sm"><DesignationCell orderId={r.order.id} designation={r.order.designation} /></TableCell>
                <TableCell className="text-center text-sm">{r.order.quantity}</TableCell>
                <TableCell><PriorityBadge priority={r.order.priority} /></TableCell>
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
        title="هل تؤكد هذه العملية؟"
        onConfirm={() => setDatePromptOpen(true)}
        onCancel={() => {
          setDatePromptOpen(false);
          setPendingStudy(null);
        }}
      />

      {pendingStudy && datePromptOpen && (
        <DatePromptDialog
          open={datePromptOpen}
          label="تاريخ نهاية الدراسة"
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
