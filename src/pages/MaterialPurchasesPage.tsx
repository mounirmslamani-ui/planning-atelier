import React, { useMemo, useState, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import type { ResourceStatus } from '@/types/planning';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePromptDialog from '@/components/DatePromptDialog';
import { dbUpdateOrder, dbUpdateStep } from '@/lib/supabase-data';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { buildOutOfPreparationFlowSet } from '@/lib/preparationFilter';

const MaterialPurchasesPage: React.FC = () => {
  const { orders, clients, steps, updateStep, updateOrder, absenceOrderId, absenceOperationId, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, productionRecords } = usePlanning();
  const excludedIds = useMemo(() => buildOutOfPreparationFlowSet({ orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId }), [orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pendingReceipt, setPendingReceipt] = useState<{ orderId: string; stepIds: string[] } | null>(null);
  const [datePromptOpen, setDatePromptOpen] = useState(false);
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const today = new Date().toISOString().split('T')[0];

  const rows = useMemo(() => {
    const isMaterialBlocked = (status: ResourceStatus | undefined) => status === 'non-disponible' || status === 'partiel';
    const orderMap = new Map<string, { stepIds: string[]; deadline: string }>();
    orders
      .filter(o => o.id !== absenceOrderId && !excludedIds.has(o.id) && isMaterialBlocked(o.materialStatus))
      .forEach(o => orderMap.set(o.id, { stepIds: [], deadline: '' }));
    steps.filter(s => s.operationId !== absenceOperationId).forEach(s => {
      const order = orders.find(o => o.id === s.orderId);
      if (!order || excludedIds.has(order.id) || !isMaterialBlocked(order.materialStatus)) return;
      const existing = orderMap.get(s.orderId);
      if (!existing) {
        orderMap.set(s.orderId, { stepIds: [s.id], deadline: s.materialDeadline || '' });
      } else {
        existing.stepIds.push(s.id);
        if ((s.materialDeadline || '') > existing.deadline) existing.deadline = s.materialDeadline || '';
      }
    });
    return Array.from(orderMap.entries()).map(([orderId, info]) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || order.id === absenceOrderId) return null;
      return { orderId, order, ...info };
    }).filter(Boolean) as any[];
  }, [steps, orders, absenceOrderId, absenceOperationId]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      list = list.filter((r: any) => {
        if (key === 'displayOrder') return String(r.order.displayOrder ?? '').includes(val);
        if (key === 'orderNumber') return r.order.orderNumber.toLowerCase().includes(lv);
        if (key === 'client') return getClientName(r.order.clientId).toLowerCase().includes(lv);
        if (key === 'designation') return r.order.designation.toLowerCase().includes(lv);
        if (key === 'quantity') return String(r.order.quantity).includes(val);
        if (key === 'priority') return r.order.priority === val;
        return true;
      });
    });
    return list;
  }, [rows, filters, getClientName]);

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
      'أجل التسليم الموعود': formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—',
      'التاريخ المبرمج لشراء المواد الأولية': formatDateFR(r.deadline) || '—',
      Fait: 'Non',
    })), [8, 20, 24, 45, 10, 12, 16, 26, 10]);
  };

  const markDone = async (orderId: string, stepIds: string[], receivedDate: string) => {
    const updatedSteps = stepIds.map(id => {
      const step = steps.find(s => s.id === id);
      return step ? { ...step, materialStatus: 'disponible' as ResourceStatus, materialAvailable: true, materialDeadline: undefined } : null;
    }).filter(Boolean) as typeof steps;

    const order = orders.find(o => o.id === orderId);
    if (!order) return false;

    const updatedOrder = {
      ...order,
      materialStatus: 'disponible' as ResourceStatus,
      materialAvailable: true,
      materialReceivedDate: receivedDate,
    };

    const saved = await Promise.all([...updatedSteps.map(dbUpdateStep), dbUpdateOrder(updatedOrder)]);
    if (saved.some(ok => !ok)) return false;

    updatedSteps.forEach(updateStep);
    updateOrder(updatedOrder);
    return true;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="مشتريات المواد الأولية" description="Étapes dont la matière n'est pas encore disponible" actions={
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        } />
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center"><ColumnHeader label="ترتيب" columnKey="displayOrder" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.displayOrder || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
                <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
                <TableHead className="text-center"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
                <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} filterMode="select" filterOptions={['P1', 'P2', 'P3', 'P4']} /></TableHead>
              <TableHead>أجل التسليم الموعود</TableHead>
              <TableHead>التاريخ المبرمج لشراء المواد الأولية</TableHead>
              <TableHead className="text-center w-16">تم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Toutes les matières sont disponibles ✓</TableCell></TableRow>
            ) : filteredRows.map((r: any) => (
              <TableRow key={r.orderId}>
                <TableCell className="text-center text-muted-foreground font-mono text-xs">{r.order.displayOrder ?? '—'}</TableCell>
                <TableCell className="text-sm font-medium">{r.order.orderNumber}</TableCell>
                <TableCell className="text-sm">{getClientName(r.order.clientId)}</TableCell>
                <TableCell className="text-sm">{r.order.designation}</TableCell>
                <TableCell className="text-center text-sm">{r.order.quantity}</TableCell>
                <TableCell><PriorityBadge priority={r.order.priority} /></TableCell>
                <TableCell className="text-sm">{formatDateFR(r.order.deliveryDeadline || r.order.plannedDeadline) || '—'}</TableCell>
                <TableCell className="text-sm">{formatDateFR(r.deadline) || '—'}</TableCell>
                <TableCell className="text-center"><Checkbox checked={false} onCheckedChange={() => setPendingReceipt({ orderId: r.orderId, stepIds: r.stepIds })} title={`Client : ${getClientName(r.order.clientId)}`} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!pendingReceipt && !datePromptOpen}
        title="هل تؤكد هذه العملية؟"
        onConfirm={() => setDatePromptOpen(true)}
        onCancel={() => {
          setDatePromptOpen(false);
          setPendingReceipt(null);
        }}
      />

      {pendingReceipt && datePromptOpen && (
        <DatePromptDialog
          open={datePromptOpen}
          label="تاريخ استلام المواد الأولية"
          defaultDate={orders.find(o => o.id === pendingReceipt.orderId)?.materialReceivedDate || today}
          onConfirm={async (date) => {
            const saved = await markDone(pendingReceipt.orderId, pendingReceipt.stepIds, date);
            if (!saved) return;
            setDatePromptOpen(false);
            setPendingReceipt(null);
          }}
          onCancel={() => {
            setDatePromptOpen(false);
            setPendingReceipt(null);
          }}
        />
      )}
    </div>
  );
};

export default MaterialPurchasesPage;
