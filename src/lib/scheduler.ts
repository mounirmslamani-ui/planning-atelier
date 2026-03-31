import type { ProductionStep, Order, Holiday, OrderPriority, Equipment } from '@/types/planning';
import { addWorkMinutes } from './workTime';

export interface OperationToSchedule {
  operationId: string;
  estimatedDuration: number; // in minutes
  options: { id: string; isSub: boolean }[];
  equipmentIds?: string[];
}

// Module-level absence operation ID — set by context after initial load
let _absenceOpId = '';
export function setAbsenceOpId(id: string) { _absenceOpId = id; }
export function getAbsenceOpId() { return _absenceOpId; }

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
    'P1': 1, 'P2': 2, 'P3': 3, 'P4': 4, 'P5': 5,
  };
  return p ? (map[p] ?? 9999) : 9999;
}

/** An order is "blocked" if material, tooling, or study is unavailable */
function isOrderBlocked(order: Order): boolean {
  return !order.materialAvailable || !order.toolingAvailable || !order.studyReady;
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
  holidays: Holiday[],
  requiredEquipmentIds?: string[],
  equipments?: Equipment[]
): ScheduleCandidate {
  const assigneeSteps = allSteps.filter(s =>
    isSub ? s.subcontractorId === assigneeId : (s.operatorId === assigneeId && !s.subcontractorId)
  );

  // Frozen steps are immovable obstacles — never displaced

  const currentScore = orderScore(currentOrder);

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

    // Never displace absences or frozen steps
    if (existing.step.operationId === 'op-8' || existing.step.frozen) {
      if (candidate < existing.end) candidate = new Date(existing.end);
      continue;
    }

    const existingOrder = existing.order;
    const existingScore = orderScore(existingOrder);

    // Can displace if:
    // 1. Current order has strictly higher priority (lower score), OR
    // 2. Same score but current deadline is earlier, OR
    // 3. Existing order is blocked (missing material/tooling)
    const currentDeadline = currentOrder.deliveryDeadline || currentOrder.plannedDeadline || '9999-12-31';
    const existingDeadline = existingOrder?.deliveryDeadline || existingOrder?.plannedDeadline || '9999-12-31';

    const canDisplace =
      (existingOrder && isOrderBlocked(existingOrder)) ||
      currentScore < existingScore ||
      (currentScore === existingScore && currentDeadline < existingDeadline);

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
  holidays: Holiday[],
  equipments?: Equipment[]
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

    // Check equipment availability — skip if any required equipment is "En panne"
    const requiredEqIds = op.equipmentIds || [];
    if (equipments && requiredEqIds.length > 0) {
      const allAvailable = requiredEqIds.every(eqId => {
        const eq = equipments.find(e => e.id === eqId);
        return eq && eq.state !== 'En panne';
      });
      if (!allAvailable) continue; // skip this operation — equipment unavailable
    }

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
        holidays,
        requiredEqIds,
        equipments
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
        equipmentIds: requiredEqIds.length > 0 ? requiredEqIds : undefined,
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
