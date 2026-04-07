import React, { useMemo, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateFR } from '@/lib/utils';
import { Download, Plus, Minus, GripVertical, Pencil, CalendarCheck, ArrowUp, ArrowDown } from 'lucide-react';
import { isWorkDay } from '@/lib/workTime';
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

/** Phase amont: check if all previous steps for this order are done */
function phaseAmontStatus(
  step: ProductionStep,
  allSteps: ProductionStep[],
  productionRecords: { stepId: string; actualDuration: number }[],
): 'green' | 'red' | 'warning' | 'na' {
  const orderSteps = allSteps.filter(s => s.orderId === step.orderId).sort((a, b) => a.order - b.order);
  const currentIdx = orderSteps.findIndex(s => s.id === step.id);
  if (currentIdx <= 0) return 'na'; // first step or not found
  
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
  const [phaseAmontWarning, setPhaseAmontWarning] = useState<{ stepId: string; operatorId: string; direction: -1 | 1 } | null>(null);

  const workingDays = useMemo(() => getWorkingDays(numDays, holidays), [numDays, holidays]);

  const getClientName = useCallback((clientId: string) => {
    if (!clientId) return '*******';
    return clients.find(c => c.id === clientId)?.name || '*******';
  }, [clients]);

  const getOperationName = useCallback((opId: string) => {
    return operations.find(o => o.id === opId)?.name || '—';
  }, [operations]);

  // Group steps by operator for the working days range, sorted by priority
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
      if (step.subcontractorId) return; // exclude subcontracting

      if (step.startDate <= lastDay && step.endDate >= firstDay) {
        const order = orders.find(o => o.id === step.orderId);
        if (!order) return;
        if (result[step.operatorId]) {
          result[step.operatorId].tasks.push({ step, order });
        }
      }
    });

    // Sort tasks within each operator by step order
    Object.values(result).forEach(group => {
      group.tasks.sort((a, b) => {
        // Sort by priority first, then by step.order
        const pa = priorityRank[a.order.priority] ?? 9;
        const pb = priorityRank[b.order.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return a.step.order - b.step.order;
      });
    });

    return Object.values(result)
      .sort((a, b) => {
        const ai = OPERATOR_NAME_ORDER.indexOf(a.operator.name);
        const bi = OPERATOR_NAME_ORDER.indexOf(b.operator.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .filter(g => g.tasks.length > 0);
  }, [operators, steps, orders, workingDays, absenceOperationId, absenceOrderId]);

  // Move task up/down within an operator's list (swap step orders)
  const moveTask = useCallback((operatorId: string, stepId: string, direction: -1 | 1) => {
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group) return;
    const idx = group.tasks.findIndex(t => t.step.id === stepId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= group.tasks.length) return;

    const currentStep = group.tasks[idx].step;
    
    // Check phase amont when moving UP (giving higher priority)
    if (direction === -1) {
      const amontStatus = phaseAmontStatus(currentStep, steps, productionRecords);
      if (amontStatus === 'red') {
        setPhaseAmontWarning({ stepId, operatorId, direction });
        return;
      }
    }

    executeMove(operatorId, stepId, direction);
  }, [operatorTasks, steps, productionRecords]);

  const executeMove = useCallback((operatorId: string, stepId: string, direction: -1 | 1) => {
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group) return;
    const idx = group.tasks.findIndex(t => t.step.id === stepId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= group.tasks.length) return;
    
    const stepA = group.tasks[idx].step;
    const stepB = group.tasks[newIdx].step;
    updateStep({ ...stepA, order: stepB.order });
    updateStep({ ...stepB, order: stepA.order });
  }, [operatorTasks, updateStep]);

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
      wsData.push(['N° Cmd', 'Client', 'Désignation', 'Qté', 'Priorité', 'Délai', 'Opération', 'Durée', 'Date début']);
      rowIdx++;
      group.tasks.forEach(({ step, order }) => {
        wsData.push([
          order.orderNumber,
          getClientName(order.clientId),
          order.designation,
          order.quantity,
          order.priority,
          formatDateFR(order.deliveryDeadline || order.plannedDeadline),
          getOperationName(step.operationId),
          formatMinutesToHM(step.estimatedDuration),
          formatDateFR(step.startDate),
        ]);
        rowIdx++;
      });
      wsData.push([]);
      rowIdx++;
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 45 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 12 }];
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
                    <TableHead className="w-[80px] text-xs">N° Cmd</TableHead>
                    <TableHead className="w-[90px] text-xs">Client</TableHead>
                    <TableHead className="text-xs">Désignation</TableHead>
                    <TableHead className="w-[45px] text-xs text-center">Qté</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Priorité</TableHead>
                    <TableHead className="w-[80px] text-xs">Délai</TableHead>
                    <TableHead className="w-[100px] text-xs">Opération</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Durée</TableHead>
                    <TableHead className="w-[70px] text-xs">Date début</TableHead>
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
                    const amontEmoji = step._phaseAmontWarning ? '⚠️' : phaseAmontEmoji(amontStatus);

                    return (
                      <TableRow
                        key={step.id}
                        className={`transition-colors ${blocked ? 'bg-[hsl(270,50%,55%)]/5' : ''}`}
                      >
                        <TableCell className="text-center px-1">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                          </div>
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
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{formatDateFR(step.startDate)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{studyStatus}</span></TooltipTrigger>
                            <TooltipContent>Étude {step.studyReady ? 'OK' : step.studyDeadline ? `Prévue ${formatDateFR(step.studyDeadline)}` : 'Manquante'}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{matStatus}</span></TooltipTrigger>
                            <TooltipContent>Matière {step.materialAvailable ? 'OK' : step.materialDeadline ? `Prévue ${formatDateFR(step.materialDeadline)}` : 'Manquante'}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{toolStatus}</span></TooltipTrigger>
                            <TooltipContent>Outillage {step.toolingAvailable ? 'OK' : step.toolingDeadline ? `Prévu ${formatDateFR(step.toolingDeadline)}` : 'Manquant'}</TooltipContent>
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
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveTask(group.operator.id, step.id, -1)} title="Monter">
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveTask(group.operator.id, step.id, 1)} title="Descendre">
                              <ArrowDown className="w-3.5 h-3.5" />
                            </Button>
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

      {/* Phase amont warning */}
      <ConfirmDialog
        open={!!phaseAmontWarning}
        title="Attention : phase amont non terminée"
        description="La phase amont n'est pas encore faite. Déplacer quand même cette étape ?"
        onConfirm={() => {
          if (phaseAmontWarning) {
            executeMove(phaseAmontWarning.operatorId, phaseAmontWarning.stepId, phaseAmontWarning.direction);
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
