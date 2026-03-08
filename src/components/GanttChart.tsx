import React, { useMemo, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Settings, Check } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import type { GanttView, ProductionStep, Order, Holiday, ProductionRecord } from '@/types/planning';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

function getUrgencyBg(urgency: string): string {
  switch (urgency) {
    case 'urgent': return 'bg-urgent/80';
    case 'moderate': return 'bg-urgent-moderate/80';
    case 'normal': return 'bg-normal/80';
    case 'not-urgent': return 'bg-not-urgent';
    default: return 'bg-muted';
  }
}

function getHatchClass(materialAvailable: boolean, toolingAvailable: boolean): string {
  if (!materialAvailable && !toolingAvailable) return 'hatch-cross';
  if (!materialAvailable) return 'hatch-right';
  if (!toolingAvailable) return 'hatch-left';
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
  onDragStart: (stepId: string, startX: number, startLeft: number, startY: number, altKey: boolean) => void;
  onResizeStart: (stepId: string, startX: number, startWidth: number) => void;
  onCtrlClick: (stepId: string) => void;
}

const GanttBlock: React.FC<GanttBlockProps> = ({
  step, order, operationName, clientName, subcontractorName, left, width, isLast, onDragStart, onResizeStart
}) => {
  const urgencyBg = step.operationId === 'op-8' ? 'bg-absence' : getUrgencyBg(order.urgency);
  const hatch = getHatchClass(order.materialAvailable, order.toolingAvailable);
  const textColor = getDeadlineTextColor(order, step);
  const borderClass = isLast ? 'border-2 border-foreground' : 'border border-foreground/20';

  return (
    <div
      className={`absolute top-1 rounded-sm cursor-move select-none overflow-hidden ${urgencyBg} ${hatch} ${borderClass}`}
      style={{ left: `${left}px`, width: `${Math.max(width, 20)}px`, height: `${ROW_HEIGHT - 8}px` }}
      onMouseDown={e => { e.preventDefault(); onDragStart(step.id, e.clientX, left, e.clientY, e.altKey); }}
      title={`${order.orderNumber} — ${order.designation}\n${operationName} | ${clientName} | Qté: ${order.quantity}${subcontractorName ? `\nSous-traitant: ${subcontractorName}` : ''}`}
    >
      <div className={`px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate ${textColor}`}>
        {subcontractorName ? (
          <>
            <div className="font-heading">{order.orderNumber} — {subcontractorName}</div>
            <div className="opacity-60 truncate">{clientName} — {order.designation}</div>
          </>
        ) : (
          <>
            <div className="font-heading">{order.orderNumber}</div>
            <div className="opacity-80">{operationName}</div>
            <div className="opacity-60 truncate">{clientName} — {order.designation}</div>
          </>
        )}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-foreground/20"
        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart(step.id, e.clientX, width); }}
      />
    </div>
  );
};

