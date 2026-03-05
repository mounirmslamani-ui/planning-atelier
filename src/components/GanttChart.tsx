import React, { useMemo, useRef, useState, useCallback } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import type { GanttView, ProductionStep, Order } from '@/types/planning';

// Work hours: 8:00-12:00, 12:30-16:00 = 7.5h = 450min per day
// Work week: Sun-Thu (Fri-Sat weekend)

const HOUR_WIDTH_DAY = 120; // px per hour in day view
const DAY_WIDTH_WEEK = 160; // px per day in week view
const DAY_WIDTH_MONTH = 40; // px per day in month view
const ROW_HEIGHT = 52;

function isWorkDay(date: Date, holidays: { date: string }[]): boolean {
  const day = date.getDay(); // 0=Sun, 5=Fri, 6=Sat
  if (day === 5 || day === 6) return false;
  const dateStr = date.toISOString().split('T')[0];
  return !holidays.some(h => h.date === dateStr);
}

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
  allSteps: ProductionStep[];
  onDragStart: (stepId: string, startX: number, startLeft: number) => void;
  onResizeStart: (stepId: string, startX: number, startWidth: number) => void;
}

const GanttBlock: React.FC<GanttBlockProps> = ({
  step, order, operationName, clientName, left, width, isLast, allSteps, onDragStart, onResizeStart
}) => {
  const urgencyBg = step.operationId === 'op-8' ? 'bg-absence' : getUrgencyBg(order.urgency);
  const hatch = getHatchClass(order.materialAvailable, order.toolingAvailable);
  const textColor = getDeadlineTextColor(order, step);
  const borderClass = isLast ? 'border-2 border-foreground' : 'border border-foreground/20';

  return (
    <div
      className={`absolute top-1 rounded-sm cursor-move select-none overflow-hidden ${urgencyBg} ${hatch} ${borderClass}`}
      style={{ left: `${left}px`, width: `${Math.max(width, 20)}px`, height: `${ROW_HEIGHT - 8}px` }}
      onMouseDown={e => { e.preventDefault(); onDragStart(step.id, e.clientX, left); }}
      title={`${order.orderNumber} — ${order.designation}\n${operationName} | ${clientName} | Qté: ${order.quantity}`}
    >
      <div className={`px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate ${textColor}`}>
        <div className="font-heading">{order.orderNumber}</div>
        <div className="opacity-80">{operationName}</div>
        <div className="opacity-60 truncate">{clientName} — {order.designation}</div>
      </div>
      {/* Resize handle */}
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
    updateStep,
  } = usePlanning();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ stepId: string; startX: number; startLeft: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ stepId: string; startX: number; startWidth: number } | null>(null);

  // Sort operators by main function
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

  // Filter steps
  const filteredSteps = useMemo(() => {
    let result = steps;
    if (selectedOperatorId) result = result.filter(s => s.operatorId === selectedOperatorId);
    if (selectedOrderId) result = result.filter(s => s.orderId === selectedOrderId);
    return result;
  }, [steps, selectedOperatorId, selectedOrderId]);

  // Time calculations
  const getPixelOffset = useCallback((dateStr: string, timeStr: string): number => {
    const date = new Date(`${dateStr}T${timeStr || '08:00'}`);
    const zero = new Date(ganttZeroDate);
    zero.setHours(8, 0, 0, 0);
    const diffMs = date.getTime() - zero.getTime();

    switch (ganttView) {
      case 'day': {
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours * HOUR_WIDTH_DAY;
      }
      case 'week': {
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays * DAY_WIDTH_WEEK;
      }
      case 'month': {
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays * DAY_WIDTH_MONTH;
      }
    }
  }, [ganttView, ganttZeroDate]);

  const getDurationWidth = useCallback((minutes: number): number => {
    switch (ganttView) {
      case 'day': return (minutes / 60) * HOUR_WIDTH_DAY;
      case 'week': return (minutes / (60 * 24)) * DAY_WIDTH_WEEK;
      case 'month': return (minutes / (60 * 24)) * DAY_WIDTH_MONTH;
    }
  }, [ganttView]);

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: { offset: number; type: 'major' | 'minor' | 'light'; label?: string }[] = [];
    const zero = new Date(ganttZeroDate);
    zero.setHours(8, 0, 0, 0);

    if (ganttView === 'day') {
      // 24 hours from the zero point
      for (let h = 0; h < 24; h++) {
        const offset = h * HOUR_WIDTH_DAY;
        lines.push({ offset, type: 'major', label: `${(8 + h) % 24}:00` });
        lines.push({ offset: offset + HOUR_WIDTH_DAY / 2, type: 'minor' });
        lines.push({ offset: offset + HOUR_WIDTH_DAY / 4, type: 'light' });
        lines.push({ offset: offset + (3 * HOUR_WIDTH_DAY) / 4, type: 'light' });
      }
    } else if (ganttView === 'week') {
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      for (let d = 0; d < 7; d++) {
        const date = new Date(zero.getTime() + d * 24 * 60 * 60 * 1000);
        const offset = d * DAY_WIDTH_WEEK;
        const dayName = dayNames[date.getDay()];
        const isWeekend = date.getDay() === 5 || date.getDay() === 6;
        lines.push({ offset, type: isWeekend ? 'light' : 'major', label: `${dayName} ${date.getDate()}` });
        lines.push({ offset: offset + DAY_WIDTH_WEEK / 2, type: 'minor' });
      }
    } else {
      for (let d = 0; d < 35; d++) {
        const date = new Date(zero.getTime() + d * 24 * 60 * 60 * 1000);
        const offset = d * DAY_WIDTH_MONTH;
        const isWeekend = date.getDay() === 5 || date.getDay() === 6;
        lines.push({ offset, type: isWeekend ? 'light' : (date.getDate() === 1 ? 'major' : 'minor'), label: d % 2 === 0 ? `${date.getDate()}` : undefined });
      }
    }
    return lines;
  }, [ganttView, ganttZeroDate]);

  const totalWidth = useMemo(() => {
    switch (ganttView) {
      case 'day': return 24 * HOUR_WIDTH_DAY;
      case 'week': return 7 * DAY_WIDTH_WEEK;
      case 'month': return 35 * DAY_WIDTH_MONTH;
    }
  }, [ganttView]);

  // Mouse handlers for drag/resize
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      // Preview only - actual update on mouseup
    }
    if (resizeState) {
      // Preview only
    }
  }, [dragState, resizeState]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const step = steps.find(s => s.id === dragState.stepId);
      if (step && Math.abs(dx) > 5) {
        let minutesDelta = 0;
        switch (ganttView) {
          case 'day': minutesDelta = (dx / HOUR_WIDTH_DAY) * 60; break;
          case 'week': minutesDelta = (dx / DAY_WIDTH_WEEK) * 24 * 60; break;
          case 'month': minutesDelta = (dx / DAY_WIDTH_MONTH) * 24 * 60; break;
        }
        const start = new Date(`${step.startDate}T${step.startTime}`);
        start.setMinutes(start.getMinutes() + Math.round(minutesDelta / 15) * 15);
        const end = new Date(start.getTime() + step.estimatedDuration * 60000);
        updateStep({
          ...step,
          startDate: start.toISOString().split('T')[0],
          startTime: start.toTimeString().slice(0, 5),
          endDate: end.toISOString().split('T')[0],
          endTime: end.toTimeString().slice(0, 5),
        });
      }
      setDragState(null);
    }
    if (resizeState) {
      const dx = e.clientX - resizeState.startX;
      const step = steps.find(s => s.id === resizeState.stepId);
      if (step && Math.abs(dx) > 5) {
        let minutesDelta = 0;
        switch (ganttView) {
          case 'day': minutesDelta = (dx / HOUR_WIDTH_DAY) * 60; break;
          case 'week': minutesDelta = (dx / DAY_WIDTH_WEEK) * 24 * 60; break;
          case 'month': minutesDelta = (dx / DAY_WIDTH_MONTH) * 24 * 60; break;
        }
        const newDuration = Math.max(15, step.estimatedDuration + Math.round(minutesDelta / 15) * 15);
        const start = new Date(`${step.startDate}T${step.startTime}`);
        const end = new Date(start.getTime() + newDuration * 60000);
        updateStep({
          ...step,
          estimatedDuration: newDuration,
          endDate: end.toISOString().split('T')[0],
          endTime: end.toTimeString().slice(0, 5),
        });
      }
      setResizeState(null);
    }
  }, [dragState, resizeState, steps, ganttView, updateStep]);

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '';
  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '';

  const handleOperatorClick = (opId: string) => {
    setSelectedOrderId(null);
    setSelectedOperatorId(selectedOperatorId === opId ? null : opId);
  };

  const handleBlockDoubleClick = (orderId: string) => {
    setSelectedOperatorId(null);
    setSelectedOrderId(selectedOrderId === orderId ? null : orderId);
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
              const nowOffset = getPixelOffset(now.toISOString().split('T')[0], now.toTimeString().slice(0, 5));
              if (nowOffset > 0 && nowOffset < totalWidth) {
                return (
                  <div
                    className="absolute top-0 w-0.5 bg-gantt-now z-20"
                    style={{ left: nowOffset, height: sortedOperators.length * ROW_HEIGHT }}
                  />
                );
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
                      <div key={step.id} onDoubleClick={() => handleBlockDoubleClick(step.orderId)}>
                        <GanttBlock
                          step={step}
                          order={order}
                          operationName={getOperationName(step.operationId)}
                          clientName={getClientName(order.clientId)}
                          left={left}
                          width={width}
                          isLast={isLast}
                          allSteps={steps}
                          onDragStart={(id, x, l) => setDragState({ stepId: id, startX: x, startLeft: l })}
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
    </div>
  );
};

export default GanttChart;
