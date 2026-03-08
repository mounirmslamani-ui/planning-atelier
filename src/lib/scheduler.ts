import type { ProductionStep, Order, Holiday, OrderPriority } from '@/types/planning';
import { addWorkMinutes } from './workTime';

export interface OperationToSchedule {
  operationId: string;
  estimatedDuration: number; // in minutes
  options: { id: string; isSub: boolean }[];
}

interface ScheduleCandidate {
  assigneeId: string;
  isSub: boolean;
  start: Date;
  end: Date;
  displacedStepIds: string[];
}

/** Lower score = higher priority. Uses displayOrder as primary criterion, then priority level. */
function orderScore(order?: Order): number {
  // displayOrder is the primary criterion — lower = higher priority
  if (order?.displayOrder != null) return order.displayOrder;
  // Fallback to priority-based score for orders without displayOrder
  return priorityScoreFromLevel(order?.priority);
}

function priorityScoreFromLevel(p?: OrderPriority): number {
  const map: Record<string, number> = {
    'P1-A': 1, 'P1-B': 2, 'P1-C': 3,
    'P2-A': 4, 'P2-B': 5, 'P2-C': 6,
    'P3-A': 7, 'P3-B': 8,
  };
  return p ? (map[p] ?? 9999) : 9999;
}

/** An order is "blocked" if material or tooling is unavailable */
function isOrderBlocked(order: Order): boolean {
  return !order.materialAvailable || !order.toolingAvailable;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function findEarliestSlot(
  assigneeId: string,
  isSub: boolean,
  duration: number,
  earliestStart: Date,
  allSteps: ProductionStep[],
  allOrders: Order[],
  currentOrder: Order,
  holidays: Holiday[]
): ScheduleCandidate {
  const assigneeSteps = allSteps.filter(s =>
    isSub ? s.subcontractorId === assigneeId : (s.operatorId === assigneeId && !s.subcontractorId)
  );

  const currentPrio = priorityScore(currentOrder.priority);

  const getOrder = (step: ProductionStep) =>
    allOrders.find(o => o.id === step.orderId);

  const sorted = assigneeSteps
    .map(s => ({
      step: s,
      start: new Date(`${s.startDate}T${s.startTime}`),
      end: new Date(`${s.endDate}T${s.endTime}`),
      order: getOrder(s),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let candidate = new Date(earliestStart);
  const displaced: string[] = [];

  for (const existing of sorted) {
    const candidateEnd = addWorkMinutes(candidate, duration, holidays);
    if (candidateEnd <= existing.start) break;

    // Never displace absences
    if (existing.step.operationId === 'op-8') {
      if (candidate < existing.end) candidate = new Date(existing.end);
      continue;
    }

    const existingOrder = existing.order;
    const existingPrio = priorityScore(existingOrder?.priority);

    // Can displace if:
    // 1. Current order has strictly higher priority (lower score), OR
    // 2. Same priority but current deadline is earlier, OR
    // 3. Existing order is blocked (missing material/tooling)
    const currentDeadline = currentOrder.deliveryDeadline || currentOrder.plannedDeadline || '9999-12-31';
    const existingDeadline = existingOrder?.deliveryDeadline || existingOrder?.plannedDeadline || '9999-12-31';

    const canDisplace =
      (existingOrder && isOrderBlocked(existingOrder)) ||
      currentPrio < existingPrio ||
      (currentPrio === existingPrio && currentDeadline < existingDeadline);

    if (canDisplace) {
      displaced.push(existing.step.id);
      continue;
    }

    // Can't displace — move past
    if (candidate < existing.end) {
      candidate = new Date(existing.end);
    }
  }

  const end = addWorkMinutes(candidate, duration, holidays);
  return { assigneeId, isSub, start: candidate, end, displacedStepIds: displaced };
}

export function scheduleOrder(
  orderId: string,
  orderDeadline: string,
  operationsToSchedule: OperationToSchedule[],
  existingSteps: ProductionStep[],
  allOrders: Order[],
  holidays: Holiday[]
): { newSteps: ProductionStep[]; updatedSteps: ProductionStep[] } {
  const newSteps: ProductionStep[] = [];
  const updatedSteps: ProductionStep[] = [];
  let workingSteps = [...existingSteps];

  const currentOrder = allOrders.find(o => o.id === orderId);
  if (!currentOrder) return { newSteps, updatedSteps };

  let previousOpEnd = new Date();

  for (let i = 0; i < operationsToSchedule.length; i++) {
    const op = operationsToSchedule[i];
    if (op.options.length === 0) continue;

    let bestCandidate: ScheduleCandidate | null = null;

    for (const option of op.options) {
      const candidate = findEarliestSlot(
        option.id,
        option.isSub,
        op.estimatedDuration,
        previousOpEnd,
        workingSteps,
        allOrders,
        currentOrder,
        holidays
      );

      if (!bestCandidate || candidate.end < bestCandidate.end) {
        bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      const step: ProductionStep = {
        id: `step-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        orderId,
        operatorId: bestCandidate.isSub ? '' : bestCandidate.assigneeId,
        subcontractorId: bestCandidate.isSub ? bestCandidate.assigneeId : undefined,
        operationId: op.operationId,
        estimatedDuration: op.estimatedDuration,
        startDate: formatDate(bestCandidate.start),
        startTime: formatTime(bestCandidate.start),
        endDate: formatDate(bestCandidate.end),
        endTime: formatTime(bestCandidate.end),
        order: i + 1,
      };

      newSteps.push(step);
      workingSteps.push(step);

      // Reschedule displaced steps
      for (const displacedId of bestCandidate.displacedStepIds) {
        const displaced = workingSteps.find(s => s.id === displacedId);
        if (!displaced) continue;

        const dIsSub = !!displaced.subcontractorId;
        const dAssigneeId = dIsSub ? displaced.subcontractorId! : displaced.operatorId;

        const newSlot = findEarliestSlot(
          dAssigneeId,
          dIsSub,
          displaced.estimatedDuration,
          bestCandidate.end,
          workingSteps.filter(s => s.id !== displacedId),
          allOrders,
          allOrders.find(o => o.id === displaced.orderId) || currentOrder,
          holidays
        );

        const updatedStep: ProductionStep = {
          ...displaced,
          startDate: formatDate(newSlot.start),
          startTime: formatTime(newSlot.start),
          endDate: formatDate(newSlot.end),
          endTime: formatTime(newSlot.end),
        };

        workingSteps = workingSteps.map(s => s.id === displacedId ? updatedStep : s);
        updatedSteps.push(updatedStep);
      }

      previousOpEnd = bestCandidate.end;
    }
  }

  return { newSteps, updatedSteps };
}
