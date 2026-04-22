import React, { useMemo, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Settings, Check, CalendarCheck, Lock, Unlock, Flag, Undo2, Redo2, Search, X } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import type { GanttView, ProductionStep, Order, Holiday, ProductionRecord } from '@/types/planning';
import { scheduleOrder } from '@/lib/scheduler';
import type { OperationToSchedule } from '@/lib/scheduler';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SubcontractorTableDialog from '@/components/SubcontractorTableDialog';
import PurchaseRowDialog from '@/components/PurchaseRowDialog';
import {
  workMinutesFromZero,
  getWorkSlotsForRange,
  addWorkMinutes,
  WORK_MINUTES_PER_DAY,
  WORK_SEGMENTS,
  workMinutesBetween,
  isWorkDay,
} from '@/lib/workTime';

const MINUTE_WIDTH_DAY = 2;    // px per work-minute in day view
const MINUTE_WIDTH_WEEK = 0.36; // px per work-minute in week view
const MINUTE_WIDTH_MONTH = 0.09; // px per work-minute in month view
const ROW_HEIGHT = 52;

function getPriorityBorderColor(order: Order): string {
  const p = order.priority;
  if (p === 'P1') return 'border-[hsl(0,72%,51%)]'; // red
  if (p === 'P2') return 'border-[hsl(30,90%,50%)]'; // orange
  if (p === 'P3') return 'border-[hsl(160,60%,40%)]'; // teal/green
  if (p === 'P4') return 'border-[hsl(55,90%,50%)]'; // yellow
  return 'border-muted-foreground';
}

function getBlockBg(order: Order, isBlocked: boolean): string {
  if (isBlocked) return 'bg-blocked'; // purple fill when blocked
  if (order.priority === 'P4') return 'bg-[hsl(55,90%,50%)]'; // yellow fill for P4 available
  return 'bg-white'; // white fill for P1-P3 when available
}

function getHatchClass(step: any): string {
  const matBlocked = !(step.materialAvailable ?? true);
  const toolBlocked = !(step.toolingAvailable ?? true);
  const studyBlocked = !(step.studyReady ?? true);
  const blocked = [matBlocked, toolBlocked, studyBlocked].filter(Boolean).length;
  if (blocked >= 2) return 'hatch-cross';
  if (matBlocked) return 'hatch-right';
  if (toolBlocked) return 'hatch-left';
  if (studyBlocked) return 'hatch-right';
  return '';
}

function getDeadlineTextColor(order: Order, step: ProductionStep): string {
  if (!order.plannedDeadline || !step.endDate) return 'text-foreground';
  const deadline = new Date(order.plannedDeadline);
  const end = new Date(step.endDate);
  const diffDays = (deadline.getTime() - end.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) return 'text-urgent';
  if (diffDays <= 3) return 'text-urgent-moderate';
  return 'text-normal';
}

function isLastStep(step: ProductionStep, allSteps: ProductionStep[]): boolean {
  const orderSteps = allSteps.filter(s => s.orderId === step.orderId);
  return orderSteps.every(s => s.order <= step.order);
}

interface GanttBlockProps {
  step: ProductionStep;
  order: Order;
  operationName: string;
  clientName: string;
  subcontractorName?: string;
  left: number;
  width: number;
  isLast: boolean;
  isCtrlSelected: boolean;
  hasLink: boolean;
  subcontractingPending: boolean;
  isAbsence: boolean;
  isDimmed: boolean;
  onDragStart: (stepId: string, startX: number, startLeft: number, startY: number, altKey: boolean) => void;
  onResizeStart: (stepId: string, startX: number, startWidth: number) => void;
  onCtrlClick: (stepId: string) => void;
}

const GanttBlock: React.FC<GanttBlockProps & { pendingSubNames?: string[] }> = ({
  step, order, operationName, clientName, subcontractorName, left, width, isLast, isCtrlSelected, hasLink, subcontractingPending, isAbsence, isDimmed, onDragStart, onResizeStart, onCtrlClick, pendingSubNames
}) => {
  // Determine if step is missing prerequisites (step-level)
  const missingItems: string[] = [];
  if (!(step.materialAvailable ?? true)) missingItems.push('Matière');
  if (!(step.toolingAvailable ?? true)) missingItems.push('Outillage');
  if (!(step.studyReady ?? true)) missingItems.push('Étude');
  if (subcontractingPending) {
    const subLabel = pendingSubNames && pendingSubNames.length > 0
      ? `Sous-traitance [${pendingSubNames.join('+')}] en cours`
      : 'Sous-traitance en cours';
    missingItems.push(subLabel);
  }
  const isBlocked = (missingItems.length > 0) && !isAbsence;

  const blockBg = isAbsence ? 'bg-absence' : getBlockBg(order, isBlocked);
  const priorityBorder = isAbsence ? 'border-muted-foreground' : getPriorityBorderColor(order);
  const frozenClass = step.frozen ? 'ring-2 ring-blue-400/60' : '';
  const borderClass = isCtrlSelected
    ? 'border-2 border-primary ring-2 ring-primary/40'
    : hasLink
      ? `border-2 border-accent`
      : `border-2 ${priorityBorder}`;
  const durationH = Math.floor(step.estimatedDuration / 60);
  const durationM = step.estimatedDuration % 60;
  const durationStr = `${durationH}h${String(durationM).padStart(2, '0')}`;
  const tooltipText = `${order.orderNumber} — ${clientName}\n${order.designation} — Qté: ${order.quantity}\n${operationName} ${durationStr}${subcontractorName ? `\nSous-traitant: ${subcontractorName}` : ''}${step.dependsOn ? `\nDépend de: #${step.dependsOnPercentage ?? 100}%` : ''}${isBlocked ? `\n⚠ Manque: ${missingItems.join(' + ')}` : ''}`;

  return (
    <div
      className={`absolute top-1 rounded-sm cursor-default select-none overflow-hidden ${blockBg} ${borderClass} ${frozenClass} group transition-opacity ${isDimmed ? 'opacity-25' : ''}`}
      style={{ left: `${left}px`, width: `${Math.max(width, 20)}px`, height: `${ROW_HEIGHT - 8}px` }}
      title={tooltipText}
    >
      <div className={`px-1.5 py-0.5 text-xs leading-tight font-medium truncate ${isBlocked ? 'text-blocked-table-foreground' : 'text-foreground'}`}>
        {subcontractorName ? (
          <>
            <div className="font-heading font-bold">{order.orderNumber} — {subcontractorName}</div>
            <div className="opacity-70 truncate">{clientName} — {order.designation}</div>
          </>
        ) : (
          <>
            <div className="font-heading font-bold truncate">{order.orderNumber} — {clientName}</div>
            <div className="opacity-70 truncate">{order.designation} — Qté: {order.quantity}</div>
          </>
        )}
      </div>
      {isBlocked && (
        <div className="absolute bottom-0 left-0 right-0 hidden group-hover:flex bg-foreground/90 text-background text-[9px] px-1 py-0.5 leading-tight z-50">
          ⚠ {missingItems.join(' + ')}
        </div>
      )}
      {hasLink && (
        <div className="absolute top-0 left-0 w-1.5 h-full bg-accent/60" />
      )}
      {isLast && !isAbsence && (
        <Flag className="absolute top-0.5 right-[18px] w-3 h-3 text-foreground/70" />
      )}
      {step.frozen && (
        <Lock className="absolute top-0.5 right-3 w-2.5 h-2.5 text-blue-500/80" />
      )}
    </div>
  );
};

