import type { ProductionStep, ResourceStatus } from '@/types/planning';

/**
 * A step is considered "blocked" when its Matière OR Outillage status
 * is red (non-disponible) or orange (partiel).
 * Étude is intentionally NOT considered here per spec.
 */
export function isStepSelfBlocked(step: ProductionStep): boolean {
  const m: ResourceStatus =
    step.materialStatus ?? (step.materialAvailable ? 'disponible' : 'non-disponible');
  const t: ResourceStatus =
    step.toolingStatus ?? (step.toolingAvailable ? 'disponible' : 'non-disponible');
  const bad = (s: ResourceStatus) => s === 'partiel' || s === 'non-disponible';
  return bad(m) || bad(t);
}

/**
 * Returns the set of step IDs (across all orders) that must be displayed in
 * "blocked" (violet) style: as soon as one step in an order is self-blocked,
 * that step AND all its successor steps in the same order are blocked.
 *
 * If ALL steps of an order have material AND tooling green, none are blocked.
 */
export function computeBlockedStepIds(allSteps: ProductionStep[]): Set<string> {
  const blocked = new Set<string>();
  // Group by orderId
  const byOrder = new Map<string, ProductionStep[]>();
  for (const s of allSteps) {
    if (!byOrder.has(s.orderId)) byOrder.set(s.orderId, []);
    byOrder.get(s.orderId)!.push(s);
  }
  for (const [, steps] of byOrder) {
    const ordered = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let hit = false;
    for (const s of ordered) {
      if (!hit && isStepSelfBlocked(s)) hit = true;
      if (hit) blocked.add(s.id);
    }
  }
  return blocked;
}

/** Returns true if the given order has at least one self-blocked step. */
export function isOrderBlocked(orderId: string, allSteps: ProductionStep[]): boolean {
  return allSteps.some(s => s.orderId === orderId && isStepSelfBlocked(s));
}

/** Tailwind classes to apply to a blocked cell/row. */
export const BLOCKED_BG_CLASS = 'bg-[hsl(270,55%,50%)] text-white';
export const BLOCKED_ROW_CLASS = 'bg-[hsl(270,55%,50%)] text-white hover:bg-[hsl(270,55%,45%)]';
