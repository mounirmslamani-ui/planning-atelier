import type { Holiday, ProductionStep, ProductionRecord } from '@/types/planning';
import { addWorkMinutes, isWorkDay } from '@/lib/workTime';
import { getStepProgressStatus } from '@/lib/stepProgress';

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Next work day at 08:00 starting from `from` (inclusive). */
function nextWorkStart(from: Date, holidays: Holiday[]): Date {
  const d = new Date(from);
  d.setHours(8, 0, 0, 0);
  while (!isWorkDay(d, holidays)) {
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
  }
  return d;
}

export interface ResyncResult {
  shifted: ProductionStep[];
  skipped: number;
}

/**
 * Find every unfinished step whose planned dates are in the past and shift them
 * forward, keeping the estimated duration. Frozen steps keep their lock state,
 * but are still moved because an active locked task must never be hidden.
 * Returns the new step objects (mutation is up to the caller).
 */
export function computeResyncedSteps(
  steps: ProductionStep[],
  records: ProductionRecord[],
  holidays: Holiday[],
  absenceOperationId: string,
  absenceOrderId: string,
  today: Date = new Date(),
): ResyncResult {
  const anchor = nextWorkStart(today, holidays);
  const anchorISO = isoDate(anchor);
  const result: ProductionStep[] = [];
  let skipped = 0;

  // Group by operator to keep tasks chained instead of overlapping.
  const byOp = new Map<string, ProductionStep[]>();

  for (const step of steps) {
    if (!step.operatorId && !step.subcontractorId) continue;
    if (step.subcontractorId) continue; // subcontractor planning handled elsewhere
    if (step.operationId === absenceOperationId) continue;
    if (step.orderId === absenceOrderId) continue;
    if (getStepProgressStatus(step, records) === 'Terminée') continue;
    if (step.startDate && step.endDate && step.startDate >= anchorISO && step.endDate >= anchorISO) continue;

    const key = step.operatorId!;
    if (!byOp.has(key)) byOp.set(key, []);
    byOp.get(key)!.push(step);
  }

  byOp.forEach((opSteps) => {
    // Preserve original chronological order
    opSteps.sort((a, b) => {
      const ka = `${a.startDate}T${a.startTime || '08:00'}`;
      const kb = `${b.startDate}T${b.startTime || '08:00'}`;
      return ka.localeCompare(kb);
    });

    let cursor = new Date(anchor);
    for (const step of opSteps) {
      const duration = step.estimatedDuration || 0;
      if (duration <= 0) { skipped++; continue; }
      const start = new Date(cursor);
      const end = addWorkMinutes(start, duration, holidays);
      result.push({
        ...step,
        startDate: isoDate(start),
        startTime: hhmm(start),
        endDate: isoDate(end),
        endTime: hhmm(end),
      });
      cursor = end;
    }
  });

  return { shifted: result, skipped };
}
