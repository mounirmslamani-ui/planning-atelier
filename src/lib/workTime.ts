import type { Holiday } from '@/types/planning';

// Work schedule: 8:00-12:00, 12:30-16:00 = 7.5h = 450min per day
// Work week: Sun(0)-Thu(4). Weekend: Fri(5), Sat(6)

const WORK_MORNING_START = 8 * 60;      // 480 min = 8:00
const WORK_MORNING_END = 12 * 60;       // 720 min = 12:00
const WORK_AFTERNOON_START = 12.5 * 60; // 750 min = 12:30
const WORK_AFTERNOON_END = 16 * 60;     // 960 min = 16:00
const WORK_MINUTES_PER_DAY = 450;       // 4h + 3.5h = 7.5h

const WORK_SEGMENTS = [
  { start: WORK_MORNING_START, end: WORK_MORNING_END },       // 8:00-12:00 = 240 min
  { start: WORK_AFTERNOON_START, end: WORK_AFTERNOON_END },   // 12:30-16:00 = 210 min
];

function dateToStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6;
}

export function isHoliday(date: Date, holidays: Holiday[]): boolean {
  const str = dateToStr(date);
  return holidays.some(h => h.date === str);
}

export function isWorkDay(date: Date, holidays: Holiday[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/** Convert a time-of-day (in minutes from midnight) to work-minutes elapsed since start of that work day.
 *  Returns 0 if before work, WORK_MINUTES_PER_DAY if after work. */
function timeOfDayToWorkMinutes(minutesFromMidnight: number): number {
  let workMin = 0;
  for (const seg of WORK_SEGMENTS) {
    if (minutesFromMidnight <= seg.start) break;
    workMin += Math.min(minutesFromMidnight, seg.end) - seg.start;
  }
  return Math.max(0, workMin);
}

/** Convert work-minutes within a day back to minutes-from-midnight */
function workMinutesToTimeOfDay(workMin: number): number {
  let remaining = workMin;
  for (const seg of WORK_SEGMENTS) {
    const segDuration = seg.end - seg.start;
    if (remaining <= segDuration) {
      return seg.start + remaining;
    }
    remaining -= segDuration;
  }
  return WORK_AFTERNOON_END; // cap at end of day
}

/** Calculate work-minutes between two dates, excluding weekends, holidays, and lunch break */
export function workMinutesBetween(startDate: Date, endDate: Date, holidays: Holiday[]): number {
  if (endDate <= startDate) return 0;

  const startDay = new Date(startDate);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(endDate);
  endDay.setHours(0, 0, 0, 0);

  if (startDay.getTime() === endDay.getTime()) {
    // Same day
    if (!isWorkDay(startDate, holidays)) return 0;
    const startMin = startDate.getHours() * 60 + startDate.getMinutes();
    const endMin = endDate.getHours() * 60 + endDate.getMinutes();
    return Math.max(0, timeOfDayToWorkMinutes(endMin) - timeOfDayToWorkMinutes(startMin));
  }

  let total = 0;
  // First day
  if (isWorkDay(startDate, holidays)) {
    const startMin = startDate.getHours() * 60 + startDate.getMinutes();
    total += WORK_MINUTES_PER_DAY - timeOfDayToWorkMinutes(startMin);
  }
  // Full days in between
  const cursor = new Date(startDay);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < endDay) {
    if (isWorkDay(cursor, holidays)) total += WORK_MINUTES_PER_DAY;
    cursor.setDate(cursor.getDate() + 1);
  }
  // Last day
  if (isWorkDay(endDate, holidays)) {
    const endMin = endDate.getHours() * 60 + endDate.getMinutes();
    total += timeOfDayToWorkMinutes(endMin);
  }

  return total;
}

/** Add work-minutes to a start date, skipping weekends, holidays, and lunch break.
 *  Supports negative minutes (moving backward in time). */
export function addWorkMinutes(start: Date, minutes: number, holidays: Holiday[]): Date {
  if (minutes === 0) return new Date(start);

  if (minutes < 0) {
    return subtractWorkMinutes(start, -minutes, holidays);
  }

  let current = new Date(start);
  let remaining = minutes;

  // If starting on a non-work day, advance to next work day start
  if (!isWorkDay(current, holidays)) {
    current.setDate(current.getDate() + 1);
    while (!isWorkDay(current, holidays)) {
      current.setDate(current.getDate() + 1);
    }
    current.setHours(8, 0, 0, 0);
  }

  // Snap to work time if before/after work hours
  const curMin = current.getHours() * 60 + current.getMinutes();
  if (curMin < WORK_MORNING_START) {
    current.setHours(8, 0, 0, 0);
  } else if (curMin >= WORK_MORNING_END && curMin < WORK_AFTERNOON_START) {
    current.setHours(12, 30, 0, 0);
  } else if (curMin >= WORK_AFTERNOON_END) {
    current.setDate(current.getDate() + 1);
    while (!isWorkDay(current, holidays)) {
      current.setDate(current.getDate() + 1);
    }
    current.setHours(8, 0, 0, 0);
  }

  while (remaining > 0) {
    const curTimeMin = current.getHours() * 60 + current.getMinutes();
    const workDone = timeOfDayToWorkMinutes(curTimeMin);
    const remainingInDay = WORK_MINUTES_PER_DAY - workDone;

    if (remaining <= remainingInDay) {
      const newWorkMin = workDone + remaining;
      const newTimeOfDay = workMinutesToTimeOfDay(newWorkMin);
      current.setHours(Math.floor(newTimeOfDay / 60), newTimeOfDay % 60, 0, 0);
      remaining = 0;
    } else {
      remaining -= remainingInDay;
      // Move to next work day
      current.setDate(current.getDate() + 1);
      while (!isWorkDay(current, holidays)) {
        current.setDate(current.getDate() + 1);
      }
      current.setHours(8, 0, 0, 0);
    }
  }

  return current;
}

/** Subtract work-minutes from a date, going backward in time */
function subtractWorkMinutes(start: Date, minutes: number, holidays: Holiday[]): Date {
  let current = new Date(start);
  let remaining = minutes;

  // If starting on a non-work day, go back to previous work day end
  if (!isWorkDay(current, holidays)) {
    current.setDate(current.getDate() - 1);
    while (!isWorkDay(current, holidays)) {
      current.setDate(current.getDate() - 1);
    }
    current.setHours(16, 0, 0, 0);
  }

  // Snap to work time if outside work hours
  const curMin = current.getHours() * 60 + current.getMinutes();
  if (curMin >= WORK_AFTERNOON_END) {
    current.setHours(16, 0, 0, 0);
  } else if (curMin > WORK_MORNING_END && curMin < WORK_AFTERNOON_START) {
    current.setHours(12, 0, 0, 0);
  } else if (curMin <= WORK_MORNING_START) {
    current.setDate(current.getDate() - 1);
    while (!isWorkDay(current, holidays)) {
      current.setDate(current.getDate() - 1);
    }
    current.setHours(16, 0, 0, 0);
  }

  while (remaining > 0) {
    const curTimeMin = current.getHours() * 60 + current.getMinutes();
    const workDone = timeOfDayToWorkMinutes(curTimeMin);

    if (remaining <= workDone) {
      const newWorkMin = workDone - remaining;
      const newTimeOfDay = workMinutesToTimeOfDay(newWorkMin);
      current.setHours(Math.floor(newTimeOfDay / 60), newTimeOfDay % 60, 0, 0);
      remaining = 0;
    } else {
      remaining -= workDone;
      // Move to previous work day end
      current.setDate(current.getDate() - 1);
      while (!isWorkDay(current, holidays)) {
        current.setDate(current.getDate() - 1);
      }
      current.setHours(16, 0, 0, 0);
    }
  }

  return current;
}

/** For Gantt: calculate cumulative work-minutes from a zero date to a target date */
export function workMinutesFromZero(zeroDate: Date, targetDate: Date, holidays: Holiday[]): number {
  if (targetDate >= zeroDate) {
    return workMinutesBetween(zeroDate, targetDate, holidays);
  }
  return -workMinutesBetween(targetDate, zeroDate, holidays);
}

/** Generate work-time slots for Gantt grid lines within a date range */
export interface WorkSlot {
  date: Date;
  startMinOfDay: number; // minutes from midnight
  endMinOfDay: number;
  label: string; // e.g. "8:00"
}

export function getWorkSlotsForRange(
  zeroDate: Date,
  numWorkDays: number,
  holidays: Holiday[]
): { date: Date; dayLabel: string; segments: { startMin: number; endMin: number }[] }[] {
  const result: { date: Date; dayLabel: string; segments: { startMin: number; endMin: number }[] }[] = [];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const cursor = new Date(zeroDate);
  cursor.setHours(0, 0, 0, 0);

  let found = 0;
  let scanned = 0;
  while (found < numWorkDays && scanned < numWorkDays * 3) {
    const d = new Date(cursor);
    if (isWorkDay(d, holidays)) {
      result.push({
        date: d,
        dayLabel: `${dayNames[d.getDay()]} ${d.getDate()}`,
        segments: WORK_SEGMENTS.map(s => ({ startMin: s.start, endMin: s.end })),
      });
      found++;
    }
    cursor.setDate(cursor.getDate() + 1);
    scanned++;
  }
  return result;
}

export { WORK_MINUTES_PER_DAY, WORK_SEGMENTS, WORK_MORNING_START, WORK_AFTERNOON_END };
