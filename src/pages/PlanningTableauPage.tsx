import React, { useMemo, useState, useCallback, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDateFR } from '@/lib/utils';
import { Download, Plus, Minus, GripVertical, Pencil, CalendarCheck, ArrowUpDown, Check, Undo2, Redo2 } from 'lucide-react';
import { isWorkDay, addWorkMinutes } from '@/lib/workTime';
import type { ProductionStep, Order, Holiday, ProductionRecord } from '@/types/planning';
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

/** Traffic light: 🟢=available/done, 🟠=partial/in-progress, 🔴=blocked/not-done, ⚫=N/A, ⚠️=warning */
function trafficLight(available: boolean | undefined, hasDeadline: boolean): string {
  if (available === undefined || available === null) return '⚫';
  if (available) return '🟢';
  if (hasDeadline) return '🟠';
  return '🔴';
}

/** Cycle: 🟢→🟠→🔴→⚫→🟢 */
function cycleTrafficLight(available: boolean | undefined, hasDeadline: boolean): { available: boolean; clearDeadline: boolean } {
  const current = trafficLight(available, hasDeadline);
  if (current === '🟢') return { available: false, clearDeadline: false }; // → 🟠 (partial)
  if (current === '🟠') return { available: false, clearDeadline: true }; // → 🔴 (blocked)
  if (current === '🔴') return { available: true, clearDeadline: true }; // → ⚫ N/A ... actually let's do → ⚫
  // ⚫ → 🟢
  return { available: true, clearDeadline: true };
}

// For cycle we need 4 states: 🟢 → 🟠 → 🔴 → / → 🟢
type TrafficState = 'green' | 'orange' | 'red' | 'na';

function getTrafficState(available: boolean | undefined, hasDeadline: boolean): TrafficState {
  if (available === undefined || available === null) return 'na';
  if (available) return 'green';
  if (hasDeadline) return 'orange';
  return 'red';
}

function trafficEmoji(state: TrafficState): string {
  if (state === 'green') return '🟢';
  if (state === 'orange') return '🟠';
  if (state === 'red') return '🔴';
  return '/';
}

function cycleState(state: TrafficState): TrafficState {
  if (state === 'green') return 'orange';
  if (state === 'orange') return 'red';
  if (state === 'red') return 'na';
  return 'green';
}

