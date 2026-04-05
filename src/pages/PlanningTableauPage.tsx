import React, { useMemo, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateFR } from '@/lib/utils';
import { ArrowUp, ArrowDown, Download } from 'lucide-react';
import type { ProductionStep, Order } from '@/types/planning';
import * as XLSX from 'xlsx';

const OPERATOR_NAME_ORDER = ['محمود', 'بلال', 'صالح', 'عادل', 'عبد الرزاق', 'حمزة', 'عمر', 'ياسين', 'معاذ', 'يوسف'];

function getPriorityTextClass(priority: string): string {
  if (priority === 'P1') return 'text-[hsl(0,72%,51%)]';
  if (priority === 'P2') return 'text-[hsl(30,90%,50%)]';
  return 'text-foreground';
}

function getDesignationBg(priority: string): string {
  if (priority === 'P1') return 'bg-[hsl(0,72%,51%)]/10';
  if (priority === 'P2') return 'bg-[hsl(30,90%,50%)]/10';
  if (priority === 'P3') return 'bg-[hsl(160,60%,40%)]/10';
  if (priority === 'P4') return 'bg-[hsl(55,90%,50%)]/20';
  return '';
}

const PlanningTableauPage: React.FC = () => {
  const { operators, orders, steps, clients, operations, absenceOperationId, absenceOrderId, updateStep } = usePlanning();
  const today = new Date().toISOString().split('T')[0];
  const [filterDate, setFilterDate] = useState(today);

  // Group steps by operator for selected date
  const operatorTasks = useMemo(() => {
    const dateStr = filterDate;
    const result: Record<string, { operator: typeof operators[0]; tasks: { step: ProductionStep; order: Order }[] }> = {};

    // Init all operators
    operators.forEach(op => {
      result[op.id] = { operator: op, tasks: [] };
    });

    steps.forEach(step => {
      if (step.operationId === absenceOperationId) return;
      if (step.orderId === absenceOrderId) return;
      if (!step.operatorId) return;
      if (!step.startDate || !step.endDate) return;

      // Check if step overlaps with the selected date
      if (step.startDate <= dateStr && step.endDate >= dateStr) {
        const order = orders.find(o => o.id === step.orderId);
        if (!order) return;
        if (result[step.operatorId]) {
          result[step.operatorId].tasks.push({ step, order });
        }
      }
    });

    // Sort operators by custom order, filter out empty
    return Object.values(result)
      .sort((a, b) => {
        const ai = OPERATOR_NAME_ORDER.indexOf(a.operator.name);
        const bi = OPERATOR_NAME_ORDER.indexOf(b.operator.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .filter(g => g.tasks.length > 0);
  }, [operators, steps, orders, filterDate, absenceOperationId, absenceOrderId]);

  const getClientName = useCallback((clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || '—';
  }, [clients]);

  const getOperationName = useCallback((opId: string) => {
    return operations.find(o => o.id === opId)?.name || '—';
  }, [operations]);

  // Move task within operator's list
  const moveTask = useCallback((operatorId: string, stepId: string, direction: -1 | 1) => {
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group) return;
    const idx = group.tasks.findIndex(t => t.step.id === stepId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= group.tasks.length) return;

    // Swap step_order values
    const stepA = group.tasks[idx].step;
    const stepB = group.tasks[newIdx].step;
    updateStep({ ...stepA, order: stepB.order });
    updateStep({ ...stepB, order: stepA.order });
  }, [operatorTasks, updateStep]);

  // Export to Excel
  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const merges: XLSX.Range[] = [];
    let rowIdx = 0;

    operatorTasks.forEach(group => {
      // Operator name header
      wsData.push([group.operator.name]);
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 4 } });
      rowIdx++;

      // Column headers
      wsData.push(['التاريخ', 'الطلبية N°', 'الزبون', 'تعيين', 'الكمية']);
      rowIdx++;

      group.tasks.forEach(({ step, order }) => {
        wsData.push([
          formatDateFR(step.startDate),
          order.orderNumber,
          getClientName(order.clientId),
          order.designation,
          order.quantity,
        ]);
        rowIdx++;
      });

      // Empty row separator
      wsData.push([]);
      rowIdx++;
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 45 }, { wch: 10 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    XLSX.writeFile(wb, `Planning_${filterDate}.xlsx`);
  }, [operatorTasks, filterDate, getClientName]);

  return (
    <div>
      <PageHeader
        title="Planning Tableau"
        action={
          <div className="flex items-center gap-3">
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-44" />
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" /> Exporter Excel
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {operatorTasks.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Aucune tâche planifiée pour le {formatDateFR(filterDate)}</p>
        )}

        {operatorTasks.map(group => (
          <div key={group.operator.id} className="bg-card rounded-lg border overflow-hidden">
            <div className="bg-muted py-2 px-4 text-center">
              <h3 className="text-base font-heading font-bold text-[hsl(0,72%,51%)]">{group.operator.name}</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-24">N° Commande</TableHead>
                  <TableHead className="w-32">Client</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="w-20 text-center">Qté</TableHead>
                  <TableHead className="w-20">Ordre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.tasks.map(({ step, order }) => {
                  const priorityText = getPriorityTextClass(order.priority);
                  const designationBg = getDesignationBg(order.priority);
                  return (
                    <TableRow key={step.id}>
                      <TableCell className="text-xs">{formatDateFR(step.startDate)}</TableCell>
                      <TableCell className={`font-medium ${priorityText}`}>{order.orderNumber}</TableCell>
                      <TableCell className={priorityText}>{getClientName(order.clientId)}</TableCell>
                      <TableCell className={designationBg}>{order.designation}</TableCell>
                      <TableCell className="text-center">{order.quantity}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveTask(group.operator.id, step.id, -1)}>
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveTask(group.operator.id, step.id, 1)}>
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanningTableauPage;
