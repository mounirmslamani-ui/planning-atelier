import React, { useMemo, useRef, useState, useCallback } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import type { GanttView, ProductionStep, Order, Holiday } from '@/types/planning';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  workMinutesFromZero,
  getWorkSlotsForRange,
  addWorkMinutes,
  WORK_MINUTES_PER_DAY,
  WORK_SEGMENTS,
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
  left: number;
  width: number;
  isLast: boolean;
  onDragStart: (stepId: string, startX: number, startLeft: number, startY: number, altKey: boolean) => void;
  onResizeStart: (stepId: string, startX: number, startWidth: number) => void;
}

const GanttBlock: React.FC<GanttBlockProps> = ({
  step, order, operationName, clientName, left, width, isLast, onDragStart, onResizeStart
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
      title={`${order.orderNumber} — ${order.designation}\n${operationName} | ${clientName} | Qté: ${order.quantity}`}
    >
      <div className={`px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate ${textColor}`}>
        <div className="font-heading">{order.orderNumber}</div>
        <div className="opacity-80">{operationName}</div>
        <div className="opacity-60 truncate">{clientName} — {order.designation}</div>
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
    operators, operations, orders, steps, holidays, clients,
    ganttView, setGanttView, ganttZeroDate, setGanttZeroDate,
    selectedOperatorId, setSelectedOperatorId,
    selectedOrderId, setSelectedOrderId,
    updateStep, addStep,
  } = usePlanning();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ stepId: string; startX: number; startY: number; startLeft: number; altKey: boolean } | null>(null);
  const [resizeState, setResizeState] = useState<{ stepId: string; startX: number; startWidth: number } | null>(null);

  const sortedOperators = useMemo(() => {
    const functionOrder = ['Tournage', 'Fraisage', 'Rectification', 'Perçage', 'Soudure', 'Traitement thermique', 'Contrôle qualité'];
    return [...operators]
      .filter(op => !selectedOperatorId || op.id === selectedOperatorId)
      .sort((a, b) => {
        const ai = functionOrder.indexOf(a.mainFunction);
        const bi = functionOrder.indexOf(b.mainFunction);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [operators, selectedOperatorId]);

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
    return numWorkDays * WORK_MINUTES_PER_DAY * minuteWidth;
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
        slot.segments.forEach(seg => {
          const segStart = seg.startMin;
          const segEnd = seg.endMin;
          for (let m = segStart; m < segEnd; m += 60) {
            const workMinInDay = getWorkMinutesInDay(m, slot.segments);
            const offset = (cumulativeWorkMinutes + workMinInDay) * minuteWidth;
            const hour = Math.floor(m / 60);
            const isHourStart = m % 60 === 0;
            if (isHourStart) {
              lines.push({ offset, type: 'major', label: `${hour}:00` });
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

    // Lunch break markers (visual gap) for day view
    if (ganttView === 'day' && workSlots.length > 0) {
      const lunchWorkMin = 240; // after 4h of morning work
      const offset = lunchWorkMin * minuteWidth;
      lines.push({ offset, type: 'major', label: '12:00 | 12:30' });
    }

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
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const step = steps.find(s => s.id === dragState.stepId);
      if (step && (Math.abs(dx) > 5 || Math.abs(dy) > ROW_HEIGHT / 2)) {
        const minutesDelta = pxToWorkMinutes(dx);
        const start = new Date(`${step.startDate}T${step.startTime}`);
        const newStart = addWorkMinutes(start, Math.round(minutesDelta / 15) * 15, holidays);
        const newEnd = addWorkMinutes(newStart, step.estimatedDuration, holidays);

        const rowShift = Math.round(dy / ROW_HEIGHT);
        const currentRowIndex = sortedOperators.findIndex(op => op.id === step.operatorId);
        const targetRowIndex = Math.max(0, Math.min(sortedOperators.length - 1, currentRowIndex + rowShift));
        const targetOperatorId = sortedOperators[targetRowIndex]?.id || step.operatorId;

        const newStepData = {
          ...step,
          operatorId: targetOperatorId,
          startDate: newStart.toISOString().split('T')[0],
          startTime: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
          endDate: newEnd.toISOString().split('T')[0],
          endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        };

        if (dragState.altKey) {
          // Duplicate: create a new step with a new ID
          addStep({ ...newStepData, id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
        } else {
          updateStep(newStepData);
        }
      }
      setDragState(null);
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
  }, [dragState, resizeState, steps, holidays, pxToWorkMinutes, updateStep, sortedOperators]);

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '';
  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '';

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
      const { workMinutesBetween } = require('@/lib/workTime');
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b">
        <div className="flex gap-1">
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
      </div>

      {/* Chart area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Operator labels */}
        <div className="w-36 flex-shrink-0 border-r bg-card">
          <div className="h-8 border-b bg-gantt-header flex items-center px-2">
            <span className="text-xs font-heading text-gantt-header-foreground">Opérateurs</span>
          </div>
          {sortedOperators.map(op => (
            <div
              key={op.id}
              onClick={() => handleOperatorClick(op.id)}
              className="flex items-center px-2 border-b cursor-pointer hover:bg-muted/50 transition-colors"
              style={{ height: ROW_HEIGHT }}
            >
              <div>
                <div className="text-xs font-medium truncate">{op.name}</div>
                <div className="text-[10px] text-muted-foreground">{op.mainFunction}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Gantt grid */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setDragState(null); setResizeState(null); }}
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
                style={{ left: l.offset, height: sortedOperators.length * ROW_HEIGHT }}
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
                      style={{ left: nowOffset, height: sortedOperators.length * ROW_HEIGHT }}
                    />
                  );
                }
              }
              return null;
            })()}

            {/* Operator rows */}
            {sortedOperators.map((op, rowIndex) => (
              <div
                key={op.id}
                className={`relative border-b ${rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}
                style={{ height: ROW_HEIGHT }}
              >
                {filteredSteps
                  .filter(s => s.operatorId === op.id)
                  .map(step => {
                    const order = orders.find(o => o.id === step.orderId);
                    if (!order) return null;
                    const left = getPixelOffset(step.startDate, step.startTime);
                    const width = getDurationWidth(step.estimatedDuration);
                    const isLast = isLastStep(step, steps);

                    return (
                      <div key={step.id} onDoubleClick={() => handleBlockDoubleClick(step.id)}>
                        <GanttBlock
                          step={step}
                          order={order}
                          operationName={getOperationName(step.operationId)}
                          clientName={getClientName(order.clientId)}
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
                <label className="text-sm font-medium mb-1 block">Opérateur</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editForm.operatorId} onChange={e => updateEditForm('operatorId', e.target.value)}>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
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
                <label className="text-sm font-medium mb-1 block">Durée estimée (min)</label>
                <Input type="number" min={0} value={editForm.estimatedDuration} onChange={e => updateEditForm('estimatedDuration', parseInt(e.target.value) || 0)} />
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
    </div>
  );
};

export default GanttChart;
