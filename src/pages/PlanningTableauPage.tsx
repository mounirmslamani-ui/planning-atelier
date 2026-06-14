import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDateFR, formatDateTimeFR } from '@/lib/utils';
import { Download, Plus, Minus, GripVertical, ArrowUpDown, Undo2, Redo2, LogIn, LogOut, X, MoveVertical } from 'lucide-react';
import { WarningTriangleIcon } from '@/components/icons/StatusIcons';
import { Checkbox } from '@/components/ui/checkbox';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { isWorkDay, addWorkMinutes } from '@/lib/workTime';
import type { ProductionStep, Order, Holiday, ProductionRecord } from '@/types/planning';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import { useConfirm } from '@/hooks/use-confirm';
import ResourceStatusPill from '@/components/ResourceStatusPill';
import type { ResourceStatus } from '@/types/planning';
import { computeBlockedStepIds, BLOCKED_TABLE_BG_CLASS } from '@/lib/blockedSteps';
import { getOrderGlobalStatus, getOrderQualityControlCheck, getStepProgressStatus, isOrderReadyForQualityControl } from '@/lib/stepProgress';
import { supabase } from '@/integrations/supabase/client';
import { useHistoryStack } from '@/hooks/useHistoryStack';
import { exportSheetsToExcel, type ExcelRow } from '@/lib/excelExport';
import { TC_LEVELS, TC_LONG, tcShort } from '@/lib/technicalComplexity';
import DesignationCell from '@/components/DesignationCell';
import RelaisDialog, { type RelaisResult, type RelaisMode } from '@/components/RelaisDialog';
import { useAuth } from '@/context/AuthContext';

const OPERATOR_NAME_ORDER = ['عادل', 'محمود العيشي', 'بلال', 'محمود بن قيطون', 'عبد الرزاق', 'حمزة', 'عمر', 'صالح', 'ياسين', 'معاذ', 'يوسف', 'عبدالنور', 'معالجة حرارية'];

const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };


