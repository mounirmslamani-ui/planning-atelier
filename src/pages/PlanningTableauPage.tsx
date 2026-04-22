import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import { Download, Plus, Minus, GripVertical, Pencil, CalendarCheck, ArrowUpDown, Check, Undo2, Redo2, Lock, Unlock, LogIn, LogOut } from 'lucide-react';
import { WarningTriangleIcon } from '@/components/icons/StatusIcons';
import { isWorkDay, addWorkMinutes } from '@/lib/workTime';
import type { ProductionStep, Order, Holiday, ProductionRecord } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import { useConfirm } from '@/hooks/use-confirm';
import ResourceStatusPill from '@/components/ResourceStatusPill';
import DatePromptDialog from '@/components/DatePromptDialog';
import type { ResourceStatus } from '@/types/planning';
import { computeBlockedStepIds, BLOCKED_TABLE_BG_CLASS } from '@/lib/blockedSteps';
import { dbUpdateOrder, dbUpdateStep } from '@/lib/supabase-data';
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

type PhaseAmontStatus = 'green' | 'orange' | 'red' | 'na';

function phaseAmontStatus(
  step: ProductionStep,
  allSteps: ProductionStep[],
  productionRecords: { stepId: string; actualDuration: number }[],
): PhaseAmontStatus {
  const orderSteps = allSteps.filter(s => s.orderId === step.orderId).sort((a, b) => a.order - b.order);
  const currentIdx = orderSteps.findIndex(s => s.id === step.id);
  if (currentIdx <= 0) return 'na';
  const previousSteps = orderSteps.slice(0, currentIdx);
  let allDone = true;
  let anyStarted = false;
  for (const ps of previousSteps) {
    const records = productionRecords.filter(r => r.stepId === ps.id);
    const totalDone = records.reduce((sum, r) => sum + r.actualDuration, 0);
    if (totalDone > 0) anyStarted = true;
    if (totalDone < ps.estimatedDuration) allDone = false;
  }
  if (allDone) return 'green';
  if (anyStarted) return 'orange';
  return 'red';
}

function phaseAmontEmoji(status: PhaseAmontStatus): string {
  if (status === 'green') return '🟢';
  if (status === 'orange') return '🟠';
  if (status === 'red') return '🔴';
  return '⚪';
}

function phaseAmontLabel(status: PhaseAmontStatus): string {
  if (status === 'green') return 'Toutes les phases amont sont terminées — étape lançable';
  if (status === 'orange') return 'Au moins une phase amont a été entamée — étape peut-être lançable';
  if (status === 'red') return 'Aucune phase amont entamée — étape non lançable';
  return 'Première étape — pas de phase amont';
}

