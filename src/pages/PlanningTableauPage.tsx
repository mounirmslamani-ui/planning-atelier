import React, { useMemo, useState, useCallback, useRef } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateFR } from '@/lib/utils';
import { Download, Plus, Minus, GripVertical, Pencil, CalendarCheck } from 'lucide-react';
import { isWorkDay, addWorkMinutes } from '@/lib/workTime';
import type { ProductionStep, Order, Holiday } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import * as XLSX from 'xlsx';

const OPERATOR_NAME_ORDER = ['محمود', 'بلال', 'صالح', 'عبد الرزاق', 'حمزة', 'عمر', 'ياسين', 'معاذ', 'يوسف'];

const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

const priorityColors: Record<string, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
};

function getDesignationBg(priority: string): string {
  if (priority === 'P1') return 'bg-[hsl(0,72%,51%)]/10';
  if (priority === 'P2') return 'bg-[hsl(30,90%,50%)]/10';
  if (priority === 'P3') return 'bg-[hsl(160,60%,40%)]/10';
  if (priority === 'P4') return 'bg-[hsl(55,90%,50%)]/20';
  return '';
}

/** Traffic light emoji for prerequisite status */
function trafficLight(available: boolean | undefined, hasDeadline: boolean): string {
  if (available === undefined || available === null) return '⚫'; // non applicable
  if (available) return '🟢'; // ready
  if (hasDeadline) return '🟠'; // partially — has a deadline set
  return '🔴'; // blocked, no deadline
}

function cycleTrafficLight(available: boolean | undefined, hasDeadline: boolean): { available: boolean; hasDeadline: boolean } {
  const current = trafficLight(available, hasDeadline);
  if (current === '🟢') return { available: false, hasDeadline: true }; // → 🟠
  if (current === '🟠') return { available: false, hasDeadline: false }; // → 🔴
  if (current === '🔴') return { available: true, hasDeadline: false }; // → ⚫ (skip to green)
  // ⚫ → 🟢
  return { available: true, hasDeadline: false };
}

/** Phase amont: check if all previous steps for this order are done */
function phaseAmontStatus(
  step: ProductionStep,
  allSteps: ProductionStep[],
  productionRecords: { stepId: string; actualDuration: number }[],
): 'green' | 'red' | 'warning' | 'na' {
  const orderSteps = allSteps.filter(s => s.orderId === step.orderId).sort((a, b) => a.order - b.order);
  const currentIdx = orderSteps.findIndex(s => s.id === step.id);
  if (currentIdx <= 0) return 'na';
  const previousSteps = orderSteps.slice(0, currentIdx);
  const allPreviousDone = previousSteps.every(ps => {
    const records = productionRecords.filter(r => r.stepId === ps.id);
    const totalDone = records.reduce((sum, r) => sum + r.actualDuration, 0);
    return totalDone >= ps.estimatedDuration;
  });
  if (allPreviousDone) return 'green';
  return 'red';
}

function phaseAmontEmoji(status: string): string {
  if (status === 'green') return '🟢';
  if (status === 'red') return '🔴';
  if (status === 'warning') return '⚠️';
  return '⚫';
}

function cyclePhaseAmont(status: string): string {
  if (status === 'na') return 'green';
  if (status === 'green') return 'red';
  if (status === 'red') return 'warning';
  return 'na';
}