function getDesignationBg(priority?: string): string {
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

const isBlockingResourceStatus = (status: ResourceStatus | undefined): boolean =>
  status === 'non-disponible' || status === 'partiel';

// isManualOrderViolation removed — manual ordering is the only mode now.


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

const MAX_SESSION_DURATION_MINUTES = 12 * 60;

function normalizeDurationInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseDurationHHMM(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (minutes > 59) return null;
  return hours * 60 + minutes;
}

// Parse strict HH:mm time-of-day (0..24h, 0..59min)
function parseTimeHHMM(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

// Auto pause rule: start < 12:00 AND end > 12:30 → 00:30, else 00:00
function computeAutoPause(start: string, end: string): string {
  const s = parseTimeHHMM(start);
  const e = parseTimeHHMM(end);
  if (s === null || e === null) return '00:00';
  return (s < 12 * 60 && e > 12 * 60 + 30) ? '00:30' : '00:00';
}

function computeActualDuration(start: string, end: string, pause: string): number | null {
  const s = parseTimeHHMM(start);
  const e = parseTimeHHMM(end);
  const p = parseDurationHHMM(pause) ?? 0;
  if (s === null || e === null) return null;
  const diff = e - s - p;
  return diff > 0 ? diff : null;
}

function isStepFinished(step: ProductionStep, records: ProductionRecord[]): boolean {
  return getStepProgressStatus(step, records) === 'Terminée';
}

function areAllOrderStepsFinished(orderId: string, allSteps: ProductionStep[], records: ProductionRecord[], absenceOperationId: string): boolean {
  return isOrderReadyForQualityControl(orderId, allSteps, records, absenceOperationId);
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

type PlanningFilterKey = 'displayOrder' | 'startDate' | 'endDate' | 'orderNumber' | 'client' | 'designation' | 'quantity' | 'priority' | 'complexity' | 'globalStatus' | 'machine' | 'status' | 'operation';

/**
 * Append new steps (whose parent order is not yet ordered) to the END of each
 * operator's list, without reordering existing steps.
 * Steps with a known planning_order keep their relative position; new steps
 * just receive a stable sequential `step.order` so React keys are stable.
 */
function appendUnorderedStepsAtEnd(allSteps: ProductionStep[]): ProductionStep[] {
  // Group by operator and reassign step.order sequentially per operator,
  // preserving the input order (which already reflects DB / planning_order order).
  const byOperator = new Map<string, ProductionStep[]>();
  allSteps.forEach(s => {
    const key = s.operatorId || '__none__';
    if (!byOperator.has(key)) byOperator.set(key, []);
    byOperator.get(key)!.push(s);
  });

  const result: ProductionStep[] = [];
  byOperator.forEach(group => {
    group.forEach((s, idx) => {
      result.push({ ...s, order: idx + 1 });
    });
  });
  return result;
}


function createPlanningSnapshot(
  nextDraftSteps: ProductionStep[],
  nextDraftOrders: Order[],
  nextForcedWarnings: Record<string, boolean>,
  nextOrderDirty: boolean,
): PlanningDraftSnapshot {
  return {
    draftSteps: nextDraftSteps.map(step => ({ ...step })),
    draftOrders: nextDraftOrders.map(order => ({ ...order })),
    forcedPhaseAmontWarnings: { ...nextForcedWarnings },
    orderDirty: nextOrderDirty,
  };
}

function areSnapshotsEqual(a: PlanningDraftSnapshot, b: PlanningDraftSnapshot): boolean {
  if (a.draftSteps.length !== b.draftSteps.length) return false;

  for (let index = 0; index < a.draftSteps.length; index += 1) {
    const left = a.draftSteps[index];
    const right = b.draftSteps[index];
    if (JSON.stringify(left) !== JSON.stringify(right)) return false;
  }

  if (a.draftOrders.length !== b.draftOrders.length) return false;

  for (let index = 0; index < a.draftOrders.length; index += 1) {
    const left = a.draftOrders[index];
    const right = b.draftOrders[index];
    if (JSON.stringify(left) !== JSON.stringify(right)) return false;
  }

  const leftWarningKeys = Object.keys(a.forcedPhaseAmontWarnings).sort();
  const rightWarningKeys = Object.keys(b.forcedPhaseAmontWarnings).sort();
  if (leftWarningKeys.length !== rightWarningKeys.length) return false;

  return a.orderDirty === b.orderDirty
    && leftWarningKeys.every((key, index) => key === rightWarningKeys[index] && a.forcedPhaseAmontWarnings[key] === b.forcedPhaseAmontWarnings[key]);
}

interface ProductionDialogState {
  open: boolean;
  step: ProductionStep | null;
  order: Order | null;
  operatorName: string;
  operationName: string;
  workDate: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  pauseTime: string;
  pauseManual: boolean;
  totalDoneAlready: number;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const NUMDAYS_STORAGE_KEY = 'planning-tableau-numdays';
const PLANNING_HISTORY_LIMIT = 50;

interface PlanningDraftSnapshot {
  draftSteps: ProductionStep[];
  draftOrders: Order[];
  forcedPhaseAmontWarnings: Record<string, boolean>;
  orderDirty: boolean;
}

const PlanningTableauPage: React.FC = () => {
  const { hasAccess } = useAuth();
  const canReorderPn = hasAccess({ tableau: 'جدول البرمجة', formulaire: '', sous_formulaire: 'تغيير ترتيب الطلبيات في البرمجة', champ_bouton: '' }) === 'RW';
  const {
    operators, orders, steps, clients, operations,
    equipments,
    absenceOperationId, absenceOrderId, updateStep, updateOrder,
    holidays, productionRecords, addProductionRecord,
    qcEntries, addQCEntry,
  } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [numDays, setNumDays] = useState(() => {
    const saved = localStorage.getItem(NUMDAYS_STORAGE_KEY);
    return saved ? parseInt(saved, 10) || 5 : 5;
  });
  const [numDaysInput, setNumDaysInput] = useState(String(numDays));
  const [draftOrders, setDraftOrders] = useState<Order[]>(orders);
  // Pn per step: position dans le planning propre à chaque opérateur (persisté en DB)
  const [planningOrderMap, setPlanningOrderMap] = useState<Record<string, number>>({});

  // Column filters for the operator tables
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [colSortKey, setColSortKey] = useState<string | null>(null);
  const [colSortDir, setColSortDir] = useState<SortDirection>(null);

  // Persist numDays
  useEffect(() => {
    localStorage.setItem(NUMDAYS_STORAGE_KEY, String(numDays));
    setNumDaysInput(String(numDays));
  }, [numDays]);

  // Validation state removed — every reorder is persisted instantly to DB.
  const orderDirty = false;
  const setOrderDirty = (_: boolean) => {};

  const history = useHistoryStack<PlanningDraftSnapshot>({
    initialPresent: createPlanningSnapshot(appendUnorderedStepsAtEnd(steps), orders, {}, false),
    limit: PLANNING_HISTORY_LIMIT,
    isEqual: areSnapshotsEqual,
  });
  const canUndo = history.canUndo;
  const canRedo = history.canRedo;

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

  // ─── DRAFT STEPS: local layer that defers DB writes until «Valider» ───
  const [draftSteps, setDraftSteps] = useState<ProductionStep[]>(steps);
  const draftInitialized = useRef(false);
  const [forcedPhaseAmontWarnings, setForcedPhaseAmontWarnings] = useState<Record<string, boolean>>({});

  const commitPlanningHistory = useCallback((
    nextDraftSteps: ProductionStep[],
    nextDraftOrders: Order[],
    nextForcedWarnings: Record<string, boolean>,
    nextOrderDirty: boolean,
  ) => {
    history.commit(createPlanningSnapshot(nextDraftSteps, nextDraftOrders, nextForcedWarnings, nextOrderDirty));
  }, [history]);

  // Sync from context whenever steps change. Since every edit is persisted
  // instantly, the context is the source of truth — always re-sync the draft.
  useEffect(() => {
    const syncedDraftSteps = appendUnorderedStepsAtEnd(steps);
    setDraftOrders(orders);
    setDraftSteps(syncedDraftSteps);
    if (!draftInitialized.current) {
      setForcedPhaseAmontWarnings({});
      history.reset(createPlanningSnapshot(syncedDraftSteps, orders, {}, false));
      draftInitialized.current = true;
    }
  }, [steps, orders, history]);

  // ─── Pn (planning_order) : chargement additif depuis la base ───
  // IMPORTANT : on ne remplace JAMAIS la map locale (elle est autoritative après un D&D).
  // On se contente d'ajouter les Pn manquants pour les nouvelles étapes apparues.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('production_steps')
        .select('id, planning_order');
      if (cancelled || error || !data) return;
      setPlanningOrderMap(prev => {
        const next = { ...prev };
        let changed = false;
        data.forEach((row: { id: string; planning_order: number | null }) => {
          if (row.planning_order != null && next[row.id] == null) {
            next[row.id] = row.planning_order;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    })();
    return () => { cancelled = true; };
  }, [steps]);

  /** Persist a batch of {stepId -> planning_order} updates to DB and local map. */
  const persistPlanningOrders = useCallback(async (updates: Record<string, number>) => {
    setPlanningOrderMap(prev => ({ ...prev, ...updates }));
    await Promise.all(
      Object.entries(updates).map(([id, planning_order]) =>
        supabase.from('production_steps').update({ planning_order }).eq('id', id)
      )
    );
  }, []);

  const handleUndo = useCallback(() => {
    const previous = history.undo();
    if (!previous) return;
    setDraftSteps(previous.draftSteps.map(step => ({ ...step })));
    setDraftOrders(previous.draftOrders.map(order => ({ ...order })));
    setForcedPhaseAmontWarnings({ ...previous.forcedPhaseAmontWarnings });
    setOrderDirty(previous.orderDirty);
  }, [history]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    if (!next) return;
    setDraftSteps(next.draftSteps.map(step => ({ ...step })));
    setDraftOrders(next.draftOrders.map(order => ({ ...order })));
    setForcedPhaseAmontWarnings({ ...next.forcedPhaseAmontWarnings });
    setOrderDirty(next.orderDirty);
  }, [history]);

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
    open: false, step: null, order: null, operatorName: '', operationName: '', workDate: todayISO(), startTime: '', endTime: '', pauseTime: '00:00', pauseManual: false, totalDoneAlready: 0,
  });
  const [prodDurationError, setProdDurationError] = useState('');
  const [completionDialog, setCompletionDialog] = useState<{
    open: boolean;
    stepId: string;
    orderId: string;
    operatorId: string;
    operationId: string;
    totalEstimated: number;
    totalDone: number;
    durationToday: number;
    workDate: string;
    startTime: string;
    endTime: string;
    pauseMinutes: number;
  } | null>(null);

  // Relais (debut_poste / relais / fin_poste) dialog state
  const [relaisDialog, setRelaisDialog] = useState<{ open: boolean; mode: RelaisMode; operatorId: string } | null>(null);
  const [pendingRelaisStart, setPendingRelaisStart] = useState<{ stepId: string; operatorId: string; startTime: string; workDate: string } | null>(null);



  // Drag & drop state - use REFS to avoid stale closure issues
  const dragRef = useRef<{ operatorId: string; index: number } | null>(null);
  const [dragOverState, setDragOverState] = useState<{ operatorId: string; index: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Selected operator tab (null = first available operator shown)
  const [selectedTabOperatorId, setSelectedTabOperatorId] = useState<string | null>(null);

  // Sélection multiple + déplacement par Pn (identique à OrdersPage Cn, mais sur planning_order)
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());
  const [movePnDialogOpen, setMovePnDialogOpen] = useState(false);
  const [moveTargetPn, setMoveTargetPn] = useState('');
  const [moveDialogOperatorId, setMoveDialogOperatorId] = useState('');

  const workingDays = useMemo(() => getWorkingDays(numDays, holidays), [numDays, holidays]);

  const getClientName = useCallback((clientId: string) => {
    if (!clientId) return '*******';
    return clients.find(c => c.id === clientId)?.name || '*******';
  }, [clients]);

  const getOperationName = useCallback((opId: string) => {
    return operations.find(o => o.id === opId)?.name || '—';
  }, [operations]);

  const getMachineName = useCallback((step: ProductionStep) => {
    const equipmentNames = (step.equipmentIds || [])
      .map(id => equipments.find(equipment => equipment.id === id)?.designation)
      .filter(Boolean) as string[];
    if (equipmentNames.length > 0) return equipmentNames.join(', ');
    const operatorName = step.operatorId ? operators.find(op => op.id === step.operatorId)?.name : '';
    return operatorName || '—';
  }, [equipments, operators]);

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
        const order = draftOrders.find(o => o.id === step.orderId);
        if (!order) return;
        if (result[step.operatorId]) {
          result[step.operatorId].tasks.push({ step, order });
        }
      }
    });

    // Tri par planning_order (Pn) si défini, sinon par displayOrder (Cn).
    Object.values(result).forEach(group => {
      group.tasks.sort((a, b) => {
        const pa = planningOrderMap[a.step.id];
        const pb = planningOrderMap[b.step.id];
        if (pa != null && pb != null) return pa - pb;
        if (pa != null) return -1;
        if (pb != null) return 1;
        const da = a.order.displayOrder ?? 0;
        const db = b.order.displayOrder ?? 0;
        if (da === 0 && db === 0) return 0;
        if (da === 0) return 1;
        if (db === 0) return -1;
        return da - db;
      });
    });

    return Object.values(result)
      .sort((a, b) => {
        const ai = OPERATOR_NAME_ORDER.indexOf(a.operator.name);
        const bi = OPERATOR_NAME_ORDER.indexOf(b.operator.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .filter(g => g.tasks.length > 0);
  }, [operators, draftSteps, draftOrders, workingDays, absenceOperationId, absenceOrderId, productionRecords, planningOrderMap]);

  // ─── Recalcul automatique des Pn pour combler les trous quand une étape disparaît ───
  useEffect(() => {
    const updates: Record<string, number> = {};
    operatorTasks.forEach(group => {
      const taskIds = group.tasks.map(t => t.step.id);
      const knownPns = taskIds
        .map(id => planningOrderMap[id])
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      // Détecte trou : si max != length OU des étapes ont un Pn mais pas séquentiel
      const hasGap = knownPns.length > 0 && (
        knownPns[knownPns.length - 1] !== knownPns.length ||
        knownPns.some((v, i) => v !== i + 1)
      );
      if (!hasGap) return;
      group.tasks.forEach((t, idx) => {
        const desired = idx + 1;
        if (planningOrderMap[t.step.id] !== desired) {
          updates[t.step.id] = desired;
        }
      });
    });
    if (Object.keys(updates).length > 0) {
      persistPlanningOrders(updates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorTasks]);

  /** Apply new order + recalculate dates LOCALLY in draftSteps (no DB write) */
  const applyReorder = useCallback((
    tasks: TaskItem[],
    targetStepId?: string,
    nextDraftOrdersOverride?: Order[],
    nextForcedWarningsOverride?: Record<string, boolean>,
    nextPlanningOrdersOverride?: Record<string, number>,
  ) => {
    const reorderedTasks = tasks.map(({ step, order }, idx) => {
      const reorderedStep: ProductionStep = {
        ...step,
        order: idx + 1,
      };

      return { order, step: reorderedStep };
    });

    const dateUpdates = recalcStartDates(reorderedTasks, holidays);
    const dateUpdatesById = new Map(dateUpdates.map(s => [s.id, s]));

    const updatedIds = new Set(reorderedTasks.map(t => t.step.id));
    const finalSteps = reorderedTasks.map(({ step }) => dateUpdatesById.get(step.id) ?? step);
    const nextDraftOrders = nextDraftOrdersOverride ?? draftOrders;
    const nextForcedWarnings = nextForcedWarningsOverride ?? forcedPhaseAmontWarnings;
    // IMPORTANT: merge fresh Pn updates over the (possibly stale) closure map,
    // sinon updateStep réécrit l'ancien planning_order en base et la position bouge au retour.
    const effectivePlanningMap = { ...planningOrderMap, ...(nextPlanningOrdersOverride ?? {}) };

    setOrderDirty(true);

    setDraftSteps(prev => {
      const unchanged = prev.filter(s => !updatedIds.has(s.id));
      return [...unchanged, ...finalSteps];
    });
    commitPlanningHistory(
      [...draftSteps.filter(s => !updatedIds.has(s.id)), ...finalSteps],
      nextDraftOrders,
      nextForcedWarnings,
      true,
    );

    const currentStepsById = new Map(draftSteps.map(step => [step.id, step]));
    finalSteps.forEach(finalStep => {
      const enriched = { ...finalStep, planningOrder: effectivePlanningMap[finalStep.id] ?? finalStep.planningOrder };
      const currentStep = currentStepsById.get(finalStep.id);
      if (!currentStep || JSON.stringify(currentStep) !== JSON.stringify(enriched)) {
        updateStep(enriched);
      }
    });
    // frozenOrder / manualSortOrder writes removed — manual ordering only.
  }, [holidays, draftOrders, forcedPhaseAmontWarnings, draftSteps, commitPlanningHistory, updateStep, planningOrderMap]);


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

    // Recalcule et persiste immédiatement le planning_order (Pn) pour cet opérateur.
    const updates: Record<string, number> = {};
    items.forEach((item, idx) => { updates[item.step.id] = idx + 1; });
    persistPlanningOrders(updates);

    applyReorder(items, dragged.step.id, undefined, undefined, updates);
    dragRef.current = null;
    setDragOverState(null);
    setIsDragging(false);
  }, [operatorTasks, applyReorder, persistPlanningOrders]);

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
      const nextForcedWarnings = newWarnings.has('phaseAmont')
        ? { ...forcedPhaseAmontWarnings, [stepId]: true }
        : forcedPhaseAmontWarnings;

      if (newWarnings.has('phaseAmont')) {
        setForcedPhaseAmontWarnings(nextForcedWarnings);
      }
      applyReorder(tasks, stepId, undefined, nextForcedWarnings);
      setPendingDrop(null);
    }
  }, [pendingDrop, applyReorder, forcedPhaseAmontWarnings]);

  const handlePendingCancel = useCallback(() => {
    setPendingDrop(null);
  }, []);

  // ─── Auto-sort : réinitialise les Pn selon le Cn (displayOrder) ───
  // handleAutoSort removed — manual ordering only.

  // ─── Sélection multiple + déplacement par Pn ───
  const toggleSelectStep = useCallback((stepId: string) => {
    setSelectedStepIds(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId); else next.add(stepId);
      return next;
    });
  }, []);

  const toggleSelectAllSteps = useCallback((tasks: TaskItem[]) => {
    const allSelected = tasks.length > 0 && tasks.every(t => selectedStepIds.has(t.step.id));
    setSelectedStepIds(prev => {
      const next = new Set(prev);
      if (allSelected) tasks.forEach(t => next.delete(t.step.id));
      else tasks.forEach(t => next.add(t.step.id));
      return next;
    });
  }, [selectedStepIds]);

  const openMovePnDialog = useCallback((operatorId: string, extraStepId?: string) => {
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group) return;
    const ids = new Set(selectedStepIds);
    if (extraStepId) ids.add(extraStepId);
    if (ids.size === 0) return;
    if (extraStepId && !selectedStepIds.has(extraStepId)) setSelectedStepIds(ids);
    const selectedTasks = group.tasks.filter(t => ids.has(t.step.id));
    const minPn = Math.min(...selectedTasks.map(t => planningOrderMap[t.step.id] ?? 9999));
    setMoveTargetPn(String(minPn === 9999 ? 1 : minPn));
    setMoveDialogOperatorId(operatorId);
    setMovePnDialogOpen(true);
  }, [operatorTasks, selectedStepIds, planningOrderMap]);

  const applyMovePnSelection = useCallback(() => {
    const target = parseInt(moveTargetPn, 10);
    if (!target || target < 1) return;
    const group = operatorTasks.find(g => g.operator.id === moveDialogOperatorId);
    if (!group) { setMovePnDialogOpen(false); return; }

    const selectedItems = group.tasks.filter(t => selectedStepIds.has(t.step.id));
    if (selectedItems.length === 0) { setMovePnDialogOpen(false); return; }
    const remaining = group.tasks.filter(t => !selectedStepIds.has(t.step.id));
    const insertAt = Math.min(Math.max(0, target - 1), remaining.length);
    const newList = [
      ...remaining.slice(0, insertAt),
      ...selectedItems,
      ...remaining.slice(insertAt),
    ];

    // Réassigner les Pn (planning_order) séquentiellement à partir de 1 — PAS les Cn/displayOrder
    const updates: Record<string, number> = {};
    newList.forEach((item, idx) => { updates[item.step.id] = idx + 1; });
    persistPlanningOrders(updates);
    applyReorder(newList, undefined, undefined, undefined, updates);

    setMovePnDialogOpen(false);
    setSelectedStepIds(new Set());
  }, [moveTargetPn, moveDialogOperatorId, operatorTasks, selectedStepIds, persistPlanningOrders, applyReorder]);



  // ─── ترتيب آلي : réordonne les tâches de l'opérateur sélectionné par ordre croissant des Cn ───
  const handleAutoSortByCn = useCallback(() => {
    const operatorId = selectedTabOperatorId ?? operatorTasks[0]?.operator.id;
    if (!operatorId) return;
    const group = operatorTasks.find(g => g.operator.id === operatorId);
    if (!group || group.tasks.length === 0) return;
    const sorted = [...group.tasks].sort((a, b) => {
      const da = a.order.displayOrder ?? 9999;
      const db = b.order.displayOrder ?? 9999;
      return da - db;
    });
    const updates: Record<string, number> = {};
    sorted.forEach((item, idx) => { updates[item.step.id] = idx + 1; });
    persistPlanningOrders(updates);
    applyReorder(sorted, undefined, undefined, undefined, updates);
  }, [selectedTabOperatorId, operatorTasks, persistPlanningOrders, applyReorder]);

  // toggleStepFrozen removed — step locking (cadenas) no longer supported.

  // Compute blocked step IDs (violet) — propagates to all successor steps of the same order
  const blockedStepIds = useMemo(
    () => computeBlockedStepIds(draftSteps, draftOrders),
    [draftSteps, draftOrders]
  );
  const isStepBlocked = (step: ProductionStep): boolean => blockedStepIds.has(step.id);

  // (Drag to Production Register is now integrated in handleDragStart)

  const openProdDialog = useCallback((stepId: string) => {
    const step = draftSteps.find(s => s.id === stepId);
    if (!step) return;
    const order = draftOrders.find(o => o.id === step.orderId);
    if (!order) return;
    const operator = operators.find(o => o.id === step.operatorId);
    const totalDoneAlready = productionRecords
      .filter(r => r.stepId === stepId)
      .reduce((sum, r) => sum + r.actualDuration, 0);

    setProdDialog({
      open: true, step, order,
      operatorName: operator?.name || '—',
      operationName: getOperationName(step.operationId),
      workDate: todayISO(),
      startTime: '', endTime: '', pauseTime: '00:00', pauseManual: false, totalDoneAlready,
    });
    setProdDurationError('');
  }, [draftSteps, draftOrders, operators, productionRecords, getOperationName]);

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
    const durationTodayMin = computeActualDuration(prodDialog.startTime, prodDialog.endTime, prodDialog.pauseTime);
    if (durationTodayMin === null) {
      setProdDurationError("الرجاء إدخال ساعة بداية وساعة نهاية صحيحتين");
      return;
    }
    if (durationTodayMin > MAX_SESSION_DURATION_MINUTES) {
      setProdDurationError('La durée maximale par session est de 12h00');
      return;
    }

    const totalDone = prodDialog.totalDoneAlready + durationTodayMin;
    const pauseMin = parseDurationHHMM(prodDialog.pauseTime) ?? 0;
    setCompletionDialog({
      open: true, stepId: prodDialog.step.id, orderId: prodDialog.order.id,
      operatorId: prodDialog.step.operatorId || '', operationId: prodDialog.step.operationId,
      totalEstimated: prodDialog.step.estimatedDuration, totalDone, durationToday: durationTodayMin,
      workDate: prodDialog.workDate || todayISO(),
      startTime: prodDialog.startTime, endTime: prodDialog.endTime, pauseMinutes: pauseMin,
    });
    setProdDialog(prev => ({ ...prev, open: false }));
  }, [prodDialog]);

  const lastRecordedStepRef = useRef<string | null>(null);

  const handleCompletionAnswer = useCallback((finished: boolean) => {
    if (!completionDialog) return;
    const { stepId, orderId, operatorId, operationId, durationToday, totalEstimated, totalDone, workDate, startTime, endTime, pauseMinutes } = completionDialog;

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
      workDate, startTime: startTime || undefined, endTime: endTime || undefined, pauseMinutes,
      workStatus: finished ? 'done' : 'continue',
    };
    addProductionRecord(record);

    if (finished) {
      // Finished steps are filtered out by isStepFinished in operatorTasks.



      const allKnownSteps = [...draftSteps, ...steps].filter((s, index, arr) => arr.findIndex(item => item.id === s.id) === index);
      const recordsAfterInsert = [...productionRecords, record];
      const qcCheck = getOrderQualityControlCheck(orderId, allKnownSteps, recordsAfterInsert, absenceOperationId);
      if (qcCheck.isReady && orderId !== absenceOrderId && !qcEntries.some(entry => entry.orderId === orderId)) {
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

  // ───────── Relais (debut_poste / relais / fin_poste) confirm handler ─────────
  const handleRelaisConfirm = useCallback((result: RelaisResult) => {
    const { finishedRecord, nextRecord } = result;

    if (finishedRecord) {
      const record: ProductionRecord = {
        id: crypto.randomUUID(),
        stepId: finishedRecord.stepId,
        orderId: finishedRecord.orderId,
        operatorId: finishedRecord.operatorId,
        operationId: finishedRecord.operationId,
        actualDuration: finishedRecord.actualDuration,
        validatedAt: new Date().toISOString(),
        workDate: finishedRecord.workDate,
        startTime: finishedRecord.startTime,
        endTime: finishedRecord.endTime,
        pauseMinutes: finishedRecord.pauseMinutes,
        workStatus: finishedRecord.workStatus,
      };
      addProductionRecord(record);

      if (finishedRecord.workStatus === 'done') {
        const allKnownSteps = [...draftSteps, ...steps].filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);
        const recordsAfterInsert = [...productionRecords, record];
        if (
          areAllOrderStepsFinished(finishedRecord.orderId, allKnownSteps, recordsAfterInsert, absenceOperationId)
          && finishedRecord.orderId !== absenceOrderId
          && !qcEntries.some(q => q.orderId === finishedRecord.orderId)
        ) {
          addQCEntry({
            id: crypto.randomUUID(),
            orderId: finishedRecord.orderId,
            controlDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        // 'continue' — adjust remaining estimated duration for the step
        const step = draftSteps.find(s => s.id === finishedRecord.stepId);
        if (step) {
          const totalDone = productionRecords
            .filter(r => r.stepId === finishedRecord.stepId)
            .reduce((sum, r) => sum + (r.actualDuration || 0), 0) + finishedRecord.actualDuration;
          const remaining = Math.max(0, step.estimatedDuration - totalDone);
          updateStep({ ...step, estimatedDuration: remaining });
        }
      }
    }

if (nextRecord) {
  setPendingRelaisStart({
    stepId: nextRecord.stepId,
    operatorId: nextRecord.operatorId,
    startTime: nextRecord.startTime,
    workDate: nextRecord.workDate,
  });
  const step = draftSteps.find(s => s.id === nextRecord.stepId);
  if (step) {
    updateStep({ ...step, startTime: nextRecord.startTime });
  }
  localStorage.setItem(`relais-started-${nextRecord.operatorId}-${nextRecord.workDate}`, nextRecord.startTime);
}

    const closingOperatorId = relaisDialog?.operatorId;
    const closingMode = relaisDialog?.mode;
    if (closingMode === 'fin_poste' && closingOperatorId) {
      localStorage.setItem(`fin-poste-${closingOperatorId}-${todayISO()}`, '1');
    }
    setRelaisDialog(null);
  }, [addProductionRecord, draftSteps, steps, productionRecords, absenceOperationId, absenceOrderId, qcEntries, addQCEntry, updateStep]);



  // Export to Excel
  const handleExport = useCallback(() => {
    exportSheetsToExcel('Planning', operatorTasks.map(group => ({
      name: group.operator.name,
      rows: group.tasks.map(({ step, order }): ExcelRow => ({
        'تاريخ البداية': formatDateFR(step.startDate),
        'رقم الطلبية': order.orderNumber,
        Client: getClientName(order.clientId),
        Désignation: order.designation,
        Qté: order.quantity,
        Priorité: order.priority,
        'مستوى التعقيد التقني': TC_LONG[order.technicalComplexity || ''] || '',
        Délai: formatDateFR(order.deliveryDeadline || order.plannedDeadline),
        Opération: getOperationName(step.operationId),
        Durée: formatMinutesToHM(step.estimatedDuration),
      })),
      columnWidths: [12, 12, 18, 45, 8, 8, 14, 12, 20, 8],
    })));
  }, [operatorTasks, getClientName, getOperationName]);

  const periodLabel = workingDays.length > 0
    ? `${formatDateFR(workingDays[0])} → ${formatDateFR(workingDays[workingDays.length - 1])}`
    : '';


  // Column filter/sort handlers
  const handleColSort = useCallback((key: string, dir: SortDirection) => {
    setColSortKey(dir ? key : null);
    setColSortDir(dir);
  }, []);
  const handleColFilter = useCallback((key: string, value: string) => {
    setColFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearPlanningFilters = useCallback(() => {
    setColFilters({});
    setColSortKey(null);
    setColSortDir(null);
  }, []);

  const operationFilterOptions = useMemo(() => (
    Array.from(new Set(operations.filter(o => o.category === 'operator' && o.id !== absenceOperationId).map(o => o.name))).sort((a, b) => a.localeCompare(b, 'fr'))
  ), [operations, absenceOperationId]);

  const machineFilterOptions = useMemo(() => (
    Array.from(new Set(operatorTasks.flatMap(group => group.tasks.map(task => getMachineName(task.step))))).filter(value => value && value !== '—').sort((a, b) => a.localeCompare(b, 'fr'))
  ), [operatorTasks, getMachineName]);

  const allValuesByKey = useMemo(() => {
    const allTasks = operatorTasks.flatMap(g => g.tasks);
    const get = (t: any, k: string) => {
      switch (k) {
        case 'displayOrder': return String(t.order.displayOrder ?? '');
        case 'startDate': return t.step.startDate || '';
        case 'endDate': return t.step.endDate || '';
        case 'orderNumber': return t.order.orderNumber;
        case 'client': return getClientName(t.order.clientId);
        case 'designation': return t.order.designation;
        case 'quantity': return String(t.order.quantity);
        case 'priority': return t.order.priority || '';
        case 'complexity': return t.order.technicalComplexity || '';
        case 'globalStatus': return getOrderGlobalStatus(t.order.id, draftSteps, productionRecords, absenceOperationId);
        case 'machine': return getMachineName(t.step);
        case 'status': return getStepProgressStatus(t.step, productionRecords);
        case 'operation': return getOperationName(t.step.operationId);
        default: return '';
      }
    };
    const keys = ['displayOrder','startDate','endDate','orderNumber','client','designation','quantity','priority','complexity','globalStatus','machine','status','operation'];
    const map: Record<string, string[]> = {};
    keys.forEach(k => { map[k] = [...new Set(allTasks.map((t: any) => get(t, k)).filter(Boolean))].sort(); });
    return map;
  }, [operatorTasks, getClientName, getMachineName, getOperationName, draftSteps, productionRecords, absenceOperationId]);

  // Apply filters to tasks within a group
  const filterTasks = useCallback((tasks: TaskItem[]): TaskItem[] => {
    let result = tasks;
    const normalizedFilters = Object.entries(colFilters).filter(([, value]) => !!value);

    normalizedFilters.forEach(([key, value]) => {
      const needle = value.toLowerCase();
      result = result.filter(t => {
        switch (key as PlanningFilterKey) {
          case 'displayOrder': return String(t.order.displayOrder ?? '').includes(needle);
          case 'startDate': return t.step.startDate === value;
          case 'endDate': return t.step.endDate === value;
          case 'orderNumber': return t.order.orderNumber.toLowerCase().includes(needle);
          case 'client': return getClientName(t.order.clientId).toLowerCase().includes(needle);
          case 'designation': return t.order.designation.toLowerCase().includes(needle);
          case 'quantity': return String(t.order.quantity).includes(needle);
          case 'priority': { const vals = value.split('|').filter(Boolean); return vals.includes(t.order.priority as string); }
          case 'complexity': { const vals = value.split('|').filter(Boolean); return vals.includes(t.order.technicalComplexity || ''); }
          case 'globalStatus': { const vals = value.split('|').filter(Boolean); return vals.includes(getOrderGlobalStatus(t.order.id, draftSteps, productionRecords, absenceOperationId)); }
          case 'machine': return getMachineName(t.step) === value;
          case 'status': { const vals = value.split('|').filter(Boolean); return vals.includes(getStepProgressStatus(t.step, productionRecords)); }
          case 'operation': { const vals = value.split('|').filter(Boolean); return vals.includes(getOperationName(t.step.operationId)); }
          default: return true;
        }
      });
    });

    if (colSortKey && colSortDir) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (colSortKey as PlanningFilterKey) {
          case 'startDate': cmp = a.step.startDate.localeCompare(b.step.startDate); break;
          case 'endDate': cmp = a.step.endDate.localeCompare(b.step.endDate); break;
          case 'client': cmp = getClientName(a.order.clientId).localeCompare(getClientName(b.order.clientId), 'fr'); break;
          case 'orderNumber': cmp = a.order.orderNumber.localeCompare(b.order.orderNumber, 'fr', { numeric: true }); break;
          case 'designation': cmp = a.order.designation.localeCompare(b.order.designation, 'fr'); break;
          case 'quantity': cmp = a.order.quantity - b.order.quantity; break;
          case 'priority': cmp = (priorityRank[a.order.priority] ?? 9) - (priorityRank[b.order.priority] ?? 9); break;
          case 'complexity': cmp = (a.order.technicalComplexity || '').localeCompare(b.order.technicalComplexity || '', 'fr'); break;
          case 'globalStatus': cmp = getOrderGlobalStatus(a.order.id, draftSteps, productionRecords, absenceOperationId).localeCompare(getOrderGlobalStatus(b.order.id, draftSteps, productionRecords, absenceOperationId), 'fr'); break;
          case 'machine': cmp = getMachineName(a.step).localeCompare(getMachineName(b.step), 'fr'); break;
          case 'status': cmp = getStepProgressStatus(a.step, productionRecords).localeCompare(getStepProgressStatus(b.step, productionRecords), 'fr'); break;
          case 'operation': cmp = getOperationName(a.step.operationId).localeCompare(getOperationName(b.step.operationId), 'fr'); break;
        }
        return colSortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [colFilters, colSortKey, colSortDir, getClientName, getMachineName, getOperationName, productionRecords, draftSteps, absenceOperationId]);

  const hasActiveFilters = Object.values(colFilters).some(Boolean) || !!colSortKey;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
        title="جدول البرمجة      "
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleUndo} disabled={!canUndo} title="تراجع (Ctrl+Z)">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRedo} disabled={!canRedo} title="إعادة (Ctrl+Y)">
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

            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearPlanningFilters}>
                <X className="w-4 h-4 mr-1" /> Effacer tous les filtres
              </Button>
            )}
            <Button
              onClick={handleAutoSortByCn}
              variant="outline"
              title="إعادة ترتيب التعيينات حسب ترتيب الطلبيات (Cn)"
            >
              <ArrowUpDown className="w-4 h-4 mr-1" /> ترتيب آلي
            </Button>
          </div>
          }
        />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>


        {/* Operator tabs */}
        <div className="flex items-center gap-1 px-1 py-2 border-b overflow-x-auto">
        <span></span>
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
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto pt-3">
        {operatorTasks.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Aucune tâche planifiée pour cette période</p>
        )}

        {operatorTasks
          .filter(group => group.operator.id === (selectedTabOperatorId ?? operatorTasks[0]?.operator.id))
          .map(group => {
          const filteredTasks = filterTasks(group.tasks);
          const groupSelectedCount = filteredTasks.filter(t => selectedStepIds.has(t.step.id)).length;
          const allFilteredSelected = filteredTasks.length > 0 && filteredTasks.every(t => selectedStepIds.has(t.step.id));
          // Cn ordering violation: a row violates if a previous row has a larger Cn
          const cnViolations = new Set<number>();
          {
            let prevMax = -Infinity;
            filteredTasks.forEach((t, i) => {
              const cn = t.order.displayOrder ?? Infinity;
              if (cn < prevMax) cnViolations.add(i);
              if (cn > prevMax) prevMax = cn;
            });
          }
          const operatorId = group.operator.id;
          const hasRecordToday = productionRecords.some(r => r.operatorId === operatorId && r.workDate === todayISO())
            || localStorage.getItem(`relais-started-${operatorId}-${todayISO()}`) !== null;
          const hasFinishedShift = localStorage.getItem(`fin-poste-${operatorId}-${todayISO()}`) === '1';
          const hasOpenStep = group.tasks.some(t => !isStepFinished(t.step, productionRecords));
          return (
          <div key={group.operator.id} className="bg-card rounded-lg border overflow-hidden">
            <div className="bg-muted py-2 px-4 flex items-center justify-between gap-3">
              <h3 className="flex-1 text-center text-lg font-heading font-bold text-[hsl(0,72%,51%)]">{group.operator.name}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {!hasRecordToday && (
                  <Button size="sm" variant="outline" onClick={() => setRelaisDialog({ open: true, mode: 'debut_poste', operatorId })}>
                    بداية دوام
                  </Button>
                )}
                {hasRecordToday && !hasFinishedShift && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hasOpenStep}
                    onClick={() => setRelaisDialog({ open: true, mode: 'relais', operatorId })}
                  >
                    تبديل الشغل
                  </Button>
                )}
                {hasRecordToday && !hasFinishedShift && (
                  <Button size="sm" variant="outline" onClick={() => setRelaisDialog({ open: true, mode: 'fin_poste', operatorId })}>
                    نهاية دوام
                  </Button>
                )}
                {groupSelectedCount > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => openMovePnDialog(group.operator.id)}>
                    <MoveVertical className="w-4 h-4 mr-1" />
                    Déplacer ({groupSelectedCount})
                  </Button>
                )}
                <span className="text-sm font-medium text-accent">
                  {formatMinutesToHM(group.tasks.reduce((sum, t) => sum + t.step.estimatedDuration, 0))}
                </span>
              </div>

            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-1 text-center">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={() => toggleSelectAllSteps(filteredTasks)}
                      />
                    </TableHead>
                    <TableHead className="w-10 px-1 text-center text-xs">Pn</TableHead>

                    <TableHead className="w-14 px-1 text-center text-xs text-muted-foreground/70">
                      <ColumnHeader label="الترتيب" columnKey="displayOrder" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['displayOrder'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.displayOrder} />
                    </TableHead>
                    <TableHead className="w-[95px] text-xs">
                      <ColumnHeader label="تاريخ البداية" columnKey="startDate" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['startDate'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.startDate} />
                    </TableHead>
                    <TableHead className="w-[95px] text-xs">
                      <ColumnHeader label="تاريخ النهاية" columnKey="endDate" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['endDate'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.endDate} />
                    </TableHead>
                    <TableHead className="w-[55px] text-xs text-center">Durée</TableHead>
                    <TableHead className="w-[80px] text-xs">
                      <ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['orderNumber'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.orderNumber} />
                    </TableHead>
                    <TableHead className="w-[90px] text-xs">
                      <ColumnHeader label="الزبون" columnKey="client" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['client'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.client} />
                    </TableHead>
                    <TableHead className="w-[180px] min-w-[180px] max-w-[180px] text-xs">
                      <ColumnHeader label="التعيين" columnKey="designation" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['designation'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.designation} />
                    </TableHead>
                    <TableHead className="w-[55px] text-xs text-center">
                      <ColumnHeader label="الكمية" columnKey="quantity" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['quantity'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.quantity} />
                    </TableHead>
                    <TableHead className="w-[70px] text-xs text-center">
                      <ColumnHeader label="الأولوية" columnKey="priority" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['priority'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.priority} />
                    </TableHead>
                    <TableHead className="w-[80px] text-xs">أجل التسليم</TableHead>
                    <TableHead className="w-[120px] text-xs">
                      <ColumnHeader label="العملية" columnKey="operation" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['operation'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.operation} />
                    </TableHead>
                    <TableHead className="w-[200px] min-w-[200px] text-xs">ملاحظات</TableHead>
                    <TableHead className="w-[105px] text-xs">
                      <ColumnHeader label="متابعة تقدم إنجاز الطلبية" columnKey="globalStatus" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['globalStatus'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.globalStatus} />
                    </TableHead>
                    <TableHead className="w-[105px] text-xs">
                      <ColumnHeader label="متابعة تقدم إنجاز الطلبية" columnKey="status" sortKey={colSortKey} sortDir={colSortDir} onSort={handleColSort} filterValue={colFilters['status'] || ''} onFilter={handleColFilter} allValues={allValuesByKey.status} />
                    </TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="دراسة">دراسة</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="مواد أولية">مواد</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="أداة">عدة</TableHead>
                    <TableHead className="w-[30px] text-xs text-center" title="المرحلة السابقة">سابق</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map(({ step, order }, index) => {
                    const blocked = isStepBlocked(step);
                    const designBg = blocked ? BLOCKED_TABLE_BG_CLASS : getDesignationBg(order.priority);
                    const flowPos = getStepFlowPosition(step, draftSteps);

                    const studyStatus: ResourceStatus = order.studyStatus ?? step.studyStatus
                      ?? (order.studyReady || step.studyReady ? 'disponible' : 'non-disponible');
                    const matStatus: ResourceStatus = order.materialStatus ?? step.materialStatus
                      ?? (order.materialAvailable || step.materialAvailable ? 'disponible' : 'non-disponible');
                    const toolStatus: ResourceStatus = order.toolingStatus ?? step.toolingStatus
                      ?? (order.toolingAvailable || step.toolingAvailable ? 'disponible' : 'non-disponible');
                    const amontStatus = phaseAmontStatus(step, draftSteps, productionRecords);
                    const amontEmoji = phaseAmontEmoji(amontStatus);

                    const dragIsOver = dragOverState?.operatorId === group.operator.id && dragOverState?.index === index;
                    const dragIsThis = isDragging && dragRef.current?.operatorId === group.operator.id && dragRef.current?.index === index;
                    const isSelected = selectedStepIds.has(step.id);

                    return (
                      <ContextMenu key={step.id}>
                        <ContextMenuTrigger asChild>
                      <TableRow
                        draggable={!hasActiveFilters && canReorderPn}
                        onDragStart={canReorderPn ? e => handleDragStart(e, group.operator.id, index, step, order) : undefined}
                        onDragOver={canReorderPn ? e => handleDragOver(e, group.operator.id, index) : undefined}
                        onDragLeave={() => setDragOverState(null)}
                        onDrop={canReorderPn ? e => handleDrop(e, group.operator.id, index) : undefined}
                        onDragEnd={canReorderPn ? handleDragEnd : undefined}
                        className={`transition-colors ${blocked ? `${BLOCKED_TABLE_BG_CLASS} hover:bg-blocked/90 [&_td:not(.preserve-status-color)_*]:!text-blocked-table-foreground` : ''} ${dragIsOver ? 'border-t-2 border-t-primary' : ''} ${dragIsThis ? 'opacity-40' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
                      >

                        <TableCell className="text-center px-1" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectStep(step.id)}
                          />
                        </TableCell>
                        <TableCell className="text-center px-1">
                          <span className="text-xs font-semibold">{index + 1}</span>
                        </TableCell>

                        <TableCell className="text-center px-1">
                          <div className="flex items-center justify-center gap-0.5">
                            {!hasActiveFilters && <GripVertical className="w-3 h-3 text-muted-foreground/50 cursor-grab" />}
                            {cnViolations.has(index) && (
                              <span title="عدم احترام الترتيب العام (Cn)">
                                <WarningTriangleIcon className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground/60">
                              {order.displayOrder && order.displayOrder > 0 ? order.displayOrder : '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{formatDateFR(step.startDate)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{formatDateFR(step.endDate)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span className="text-xs">{formatMinutesToHM(step.estimatedDuration)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} className="font-heading text-sm" />
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-sm">{getClientName(order.clientId)}</span>
                        </TableCell>
                        <TableCell className={`py-1.5 px-2 w-[180px] min-w-[180px] max-w-[180px] align-top ${designBg}`}>
                          <DesignationCell orderId={order.id} designation={order.designation} className={`text-sm whitespace-normal break-words block ${blocked ? 'text-black font-medium' : ''}`} />
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span className="text-sm">{order.quantity}</span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center preserve-status-color">
                          <PriorityBadge priority={order.priority} />
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
                            <span className="text-xs">{getOperationName(step.operationId)}</span>
                          </div>
                        </TableCell>
                        {/* Observation */}
                        <TableCell className="py-1.5 px-2 w-[200px] min-w-[200px] align-top">
                          {order.notesUpdatedAt ? (
                            <Tooltip delayDuration={150}>
                              <TooltipTrigger asChild>
                                <span className={`text-xs whitespace-normal break-words block cursor-help ${blocked ? 'text-black' : 'text-muted-foreground'}`}>
                                  {order.observation || '—'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs !bg-white !text-black border border-border">
                                Modifié le {formatDateTimeFR(order.notesUpdatedAt)}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className={`text-xs whitespace-normal break-words block ${blocked ? 'text-black' : 'text-muted-foreground'}`}>
                              {order.observation || '—'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 preserve-status-color">
                          <span className="inline-flex items-center justify-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {getOrderGlobalStatus(order.id, draftSteps, productionRecords, absenceOperationId)}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span className="text-xs">{getStepProgressStatus(step, productionRecords)}</span>
                        </TableCell>
                        {/* دراسة — lecture seule */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <ResourceStatusPill
                            value={studyStatus}
                            readOnly
                          />
                        </TableCell>
                        {/* مواد أولية — lecture seule */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <ResourceStatusPill
                            value={matStatus}
                            
                            readOnly
                          />
                        </TableCell>
                        {/* عدة — lecture seule */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <ResourceStatusPill
                            value={toolStatus}
                            readOnly
                          />
                        </TableCell>
                        {/* Phase amont */}
                        <TableCell className="py-1.5 px-1 text-center">
                          <TooltipProvider><Tooltip>
                            <TooltipTrigger><span className="text-sm">{amontEmoji}</span></TooltipTrigger>
                            <TooltipContent>{phaseAmontLabel(amontStatus)}</TooltipContent>
                          </Tooltip></TooltipProvider>
                        </TableCell>

                      </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          {canReorderPn && (
                            <ContextMenuItem onClick={() => openMovePnDialog(group.operator.id, step.id)}>
                              <MoveVertical className="w-4 h-4 mr-2" />
                              Déplacer la sélection {selectedStepIds.size > 0
                                ? `(${selectedStepIds.has(step.id) ? selectedStepIds.size : selectedStepIds.size + 1})`
                                : '(1)'}
                            </ContextMenuItem>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          );
        })}
      </div>

      {/* Chained prerequisite check dialogs */}
      <ConfirmDialog
        open={!!pendingDrop && pendingDrop.currentCheck < pendingDrop.checks.length}
        title="تنبيه"
        description={pendingDrop ? pendingDrop.checks[pendingDrop.currentCheck]?.message : ''}
        onConfirm={handlePendingConfirm}
        onCancel={handlePendingCancel}
        confirmLabel="Oui"
        cancelLabel="Non"
        variant="default"
      />

      {/* Work register dialog */}
      <Dialog open={prodDialog.open} onOpenChange={(o) => { if (!o) { setProdDialog(prev => ({ ...prev, open: false })); setProdDurationError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading">التسجيل في سجل الأشغال المنجزة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">العامل :</span>
              <span className="font-medium">{prodDialog.operatorName}</span>
              <span className="text-muted-foreground">رقم الطلبية :</span>
              <span className="font-medium">{prodDialog.order?.orderNumber || '—'}</span>
              <span className="text-muted-foreground">Désignation :</span>
              <span className="font-medium">{prodDialog.order?.designation || '—'}</span>
              <span className="text-muted-foreground">الكمية :</span>
              <span className="font-medium">{prodDialog.order?.quantity || '—'}</span>
              <span className="text-muted-foreground">العملية :</span>
              <span className="font-medium">{prodDialog.operationName}</span>
              <span className="text-muted-foreground">المدة الكلية المقدرة للشغل :</span>
              <span className="font-medium">{prodDialog.step ? formatMinutesToHM(prodDialog.step.estimatedDuration) : '—'}</span>
            </div>
            <div className="border-t pt-3">
              <label className="text-xs text-muted-foreground mb-1 block">تاريخ الأشغال</label>
              <Input
                type="date"
                className="h-9 font-mono"
                value={prodDialog.workDate}
                onChange={e => setProdDialog(prev => ({ ...prev, workDate: e.target.value }))}
              />
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ساعة البداية</label>
                <Input
                  type="time"
                  className="h-9 font-mono"
                  value={prodDialog.startTime}
                  onChange={e => {
                    const startTime = e.target.value;
                    setProdDialog(prev => {
                      const pauseTime = prev.pauseManual ? prev.pauseTime : computeAutoPause(startTime, prev.endTime);
                      return { ...prev, startTime, pauseTime };
                    });
                    setProdDurationError('');
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ساعة النهاية</label>
                <Input
                  type="time"
                  className="h-9 font-mono"
                  value={prodDialog.endTime}
                  onChange={e => {
                    const endTime = e.target.value;
                    setProdDialog(prev => {
                      const pauseTime = prev.pauseManual ? prev.pauseTime : computeAutoPause(prev.startTime, endTime);
                      return { ...prev, endTime, pauseTime };
                    });
                    setProdDurationError('');
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الوقت المستقطع (HH:mm)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{2}:[0-9]{2}"
                  placeholder="00:30"
                  maxLength={5}
                  className="h-9 font-mono"
                  value={prodDialog.pauseTime}
                  onChange={e => {
                    const pauseTime = normalizeDurationInput(e.target.value);
                    setProdDialog(prev => ({ ...prev, pauseTime, pauseManual: true }));
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المدة الفعلية</label>
                <Input
                  type="text"
                  readOnly
                  disabled
                  className="h-9 font-mono bg-muted"
                  value={(() => {
                    const m = computeActualDuration(prodDialog.startTime, prodDialog.endTime, prodDialog.pauseTime);
                    return m === null ? '—' : formatMinutesToHM(m);
                  })()}
                />
              </div>
            </div>
            {prodDurationError && <p className="text-xs text-destructive">{prodDurationError}</p>}
            <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
              <span className="text-muted-foreground">المدة الفعلية الإجمالية :</span>
              <span className="font-medium">{(() => {
                const todayMin = computeActualDuration(prodDialog.startTime, prodDialog.endTime, prodDialog.pauseTime) ?? 0;
                return formatMinutesToHM(prodDialog.totalDoneAlready + todayMin);
              })()}</span>
              <span className="text-muted-foreground">Durée estimée restante :</span>
              <span className="font-medium">{(() => {
                const todayMin = computeActualDuration(prodDialog.startTime, prodDialog.endTime, prodDialog.pauseTime) ?? 0;
                const remaining = Math.max(0, (prodDialog.step?.estimatedDuration || 0) - prodDialog.totalDoneAlready - todayMin);
                return formatMinutesToHM(remaining);
              })()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProdDialog(prev => ({ ...prev, open: false })); setProdDurationError(''); }}>إلغاء</Button>
            <Button onClick={handleProdDialogOk} disabled={computeActualDuration(prodDialog.startTime, prodDialog.endTime, prodDialog.pauseTime) === null || !!prodDurationError}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion Dialog */}
      <ConfirmDialog
        open={!!completionDialog}
        title="هل انتهت المرحلة؟"
        description="Cette phase est-elle complètement terminée ?"
        onConfirm={() => completionDialog && handleCompletionAnswer(true)}
        onCancel={() => completionDialog && handleCompletionAnswer(false)}
        confirmLabel="Oui, terminée"
        cancelLabel="Non, à poursuivre"
        variant="default"
      />

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />

      {/* Déplacement par Pn — sélection multiple */}
      <Dialog open={movePnDialogOpen} onOpenChange={setMovePnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Déplacer la sélection (Pn)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedStepIds.size} tâche(s) sélectionnée(s). Saisissez la nouvelle position (Pn) à laquelle placer la première tâche. Les suivantes prendront Pn+1, Pn+2, … et le reste sera décalé automatiquement.
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Position cible (Pn)</label>
              <Input
                type="number"
                min={1}
                value={moveTargetPn}
                onChange={e => setMoveTargetPn(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') applyMovePnSelection(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovePnDialogOpen(false)}>إلغاء</Button>
            <Button onClick={applyMovePnSelection}>Déplacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relais Dialog — بداية دوام / تبديل الطلبية / نهاية دوام */}
      {relaisDialog && (() => {
        const group = operatorTasks.find(g => g.operator.id === relaisDialog.operatorId);
        const operatorOpenSteps = (group?.tasks || []).map(t => ({ step: t.step, order: t.order }));
        const operatorName = group?.operator.name || '';

        let currentStep: ProductionStep | null = null;
        let currentOrder: Order | null = null;
        if (relaisDialog.mode !== 'debut_poste') {
          currentStep = operatorOpenSteps[0]?.step || null;
          currentOrder = operatorOpenSteps[0]?.order || null;
        }
        const currentStepTotalDoneAlready = currentStep
          ? productionRecords.filter(r => r.stepId === currentStep!.id).reduce((s, r) => s + (r.actualDuration || 0), 0)
          : 0;

        let nextStep: ProductionStep | null = null;
        let nextOrder: Order | null = null;
        if (relaisDialog.mode === 'debut_poste') {
          nextStep = operatorOpenSteps[0]?.step || null;
          nextOrder = operatorOpenSteps[0]?.order || null;
        } else if (relaisDialog.mode === 'relais') {
          // next after current; if none, first
          nextStep = operatorOpenSteps[1]?.step || operatorOpenSteps[0]?.step || null;
          nextOrder = operatorOpenSteps[1]?.order || operatorOpenSteps[0]?.order || null;
        }
        const nextStepTotalDoneAlready = nextStep
          ? productionRecords.filter(r => r.stepId === nextStep!.id).reduce((s, r) => s + (r.actualDuration || 0), 0)
          : 0;

        return (
          <RelaisDialog
            open={relaisDialog.open}
            mode={relaisDialog.mode}
            operatorId={relaisDialog.operatorId}
            operatorName={operatorName}
            currentStep={currentStep}
            currentOrder={currentOrder}
            currentStepTotalDoneAlready={currentStepTotalDoneAlready}
            nextStep={nextStep}
            nextOrder={nextOrder}
            nextStepTotalDoneAlready={nextStepTotalDoneAlready}
            onConfirm={handleRelaisConfirm}
            onCancel={() => setRelaisDialog(null)}
            operations={operations}
            productionRecords={productionRecords}
            operatorOpenSteps={operatorOpenSteps}
            initialStartTimeOverride={pendingRelaisStart && pendingRelaisStart.operatorId === relaisDialog.operatorId ? pendingRelaisStart.startTime : undefined}
          />
        );
      })()}
    </div>

  );
};

export default PlanningTableauPage;