function stateToStepFields(state: TrafficState, field: 'study' | 'material' | 'tooling'): { available: boolean | undefined; deadline: string | undefined } {
  if (state === 'green') return { available: true, deadline: undefined };
  if (state === 'orange') return { available: false, deadline: 'pending' }; // truthy deadline
  if (state === 'red') return { available: false, deadline: undefined };
  // na
  return { available: undefined, deadline: undefined };
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
  now.setHours(7, 0, 0, 0);
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

// ─── Production Register Dialog ──────────────────────────────
interface ProductionDialogState {
  open: boolean;
  step: ProductionStep | null;
  order: Order | null;
  operatorName: string;
  operationName: string;
  durationToday: string; // hh:mm input
  totalDoneAlready: number; // minutes
}

const PlanningTableauPage: React.FC = () => {
  const {
    operators, orders, steps, clients, operations,
    absenceOperationId, absenceOrderId, updateStep, updateOrder,
    holidays, productionRecords, addProductionRecord, deleteStep,
    undo, redo, canUndo, canRedo,
  } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [numDays, setNumDays] = useState(5);
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineEdits, setInlineEdits] = useState<Record<string, any>>({});

  // Chained confirm dialogs for drag-up checks
  const [pendingDrop, setPendingDrop] = useState<{
    tasks: TaskItem[];
    stepId: string;
    checks: { type: 'study' | 'material' | 'tooling' | 'phaseAmont'; message: string }[];
    currentCheck: number;
    warnings: Set<string>;
  } | null>(null);

  // Production register dialog
  const [prodDialog, setProdDialog] = useState<ProductionDialogState>({
    open: false, step: null, order: null, operatorName: '', operationName: '', durationToday: '', totalDoneAlready: 0,
  });
  const [completionDialog, setCompletionDialog] = useState<{
    open: boolean;
    stepId: string;
    orderId: string;
    operatorId: string;
    operationId: string;
    totalEstimated: number;
    totalDone: number; // after adding today
    durationToday: number;
  } | null>(null);

  // Drag & drop state
  const [dragOperatorId, setDragOperatorId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [forcedPhaseAmontWarnings, setForcedPhaseAmontWarnings] = useState<Record<string, boolean>>({});

  // Validation state: tracks if order has been modified since last "Valider"
  const [orderDirty, setOrderDirty] = useState(false);

  const workingDays = useMemo(() => getWorkingDays(numDays, holidays), [numDays, holidays]);

  const getClientName = useCallback((clientId: string) => {
    if (!clientId) return '*******';
    return clients.find(c => c.id === clientId)?.name || '*******';
  }, [clients]);

  const getOperationName = useCallback((opId: string) => {
    return operations.find(o => o.id === opId)?.name || '—';
  }, [operations]);

  // Group steps by operator, sorted by order Cn from orders table
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

    // Sort tasks within each operator by the order's Cn (displayOrder) from "Commandes en cours"
    Object.values(result).forEach(group => {
      group.tasks.sort((a, b) => {
        const orderA = a.order.displayOrder ?? 9999;
        const orderB = b.order.displayOrder ?? 9999;
        if (orderA !== orderB) return orderA - orderB;
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

  // ─── Drag & drop handlers with chained prerequisite checks ───
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

    // If moved UP, check prerequisites
    if (dropIndex < dragIndex) {
      const checks: { type: 'study' | 'material' | 'tooling' | 'phaseAmont'; message: string }[] = [];

      // Phase amont
      const amontSt = phaseAmontStatus(dragged.step, steps, productionRecords);
      if (amontSt === 'red') {
        checks.push({ type: 'phaseAmont', message: "Attention : phase amont n'est pas encore effectuée. Reprogrammer quand même cette étape ?" });
      }

      // Study
      if (dragged.step.studyReady === false) {
        checks.push({ type: 'study', message: "Attention : étude non finalisée. Reprogrammer quand même cette étape ?" });
      }

      // Material
      if (dragged.step.materialAvailable === false) {
        checks.push({ type: 'material', message: "Attention : matière première non disponible. Reprogrammer quand même cette étape ?" });
      }

      // Tooling
      if (dragged.step.toolingAvailable === false) {
        checks.push({ type: 'tooling', message: "Attention : outillage non disponible. Reprogrammer quand même cette étape ?" });
      }

      if (checks.length > 0) {
        setPendingDrop({ tasks: items, stepId: dragged.step.id, checks, currentCheck: 0, warnings: new Set() });
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
    (window as Window & { __planningProdDragPayload?: string }).__planningProdDragPayload = undefined;
    setDragIndex(null);
    setDragOverIndex(null);
    setDragOperatorId(null);
  }, []);

  /** Apply new order + recalculate dates, optionally set ⚠️ warnings */
  const applyReorder = useCallback((tasks: TaskItem[], warningFields?: Set<string>, targetStepId?: string) => {
    const reorderedTasks = tasks.map(({ step, order }, idx) => {
      const reorderedStep: ProductionStep = {
        ...step,
        order: idx + 1,
      };

      if (step.id === targetStepId && warningFields) {
        if (warningFields.has('study')) {
          reorderedStep.studyReady = false;
          reorderedStep.studyDeadline = 'warning';
        }
        if (warningFields.has('material')) {
          reorderedStep.materialAvailable = false;
          reorderedStep.materialDeadline = 'warning';
        }
        if (warningFields.has('tooling')) {
          reorderedStep.toolingAvailable = false;
          reorderedStep.toolingDeadline = 'warning';
        }
      }

      return { order, step: reorderedStep };
    });

    const dateUpdatesById = new Map(
      recalcStartDates(reorderedTasks, holidays).map(step => [step.id, step]),
    );

    reorderedTasks.forEach(({ step }, idx) => {
      const nextStep = dateUpdatesById.get(step.id) ?? step;
      const currentStep = tasks[idx].step;
      const hasChanged =
        currentStep.order !== nextStep.order ||
        currentStep.startDate !== nextStep.startDate ||
        currentStep.startTime !== nextStep.startTime ||
        currentStep.endDate !== nextStep.endDate ||
        currentStep.endTime !== nextStep.endTime ||
        currentStep.studyReady !== nextStep.studyReady ||
        currentStep.studyDeadline !== nextStep.studyDeadline ||
        currentStep.materialAvailable !== nextStep.materialAvailable ||
        currentStep.materialDeadline !== nextStep.materialDeadline ||
        currentStep.toolingAvailable !== nextStep.toolingAvailable ||
        currentStep.toolingDeadline !== nextStep.toolingDeadline;

      if (hasChanged) {
        updateStep(nextStep);
      }
    });
    setOrderDirty(true);
  }, [updateStep, holidays]);

  // Handle chained confirm for pending drop
  const handlePendingConfirm = useCallback(() => {
    if (!pendingDrop) return;
    const { checks, currentCheck, warnings, tasks, stepId } = pendingDrop;
    const currentType = checks[currentCheck].type;
    const newWarnings = new Set(warnings);
    newWarnings.add(currentType);

    const nextCheck = currentCheck + 1;
    if (nextCheck < checks.length) {
      setPendingDrop({ ...pendingDrop, currentCheck: nextCheck, warnings: newWarnings });
    } else {
      if (newWarnings.has('phaseAmont')) {
        setForcedPhaseAmontWarnings(prev => ({ ...prev, [stepId]: true }));
      }

      applyReorder(tasks, newWarnings, stepId);
      setPendingDrop(null);
    }
  }, [pendingDrop, applyReorder]);

  const handlePendingCancel = useCallback(() => {
    setPendingDrop(null);
  }, []);

  // ─── Auto-sort: by priority (P1>P2>P3>P4) then latest availability date ───
  const handleAutoSort = useCallback((operatorId: string) => {
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group || group.tasks.length === 0) return;

    const getLatestAvailDate = (step: ProductionStep): string => {
      const dates: string[] = [];
      if (step.studyDeadline && step.studyDeadline !== 'warning' && step.studyDeadline !== 'pending') dates.push(step.studyDeadline);
      if (step.materialDeadline && step.materialDeadline !== 'warning' && step.materialDeadline !== 'pending') dates.push(step.materialDeadline);
      if (step.toolingDeadline && step.toolingDeadline !== 'warning' && step.toolingDeadline !== 'pending') dates.push(step.toolingDeadline);
      if (dates.length === 0) return '0000-00-00'; // available immediately
      return dates.sort().reverse()[0];
    };

    const sorted = [...group.tasks].sort((a, b) => {
      const pa = priorityRank[a.order.priority] ?? 9;
      const pb = priorityRank[b.order.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = getLatestAvailDate(a.step);
      const db = getLatestAvailDate(b.step);
      return da.localeCompare(db);
    });

    applyReorder(sorted);
  }, [operatorTasks, applyReorder]);

  // ─── Validate: save step_order to DB and mark clean ───
  const handleValidate = useCallback(() => {
    // The steps are already being saved via updateStep in applyReorder
    // Just recalculate all dates for all operators to ensure consistency
    operatorTasks.forEach(group => {
      const updated = recalcStartDates(group.tasks, holidays);
      updated.forEach(step => updateStep(step));
    });
    setOrderDirty(false);
  }, [operatorTasks, holidays, updateStep]);

  // ─── Inline edit helpers (now for step fields: date début, opération, durée, statuts) ───
  const getStepInlineValue = (step: ProductionStep, field: string) => {
    return inlineEdits[step.id]?.[field] ?? (step as any)[field];
  };
  const setStepInlineValue = (stepId: string, field: string, value: any) => {
    setInlineEdits(prev => ({ ...prev, [stepId]: { ...prev[stepId], [field]: value } }));
  };

  const saveInlineEdits = (stepId: string) => {
    const changes = inlineEdits[stepId];
    const step = steps.find(s => s.id === stepId);
    if (step && changes && Object.keys(changes).length > 0) {
      const updated = { ...step };
      if (changes.startDate !== undefined) updated.startDate = changes.startDate;
      if (changes.operationId !== undefined) updated.operationId = changes.operationId;
      if (changes.estimatedDuration !== undefined) updated.estimatedDuration = changes.estimatedDuration;
      // Traffic light states
      if (changes.studyState !== undefined) {
        const s = changes.studyState as TrafficState;
        updated.studyReady = s === 'green' ? true : s === 'na' ? undefined as any : false;
        updated.studyDeadline = s === 'orange' ? 'pending' : undefined;
      }
      if (changes.materialState !== undefined) {
        const s = changes.materialState as TrafficState;
        updated.materialAvailable = s === 'green' ? true : s === 'na' ? undefined as any : false;
        updated.materialDeadline = s === 'orange' ? 'pending' : undefined;
      }
      if (changes.toolingState !== undefined) {
        const s = changes.toolingState as TrafficState;
        updated.toolingAvailable = s === 'green' ? true : s === 'na' ? undefined as any : false;
        updated.toolingDeadline = s === 'orange' ? 'pending' : undefined;
      }
      updateStep(updated);
    }
    setInlineEdits(prev => { const n = { ...prev }; delete n[stepId]; return n; });
    setEditingRowId(null);
  };

  const cancelInlineEdits = (stepId: string) => {
    setInlineEdits(prev => { const n = { ...prev }; delete n[stepId]; return n; });
    setEditingRowId(null);
  };

  // Check if step has material/tooling blocked → violet background
  const isStepBlocked = (step: ProductionStep): boolean => {
    const matState = getTrafficState(step.materialAvailable, !!step.materialDeadline);
    const toolState = getTrafficState(step.toolingAvailable, !!step.toolingDeadline);
    return matState === 'orange' || matState === 'red' || toolState === 'orange' || toolState === 'red';
  };

  // ─── Drag to Production Register ───
  const handleDragStartForProd = useCallback((e: React.DragEvent, step: ProductionStep, order: Order) => {
    const payload = JSON.stringify({ stepId: step.id, orderId: order.id });
    e.dataTransfer.setData('application/x-prod-step', payload);
    e.dataTransfer.setData('text/x-prod-step', payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'copyMove';
    (window as Window & { __planningProdDragPayload?: string }).__planningProdDragPayload = payload;
  }, []);

  // ─── Open production register dialog ───
  const openProdDialog = useCallback((stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    const order = orders.find(o => o.id === step.orderId);
    if (!order) return;
    const operator = operators.find(o => o.id === step.operatorId);
    const totalDoneAlready = productionRecords
      .filter(r => r.stepId === stepId)
      .reduce((sum, r) => sum + r.actualDuration, 0);

    setProdDialog({
      open: true,
      step,
      order,
      operatorName: operator?.name || '—',
      operationName: getOperationName(step.operationId),
      durationToday: '',
      totalDoneAlready,
    });
  }, [steps, orders, operators, productionRecords, getOperationName]);

  // Listen for drop events from sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.stepId) {
        openProdDialog(detail.stepId);
      }
    };
    window.addEventListener('prod-register-drop', handler);
    return () => window.removeEventListener('prod-register-drop', handler);
  }, [openProdDialog]);

  const handleProdDialogOk = useCallback(() => {
    if (!prodDialog.step || !prodDialog.order) return;
    const [hh, mm] = (prodDialog.durationToday || '0:0').split(':').map(Number);
    const durationTodayMin = (hh || 0) * 60 + (mm || 0);
    if (durationTodayMin <= 0) return;

    const totalDone = prodDialog.totalDoneAlready + durationTodayMin;

    setCompletionDialog({
      open: true,
      stepId: prodDialog.step.id,
      orderId: prodDialog.order.id,
      operatorId: prodDialog.step.operatorId || '',
      operationId: prodDialog.step.operationId,
      totalEstimated: prodDialog.step.estimatedDuration,
      totalDone,
      durationToday: durationTodayMin,
    });
    setProdDialog(prev => ({ ...prev, open: false }));
  }, [prodDialog]);

  const handleCompletionAnswer = useCallback((finished: boolean) => {
    if (!completionDialog) return;
    const { stepId, orderId, operatorId, operationId, durationToday, totalEstimated, totalDone } = completionDialog;

    // Add production record
    const record: ProductionRecord = {
      id: crypto.randomUUID(),
      stepId,
      orderId,
      operatorId,
      operationId,
      actualDuration: durationToday,
      validatedAt: new Date().toISOString(),
    };
    addProductionRecord(record);

    if (finished) {
      // Remove step from planning
      deleteStep(stepId);
    } else {
      // Update remaining duration and reschedule to next working day
      const step = steps.find(s => s.id === stepId);
      if (step) {
        const remaining = Math.max(0, totalEstimated - totalDone);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        while (!isWorkDay(tomorrow, holidays)) {
          tomorrow.setDate(tomorrow.getDate() + 1);
        }
        const nextDay = tomorrow.toISOString().split('T')[0];
        updateStep({
          ...step,
          estimatedDuration: remaining,
          startDate: nextDay,
          startTime: '07:00',
          endDate: nextDay,
          endTime: '07:00',
        });
      }
    }

    setCompletionDialog(null);
  }, [completionDialog, addProductionRecord, deleteStep, steps, updateStep, holidays]);

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

  // Traffic light legend
  const legendItems = [
    { emoji: '🟢', label: 'Disponible / Fait' },
    { emoji: '🟠', label: 'Partiel / En cours' },
    { emoji: '🔴', label: 'Non disponible / Pas fait' },
    { emoji: '/', label: 'Pas besoin' },
    { emoji: '⚠️', label: 'Attention (forcé)' },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Planning Tableau"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} title="Annuler (Ctrl+Z)">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} title="Rétablir (Ctrl+Y)">
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
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
            <div className="flex items-center gap-2 border-l pl-3 ml-2">
              {legendItems.map(l => (
                <span key={l.emoji} className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <span className="text-sm">{l.emoji}</span>{l.label}
                </span>
              ))}
            </div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" /> Exporter Excel
            </Button>
            <Button
              onClick={handleValidate}
              className={`transition-all ${orderDirty ? 'animate-pulse bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-primary text-primary-foreground'}`}
            >
              <Check className="w-4 h-4 mr-1" /> Valider
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
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAutoSort(group.operator.id)}>
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1" /> Trier auto
                </Button>
                <span className="text-sm font-medium text-accent">
                  {formatMinutesToHM(group.tasks.reduce((sum, t) => sum + t.step.estimatedDuration, 0))}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 px-1 text-center text-xs">Ordre</TableHead>
                    <TableHead className="w-[70px] text-xs">Date début</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Durée</TableHead>
                    <TableHead className="w-[80px] text-xs">N° Cmd</TableHead>
                    <TableHead className="w-[90px] text-xs">Client</TableHead>
                    <TableHead className="text-xs">Désignation</TableHead>
                    <TableHead className="w-[45px] text-xs text-center">Qté</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Priorité</TableHead>
                    <TableHead className="w-[80px] text-xs">Délai</TableHead>
                    <TableHead className="w-[100px] text-xs">Opération</TableHead>
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

                    // Current traffic states
                    const studyState = step.studyDeadline === 'warning' ? 'warning' as any : getTrafficState(step.studyReady, !!step.studyDeadline);
                    const matState = step.materialDeadline === 'warning' ? 'warning' as any : getTrafficState(step.materialAvailable, !!step.materialDeadline);
                    const toolState = step.toolingDeadline === 'warning' ? 'warning' as any : getTrafficState(step.toolingAvailable, !!step.toolingDeadline);
                    const amontStatus = phaseAmontStatus(step, steps, productionRecords);
                    const hasForcedAmontWarning = !!forcedPhaseAmontWarnings[step.id] && amontStatus === 'red';
                    const amontEmoji = hasForcedAmontWarning ? '⚠️' : phaseAmontEmoji(amontStatus);

                    // For editing, get overridden states
                    const editStudyState = inlineEdits[step.id]?.studyState ?? studyState;
                    const editMatState = inlineEdits[step.id]?.materialState ?? matState;
                    const editToolState = inlineEdits[step.id]?.toolingState ?? toolState;

                    const studyEmoji = studyState === 'warning' ? '⚠️' : trafficEmoji(studyState);
                    const matEmoji = matState === 'warning' ? '⚠️' : trafficEmoji(matState);
                    const toolEmoji = toolState === 'warning' ? '⚠️' : trafficEmoji(toolState);

                    const isDragOver = dragOperatorId === group.operator.id && dragOverIndex === index;
                    const isDragging = dragOperatorId === group.operator.id && dragIndex === index;

                    return (
                      <TableRow
                        key={step.id}
                        draggable={!isEditing}
                        onDragStart={e => {
                          handleDragStart(e, group.operator.id, index);
                          handleDragStartForProd(e, step, order);
                        }}
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
                          {isEditing ? (
                            <Input type="date" className="h-7 text-xs w-[110px]"
                              value={getStepInlineValue(step, 'startDate') || ''}
                              onChange={e => setStepInlineValue(step.id, 'startDate', e.target.value)}
                              onClick={e => e.stopPropagation()} />
                          ) : (
                            <span className="text-xs">{formatDateFR(step.startDate)}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          {isEditing ? (
                            <Input type="number" min={0} step={15} className="h-7 w-16 text-xs"
                              value={getStepInlineValue(step, 'estimatedDuration') ?? step.estimatedDuration}
                              onChange={e => setStepInlineValue(step.id, 'estimatedDuration', parseInt(e.target.value) || 0)}
                              onClick={e => e.stopPropagation()} />
                          ) : (
                            <span className="text-xs">{formatMinutesToHM(step.estimatedDuration)}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="font-heading text-xs">{order.orderNumber}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{getClientName(order.clientId)}</span>
                        </TableCell>
                        <TableCell className={`py-1.5 px-2 ${designBg}`}>
                          <span className={`text-xs truncate block ${blocked ? 'text-white font-medium' : ''}`}>
                            {order.designation}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span className="text-xs">{order.quantity}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <Badge className={`${priorityColors[order.priority]} text-xs`}>{order.priority}</Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{formatDateFR(order.deliveryDeadline || order.plannedDeadline)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          {isEditing ? (
                            <Select
                              value={getStepInlineValue(step, 'operationId') || step.operationId}
                              onValueChange={val => setStepInlineValue(step.id, 'operationId', val)}
                            >
                              <SelectTrigger className="h-7 text-xs w-full" onClick={e => e.stopPropagation()}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {operations
                                  .filter(o => o.id !== absenceOperationId && o.category === 'operator')
                                  .map(o => (
                                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{getOperationName(step.operationId)}</span>
                          )}
                        </TableCell>
                        {/* Étude */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`text-sm ${isEditing ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                                onClick={isEditing ? (e) => {
                                  e.stopPropagation();
                                  const cur = editStudyState as TrafficState;
                                  setStepInlineValue(step.id, 'studyState', cycleState(cur));
                                } : undefined}
                              >
                                {isEditing ? trafficEmoji(editStudyState as TrafficState) : studyEmoji}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Étude: {studyState === 'green' ? 'Fait' : studyState === 'orange' ? 'En cours' : studyState === 'red' ? 'Pas fait' : studyState === 'warning' ? '⚠️ Forcé' : 'Pas besoin'}{isEditing ? ' — Cliquer pour changer' : ''}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        {/* Matière */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`text-sm ${isEditing ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                                onClick={isEditing ? (e) => {
                                  e.stopPropagation();
                                  const cur = editMatState as TrafficState;
                                  setStepInlineValue(step.id, 'materialState', cycleState(cur));
                                } : undefined}
                              >
                                {isEditing ? trafficEmoji(editMatState as TrafficState) : matEmoji}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Matière: {matState === 'green' ? 'Disponible' : matState === 'orange' ? 'Partielle' : matState === 'red' ? 'Non disponible' : matState === 'warning' ? '⚠️ Forcé' : 'Pas besoin'}{isEditing ? ' — Cliquer pour changer' : ''}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        {/* Outillage */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`text-sm ${isEditing ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                                onClick={isEditing ? (e) => {
                                  e.stopPropagation();
                                  const cur = editToolState as TrafficState;
                                  setStepInlineValue(step.id, 'toolingState', cycleState(cur));
                                } : undefined}
                              >
                                {isEditing ? trafficEmoji(editToolState as TrafficState) : toolEmoji}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Outillage: {toolState === 'green' ? 'Disponible' : toolState === 'orange' ? 'Partiel' : toolState === 'red' ? 'Non disponible' : toolState === 'warning' ? '⚠️ Forcé' : 'Pas besoin'}{isEditing ? ' — Cliquer pour changer' : ''}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        {/* Phase amont */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{amontEmoji}</span></TooltipTrigger>
                            <TooltipContent>
                              {amontStatus === 'na'
                                ? 'Première étape'
                                : hasForcedAmontWarning
                                  ? '⚠️ Phase amont non terminée mais reprogrammation forcée'
                                  : amontStatus === 'green'
                                    ? 'Phases précédentes terminées'
                                    : 'Phases précédentes non terminées'}
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
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveInlineEdits(step.id)} title="Enregistrer">
                                  <span className="text-normal text-sm font-bold">✓</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => cancelInlineEdits(step.id)} title="Annuler">
                                  <span className="text-destructive text-sm font-bold">✕</span>
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingRowId(step.id); setInlineEdits(prev => ({ ...prev, [step.id]: {} })); }} title="Éditer">
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

      {/* Chained prerequisite check dialogs */}
      <ConfirmDialog
        open={!!pendingDrop && pendingDrop.currentCheck < pendingDrop.checks.length}
        title="Attention"
        description={pendingDrop ? pendingDrop.checks[pendingDrop.currentCheck]?.message : ''}
        onConfirm={handlePendingConfirm}
        onCancel={handlePendingCancel}
        confirmLabel="Oui"
        cancelLabel="Non"
        variant="default"
      />

      {/* Production Register Dialog */}
      <Dialog open={prodDialog.open} onOpenChange={(o) => { if (!o) setProdDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading">Enregistrement Production</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Opérateur :</span>
              <span className="font-medium">{prodDialog.operatorName}</span>
              <span className="text-muted-foreground">N° Cde :</span>
              <span className="font-medium">{prodDialog.order?.orderNumber || '—'}</span>
              <span className="text-muted-foreground">Désignation :</span>
              <span className="font-medium">{prodDialog.order?.designation || '—'}</span>
              <span className="text-muted-foreground">Qté :</span>
              <span className="font-medium">{prodDialog.order?.quantity || '—'}</span>
              <span className="text-muted-foreground">Opération :</span>
              <span className="font-medium">{prodDialog.operationName}</span>
              <span className="text-muted-foreground">Durée totale estimée :</span>
              <span className="font-medium">{prodDialog.step ? formatMinutesToHM(prodDialog.step.estimatedDuration) : '—'}</span>
            </div>
            <div className="border-t pt-3">
              <label className="text-sm text-muted-foreground mb-1 block">Durée effectuée aujourd'hui (hh:mm) :</label>
              <Input
                type="time"
                className="h-9 w-32"
                value={prodDialog.durationToday}
                onChange={e => setProdDialog(prev => ({ ...prev, durationToday: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
              <span className="text-muted-foreground">Durée effectuée totale :</span>
              <span className="font-medium">{(() => {
                const [hh, mm] = (prodDialog.durationToday || '0:0').split(':').map(Number);
                const todayMin = (hh || 0) * 60 + (mm || 0);
                return formatMinutesToHM(prodDialog.totalDoneAlready + todayMin);
              })()}</span>
              <span className="text-muted-foreground">Durée estimée restante :</span>
              <span className="font-medium">{(() => {
                const [hh, mm] = (prodDialog.durationToday || '0:0').split(':').map(Number);
                const todayMin = (hh || 0) * 60 + (mm || 0);
                const remaining = Math.max(0, (prodDialog.step?.estimatedDuration || 0) - prodDialog.totalDoneAlready - todayMin);
                return formatMinutesToHM(remaining);
              })()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdDialog(prev => ({ ...prev, open: false }))}>Annuler</Button>
            <Button onClick={handleProdDialogOk} disabled={!prodDialog.durationToday}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion Dialog */}
      <ConfirmDialog
        open={!!completionDialog}
        title="Phase terminée ?"
        description="Cette phase est-elle complètement terminée ?"
        onConfirm={() => completionDialog && handleCompletionAnswer(true)}
        onCancel={() => completionDialog && handleCompletionAnswer(false)}
        confirmLabel="Oui, terminée"
        cancelLabel="Non, à poursuivre"
        variant="default"
      />

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default PlanningTableauPage;