function getWorkingDays(n: number, holidays: Holiday[]): string[] {
  const result: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let scanned = 0;
  while (result.length < n && scanned < n * 4) {
    if (isWorkDay(cursor, holidays)) {
      result.push(cursor.toISOString().split('T')[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
    scanned++;
  }
  return result;
}

function formatMinutesToHM(minutes: number): string {
  if (minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h00`;
}

/** Recalculate start dates sequentially for tasks assigned to same operator */
function recalcStartDates(
  tasks: { step: ProductionStep; order: Order }[],
  holidays: Holiday[],
): ProductionStep[] {
  const now = new Date();
  now.setHours(7, 0, 0, 0); // work day start
  // Make sure we start on a work day
  while (!isWorkDay(now, holidays)) {
    now.setDate(now.getDate() + 1);
  }

  let cursor = now;
  const updated: ProductionStep[] = [];

  for (const { step } of tasks) {
    const start = new Date(cursor);
    const end = addWorkMinutes(start, step.estimatedDuration, holidays);
    const startDate = start.toISOString().split('T')[0];
    const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    const endDate = end.toISOString().split('T')[0];
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

    if (step.startDate !== startDate || step.startTime !== startTime || step.endDate !== endDate || step.endTime !== endTime) {
      updated.push({ ...step, startDate, startTime, endDate, endTime });
    }
    cursor = end;
  }
  return updated;
}

interface TaskItem {
  step: ProductionStep;
  order: Order;
}

const PlanningTableauPage: React.FC = () => {
  const {
    operators, orders, steps, clients, operations,
    absenceOperationId, absenceOrderId, updateStep, updateOrder,
    holidays, productionRecords,
  } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [numDays, setNumDays] = useState(5);
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineEdits, setInlineEdits] = useState<Record<string, Partial<Order>>>({});
  const [phaseAmontWarning, setPhaseAmontWarning] = useState<{ stepId: string; operatorId: string; pendingTasks: TaskItem[] } | null>(null);

  // Drag & drop state
  const [dragOperatorId, setDragOperatorId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const workingDays = useMemo(() => getWorkingDays(numDays, holidays), [numDays, holidays]);

  const getClientName = useCallback((clientId: string) => {
    if (!clientId) return '*******';
    return clients.find(c => c.id === clientId)?.name || '*******';
  }, [clients]);

  const getOperationName = useCallback((opId: string) => {
    return operations.find(o => o.id === opId)?.name || '—';
  }, [operations]);

  // Group steps by operator for the working days range, sorted by step.order
  const operatorTasks = useMemo(() => {
    if (workingDays.length === 0) return [];
    const firstDay = workingDays[0];
    const lastDay = workingDays[workingDays.length - 1];

    const result: Record<string, { operator: typeof operators[0]; tasks: TaskItem[] }> = {};
    operators.forEach(op => {
      result[op.id] = { operator: op, tasks: [] };
    });

    steps.forEach(step => {
      if (step.operationId === absenceOperationId) return;
      if (step.orderId === absenceOrderId) return;
      if (!step.operatorId) return;
      if (!step.startDate || !step.endDate) return;
      if (step.subcontractorId) return;

      if (step.startDate <= lastDay && step.endDate >= firstDay) {
        const order = orders.find(o => o.id === step.orderId);
        if (!order) return;
        if (result[step.operatorId]) {
          result[step.operatorId].tasks.push({ step, order });
        }
      }
    });

    // Sort tasks within each operator by step.order (manual ordering)
    Object.values(result).forEach(group => {
      group.tasks.sort((a, b) => a.step.order - b.step.order);
    });

    return Object.values(result)
      .sort((a, b) => {
        const ai = OPERATOR_NAME_ORDER.indexOf(a.operator.name);
        const bi = OPERATOR_NAME_ORDER.indexOf(b.operator.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .filter(g => g.tasks.length > 0);
  }, [operators, steps, orders, workingDays, absenceOperationId, absenceOrderId]);

  // Drag & drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, operatorId: string, index: number) => {
    setDragOperatorId(operatorId);
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, operatorId: string, index: number) => {
    e.preventDefault();
    if (dragOperatorId !== operatorId) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, [dragOperatorId]);

  const handleDrop = useCallback((e: React.DragEvent, operatorId: string, dropIndex: number) => {
    e.preventDefault();
    if (dragOperatorId !== operatorId || dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      setDragOperatorId(null);
      return;
    }

    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group) return;

    const items = [...group.tasks];
    const [dragged] = items.splice(dragIndex, 1);
    items.splice(dropIndex, 0, dragged);

    // Check phase amont if moved up
    if (dropIndex < dragIndex) {
      const amontStatus = phaseAmontStatus(dragged.step, steps, productionRecords);
      if (amontStatus === 'red') {
        setPhaseAmontWarning({ stepId: dragged.step.id, operatorId, pendingTasks: items });
        setDragIndex(null);
        setDragOverIndex(null);
        setDragOperatorId(null);
        return;
      }
    }

    applyReorder(items);
    setDragIndex(null);
    setDragOverIndex(null);
    setDragOperatorId(null);
  }, [dragOperatorId, dragIndex, operatorTasks, steps, productionRecords]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    setDragOperatorId(null);
  }, []);

  /** Apply new order + recalculate dates */
  const applyReorder = useCallback((tasks: TaskItem[]) => {
    // Reassign step.order sequentially
    tasks.forEach(({ step }, idx) => {
      const newOrder = idx + 1;
      if (step.order !== newOrder) {
        updateStep({ ...step, order: newOrder });
      }
    });

    // Recalculate start/end dates
    const dateUpdates = recalcStartDates(tasks, holidays);
    dateUpdates.forEach(s => updateStep(s));
  }, [updateStep, holidays]);

  // Inline edit helpers
  const getInlineValue = (o: Order, field: keyof Order) => {
    return inlineEdits[o.id]?.[field] ?? o[field];
  };
  const setInlineValue = (id: string, field: keyof Order, value: any) => {
    setInlineEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const saveInlineEdits = (id: string) => {
    const changes = inlineEdits[id];
    const order = orders.find(o => o.id === id);
    if (order && changes && Object.keys(changes).length > 0) {
      updateOrder({ ...order, ...changes });
    }
    setInlineEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingRowId(null);
  };
  const cancelInlineEdits = (id: string) => {
    setInlineEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingRowId(null);
  };

  // Toggle status handlers (when editing)
  const toggleStudy = useCallback((step: ProductionStep) => {
    const { available } = cycleTrafficLight(step.studyReady, !!step.studyDeadline);
    updateStep({ ...step, studyReady: available, studyDeadline: available ? undefined : step.studyDeadline });
  }, [updateStep]);

  const toggleMaterial = useCallback((step: ProductionStep) => {
    const { available } = cycleTrafficLight(step.materialAvailable, !!step.materialDeadline);
    updateStep({ ...step, materialAvailable: available, materialDeadline: available ? undefined : step.materialDeadline });
  }, [updateStep]);

  const toggleTooling = useCallback((step: ProductionStep) => {
    const { available } = cycleTrafficLight(step.toolingAvailable, !!step.toolingDeadline);
    updateStep({ ...step, toolingAvailable: available, toolingDeadline: available ? undefined : step.toolingDeadline });
  }, [updateStep]);

  // Check if step has material/tooling blocked → violet background
  const isStepBlocked = (step: ProductionStep): boolean => {
    const matBlocked = !(step.materialAvailable ?? true);
    const toolBlocked = !(step.toolingAvailable ?? true);
    return matBlocked || toolBlocked;
  };

  // Export to Excel
  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const merges: XLSX.Range[] = [];
    let rowIdx = 0;

    operatorTasks.forEach(group => {
      wsData.push([group.operator.name]);
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 8 } });
      rowIdx++;
      wsData.push(['Date début', 'N° Cmd', 'Client', 'Désignation', 'Qté', 'Priorité', 'Délai', 'Opération', 'Durée']);
      rowIdx++;
      group.tasks.forEach(({ step, order }) => {
        wsData.push([
          formatDateFR(step.startDate),
          order.orderNumber,
          getClientName(order.clientId),
          order.designation,
          order.quantity,
          order.priority,
          formatDateFR(order.deliveryDeadline || order.plannedDeadline),
          getOperationName(step.operationId),
          formatMinutesToHM(step.estimatedDuration),
        ]);
        rowIdx++;
      });
      wsData.push([]);
      rowIdx++;
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 45 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    XLSX.writeFile(wb, `Planning_${numDays}j.xlsx`);
  }, [operatorTasks, numDays, getClientName, getOperationName]);

  const periodLabel = workingDays.length > 0
    ? `${formatDateFR(workingDays[0])} → ${formatDateFR(workingDays[workingDays.length - 1])}`
    : '';

  return (
    <div className="p-6">
      <PageHeader
        title="Planning Tableau"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNumDays(d => Math.max(1, d - 1))}>
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="text-sm font-medium w-16 text-center">{numDays} jour{numDays > 1 ? 's' : ''}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNumDays(d => d + 1)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" /> Exporter Excel
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {operatorTasks.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Aucune tâche planifiée pour cette période</p>
        )}

        {operatorTasks.map(group => (
          <div key={group.operator.id} className="bg-card rounded-lg border overflow-hidden">
            <div className="bg-muted py-2 px-4 flex items-center justify-between">
              <h3 className="text-base font-heading font-bold text-[hsl(0,72%,51%)]">{group.operator.name}</h3>
              <span className="text-sm font-medium text-accent">
                {formatMinutesToHM(group.tasks.reduce((sum, t) => sum + t.step.estimatedDuration, 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 px-1 text-center text-xs">Ordre</TableHead>
                    <TableHead className="w-[70px] text-xs">Date début</TableHead>
                    <TableHead className="w-[80px] text-xs">N° Cmd</TableHead>
                    <TableHead className="w-[90px] text-xs">Client</TableHead>
                    <TableHead className="text-xs">Désignation</TableHead>
                    <TableHead className="w-[45px] text-xs text-center">Qté</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Priorité</TableHead>
                    <TableHead className="w-[80px] text-xs">Délai</TableHead>
                    <TableHead className="w-[100px] text-xs">Opération</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Durée</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Étude">Ét.</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Matière">Ma.</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Outillage">Ou.</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Phase amont">Ph.</TableHead>
                    <TableHead className="w-[90px] text-xs px-1">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.tasks.map(({ step, order }, index) => {
                    const blocked = isStepBlocked(step);
                    const isEditing = editingRowId === step.id;
                    const designBg = blocked ? 'bg-[hsl(270,50%,55%)] text-white' : getDesignationBg(order.priority);
                    
                    const studyStatus = trafficLight(step.studyReady, !!step.studyDeadline);
                    const matStatus = trafficLight(step.materialAvailable, !!step.materialDeadline);
                    const toolStatus = trafficLight(step.toolingAvailable, !!step.toolingDeadline);
                    const amontStatus = phaseAmontStatus(step, steps, productionRecords);
                    const amontEmoji = phaseAmontEmoji(amontStatus);

                    const isDragOver = dragOperatorId === group.operator.id && dragOverIndex === index;
                    const isDragging = dragOperatorId === group.operator.id && dragIndex === index;

                    return (
                      <TableRow
                        key={step.id}
                        draggable={!isEditing}
                        onDragStart={e => handleDragStart(e, group.operator.id, index)}
                        onDragOver={e => handleDragOver(e, group.operator.id, index)}
                        onDragLeave={() => setDragOverIndex(null)}
                        onDrop={e => handleDrop(e, group.operator.id, index)}
                        onDragEnd={handleDragEnd}
                        className={`transition-colors ${blocked ? 'bg-[hsl(270,50%,55%)]/5' : ''} ${isDragOver ? 'border-t-2 border-t-primary' : ''} ${isDragging ? 'opacity-40' : ''}`}
                      >
                        <TableCell className="text-center px-1 cursor-grab">
                          <div className="flex items-center justify-center gap-0.5">
                            <GripVertical className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{formatDateFR(step.startDate)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="font-heading text-xs">{order.orderNumber}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          {isEditing ? (
                            <Select
                              value={(getInlineValue(order, 'clientId') as string) || order.clientId}
                              onValueChange={val => setInlineValue(order.id, 'clientId', val)}
                            >
                              <SelectTrigger className="h-7 text-xs w-full" onClick={e => e.stopPropagation()}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {clients.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{getClientName(order.clientId)}</span>
                          )}
                        </TableCell>
                        <TableCell className={`py-1.5 px-2 ${designBg}`}>
                          {isEditing ? (
                            <Input className="h-7 text-xs"
                              value={(getInlineValue(order, 'designation') as string) || ''}
                              onChange={e => setInlineValue(order.id, 'designation', e.target.value)}
                              onClick={e => e.stopPropagation()} />
                          ) : (
                            <span className={`text-xs truncate block ${blocked ? 'text-white font-medium' : ''}`}>
                              {order.designation}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          {isEditing ? (
                            <Input type="number" min={1} className="h-7 w-14 text-xs"
                              value={getInlineValue(order, 'quantity') as number}
                              onChange={e => setInlineValue(order.id, 'quantity', parseInt(e.target.value) || 1)}
                              onClick={e => e.stopPropagation()} />
                          ) : (
                            <span className="text-xs">{order.quantity}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          {isEditing ? (
                            <select
                              className="w-full rounded-md border border-input bg-background px-1 py-1 text-xs"
                              value={(getInlineValue(order, 'priority') as string) || order.priority}
                              onChange={e => setInlineValue(order.id, 'priority', e.target.value)}
                              onClick={e => e.stopPropagation()}
                            >
                              {['P1', 'P2', 'P3', 'P4'].map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                          ) : (
                            <Badge className={`${priorityColors[order.priority]} text-xs`}>{order.priority}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          {isEditing ? (
                            <Input type="date" className="h-7 text-xs"
                              value={(getInlineValue(order, 'deliveryDeadline') as string) || order.deliveryDeadline || order.plannedDeadline}
                              onChange={e => setInlineValue(order.id, 'deliveryDeadline', e.target.value)}
                              onClick={e => e.stopPropagation()} />
                          ) : (
                            <span className="text-xs">{formatDateFR(order.deliveryDeadline || order.plannedDeadline)}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{getOperationName(step.operationId)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span className="text-xs">{formatMinutesToHM(step.estimatedDuration)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`text-sm ${isEditing ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                                onClick={isEditing ? (e) => { e.stopPropagation(); toggleStudy(step); } : undefined}
                              >
                                {studyStatus}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Étude {step.studyReady ? 'OK' : step.studyDeadline ? `Prévue ${formatDateFR(step.studyDeadline)}` : 'Manquante'}{isEditing ? ' — Cliquer pour changer' : ''}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`text-sm ${isEditing ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                                onClick={isEditing ? (e) => { e.stopPropagation(); toggleMaterial(step); } : undefined}
                              >
                                {matStatus}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Matière {step.materialAvailable ? 'OK' : step.materialDeadline ? `Prévue ${formatDateFR(step.materialDeadline)}` : 'Manquante'}{isEditing ? ' — Cliquer pour changer' : ''}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`text-sm ${isEditing ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                                onClick={isEditing ? (e) => { e.stopPropagation(); toggleTooling(step); } : undefined}
                              >
                                {toolStatus}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Outillage {step.toolingAvailable ? 'OK' : step.toolingDeadline ? `Prévu ${formatDateFR(step.toolingDeadline)}` : 'Manquant'}{isEditing ? ' — Cliquer pour changer' : ''}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{amontEmoji}</span></TooltipTrigger>
                            <TooltipContent>
                              {amontStatus === 'na' ? 'Première étape' : amontStatus === 'green' ? 'Phases précédentes terminées' : 'Phases précédentes non terminées'}
                            </TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="px-1">
                          <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPlanningOrder(order)} title="Affectations">
                              <CalendarCheck className="w-3.5 h-3.5" />
                            </Button>
                            {isEditing ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveInlineEdits(order.id)} title="Enregistrer">
                                  <span className="text-normal text-sm font-bold">✓</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => cancelInlineEdits(order.id)} title="Annuler">
                                  <span className="text-destructive text-sm font-bold">✕</span>
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingRowId(step.id); setInlineEdits(prev => ({ ...prev, [order.id]: {} })); }} title="Éditer">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>

      {planningOrder && (
        <OrderPlanningDialog order={planningOrder} open={!!planningOrder} onOpenChange={(open) => { if (!open) setPlanningOrder(null); }} />
      )}

      {/* Phase amont warning on drag */}
      <ConfirmDialog
        open={!!phaseAmontWarning}
        title="Attention : phase amont non terminée"
        description="La phase amont n'est pas encore faite. Déplacer quand même cette étape ?"
        onConfirm={() => {
          if (phaseAmontWarning) {
            applyReorder(phaseAmontWarning.pendingTasks);
          }
          setPhaseAmontWarning(null);
        }}
        onCancel={() => setPhaseAmontWarning(null)}
        variant="default"
      />

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default PlanningTableauPage;