const GanttChart: React.FC = () => {
  const {
    operators, operations, orders, steps, holidays, clients, subcontractors,
    ganttView, setGanttView, ganttZeroDate, setGanttZeroDate,
    selectedOperatorId, setSelectedOperatorId,
    selectedOrderId, setSelectedOrderId,
    updateStep, addStep, addProductionRecord,
  } = usePlanning();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ stepId: string; startX: number; startY: number; startLeft: number; altKey: boolean } | null>(null);
  const [resizeState, setResizeState] = useState<{ stepId: string; startX: number; startWidth: number } | null>(null);
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validateStepId, setValidateStepId] = useState<string | null>(null);
  const [validateActualDuration, setValidateActualDuration] = useState<number>(0);
  const [isOverValidateZone, setIsOverValidateZone] = useState(false);
  const validateZoneRef = useRef<HTMLDivElement>(null);

  type GanttRow = { type: 'operator'; id: string; label: string; sublabel: string } | { type: 'subcontractor'; id: string; label: string; sublabel: string };

  const ganttRows = useMemo(() => {
    const functionOrder = ['Tournage', 'Fraisage', 'Rectification', 'Perçage', 'Soudure', 'Traitement thermique', 'Contrôle qualité'];
    const opRows: GanttRow[] = [...operators]
      .filter(op => !selectedOperatorId || op.id === selectedOperatorId)
      .sort((a, b) => {
        const ai = functionOrder.indexOf(a.mainFunction);
        const bi = functionOrder.indexOf(b.mainFunction);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(op => ({ type: 'operator' as const, id: op.id, label: op.name, sublabel: op.mainFunction }));

    // Add a single subcontractor row if there are subcontractor steps
    const hasSubSteps = steps.some(s => s.subcontractorId);
    const subRow: GanttRow[] = (hasSubSteps || subcontractors.length > 0) && !selectedOperatorId
      ? [{ type: 'subcontractor' as const, id: '__subcontractor__', label: 'Sous-traitant', sublabel: '' }]
      : [];

    return [...opRows, ...subRow];
  }, [operators, selectedOperatorId, steps, subcontractors]);

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
            setValidateActualDuration(parseFloat((step.estimatedDuration / 60).toFixed(2)));
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
          operatorId: targetRow?.type === 'operator' ? targetRow.id : step.operatorId,
          subcontractorId: targetRow?.type === 'subcontractor' ? undefined : step.subcontractorId,
          startDate: newStart.toISOString().split('T')[0],
          startTime: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
          endDate: newEnd.toISOString().split('T')[0],
          endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        };

        if (dragState.altKey) {
          addStep({ ...newStepData, id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
        } else {
          updateStep(newStepData);
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
          estimatedDuration: newDuration,
          endDate: newEnd.toISOString().split('T')[0],
          endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        });
      }
      setResizeState(null);
    }
  }, [dragState, resizeState, steps, holidays, pxToWorkMinutes, updateStep, ganttRows]);

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
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      stepId: step.id,
      orderId: step.orderId,
      operatorId: step.operatorId,
      operationId: step.operationId,
      actualDuration: Math.round(validateActualDuration * 60),
      validatedAt: new Date().toISOString(),
    };
    addProductionRecord(record);
    setValidateDialogOpen(false);
    setValidateStepId(null);
  }, [validateStepId, validateActualDuration, steps, addProductionRecord]);

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
      onMouseMove={(e) => { handleMouseMove(e); handleGlobalMouseMove(e); }}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setDragState(null); setResizeState(null); setIsOverValidateZone(false); }}
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
        {(selectedOperatorId || selectedOrderId) && (
          <button
            onClick={() => { setSelectedOperatorId(null); setSelectedOrderId(null); }}
            className="ml-auto px-3 py-1 text-xs rounded bg-accent text-accent-foreground"
          >
            Tout afficher
          </button>
        )}
        {/* Validate production icon - drop zone */}
        <div
          ref={validateZoneRef}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed transition-all ${
            isOverValidateZone
              ? 'border-primary bg-primary/20 scale-110'
              : dragState
                ? 'border-primary/50 bg-primary/5 animate-pulse'
                : 'border-muted-foreground/30 bg-muted/30'
          }`}
          title="Glissez un bloc ici pour valider la production"
        >
          <div className="relative w-7 h-7">
            <Settings className={`w-7 h-7 ${isOverValidateZone ? 'text-primary' : 'text-muted-foreground'} transition-colors`} />
            <Check className={`absolute bottom-0 right-0 w-3.5 h-3.5 ${isOverValidateZone ? 'text-primary' : 'text-muted-foreground'} transition-colors`} strokeWidth={3} />
          </div>
          <span className={`text-[10px] font-medium ${isOverValidateZone ? 'text-primary' : 'text-muted-foreground'}`}>Valider</span>
        </div>
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
              onClick={() => row.type === 'operator' ? handleOperatorClick(row.id) : undefined}
              className={`flex items-center px-2 border-b transition-colors ${row.type === 'operator' ? 'cursor-pointer hover:bg-muted/50' : 'bg-muted/20'}`}
              style={{ height: ROW_HEIGHT }}
            >
              <div>
                <div className={`text-xs font-medium truncate ${row.type === 'subcontractor' ? 'text-primary' : ''}`}>{row.label}</div>
                {row.sublabel && <div className="text-[10px] text-muted-foreground">{row.sublabel}</div>}
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

            {/* Operator rows */}
            {ganttRows.map((row, rowIndex) => (
              <div
                key={row.id}
                className={`relative border-b ${rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}
                style={{ height: ROW_HEIGHT }}
              >
                {filteredSteps
                  .filter(s => row.type === 'operator' ? s.operatorId === row.id && !s.subcontractorId : !!s.subcontractorId)
                  .map(step => {
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
                          onDragStart={(id, x, l, y, alt) => setDragState({ stepId: id, startX: x, startY: y, startLeft: l, altKey: alt })}
                          onResizeStart={(id, x, w) => setResizeState({ stepId: id, startX: x, startWidth: w })}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
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
                  {operations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleEditSave}>Enregistrer</Button>
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
                    onChange={e => setValidateActualDuration(parseFloat(e.target.value) || 0)}
                    autoFocus
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleValidateSave}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GanttChart;