/** Determine if a step is the first, last, or only operator (non-subcontractor) step for its order */
function getStepFlowPosition(
  step: ProductionStep,
  allSteps: ProductionStep[],
): 'only' | 'first' | 'last' | 'middle' | 'none' {
  // Get all operator steps (non-subcontractor) for this order, sorted by order
  const operatorSteps = allSteps
    .filter(s => s.orderId === step.orderId && !s.subcontractorId)
    .sort((a, b) => a.order - b.order);
  if (operatorSteps.length === 0) return 'none';
  if (operatorSteps.length === 1 && operatorSteps[0].id === step.id) return 'only';
  if (operatorSteps[0].id === step.id) return 'first';
  if (operatorSteps[operatorSteps.length - 1].id === step.id) return 'last';
  return 'middle';
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

function isStepFinished(step: ProductionStep, records: ProductionRecord[]): boolean {
  if (step.subcontractorId) return step.subcontractingDone === true;
  return records.some(record => record.stepId === step.id && record.workStatus === 'done');
}

function areAllOrderStepsFinished(orderId: string, allSteps: ProductionStep[], records: ProductionRecord[], absenceOperationId: string): boolean {
  const orderSteps = allSteps.filter(step => step.orderId === orderId && step.operationId !== absenceOperationId);
  return orderSteps.length > 0 && orderSteps.every(step => isStepFinished(step, records));
}

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

/**
 * Insert new steps (whose parent order has no displayOrder / displayOrder === 0)
 * at the TOP of their priority group.
 * Steps whose parent order has a valid displayOrder keep their relative Cn order.
 */
function insertNewStepsAtPriorityTop(allSteps: ProductionStep[], allOrders: Order[]): ProductionStep[] {
  const orderMap = new Map(allOrders.map(o => [o.id, o]));

  // "ordered" = parent order has a displayOrder > 0
  const ordered = allSteps.filter(s => {
    const o = orderMap.get(s.orderId);
    return o && o.displayOrder && o.displayOrder > 0;
  });
  const unordered = allSteps.filter(s => {
    const o = orderMap.get(s.orderId);
    return !o || !o.displayOrder || o.displayOrder <= 0;
  });

  if (unordered.length === 0) return allSteps;

  // Group ordered steps by operatorId, sorted by their parent order's displayOrder (Cn)
  const byOperator = new Map<string, ProductionStep[]>();
  ordered.forEach(s => {
    const key = s.operatorId || '__none__';
    if (!byOperator.has(key)) byOperator.set(key, []);
    byOperator.get(key)!.push(s);
  });
  byOperator.forEach(arr => arr.sort((a, b) => {
    const oa = orderMap.get(a.orderId);
    const ob = orderMap.get(b.orderId);
    return (oa?.displayOrder || 0) - (ob?.displayOrder || 0);
  }));

  // For each unordered step, insert at the top of its priority group
  unordered.forEach(newStep => {
    const key = newStep.operatorId || '__none__';
    if (!byOperator.has(key)) byOperator.set(key, []);
    const group = byOperator.get(key)!;
    const newOrder = orderMap.get(newStep.orderId);
    const newPriority = priorityRank[newOrder?.priority || 'P4'] ?? 3;

    // Find the first step with same or lower priority
    let insertIdx = 0;
    for (let i = 0; i < group.length; i++) {
      const existingOrder = orderMap.get(group[i].orderId);
      const existingPriority = priorityRank[existingOrder?.priority || 'P4'] ?? 3;
      if (existingPriority >= newPriority) {
        insertIdx = i;
        break;
      }
      insertIdx = i + 1;
    }
    group.splice(insertIdx, 0, newStep);
  });

  // Reassign step.order sequentially per operator
  const result: ProductionStep[] = [];
  byOperator.forEach(group => {
    group.forEach((s, idx) => {
      result.push({ ...s, order: idx + 1 });
    });
  });

  return result;
}

interface ProductionDialogState {
  open: boolean;
  step: ProductionStep | null;
  order: Order | null;
  operatorName: string;
  operationName: string;
  durationToday: string;
  totalDoneAlready: number;
}

const NUMDAYS_STORAGE_KEY = 'planning-tableau-numdays';

const PlanningTableauPage: React.FC = () => {
  const {
    operators, orders, steps, clients, operations,
    absenceOperationId, absenceOrderId, updateStep, updateOrder,
    holidays, productionRecords, addProductionRecord,
    qcEntries, addQCEntry,
    undo, redo, canUndo, canRedo,
  } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [numDays, setNumDays] = useState(() => {
    const saved = localStorage.getItem(NUMDAYS_STORAGE_KEY);
    return saved ? parseInt(saved, 10) || 5 : 5;
  });
  const [numDaysInput, setNumDaysInput] = useState(String(numDays));
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineEdits, setInlineEdits] = useState<Record<string, any>>({});

  // Column filters for the operator tables
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [colSortKey, setColSortKey] = useState<string | null>(null);
  const [colSortDir, setColSortDir] = useState<SortDirection>(null);

  // Persist numDays
  useEffect(() => {
    localStorage.setItem(NUMDAYS_STORAGE_KEY, String(numDays));
    setNumDaysInput(String(numDays));
  }, [numDays]);

  const handleNumDaysInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNumDaysInput(e.target.value);
  }, []);

  const handleNumDaysInputBlur = useCallback(() => {
    const val = parseInt(numDaysInput, 10);
    if (val >= 1 && val <= 365) {
      setNumDays(val);
    } else {
      setNumDaysInput(String(numDays));
    }
  }, [numDaysInput, numDays]);

  const handleNumDaysKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  // ─── DRAFT STEPS: local layer that defers DB writes until "Valider" ───
  const [draftSteps, setDraftSteps] = useState<ProductionStep[]>(steps);
  const draftInitialized = useRef(false);

  // Sync from context on initial load or when steps change from outside (e.g. OrderPlanningDialog)
  useEffect(() => {
    if (!draftInitialized.current) {
      setDraftSteps(insertNewStepsAtPriorityTop(steps, orders));
      draftInitialized.current = true;
      return;
    }
    // If not dirty, accept upstream changes
    if (!orderDirty) {
      setDraftSteps(prev => {
        // Detect truly new steps (exist in steps but not in prev)
        const prevIds = new Set(prev.map(s => s.id));
        const newSteps = steps.filter(s => !prevIds.has(s.id));
        if (newSteps.length === 0) {
          // No new steps – just accept upstream
          return insertNewStepsAtPriorityTop(steps, orders);
        }
        // Merge: keep existing ordered steps, insert new ones at top of their priority group
        return insertNewStepsAtPriorityTop(steps, orders);
      });
    }
  }, [steps]); // intentionally exclude orderDirty to avoid loops

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
    totalDone: number;
    durationToday: number;
  } | null>(null);

  // Drag & drop state - use REFS to avoid stale closure issues
  const dragRef = useRef<{ operatorId: string; index: number } | null>(null);
  const [dragOverState, setDragOverState] = useState<{ operatorId: string; index: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [forcedPhaseAmontWarnings, setForcedPhaseAmontWarnings] = useState<Record<string, boolean>>({});

  // Validation state
  const [orderDirty, setOrderDirty] = useState(false);

  // Selected operator tab (null = first available operator shown)
  const [selectedTabOperatorId, setSelectedTabOperatorId] = useState<string | null>(null);

  const workingDays = useMemo(() => getWorkingDays(numDays, holidays), [numDays, holidays]);

  const getClientName = useCallback((clientId: string) => {
    if (!clientId) return '*******';
    return clients.find(c => c.id === clientId)?.name || '*******';
  }, [clients]);

  const getOperationName = useCallback((opId: string) => {
    return operations.find(o => o.id === opId)?.name || '—';
  }, [operations]);

  // Group DRAFT steps by operator (uses draftSteps instead of steps)
  const operatorTasks = useMemo(() => {
    if (workingDays.length === 0) return [];
    const firstDay = workingDays[0];
    const lastDay = workingDays[workingDays.length - 1];

    const result: Record<string, { operator: typeof operators[0]; tasks: TaskItem[] }> = {};
    operators.forEach(op => {
      result[op.id] = { operator: op, tasks: [] };
    });

    draftSteps.forEach(step => {
      if (step.operationId === absenceOperationId) return;
      if (step.orderId === absenceOrderId) return;
      if (isStepFinished(step, productionRecords)) return;
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

    // Sort tasks within each operator by order.displayOrder (Cn from Commandes en cours)
    // Frozen steps keep their position; others sort by Cn ascending.
    // Steps without a Cn (displayOrder === 0 or null) go to the top of their priority group.
    Object.values(result).forEach(group => {
      group.tasks.sort((a, b) => {
        const cnA = a.order.displayOrder || 0;
        const cnB = b.order.displayOrder || 0;
        // Steps without Cn: sort by priority then keep natural order
        if (cnA === 0 && cnB === 0) {
          const pa = priorityRank[a.order.priority] ?? 9;
          const pb = priorityRank[b.order.priority] ?? 9;
          return pa - pb;
        }
        if (cnA === 0) return -1; // new steps go to top
        if (cnB === 0) return 1;
        return cnA - cnB;
      });
    });

    return Object.values(result)
      .sort((a, b) => {
        const ai = OPERATOR_NAME_ORDER.indexOf(a.operator.name);
        const bi = OPERATOR_NAME_ORDER.indexOf(b.operator.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .filter(g => g.tasks.length > 0);
  }, [operators, draftSteps, orders, workingDays, absenceOperationId, absenceOrderId, productionRecords]);

  /** Apply new order + recalculate dates LOCALLY in draftSteps (no DB write) */
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

    const dateUpdates = recalcStartDates(reorderedTasks, holidays);
    const dateUpdatesById = new Map(dateUpdates.map(s => [s.id, s]));

    const updatedIds = new Set(reorderedTasks.map(t => t.step.id));
    const finalSteps = reorderedTasks.map(({ step }) => dateUpdatesById.get(step.id) ?? step);

    setDraftSteps(prev => {
      const unchanged = prev.filter(s => !updatedIds.has(s.id));
      return [...unchanged, ...finalSteps];
    });
    setOrderDirty(true);
  }, [holidays]);

  // ─── Drag & drop handlers with refs for reliable state ───
  const handleDragStart = useCallback((e: React.DragEvent, operatorId: string, index: number, step: ProductionStep, order: Order) => {
    // Set vertical reorder data
    dragRef.current = { operatorId, index };
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', `${operatorId}:${index}`);
    // Set horizontal (sidebar production register) data
    const payload = JSON.stringify({ stepId: step.id, orderId: order.id });
    e.dataTransfer.setData('application/x-prod-step', payload);
    e.dataTransfer.setData('text/x-prod-step', payload);
    (window as Window & { __planningProdDragPayload?: string }).__planningProdDragPayload = payload;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, operatorId: string, index: number) => {
    e.preventDefault();
    if (!dragRef.current || dragRef.current.operatorId !== operatorId) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverState({ operatorId, index });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, operatorId: string, dropIndex: number) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag || drag.operatorId !== operatorId || drag.index === dropIndex) {
      dragRef.current = null;
      setDragOverState(null);
      setIsDragging(false);
      return;
    }

    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group) return;

    const items = [...group.tasks];
    const dragIndex = drag.index;
    const [dragged] = items.splice(dragIndex, 1);
    items.splice(dropIndex, 0, dragged);

    // If moved UP, check prerequisites
    if (dropIndex < dragIndex) {
      const checks: { type: 'study' | 'material' | 'tooling' | 'phaseAmont'; message: string }[] = [];

      const amontSt = phaseAmontStatus(dragged.step, draftSteps, productionRecords);
      if (amontSt === 'red') {
        checks.push({ type: 'phaseAmont', message: "Attention : phase amont n'est pas encore effectuée. Reprogrammer quand même cette étape ?" });
      }
      if (dragged.step.studyReady === false) {
        checks.push({ type: 'study', message: "Attention : étude non finalisée. Reprogrammer quand même cette étape ?" });
      }
      if (dragged.step.materialAvailable === false) {
        checks.push({ type: 'material', message: "Attention : matière première non disponible. Reprogrammer quand même cette étape ?" });
      }
      if (dragged.step.toolingAvailable === false) {
        checks.push({ type: 'tooling', message: "Attention : outillage non disponible. Reprogrammer quand même cette étape ?" });
      }

      const draggedPriority = priorityRank[dragged.order.priority] ?? 9;
      const jumpedOverItems = items.slice(0, dropIndex);
      const hasHigherPriorityAbove = jumpedOverItems.some(t => (priorityRank[t.order.priority] ?? 9) < draggedPriority);
      if (hasHigherPriorityAbove) {
        checks.push({ type: 'study' as any, message: "Attention l'ordre d'exécution ne respecte pas l'ordre défini dans les priorités commerciales. Reprogrammer quand même cette étape ?" });
      }

      if (checks.length > 0) {
        setPendingDrop({ tasks: items, stepId: dragged.step.id, checks, currentCheck: 0, warnings: new Set() });
        dragRef.current = null;
        setDragOverState(null);
        setIsDragging(false);
        return;
      }
    }

    applyReorder(items);
    dragRef.current = null;
    setDragOverState(null);
    setIsDragging(false);
  }, [operatorTasks, draftSteps, productionRecords, applyReorder]);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDragOverState(null);
    setIsDragging(false);
    (window as Window & { __planningProdDragPayload?: string }).__planningProdDragPayload = undefined;
  }, []);

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

  // ─── Auto-sort ───
  const handleAutoSort = useCallback((operatorId: string) => {
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group || group.tasks.length === 0) return;

    const getLatestAvailDate = (step: ProductionStep): string => {
      const dates: string[] = [];
      if (step.studyDeadline && step.studyDeadline !== 'warning' && step.studyDeadline !== 'pending') dates.push(step.studyDeadline);
      if (step.materialDeadline && step.materialDeadline !== 'warning' && step.materialDeadline !== 'pending') dates.push(step.materialDeadline);
      if (step.toolingDeadline && step.toolingDeadline !== 'warning' && step.toolingDeadline !== 'pending') dates.push(step.toolingDeadline);
      if (dates.length === 0) return '0000-00-00';
      return dates.sort().reverse()[0];
    };

    const sorted = [...group.tasks].sort((a, b) => {
      // Frozen steps stay at the top
      if (a.step.frozen && !b.step.frozen) return -1;
      if (!a.step.frozen && b.step.frozen) return 1;
      const pa = priorityRank[a.order.priority] ?? 9;
      const pb = priorityRank[b.order.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = getLatestAvailDate(a.step);
      const db = getLatestAvailDate(b.step);
      return da.localeCompare(db);
    });

    applyReorder(sorted);
  }, [operatorTasks, applyReorder]);

  // ─── Validate: commit ALL draftSteps to DB via updateStep, then mark clean ───
  const handleValidate = useCallback(() => {
    // Commit every draft step that differs from the context steps
    const contextMap = new Map(steps.map(s => [s.id, s]));
    draftSteps.forEach(draft => {
      const original = contextMap.get(draft.id);
      if (!original ||
        draft.order !== original.order ||
        draft.startDate !== original.startDate ||
        draft.startTime !== original.startTime ||
        draft.endDate !== original.endDate ||
        draft.endTime !== original.endTime ||
        draft.frozen !== original.frozen ||
        draft.studyStatus !== original.studyStatus ||
        draft.studyReady !== original.studyReady ||
        draft.studyDeadline !== original.studyDeadline ||
        draft.materialStatus !== original.materialStatus ||
        draft.materialAvailable !== original.materialAvailable ||
        draft.materialDeadline !== original.materialDeadline ||
        draft.toolingStatus !== original.toolingStatus ||
        draft.toolingAvailable !== original.toolingAvailable ||
        draft.toolingDeadline !== original.toolingDeadline ||
        draft.operationId !== original.operationId ||
        draft.estimatedDuration !== original.estimatedDuration
      ) {
        updateStep(draft);
      }
    });
    setOrderDirty(false);
  }, [draftSteps, steps, updateStep]);

  // ─── Toggle frozen (lock) on a step (local draft) ───
  const toggleStepFrozen = useCallback((stepId: string) => {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, frozen: !s.frozen } : s));
    setOrderDirty(true);
  }, []);

  // ─── Inline edit helpers ───
  const getStepInlineValue = (step: ProductionStep, field: string) => {
    return inlineEdits[step.id]?.[field] ?? (step as any)[field];
  };
  const setStepInlineValue = (stepId: string, field: string, value: any) => {
    setInlineEdits(prev => ({ ...prev, [stepId]: { ...prev[stepId], [field]: value } }));
  };

  const saveInlineEdits = (stepId: string) => {
    const changes = inlineEdits[stepId];
    const step = draftSteps.find(s => s.id === stepId);
    if (step && changes && Object.keys(changes).length > 0) {
      const updated = { ...step };
      if (changes.startDate !== undefined) updated.startDate = changes.startDate;
      if (changes.operationId !== undefined) updated.operationId = changes.operationId;
      if (changes.estimatedDuration !== undefined) updated.estimatedDuration = changes.estimatedDuration;
      // Status updates (Étude/Matière/Outillage) are now handled directly by ResourceStatusPill
      // Save to draft only (not DB)
      setDraftSteps(prev => prev.map(s => s.id === stepId ? updated : s));
      setOrderDirty(true);
    }
    setInlineEdits(prev => { const n = { ...prev }; delete n[stepId]; return n; });
    setEditingRowId(null);
  };

  const cancelInlineEdits = (stepId: string) => {
    setInlineEdits(prev => { const n = { ...prev }; delete n[stepId]; return n; });
    setEditingRowId(null);
  };

  // Compute blocked step IDs (violet) — propagates to all successor steps of the same order
  const blockedStepIds = useMemo(
    () => computeBlockedStepIds(draftSteps, orders),
    [draftSteps, orders]
  );
  const isStepBlocked = (step: ProductionStep): boolean => blockedStepIds.has(step.id);

  // ─── Status update for Étude / Matière / Outillage via ResourceStatusPill ───
  const [statusDatePrompt, setStatusDatePrompt] = useState<{
    open: boolean;
    stepId: string;
    field: 'study' | 'material' | 'tooling';
    nextStatus: ResourceStatus;
  } | null>(null);
  const [pendingMaterialStatus, setPendingMaterialStatus] = useState<{ stepId: string; nextStatus: ResourceStatus } | null>(null);
  const [materialConfirmOpen, setMaterialConfirmOpen] = useState(false);
  const [materialDatePromptOpen, setMaterialDatePromptOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const applyStepStatus = useCallback(async (stepId: string, field: 'study' | 'material' | 'tooling', status: ResourceStatus, deadline?: string, receivedDate?: string) => {
    const sourceStep = draftSteps.find(s => s.id === stepId) || steps.find(s => s.id === stepId);
    if (!sourceStep) return false;

    const statusKey = `${field}Status` as 'studyStatus' | 'materialStatus' | 'toolingStatus';
    const boolKey = field === 'study' ? 'studyReady' : field === 'material' ? 'materialAvailable' : 'toolingAvailable';
    const deadlineKey = `${field}Deadline` as 'studyDeadline' | 'materialDeadline' | 'toolingDeadline';
    const isAvailable = status === 'disponible';

    const updatedDraftSteps = draftSteps.map(s => {
      if (s.orderId !== sourceStep.orderId || s.operationId === absenceOperationId) return s;
      const updated = { ...s };
      if (field === 'study') {
        updated.studyStatus = status;
        updated.studyReady = status === 'disponible';
        if (status === 'partiel' || status === 'non-disponible') {
          if (deadline) updated.studyDeadline = deadline;
        } else {
          updated.studyDeadline = undefined;
        }
      } else if (field === 'material') {
        updated.materialStatus = status;
        updated.materialAvailable = status === 'disponible';
        if (status === 'partiel' || status === 'non-disponible') {
          if (deadline) updated.materialDeadline = deadline;
        } else {
          updated.materialDeadline = undefined;
        }
      } else {
        updated.toolingStatus = status;
        updated.toolingAvailable = status === 'disponible';
        if (status === 'partiel' || status === 'non-disponible') {
          if (deadline) updated.toolingDeadline = deadline;
        } else {
          updated.toolingDeadline = undefined;
        }
      }
      return updated;
    });

    const updatedContextSteps = steps
      .filter(s => s.orderId === sourceStep.orderId && s.operationId !== absenceOperationId)
      .map(s => ({
        ...s,
        [statusKey]: status,
        [boolKey]: isAvailable,
        [deadlineKey]: (status === 'partiel' || status === 'non-disponible') ? deadline || undefined : undefined,
      } as ProductionStep));

    const order = orders.find(o => o.id === sourceStep.orderId);
    if (!order) return false;
    const updatedOrder = {
      ...order,
      [statusKey]: status,
      [boolKey]: isAvailable,
      ...(field === 'material' ? { materialReceivedDate: isAvailable ? receivedDate : undefined } : {}),
    } as Order;

    const saved = await Promise.all([...updatedContextSteps.map(dbUpdateStep), dbUpdateOrder(updatedOrder)]);
    if (saved.some(ok => !ok)) return false;

    setDraftSteps(updatedDraftSteps);
    updatedContextSteps.forEach(updateStep);
    updateOrder(updatedOrder);
    return true;
  }, [draftSteps, steps, orders, absenceOperationId, updateStep, updateOrder]);

  const handleStatusChange = useCallback((stepId: string, field: 'study' | 'material' | 'tooling', next: ResourceStatus) => {
    if (next === 'partiel' || next === 'non-disponible') {
      setStatusDatePrompt({ open: true, stepId, field, nextStatus: next });
    } else if (field === 'material' && next === 'disponible') {
      setPendingMaterialStatus({ stepId, nextStatus: next });
      setMaterialDatePromptOpen(false);
      setMaterialConfirmOpen(true);
    } else {
      applyStepStatus(stepId, field, next);
    }
  }, [applyStepStatus]);

  // (Drag to Production Register is now integrated in handleDragStart)

  const openProdDialog = useCallback((stepId: string) => {
    const step = draftSteps.find(s => s.id === stepId);
    if (!step) return;
    const order = orders.find(o => o.id === step.orderId);
    if (!order) return;
    const operator = operators.find(o => o.id === step.operatorId);
    const totalDoneAlready = productionRecords
      .filter(r => r.stepId === stepId)
      .reduce((sum, r) => sum + r.actualDuration, 0);

    setProdDialog({
      open: true, step, order,
      operatorName: operator?.name || '—',
      operationName: getOperationName(step.operationId),
      durationToday: '', totalDoneAlready,
    });
  }, [draftSteps, orders, operators, productionRecords, getOperationName]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.stepId) openProdDialog(detail.stepId);
    };
    window.addEventListener('prod-register-drop', handler);
    return () => window.removeEventListener('prod-register-drop', handler);
  }, [openProdDialog]);

  // QC drop: force-transfer the order to Quality Control
  const handleQcDrop = useCallback((stepId: string) => {
    const step = draftSteps.find(s => s.id === stepId) || steps.find(s => s.id === stepId);
    if (!step) return;
    const orderId = step.orderId;
    if (orderId === absenceOrderId) return;

    const allKnownSteps = [...draftSteps, ...steps].filter((s, index, arr) => arr.findIndex(item => item.id === s.id) === index);
    if (!areAllOrderStepsFinished(orderId, allKnownSteps, productionRecords, absenceOperationId)) return;

    if (!qcEntries.some(entry => entry.orderId === orderId)) {
      addQCEntry({
        id: crypto.randomUUID(),
        orderId,
        controlDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      });
    }
  }, [draftSteps, steps, productionRecords, absenceOperationId, absenceOrderId, qcEntries, addQCEntry]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.stepId) handleQcDrop(detail.stepId);
    };
    window.addEventListener('qc-drop', handler);
    return () => window.removeEventListener('qc-drop', handler);
  }, [handleQcDrop]);

  const handleProdDialogOk = useCallback(() => {
    if (!prodDialog.step || !prodDialog.order) return;
    const [hh, mm] = (prodDialog.durationToday || '0:0').split(':').map(Number);
    const durationTodayMin = (hh || 0) * 60 + (mm || 0);
    if (durationTodayMin <= 0) return;

    const totalDone = prodDialog.totalDoneAlready + durationTodayMin;
    setCompletionDialog({
      open: true, stepId: prodDialog.step.id, orderId: prodDialog.order.id,
      operatorId: prodDialog.step.operatorId || '', operationId: prodDialog.step.operationId,
      totalEstimated: prodDialog.step.estimatedDuration, totalDone, durationToday: durationTodayMin,
    });
    setProdDialog(prev => ({ ...prev, open: false }));
  }, [prodDialog]);

  const lastRecordedStepRef = useRef<string | null>(null);

  const handleCompletionAnswer = useCallback((finished: boolean) => {
    if (!completionDialog) return;
    const { stepId, orderId, operatorId, operationId, durationToday, totalEstimated, totalDone } = completionDialog;

    // Debounce: prevent double registration for same step in same interaction
    const dedupeKey = `${stepId}-${durationToday}-${Date.now().toString().slice(0, -3)}`;
    if (lastRecordedStepRef.current === dedupeKey) {
      setCompletionDialog(null);
      return;
    }
    lastRecordedStepRef.current = dedupeKey;

    const record: ProductionRecord = {
      id: crypto.randomUUID(), stepId, orderId, operatorId, operationId,
      actualDuration: durationToday, validatedAt: new Date().toISOString(),
      workStatus: finished ? 'done' : 'continue',
    };
    addProductionRecord(record);

    if (finished) {
      // Remove from local draftSteps immediately so it disappears from Planning Tableau
      setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, frozen: true } : s));

      const allKnownSteps = [...draftSteps, ...steps].filter((s, index, arr) => arr.findIndex(item => item.id === s.id) === index);
      const allFinished = allKnownSteps
        .filter(s => s.orderId === orderId && s.operationId !== absenceOperationId)
        .every(s => s.id === stepId ? true : isStepFinished(s, productionRecords));
      if (allFinished && orderId !== absenceOrderId && !qcEntries.some(entry => entry.orderId === orderId)) {
        addQCEntry({
          id: crypto.randomUUID(),
          orderId,
          controlDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      const step = draftSteps.find(s => s.id === stepId);
      if (step) {
        const remaining = Math.max(0, totalEstimated - totalDone);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        while (!isWorkDay(tomorrow, holidays)) {
          tomorrow.setDate(tomorrow.getDate() + 1);
        }
        const nextDay = tomorrow.toISOString().split('T')[0];
        updateStep({ ...step, estimatedDuration: remaining, startDate: nextDay, startTime: '07:00', endDate: nextDay, endTime: '07:00' });
      }
    }
    setCompletionDialog(null);
  }, [completionDialog, addProductionRecord, draftSteps, steps, productionRecords, absenceOperationId, absenceOrderId, qcEntries, addQCEntry, updateStep, holidays]);

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
          formatDateFR(step.startDate), order.orderNumber, getClientName(order.clientId),
          order.designation, order.quantity, order.priority,
          formatDateFR(order.deliveryDeadline || order.plannedDeadline),
          getOperationName(step.operationId), formatMinutesToHM(step.estimatedDuration),
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

  const legendItems = [
    { emoji: '🟢', label: 'Disponible / Fait' },
    { emoji: '🟠', label: 'Partiel / En cours' },
    { emoji: '🔴', label: 'Non disponible / Pas fait' },
    { emoji: '/', label: 'Pas besoin' },
    { emoji: '⚠️', label: 'Attention (forcé)' },
  ];

  // Column filter/sort handlers
  const handleColSort = useCallback((key: string, dir: SortDirection) => {
    setColSortKey(dir ? key : null);
    setColSortDir(dir);
  }, []);
  const handleColFilter = useCallback((key: string, value: string) => {
    setColFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Apply filters to tasks within a group
  const filterTasks = useCallback((tasks: TaskItem[]): TaskItem[] => {
    let result = tasks;
    const clientFilter = colFilters['client']?.toLowerCase();
    const cmdFilter = colFilters['orderNumber']?.toLowerCase();

    if (clientFilter) {
      result = result.filter(t => getClientName(t.order.clientId).toLowerCase().includes(clientFilter));
    }
    if (cmdFilter) {
      result = result.filter(t => t.order.orderNumber.toLowerCase().includes(cmdFilter));
    }

    if (colSortKey && colSortDir) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (colSortKey === 'client') {
          cmp = getClientName(a.order.clientId).localeCompare(getClientName(b.order.clientId));
        } else if (colSortKey === 'orderNumber') {
          cmp = a.order.orderNumber.localeCompare(b.order.orderNumber, 'fr', { numeric: true });
        }
        return colSortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [colFilters, colSortKey, colSortDir, getClientName]);

  const hasActiveFilters = !!(colFilters['client'] || colFilters['orderNumber'] || colSortKey);

  return (
    <div className="p-6">
      <PageHeader
        title="Planning Tableau"
        actions={
          <div className="flex items-center gap-3 flex-wrap">
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
              <Input
                type="text"
                inputMode="numeric"
                className="h-7 w-12 text-center text-sm font-medium px-1"
                value={numDaysInput}
                onChange={handleNumDaysInputChange}
                onBlur={handleNumDaysInputBlur}
                onKeyDown={handleNumDaysKeyDown}
              />
              <span className="text-xs text-muted-foreground">jour{numDays > 1 ? 's' : ''}</span>
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

      {/* Operator tabs */}
      <div className="flex items-center gap-1 px-1 py-2 mb-3 border-b overflow-x-auto">
        <span className="text-xs font-medium text-muted-foreground mr-2 whitespace-nowrap">Opérateur :</span>
        {operatorTasks.map(group => {
          const isActive = (selectedTabOperatorId ?? operatorTasks[0]?.operator.id) === group.operator.id;
          return (
            <button
              key={group.operator.id}
              onClick={() => setSelectedTabOperatorId(group.operator.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background hover:bg-muted text-foreground border'
              }`}
            >
              {group.operator.name}
              <span className="ml-1.5 opacity-70">({group.tasks.length})</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {operatorTasks.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Aucune tâche planifiée pour cette période</p>
        )}

        {operatorTasks
          .filter(group => group.operator.id === (selectedTabOperatorId ?? operatorTasks[0]?.operator.id))
          .map(group => {
          const filteredTasks = filterTasks(group.tasks);
          return (
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
                    <TableHead className="w-[80px] text-xs">
                      <ColumnHeader label="N° Cmd" columnKey="orderNumber" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['orderNumber'] || ''} onFilter={handleColFilter} />
                    </TableHead>
                    <TableHead className="w-[90px] text-xs">
                      <ColumnHeader label="Client" columnKey="client" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['client'] || ''} onFilter={handleColFilter} />
                    </TableHead>
                    <TableHead className="w-[180px] min-w-[180px] max-w-[180px] text-xs">Désignation</TableHead>
                    <TableHead className="w-[45px] text-xs text-center">Qté</TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Priorité</TableHead>
                    <TableHead className="w-[80px] text-xs">Délai</TableHead>
                    <TableHead className="w-[100px] text-xs">Opération</TableHead>
                    <TableHead className="w-[200px] min-w-[200px] text-xs">Observation</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Étude">Ét.</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Matière">Ma.</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Outillage">Ou.</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="Phase amont">Ph.</TableHead>
                    <TableHead className="w-[100px] text-xs px-1">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map(({ step, order }, index) => {
                    const blocked = isStepBlocked(step);
                    const isEditing = editingRowId === step.id;
                    const designBg = blocked ? BLOCKED_TABLE_BG_CLASS : getDesignationBg(order.priority);
                    const flowPos = getStepFlowPosition(step, draftSteps);

                    const studyStatus: ResourceStatus = order.studyStatus ?? step.studyStatus
                      ?? (order.studyReady || step.studyReady ? 'disponible' : 'non-disponible');
                    const matStatus: ResourceStatus = order.materialStatus ?? step.materialStatus
                      ?? (order.materialAvailable || step.materialAvailable ? 'disponible' : 'non-disponible');
                    const toolStatus: ResourceStatus = order.toolingStatus ?? step.toolingStatus
                      ?? (order.toolingAvailable || step.toolingAvailable ? 'disponible' : 'non-disponible');
                    const amontStatus = phaseAmontStatus(step, draftSteps, productionRecords);
                    const hasForcedAmontWarning = !!forcedPhaseAmontWarnings[step.id] && amontStatus === 'red';
                    const amontEmoji = hasForcedAmontWarning ? '⚠️' : phaseAmontEmoji(amontStatus);

                    const dragIsOver = dragOverState?.operatorId === group.operator.id && dragOverState?.index === index;
                    const dragIsThis = isDragging && dragRef.current?.operatorId === group.operator.id && dragRef.current?.index === index;

                    return (
                      <TableRow
                        key={step.id}
                        draggable={!isEditing && !step.frozen && !hasActiveFilters}
                        onDragStart={e => handleDragStart(e, group.operator.id, index, step, order)}
                        onDragOver={e => handleDragOver(e, group.operator.id, index)}
                        onDragLeave={() => setDragOverState(null)}
                        onDrop={e => handleDrop(e, group.operator.id, index)}
                        onDragEnd={handleDragEnd}
                        className={`transition-colors ${blocked ? `${BLOCKED_TABLE_BG_CLASS} hover:bg-blocked/90 [&_*]:!text-blocked-table-foreground` : ''} ${dragIsOver ? 'border-t-2 border-t-primary' : ''} ${dragIsThis ? 'opacity-40' : ''} ${!blocked && step.frozen ? 'bg-primary/5' : ''}`}
                      >
                        <TableCell className="text-center px-1">
                          <div className="flex items-center justify-center gap-0.5">
                            {!step.frozen && !hasActiveFilters && <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab" />}
                            {step.frozen && <Lock className="w-3 h-3 text-primary" />}
                            <span className="text-xs font-medium text-muted-foreground">
                              {order.displayOrder && order.displayOrder > 0 ? order.displayOrder : <WarningTriangleIcon className="w-3.5 h-3.5 inline-block" />}
                            </span>
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
                        <TableCell className={`py-1.5 px-2 w-[180px] min-w-[180px] max-w-[180px] align-top ${designBg}`}>
                          <span className={`text-xs whitespace-normal break-words block ${blocked ? 'text-white font-medium' : ''}`}>
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
                          <div className="flex items-center gap-1">
                            {/* Flow position icons */}
                            {flowPos === 'only' && (
                              <div className="flex items-center gap-0 shrink-0">
                                <LogIn className="w-3.5 h-3.5 text-[hsl(142,60%,42%)]" />
                                <LogOut className="w-3.5 h-3.5 text-[hsl(0,72%,51%)]" />
                              </div>
                            )}
                            {flowPos === 'first' && (
                              <LogIn className="w-3.5 h-3.5 text-[hsl(142,60%,42%)] shrink-0" />
                            )}
                            {flowPos === 'last' && (
                              <LogOut className="w-3.5 h-3.5 text-[hsl(0,72%,51%)] shrink-0" />
                            )}
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
                          </div>
                        </TableCell>
                        {/* Observation */}
                        <TableCell className="py-1.5 px-2 w-[200px] min-w-[200px] align-top">
                          <span className={`text-xs whitespace-normal break-words block ${blocked ? 'text-white' : 'text-muted-foreground'}`}>
                            {order.observation || '—'}
                          </span>
                        </TableCell>
                        {/* Étude */}
                        <TableCell className="py-1.5 px-1 text-center" onClick={e => e.stopPropagation()}>
                          <ResourceStatusPill
                            value={studyStatus}
                            onChange={(next) => handleStatusChange(step.id, 'study', next)}
                            deadline={step.studyDeadline}
                          />
                        </TableCell>
                        {/* Matière */}
                        <TableCell className="py-1.5 px-1 text-center" onClick={e => e.stopPropagation()}>
                          <ResourceStatusPill
                            value={matStatus}
                            onChange={(next) => handleStatusChange(step.id, 'material', next)}
                            deadline={step.materialDeadline}
                            receivedDate={order.materialReceivedDate}
                          />
                        </TableCell>
                        {/* Outillage */}
                        <TableCell className="py-1.5 px-1 text-center" onClick={e => e.stopPropagation()}>
                          <ResourceStatusPill
                            value={toolStatus}
                            onChange={(next) => handleStatusChange(step.id, 'tooling', next)}
                            deadline={step.toolingDeadline}
                          />
                        </TableCell>
                        {/* Phase amont */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{amontEmoji}</span></TooltipTrigger>
                            <TooltipContent>
                              {hasForcedAmontWarning
                                ? '⚠️ Phase amont non terminée mais reprogrammation forcée'
                                : phaseAmontLabel(amontStatus)}
                            </TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>
                        <TableCell className="px-1">
                          <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleStepFrozen(step.id)} title={step.frozen ? 'Libérer' : 'Verrouiller'}>
                              {step.frozen ? <Lock className="w-3.5 h-3.5 text-primary" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                            </Button>
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
          );
        })}
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

      {/* Work register dialog */}
      <Dialog open={prodDialog.open} onOpenChange={(o) => { if (!o) setProdDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading">Enregistrement au registre des travaux effectués</DialogTitle>
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
              <Input type="time" className="h-9 w-32" value={prodDialog.durationToday}
                onChange={e => setProdDialog(prev => ({ ...prev, durationToday: e.target.value }))} />
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

      {statusDatePrompt && (
        <DatePromptDialog
          open={statusDatePrompt.open}
          label={
            statusDatePrompt.field === 'study'
              ? "Date prévue de finalisation de l'étude"
              : statusDatePrompt.field === 'material'
                ? 'Date prévue de disponibilité de la matière'
                : "Date prévue de disponibilité de l'outillage"
          }
          onConfirm={async (date) => {
            const saved = await applyStepStatus(statusDatePrompt.stepId, statusDatePrompt.field, statusDatePrompt.nextStatus, date);
            if (saved) setStatusDatePrompt(null);
          }}
          onCancel={() => setStatusDatePrompt(null)}
        />
      )}

      <ConfirmDialog
        open={materialConfirmOpen}
        title="Confirmez-vous cette action ?"
        onConfirm={() => {
          setMaterialConfirmOpen(false);
          setMaterialDatePromptOpen(true);
        }}
        onCancel={() => {
          setMaterialConfirmOpen(false);
          setMaterialDatePromptOpen(false);
          setPendingMaterialStatus(null);
        }}
      />

      {pendingMaterialStatus && materialDatePromptOpen && (
        <DatePromptDialog
          open={materialDatePromptOpen}
          label="Date de réception de la matière"
          defaultDate={orders.find(o => o.id === (draftSteps.find(s => s.id === pendingMaterialStatus.stepId) || steps.find(s => s.id === pendingMaterialStatus.stepId))?.orderId)?.materialReceivedDate || today}
          onConfirm={async (date) => {
            const saved = await applyStepStatus(pendingMaterialStatus.stepId, 'material', pendingMaterialStatus.nextStatus, undefined, date);
            if (!saved) return;
            setMaterialDatePromptOpen(false);
            setPendingMaterialStatus(null);
          }}
          onCancel={() => {
            setMaterialDatePromptOpen(false);
            setPendingMaterialStatus(null);
          }}
        />
      )}
    </div>
  );
};

export default PlanningTableauPage;