const GanttChart: React.FC = () => {
  const {
    operators, operations, orders, steps, holidays, clients, subcontractors, equipments,
    ganttView, setGanttView, ganttZeroDate, setGanttZeroDate,
    selectedOperatorId, setSelectedOperatorId,
    selectedOrderId, setSelectedOrderId,
    updateStep, addStep, addProductionRecord,
    deleteStep, addQCEntry, setSteps,
    undo, redo, canUndo, canRedo,
    absenceOperationId, absenceOrderId, loading,
  } = usePlanning();

  // Compute which orders have pending subcontracting (subcontractor op steps not done)
  const subcontractorOpIds = useMemo(() => new Set(operations.filter(op => op.category === 'subcontractor').map(op => op.id)), [operations]);
  const ordersWithPendingSubcontracting = useMemo(() => {
    const pending = new Set<string>();
    steps.forEach(s => {
      if (subcontractorOpIds.has(s.operationId) && !(s.subcontractingDone)) {
        pending.add(s.orderId);
      }
    });
    return pending;
  }, [steps, subcontractorOpIds]);

  // Compute pending subcontracting operation names per order
  const pendingSubNamesPerOrder = useMemo(() => {
    const map: Record<string, string[]> = {};
    steps.forEach(s => {
      if (subcontractorOpIds.has(s.operationId) && !(s.subcontractingDone)) {
        const opName = operations.find(op => op.id === s.operationId)?.name || '?';
        if (!map[s.orderId]) map[s.orderId] = [];
        if (!map[s.orderId].includes(opName)) map[s.orderId].push(opName);
      }
    });
    return map;
  }, [steps, subcontractorOpIds, operations]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ stepId: string; startX: number; startY: number; startLeft: number; altKey: boolean } | null>(null);
  const [resizeState, setResizeState] = useState<{ stepId: string; startX: number; startWidth: number } | null>(null);
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validateStepId, setValidateStepId] = useState<string | null>(null);
  const [validateActualDuration, setValidateActualDuration] = useState<number>(0);
  const [isOverValidateZone, setIsOverValidateZone] = useState(false);
  const validateZoneRef = useRef<HTMLDivElement>(null);
  const [validateWorkDone, setValidateWorkDone] = useState<'done' | 'continue'>('done');
  const [validateRemainingDuration, setValidateRemainingDuration] = useState<number>(0);
  const [validateContinueDate, setValidateContinueDate] = useState<string>('');
  const [validateContinueTime, setValidateContinueTime] = useState<string>('08:00');

  // Ctrl+Click linking state
  const [ctrlSelectedStepId, setCtrlSelectedStepId] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkPercentage, setLinkPercentage] = useState<number>(100);
  const [isEditingLink, setIsEditingLink] = useState(false);

  const handleCtrlClick = useCallback((stepId: string) => {
    if (!ctrlSelectedStepId) {
      // First click: always select the block
      setCtrlSelectedStepId(stepId);
    } else if (ctrlSelectedStepId === stepId) {
      // Same block clicked again: if it has a link, open edit; otherwise deselect
      const clickedStep = steps.find(s => s.id === stepId);
      if (clickedStep?.dependsOn) {
        setLinkSource(clickedStep.dependsOn);
        setLinkTarget(stepId);
        setLinkPercentage(clickedStep.dependsOnPercentage ?? 100);
        setIsEditingLink(true);
        setLinkDialogOpen(true);
        setCtrlSelectedStepId(null);
      } else {
        setCtrlSelectedStepId(null);
      }
    } else {
      // Second block clicked: check if a link already exists between these two
      const stepA = steps.find(s => s.id === ctrlSelectedStepId);
      const stepB = steps.find(s => s.id === stepId);

      if (stepB?.dependsOn === ctrlSelectedStepId) {
        setLinkSource(ctrlSelectedStepId);
        setLinkTarget(stepId);
        setLinkPercentage(stepB.dependsOnPercentage ?? 100);
        setIsEditingLink(true);
      } else if (stepA?.dependsOn === stepId) {
        setLinkSource(stepId);
        setLinkTarget(ctrlSelectedStepId);
        setLinkPercentage(stepA.dependsOnPercentage ?? 100);
        setIsEditingLink(true);
      } else {
        // New link: first selected = predecessor, second = successor
        setLinkSource(ctrlSelectedStepId);
        setLinkTarget(stepId);
        setLinkPercentage(100);
        setIsEditingLink(false);
      }
      setLinkDialogOpen(true);
      setCtrlSelectedStepId(null);
    }
  }, [ctrlSelectedStepId, steps]);

  const handleLinkSave = useCallback(() => {
    if (!linkSource || !linkTarget) return;
    const targetStep = steps.find(s => s.id === linkTarget);
    const sourceStep = steps.find(s => s.id === linkSource);
    if (!targetStep || !sourceStep) return;

    const sourceStart = new Date(`${sourceStep.startDate}T${sourceStep.startTime}`);
    const minutesOffset = Math.round(sourceStep.estimatedDuration * (linkPercentage / 100));
    const newTargetStart = addWorkMinutes(sourceStart, minutesOffset, holidays);
    const newTargetEnd = addWorkMinutes(newTargetStart, targetStep.estimatedDuration, holidays);

    updateStep({
      ...targetStep,
      dependsOn: linkSource,
      dependsOnPercentage: linkPercentage,
      startDate: newTargetStart.toISOString().split('T')[0],
      startTime: `${String(newTargetStart.getHours()).padStart(2, '0')}:${String(newTargetStart.getMinutes()).padStart(2, '0')}`,
      endDate: newTargetEnd.toISOString().split('T')[0],
      endTime: `${String(newTargetEnd.getHours()).padStart(2, '0')}:${String(newTargetEnd.getMinutes()).padStart(2, '0')}`,
    });

    setLinkDialogOpen(false);
    setLinkSource(null);
    setLinkTarget(null);
    setIsEditingLink(false);
  }, [linkSource, linkTarget, linkPercentage, steps, holidays, updateStep]);

  const handleLinkDelete = useCallback(() => {
    if (!linkTarget) return;
    const targetStep = steps.find(s => s.id === linkTarget);
    if (!targetStep) return;

    updateStep({
      ...targetStep,
      dependsOn: undefined,
      dependsOnPercentage: undefined,
    });

    setLinkDialogOpen(false);
    setLinkSource(null);
    setLinkTarget(null);
    setIsEditingLink(false);
  }, [linkTarget, steps, updateStep]);

  // Propagate dependent steps when a step moves/resizes
  const propagateDependents = useCallback((changedStepId: string) => {
    const dependents = steps.filter(s => s.dependsOn === changedStepId);
    const sourceStep = steps.find(s => s.id === changedStepId);
    if (!sourceStep) return;

    dependents.forEach(dep => {
      const pct = dep.dependsOnPercentage ?? 100;
      const sourceStart = new Date(`${sourceStep.startDate}T${sourceStep.startTime}`);
      const minutesOffset = Math.round(sourceStep.estimatedDuration * (pct / 100));
      const newStart = addWorkMinutes(sourceStart, minutesOffset, holidays);
      const newEnd = addWorkMinutes(newStart, dep.estimatedDuration, holidays);

      updateStep({
        ...dep,
        startDate: newStart.toISOString().split('T')[0],
        startTime: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
        endDate: newEnd.toISOString().split('T')[0],
        endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
      });
    });
  }, [steps, holidays, updateStep]);

  // Replanifier: reschedule all non-frozen orders
  const handleReplanifier = useCallback(() => {
    // Group non-frozen steps by order, sorted by displayOrder
    const orderIds = [...new Set(steps.filter(s => !s.frozen && s.operationId !== absenceOperationId).map(s => s.orderId))];
    const sortedOrders = orderIds
      .map(id => orders.find(o => o.id === id))
      .filter(Boolean)
      .sort((a, b) => (a!.displayOrder ?? 9999) - (b!.displayOrder ?? 9999)) as Order[];

    // Keep frozen steps and absence steps untouched
    let workingSteps = steps.filter(s => s.frozen || s.operationId === absenceOperationId);

    for (const order of sortedOrders) {
      const orderSteps = steps.filter(s => s.orderId === order.id && !s.frozen && s.operationId !== absenceOperationId)
        .sort((a, b) => a.order - b.order);

      if (orderSteps.length === 0) continue;

      // Delete non-frozen steps for this order
      orderSteps.forEach(s => deleteStep(s.id));

      const opsToSchedule: OperationToSchedule[] = orderSteps.map(s => {
        const isSub = !!s.subcontractorId;
        return {
          operationId: s.operationId,
          estimatedDuration: s.estimatedDuration,
          options: [{ id: isSub ? s.subcontractorId! : s.operatorId, isSub }],
          equipmentIds: s.equipmentIds,
        };
      });

      const deadline = order.deliveryDeadline || order.plannedDeadline || '9999-12-31';
      const { newSteps, updatedSteps } = scheduleOrder(
        order.id,
        deadline,
        opsToSchedule,
        workingSteps,
        orders,
        holidays,
        equipments
      );

      newSteps.forEach(s => addStep(s));
      updatedSteps.forEach(s => updateStep(s));
      workingSteps = [...workingSteps, ...newSteps];
    }
  }, [steps, orders, holidays, equipments, deleteStep, addStep, updateStep]);

  type GanttRow = { type: 'operator' | 'tooling'; id: string; label: string; sublabel: string };

  // Dialog states for special row clicks
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false); // keep state for dialog
  const [toolingDialogOpen, setToolingDialogOpen] = useState(false);

  // Compute operator charge (sum of assigned task durations in hours)
  const operatorCharge = useMemo(() => {
    const chargeMap: Record<string, number> = {};
    steps.forEach(s => {
      if (s.operatorId && !s.subcontractorId && s.operationId !== absenceOperationId) {
        chargeMap[s.operatorId] = (chargeMap[s.operatorId] || 0) + s.estimatedDuration;
      }
    });
    return chargeMap;
  }, [steps, absenceOperationId]);

  // Search/highlight order state
  const [searchOrderNumber, setSearchOrderNumber] = useState('');
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);

  const OPERATOR_NAME_ORDER = ['محمود', 'بلال', 'صالح', 'عادل', 'عبد الرزاق', 'حمزة', 'عمر', 'ياسين', 'معاذ', 'يوسف'];

  const ganttRows = useMemo(() => {
    const opRows: GanttRow[] = [...operators]
      .filter(op => !selectedOperatorId || op.id === selectedOperatorId)
      .sort((a, b) => {
        const ai = OPERATOR_NAME_ORDER.indexOf(a.name);
        const bi = OPERATOR_NAME_ORDER.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(op => {
        const chargeMin = operatorCharge[op.id] || 0;
        const chargeH = (chargeMin / 60).toFixed(1);
        return { type: 'operator' as const, id: op.id, label: op.name, sublabel: `${chargeH} h` };
      });

    // Only tooling special row (material row removed)
    const specialRows: GanttRow[] = [];
    if (!selectedOperatorId) {
      const hasToolingPending = orders.some(o => o.id !== absenceOrderId && !o.toolingAvailable);
      if (hasToolingPending) {
        specialRows.push({ type: 'tooling' as const, id: '__tooling__', label: 'Achat outillage', sublabel: '' });
      }
    }

    return [...opRows, ...specialRows];
  }, [operators, selectedOperatorId, orders, operatorCharge, absenceOrderId]);

  // Handle search order
  const handleSearchOrder = useCallback(() => {
    if (!searchOrderNumber.trim()) {
      setHighlightedOrderId(null);
      return;
    }
    const order = orders.find(o => o.orderNumber.toLowerCase().includes(searchOrderNumber.trim().toLowerCase()));
    if (order) {
      setHighlightedOrderId(order.id);
      // Find the date range of all steps for this order
      const orderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOperationId);
      if (orderSteps.length > 0) {
        const startDates = orderSteps.map(s => new Date(s.startDate)).sort((a, b) => a.getTime() - b.getTime());
        const endDates = orderSteps.map(s => new Date(s.endDate)).sort((a, b) => a.getTime() - b.getTime());
        const earliest = startDates[0];
        const latest = endDates[endDates.length - 1];
        // Set gantt view to show the full range
        const diffDays = Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          setGanttView('day');
        } else if (diffDays <= 7) {
          setGanttView('week');
        } else {
          setGanttView('month');
        }
        setGanttZeroDate(earliest);
      }
    }
  }, [searchOrderNumber, orders, steps, absenceOperationId, setGanttView, setGanttZeroDate]);

  const handleResetSearch = useCallback(() => {
    setSearchOrderNumber('');
    setHighlightedOrderId(null);
  }, []);

  const filteredSteps = useMemo(() => {
    let result = steps;
    if (selectedOperatorId) result = result.filter(s => s.operatorId === selectedOperatorId);
    if (selectedOrderId) result = result.filter(s => s.orderId === selectedOrderId);
    return result;
  }, [steps, selectedOperatorId, selectedOrderId]);

  // Determine how many work days to show based on view
  const numWorkDays = useMemo(() => {
    switch (ganttView) {
      case 'day': return 1;
      case 'week': return 5; // Sun-Thu
      case 'month': return 22; // ~1 month of work days
    }
  }, [ganttView]);

  const minuteWidth = useMemo(() => {
    switch (ganttView) {
      case 'day': return MINUTE_WIDTH_DAY;
      case 'week': return MINUTE_WIDTH_WEEK;
      case 'month': return MINUTE_WIDTH_MONTH;
    }
  }, [ganttView]);

  // Get work slots for the range
  const workSlots = useMemo(() => {
    return getWorkSlotsForRange(ganttZeroDate, numWorkDays, holidays);
  }, [ganttZeroDate, numWorkDays, holidays]);

  // Total width based on work minutes
  const totalWidth = useMemo(() => {
    return numWorkDays * WORK_MINUTES_PER_DAY * minuteWidth + 40; // +40px so last label (16:00) isn't clipped
  }, [numWorkDays, minuteWidth]);

  // Convert a datetime to pixel offset from zero
  const getPixelOffset = useCallback((dateStr: string, timeStr: string): number => {
    const target = new Date(`${dateStr}T${timeStr || '08:00'}`);
    const zero = new Date(ganttZeroDate);
    zero.setHours(8, 0, 0, 0);
    const workMin = workMinutesFromZero(zero, target, holidays);
    return workMin * minuteWidth;
  }, [ganttZeroDate, holidays, minuteWidth]);

  // Convert duration in work-minutes to pixels
  const getDurationWidth = useCallback((minutes: number): number => {
    return minutes * minuteWidth;
  }, [minuteWidth]);

  // Grid lines based on work slots
  const gridLines = useMemo(() => {
    const lines: { offset: number; type: 'major' | 'minor' | 'light'; label?: string }[] = [];
    let cumulativeWorkMinutes = 0;

    workSlots.forEach((slot, dayIndex) => {
      if (ganttView === 'day') {
        // Show hour-level detail for single day
        // Track positions already labeled to avoid overlaps
        const labeledPositions = new Set<number>();

        slot.segments.forEach((seg, segIdx) => {
          const segStart = seg.startMin;
          const segEnd = seg.endMin;

          // Show segment start label (e.g. 8:00, 12:30)
          {
            const workMinInDay = getWorkMinutesInDay(segStart, slot.segments);
            const offset = (cumulativeWorkMinutes + workMinInDay) * minuteWidth;
            const hour = Math.floor(segStart / 60);
            const min = segStart % 60;
            lines.push({ offset, type: 'major', label: `${hour}:${String(min).padStart(2, '0')}` });
            labeledPositions.add(workMinInDay);
          }

          // Hour marks within segment (skip segment start)
          for (let m = Math.ceil(segStart / 60) * 60; m < segEnd; m += 60) {
            if (m <= segStart) continue;
            const workMinInDay = getWorkMinutesInDay(m, slot.segments);
            if (labeledPositions.has(workMinInDay)) continue;
            const offset = (cumulativeWorkMinutes + workMinInDay) * minuteWidth;
            const hour = Math.floor(m / 60);
            lines.push({ offset, type: 'major', label: `${hour}:00` });
            labeledPositions.add(workMinInDay);
          }

          // Show segment end label (e.g. 16:00) only for the LAST segment
          if (segIdx === slot.segments.length - 1) {
            const workMinInDay = getWorkMinutesInDay(segEnd, slot.segments);
            if (!labeledPositions.has(workMinInDay)) {
              const offset = (cumulativeWorkMinutes + workMinInDay) * minuteWidth;
              const hour = Math.floor(segEnd / 60);
              lines.push({ offset, type: 'major', label: `${hour}:00` });
              labeledPositions.add(workMinInDay);
            }
          }

          // Half-hours
          for (let m = segStart + 30; m < segEnd; m += 60) {
            const workMinInDay = getWorkMinutesInDay(m, slot.segments);
            const offset = (cumulativeWorkMinutes + workMinInDay) * minuteWidth;
            lines.push({ offset, type: 'minor' });
          }
          // Quarter-hours
          for (let m = segStart + 15; m < segEnd; m += 30) {
            if (m % 30 !== 0) {
              const workMinInDay = getWorkMinutesInDay(m, slot.segments);
              const offset = (cumulativeWorkMinutes + workMinInDay) * minuteWidth;
              lines.push({ offset, type: 'light' });
            }
          }
        });
      } else if (ganttView === 'week') {
        // Day-level with half-day markers
        const offset = cumulativeWorkMinutes * minuteWidth;
        lines.push({ offset, type: 'major', label: slot.dayLabel });
        // Half-day marker (after morning segment = 240 min)
        const halfOffset = (cumulativeWorkMinutes + 240) * minuteWidth;
        lines.push({ offset: halfOffset, type: 'minor' });
      } else {
        // Month: day-level
        const offset = cumulativeWorkMinutes * minuteWidth;
        lines.push({ offset, type: dayIndex % 7 === 0 ? 'major' : 'minor', label: slot.dayLabel });
      }

      cumulativeWorkMinutes += WORK_MINUTES_PER_DAY;
    });


    return lines;
  }, [workSlots, ganttView, minuteWidth]);

  // Helper: convert absolute minute-of-day to work-minutes elapsed in that day
  function getWorkMinutesInDay(minuteOfDay: number, segments: { startMin: number; endMin: number }[]): number {
    let workMin = 0;
    for (const seg of segments) {
      if (minuteOfDay <= seg.startMin) break;
      workMin += Math.min(minuteOfDay, seg.endMin) - seg.startMin;
    }
    return Math.max(0, workMin);
  }

  // Convert pixel delta to work-minutes delta
  const pxToWorkMinutes = useCallback((dx: number): number => {
    return dx / minuteWidth;
  }, [minuteWidth]);

  const handleMouseMove = useCallback((_e: React.MouseEvent) => {
    // Preview only
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragState) {
      // Check if dropped on validate zone
      if (validateZoneRef.current) {
        const rect = validateZoneRef.current.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const step = steps.find(s => s.id === dragState.stepId);
          if (step) {
            setValidateStepId(step.id);
            const actualH = parseFloat((step.estimatedDuration / 60).toFixed(2));
            setValidateActualDuration(actualH);
            setValidateWorkDone('done');
            setValidateRemainingDuration(0);
            // Default continue date: next work day at 08:00
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            while (!isWorkDay(tomorrow, holidays)) {
              tomorrow.setDate(tomorrow.getDate() + 1);
            }
            setValidateContinueDate(tomorrow.toISOString().split('T')[0]);
            setValidateContinueTime('08:00');
            setValidateDialogOpen(true);
          }
          setDragState(null);
          setIsOverValidateZone(false);
          return;
        }
      }

      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const step = steps.find(s => s.id === dragState.stepId);
      if (step && (Math.abs(dx) > 5 || Math.abs(dy) > ROW_HEIGHT / 2)) {
        const minutesDelta = pxToWorkMinutes(dx);
        const start = new Date(`${step.startDate}T${step.startTime}`);
        const newStart = addWorkMinutes(start, Math.round(minutesDelta / 15) * 15, holidays);
        const newEnd = addWorkMinutes(newStart, step.estimatedDuration, holidays);

        const rowShift = Math.round(dy / ROW_HEIGHT);
        const currentRowIndex = ganttRows.findIndex(row => row.type === 'operator' && row.id === step.operatorId);
        const targetRowIndex = Math.max(0, Math.min(ganttRows.length - 1, currentRowIndex + rowShift));
        const targetRow = ganttRows[targetRowIndex];
        
        const newStepData = {
          ...step,
          frozen: true, // Mark as frozen after manual move
          operatorId: targetRow?.type === 'operator' ? targetRow.id : step.operatorId,
          subcontractorId: step.subcontractorId,
          startDate: newStart.toISOString().split('T')[0],
          startTime: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
          endDate: newEnd.toISOString().split('T')[0],
          endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        };

        if (dragState.altKey) {
          addStep({ ...newStepData, id: crypto.randomUUID() });
        } else {
          updateStep(newStepData);
          // Propagate to dependent steps
          setTimeout(() => propagateDependents(newStepData.id), 0);
        }
      }
      setDragState(null);
      setIsOverValidateZone(false);
    }
    if (resizeState) {
      const dx = e.clientX - resizeState.startX;
      const step = steps.find(s => s.id === resizeState.stepId);
      if (step && Math.abs(dx) > 5) {
        const minutesDelta = pxToWorkMinutes(dx);
        const newDuration = Math.max(15, step.estimatedDuration + Math.round(minutesDelta / 15) * 15);
        const start = new Date(`${step.startDate}T${step.startTime}`);
        const newEnd = addWorkMinutes(start, newDuration, holidays);
        updateStep({
          ...step,
          frozen: true, // Mark as frozen after manual resize
          estimatedDuration: newDuration,
          endDate: newEnd.toISOString().split('T')[0],
          endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        });
        // Propagate to dependent steps
        setTimeout(() => propagateDependents(step.id), 0);
      }
      setResizeState(null);
    }
  }, [dragState, resizeState, steps, holidays, pxToWorkMinutes, updateStep, ganttRows, propagateDependents]);

  // Handle mouse move for validate zone highlight
  const handleGlobalMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState && validateZoneRef.current) {
      const rect = validateZoneRef.current.getBoundingClientRect();
      const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      setIsOverValidateZone(over);
    }
  }, [dragState]);

  const handleValidateSave = useCallback(() => {
    if (!validateStepId) return;
    const step = steps.find(s => s.id === validateStepId);
    if (!step) return;
    const record: ProductionRecord = {
      id: crypto.randomUUID(),
      stepId: step.id,
      orderId: step.orderId,
      operatorId: step.operatorId,
      operationId: step.operationId,
      actualDuration: Math.round(validateActualDuration * 60),
      validatedAt: new Date().toISOString(),
    };
    addProductionRecord(record);

    // If work is to continue, create a new step with remaining duration
    if (validateWorkDone === 'continue' && validateRemainingDuration > 0 && validateContinueDate) {
      const remainingMin = Math.round(validateRemainingDuration * 60);
      const continueStart = new Date(`${validateContinueDate}T${validateContinueTime || '08:00'}`);
      const continueEnd = addWorkMinutes(continueStart, remainingMin, holidays);
      addStep({
        ...step,
        id: crypto.randomUUID(),
        estimatedDuration: remainingMin,
        startDate: continueStart.toISOString().split('T')[0],
        startTime: `${String(continueStart.getHours()).padStart(2, '0')}:${String(continueStart.getMinutes()).padStart(2, '0')}`,
        endDate: continueEnd.toISOString().split('T')[0],
        endTime: `${String(continueEnd.getHours()).padStart(2, '0')}:${String(continueEnd.getMinutes()).padStart(2, '0')}`,
      });
    } else {
      // Check if this was the last step for the order (no other steps remaining on planning after removal)
      const otherSteps = steps.filter(s => s.orderId === step.orderId && s.id !== step.id && s.operationId !== absenceOperationId);
      if (otherSteps.length === 0 && step.orderId !== absenceOrderId) {
        // Move order to Quality Control
        addQCEntry({
          id: crypto.randomUUID(),
          orderId: step.orderId,
          controlDate: '',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Remove the validated step from the planning
    deleteStep(step.id);

    setValidateDialogOpen(false);
    setValidateStepId(null);
  }, [validateStepId, validateActualDuration, validateWorkDone, validateRemainingDuration, validateContinueDate, validateContinueTime, steps, holidays, addProductionRecord, addStep, deleteStep, addQCEntry]);

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '';
  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '';
  const getSubcontractorName = (id: string) => subcontractors.find(s => s.id === id)?.companyName || '';

  const handleOperatorClick = (opId: string) => {
    setSelectedOrderId(null);
    setSelectedOperatorId(selectedOperatorId === opId ? null : opId);
  };

  // --- Edit step dialog ---
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<ProductionStep | null>(null);

  function computeThirdField(
    startDate: string, startTime: string, endDate: string, endTime: string, duration: number, hols: Holiday[]
  ): { endDate: string; endTime: string; duration: number } {
    if (startDate && startTime && duration > 0 && (!endDate || !endTime)) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = addWorkMinutes(start, duration, hols);
      return {
        endDate: end.toISOString().split('T')[0],
        endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
        duration
      };
    }
    if (startDate && startTime && endDate && endTime && duration <= 0) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      const workMin = workMinutesBetween(start, end, hols);
      return { endDate, endTime, duration: Math.max(0, workMin) };
    }
    return { endDate, endTime, duration };
  }

  const handleBlockDoubleClick = (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (step) {
      setEditForm({ ...step });
      setEditDialogOpen(true);
    }
  };

  const updateEditForm = (key: string, value: any) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (['startDate', 'startTime', 'estimatedDuration'].includes(key)) {
        if (next.startDate && next.startTime && next.estimatedDuration > 0) {
          const c = computeThirdField(next.startDate, next.startTime, '', '', next.estimatedDuration, holidays);
          next.endDate = c.endDate;
          next.endTime = c.endTime;
        }
      }
      if (['endDate', 'endTime'].includes(key)) {
        if (next.startDate && next.startTime && next.endDate && next.endTime) {
          const c = computeThirdField(next.startDate, next.startTime, next.endDate, next.endTime, 0, holidays);
          next.estimatedDuration = c.duration;
        }
      }
      return next;
    });
  };

  const handleEditSave = () => {
    if (!editForm) return;
    const computed = computeThirdField(editForm.startDate, editForm.startTime, editForm.endDate, editForm.endTime, editForm.estimatedDuration, holidays);
    updateStep({ ...editForm, ...computed, estimatedDuration: computed.duration });
    setEditDialogOpen(false);
    setEditForm(null);
  };

  return (
    <div
      className="flex flex-col h-full"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b">
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month'] as GanttView[]).map(v => (
            <button
              key={v}
              onClick={() => setGanttView(v)}
              className={`px-3 py-1.5 text-xs font-heading rounded transition-colors ${
                ganttView === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
          <div className="flex items-center ml-2">
            <button
              onClick={() => {
                const d = new Date(ganttZeroDate);
                if (ganttView === 'day') d.setDate(d.getDate() - 1);
                else if (ganttView === 'week') d.setDate(d.getDate() - 7);
                else d.setMonth(d.getMonth() - 1);
                setGanttZeroDate(d);
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setGanttZeroDate(new Date());
              }}
              className="px-2 py-1 text-xs font-medium rounded hover:bg-muted transition-colors"
              title="Aujourd'hui"
            >
              Auj.
            </button>
            <button
              onClick={() => {
                const d = new Date(ganttZeroDate);
                if (ganttView === 'day') d.setDate(d.getDate() + 1);
                else if (ganttView === 'week') d.setDate(d.getDate() + 7);
                else d.setMonth(d.getMonth() + 1);
                setGanttZeroDate(d);
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted-foreground text-xs">Point 0 :</label>
          <input
            type="date"
            className="rounded border bg-background px-2 py-1 text-xs"
            value={ganttZeroDate.toISOString().split('T')[0]}
            onChange={e => setGanttZeroDate(new Date(e.target.value))}
          />
          <input
            type="time"
            className="rounded border bg-background px-2 py-1 text-xs"
            value={`${String(ganttZeroDate.getHours()).padStart(2, '0')}:${String(ganttZeroDate.getMinutes()).padStart(2, '0')}`}
            onChange={e => {
              const [h, m] = e.target.value.split(':').map(Number);
              const d = new Date(ganttZeroDate);
              d.setHours(h, m);
              setGanttZeroDate(d);
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground italic ml-2">Visualisation seule — utilisez le Planning Tableau pour modifier</span>
        {/* Search order */}
        <div className="flex items-center gap-1 ml-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="N° commande..."
              className="rounded border bg-background pl-7 pr-2 py-1 text-xs w-32"
              value={searchOrderNumber}
              onChange={e => setSearchOrderNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchOrder(); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearchOrder} className="h-7 px-2">
            <Search className="w-3.5 h-3.5" />
          </Button>
          {highlightedOrderId && (
            <Button variant="ghost" size="sm" onClick={handleResetSearch} className="h-7 px-2" title="Réinitialiser">
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        {(selectedOperatorId || selectedOrderId) && (
          <button
            onClick={() => { setSelectedOperatorId(null); setSelectedOrderId(null); }}
            className="ml-auto px-3 py-1 text-xs rounded bg-accent text-accent-foreground"
          >
            Tout afficher
          </button>
        )}
      </div>

      {/* Operator tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/30 overflow-x-auto flex-shrink-0">
        <span className="text-xs font-medium text-muted-foreground mr-2 whitespace-nowrap">Opérateur :</span>
        <button
          onClick={() => setSelectedOperatorId(null)}
          className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            !selectedOperatorId
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-background hover:bg-muted text-foreground border'
          }`}
        >
          Tous
        </button>
        {[...operators]
          .sort((a, b) => {
            const ai = OPERATOR_NAME_ORDER.indexOf(a.name);
            const bi = OPERATOR_NAME_ORDER.indexOf(b.name);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          })
          .map(op => (
            <button
              key={op.id}
              onClick={() => setSelectedOperatorId(op.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                selectedOperatorId === op.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background hover:bg-muted text-foreground border'
              }`}
            >
              {op.name}
            </button>
          ))}
      </div>

      {/* Chart area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Operator labels */}
        <div className="w-36 flex-shrink-0 border-r bg-card">
          <div className="h-8 border-b bg-gantt-header flex items-center px-2">
            <span className="text-xs font-heading text-gantt-header-foreground">Ressources</span>
          </div>
          {ganttRows.map(row => (
            <div
              key={row.id}
              onClick={() => {
                if (row.type === 'operator') handleOperatorClick(row.id);
                else if (row.type === 'tooling') setToolingDialogOpen(true);
              }}
              className={`flex items-center px-2 border-b transition-colors cursor-pointer hover:bg-muted/50 ${row.type !== 'operator' ? 'bg-muted/20' : ''}`}
              style={{ height: ROW_HEIGHT }}
            >
              <div>
                <div className={`text-sm font-medium truncate ${row.type !== 'operator' ? 'text-primary' : ''}`}>{row.label}</div>
                {row.sublabel && <div className="text-[10px] text-accent font-semibold">{row.sublabel}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Gantt grid */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative"
        >
          {/* Header timeline */}
          <div className="h-8 bg-gantt-header sticky top-0 z-10 relative" style={{ width: totalWidth }}>
            {gridLines.filter(l => l.label).map((l, i) => (
              <div key={i} className="absolute top-0 h-full flex items-center" style={{ left: l.offset }}>
                <span className="text-[10px] font-heading text-gantt-header-foreground pl-1">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="relative" style={{ width: totalWidth }}>
            {/* Grid lines */}
            {gridLines.map((l, i) => (
              <div
                key={i}
                className={`absolute top-0 w-px ${
                  l.type === 'major' ? 'bg-gantt-line' : l.type === 'minor' ? 'bg-gantt-line/50' : 'bg-gantt-line-light/40'
                }`}
                style={{ left: l.offset, height: ganttRows.length * ROW_HEIGHT }}
              />
            ))}

            {/* Now line */}
            {(() => {
              const now = new Date();
              const zero = new Date(ganttZeroDate);
              zero.setHours(8, 0, 0, 0);
              if (isWorkDay(now, holidays)) {
                const nowOffset = getPixelOffset(
                  now.toISOString().split('T')[0],
                  now.toTimeString().slice(0, 5)
                );
                if (nowOffset > 0 && nowOffset < totalWidth) {
                  return (
                    <div
                      className="absolute top-0 w-0.5 bg-gantt-now z-20"
                      style={{ left: nowOffset, height: ganttRows.length * ROW_HEIGHT }}
                    />
                  );
                }
              }
              return null;
            })()}

            {/* Rows */}
            {ganttRows.map((row, rowIndex) => {
              // Determine which steps to show in this row
              const rowSteps = filteredSteps.filter(s => {
                const isAbsenceStep = s.operationId === absenceOperationId;
                if (isAbsenceStep && s.orderId !== absenceOrderId) return false;

                if (row.type === 'operator') return s.operatorId === row.id;
                if (row.type === 'tooling') {
                  const order = orders.find(o => o.id === s.orderId);
                  return order && !order.toolingAvailable && !isAbsenceStep;
                }
                return false;
              });

              return (
                <div
                  key={row.id}
                  className={`relative border-b ${rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => {
                    if (row.type === 'tooling') setToolingDialogOpen(true);
                  }}
                >
                  {rowSteps.map(step => {
                    const order = orders.find(o => o.id === step.orderId);
                    if (!order) return null;
                    const left = getPixelOffset(step.startDate, step.startTime);
                    const width = getDurationWidth(step.estimatedDuration);
                    const isLast = isLastStep(step, steps);
                    const subName = step.subcontractorId ? getSubcontractorName(step.subcontractorId) : undefined;

                    return (
                      <div key={step.id} onDoubleClick={() => handleBlockDoubleClick(step.id)}>
                        <GanttBlock
                          step={step}
                          order={order}
                          operationName={getOperationName(step.operationId)}
                          clientName={getClientName(order.clientId)}
                          subcontractorName={subName}
                          left={left}
                          width={width}
                          isLast={isLast}
                          isCtrlSelected={false}
                          hasLink={!!step.dependsOn}
                          subcontractingPending={ordersWithPendingSubcontracting.has(order.id)}
                          pendingSubNames={pendingSubNamesPerOrder[order.id] || []}
                          isAbsence={step.operationId === absenceOperationId}
                          isDimmed={!!highlightedOrderId && step.orderId !== highlightedOrderId}
                          onDragStart={() => {}}
                          onResizeStart={() => {}}
                          onCtrlClick={() => {}}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* SVG arrows for linked blocks */}
            <svg className="absolute top-0 left-0 w-full pointer-events-none z-30" style={{ height: ganttRows.length * ROW_HEIGHT }}>
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" className="fill-accent" />
                </marker>
              </defs>
              {filteredSteps.filter(s => s.dependsOn).map(targetStep => {
                const sourceStep = steps.find(s => s.id === targetStep.dependsOn);
                if (!sourceStep) return null;

                // Find row indices
                const sourceRowIdx = ganttRows.findIndex(r =>
                  r.type === 'operator' && r.id === sourceStep.operatorId
                );
                const targetRowIdx = ganttRows.findIndex(r =>
                  r.type === 'operator' && r.id === targetStep.operatorId
                );
                if (sourceRowIdx < 0 || targetRowIdx < 0) return null;

                const pct = targetStep.dependsOnPercentage ?? 100;
                const sourceLeft = getPixelOffset(sourceStep.startDate, sourceStep.startTime);
                const sourceWidth = getDurationWidth(sourceStep.estimatedDuration);
                const targetLeft = getPixelOffset(targetStep.startDate, targetStep.startTime);

                const x1 = sourceLeft + sourceWidth * (pct / 100);
                const y1 = sourceRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                const x2 = targetLeft;
                const y2 = targetRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

                // Curved path
                const midX = (x1 + x2) / 2;

                return (
                  <g key={`link-${targetStep.id}`}>
                    <path
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      className="stroke-accent"
                      strokeWidth={2}
                      strokeDasharray={pct < 100 ? "6 3" : "none"}
                      markerEnd="url(#arrowhead)"
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 6}
                      className="fill-accent text-[9px] font-bold"
                      textAnchor="middle"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Edit Step Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">Modifier l'étape</DialogTitle></DialogHeader>
          {editForm && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Commande</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editForm.orderId} onChange={e => updateEditForm('orderId', e.target.value)}>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} — {o.designation}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Assigner à</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${!editForm.subcontractorId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    onClick={() => { updateEditForm('subcontractorId', undefined); updateEditForm('operatorId', operators[0]?.id || ''); }}
                  >
                    Opérateur
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${editForm.subcontractorId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    onClick={() => { updateEditForm('operatorId', ''); updateEditForm('subcontractorId', subcontractors[0]?.id || ''); }}
                  >
                    Sous-traitant
                  </button>
                </div>
                {!editForm.subcontractorId ? (
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editForm.operatorId} onChange={e => updateEditForm('operatorId', e.target.value)}>
                    {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editForm.subcontractorId} onChange={e => updateEditForm('subcontractorId', e.target.value)}>
                    {subcontractors.map(s => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Opération</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editForm.operationId} onChange={e => updateEditForm('operationId', e.target.value)}>
                  {operations.filter(o => o.id !== absenceOperationId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Ordre chronologique</label>
                <Input type="number" min={1} value={editForm.order} onChange={e => updateEditForm('order', parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Date début</label>
                <Input type="date" value={editForm.startDate} onChange={e => updateEditForm('startDate', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Heure début</label>
                <Input type="time" value={editForm.startTime} onChange={e => updateEditForm('startTime', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Durée estimée (h)</label>
                <Input type="number" min={0} step={0.25} value={parseFloat((editForm.estimatedDuration / 60).toFixed(2))} onChange={e => updateEditForm('estimatedDuration', Math.round((parseFloat(e.target.value) || 0) * 60))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Date fin</label>
                <Input type="date" value={editForm.endDate} onChange={e => updateEditForm('endDate', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Heure fin</label>
                <Input type="time" value={editForm.endTime} onChange={e => updateEditForm('endTime', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Dépend de (étape)</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editForm.dependsOn || ''} onChange={e => updateEditForm('dependsOn', e.target.value || undefined)}>
                  <option value="">Aucune dépendance</option>
                  {steps.filter(s => s.id !== editForm.id).map(s => {
                    const o = orders.find(ord => ord.id === s.orderId);
                    return <option key={s.id} value={s.id}>#{s.order} — {o?.orderNumber || '—'}</option>;
                  })}
                </select>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            {editForm?.frozen && (
              <Button variant="outline" className="mr-auto" onClick={() => {
                if (editForm) {
                  updateStep({ ...editForm, frozen: false });
                  setEditForm({ ...editForm, frozen: false });
                }
              }}>
                <Unlock className="w-4 h-4 mr-1" /> Libérer
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleEditSave}>Enregistrer</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validate Production Dialog */}
      <Dialog open={validateDialogOpen} onOpenChange={setValidateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Valider la production</DialogTitle>
          </DialogHeader>
          {validateStepId && (() => {
            const step = steps.find(s => s.id === validateStepId);
            const order = step ? orders.find(o => o.id === step.orderId) : null;
            const opName = step ? getOperationName(step.operationId) : '';
            const oprName = step ? operators.find(o => o.id === step.operatorId)?.name : '';
            return (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Commande :</span> <strong>{order?.orderNumber}</strong> — {order?.designation}</p>
                  <p><span className="text-muted-foreground">Opération :</span> {opName}</p>
                  <p><span className="text-muted-foreground">Opérateur :</span> {oprName}</p>
                  <p><span className="text-muted-foreground">Durée estimée :</span> {step ? (step.estimatedDuration / 60).toFixed(2) : 0}h</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Durée réelle (heures)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={validateActualDuration}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setValidateActualDuration(val);
                      // Auto-update remaining duration
                      if (step) {
                        const remaining = Math.max(0, parseFloat((step.estimatedDuration / 60).toFixed(2)) - val);
                        setValidateRemainingDuration(parseFloat(remaining.toFixed(2)));
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">État du travail</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${validateWorkDone === 'done' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border'}`}
                      onClick={() => setValidateWorkDone('done')}
                    >
                      ✓ Terminé
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${validateWorkDone === 'continue' ? 'bg-accent text-accent-foreground border-accent' : 'bg-muted text-muted-foreground border-border'}`}
                      onClick={() => {
                        setValidateWorkDone('continue');
                        if (step) {
                          const remaining = Math.max(0, parseFloat((step.estimatedDuration / 60).toFixed(2)) - validateActualDuration);
                          setValidateRemainingDuration(parseFloat(remaining.toFixed(2)));
                        }
                      }}
                    >
                      ⏩ À poursuivre
                    </button>
                  </div>
                </div>
                {validateWorkDone === 'continue' && (
                  <div className="space-y-3 p-3 rounded-md border border-accent/30 bg-accent/5">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Durée restante (heures)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.25}
                        value={validateRemainingDuration}
                        onChange={e => setValidateRemainingDuration(parseFloat(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Estimée initiale: {step ? (step.estimatedDuration / 60).toFixed(2) : 0}h — Passée: {validateActualDuration}h
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Date de reprise</label>
                      <Input
                        type="date"
                        value={validateContinueDate}
                        onChange={e => setValidateContinueDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Heure de reprise</label>
                      <Input
                        type="time"
                        value={validateContinueTime}
                        onChange={e => setValidateContinueTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleValidateSave}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Dependency Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) { setLinkSource(null); setLinkTarget(null); setIsEditingLink(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{isEditingLink ? 'Modifier le lien' : 'Lier les blocs'}</DialogTitle>
          </DialogHeader>
          {linkSource && linkTarget && (() => {
            const src = steps.find(s => s.id === linkSource);
            const tgt = steps.find(s => s.id === linkTarget);
            const srcOrder = src ? orders.find(o => o.id === src.orderId) : null;
            const tgtOrder = tgt ? orders.find(o => o.id === tgt.orderId) : null;
            return (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Bloc 1 (prédécesseur) :</span> <strong>{srcOrder?.orderNumber}</strong> — {getOperationName(src?.operationId || '')}</p>
                  <p><span className="text-muted-foreground">Bloc 2 (successeur) :</span> <strong>{tgtOrder?.orderNumber}</strong> — {getOperationName(tgt?.operationId || '')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Pourcentage d'avancement requis avant de démarrer le bloc 2
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={linkPercentage}
                      onChange={e => setLinkPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-24"
                      autoFocus
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {linkPercentage === 0 && "Les deux blocs démarrent simultanément."}
                    {linkPercentage === 100 && "Le bloc 2 ne démarre qu'après la fin complète du bloc 1."}
                    {linkPercentage > 0 && linkPercentage < 100 && `Le bloc 2 démarre quand le bloc 1 atteint ${linkPercentage}%.`}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="flex justify-between">
            {isEditingLink && (
              <Button variant="destructive" onClick={handleLinkDelete} className="mr-auto">Supprimer le lien</Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleLinkSave}>{isEditingLink ? 'Modifier' : 'Lier'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Special row dialogs */}
      <SubcontractorTableDialog open={subDialogOpen} onOpenChange={setSubDialogOpen} />
      <PurchaseRowDialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen} title="Achats matières programmés" type="material" />
      <PurchaseRowDialog open={toolingDialogOpen} onOpenChange={setToolingDialogOpen} title="Achats outillage programmés" type="tooling" />
    </div>
  );
};

export default GanttChart;
