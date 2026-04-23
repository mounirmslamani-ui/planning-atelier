import type { Order, ProductionStep, ResourceStatus } from '@/types/planning';

/**
 * A step is considered "blocked" when its Matière OR Outillage status
 * is red (non-disponible) or orange (partiel).
 * Étude is intentionally NOT considered here per spec.
 */
const isBlockingStatus = (status: ResourceStatus): boolean => status === 'partiel' || status === 'non-disponible';

function getOrderResourceStatus(order: Order | undefined, field: 'material' | 'tooling'): ResourceStatus | undefined {
  if (!order) return undefined;
  if (field === 'material') return order.materialStatus ?? (order.materialAvailable ? 'disponible' : 'non-disponible');
  return order.toolingStatus ?? (order.toolingAvailable ? 'disponible' : 'non-disponible');
}

export function isStepSelfBlocked(step: ProductionStep, order?: Order): boolean {
  const m: ResourceStatus =
    getOrderResourceStatus(order, 'material') ?? step.materialStatus ?? (step.materialAvailable ? 'disponible' : 'non-disponible');
  const t: ResourceStatus =
    getOrderResourceStatus(order, 'tooling') ?? step.toolingStatus ?? (step.toolingAvailable ? 'disponible' : 'non-disponible');
  return isBlockingStatus(m) || isBlockingStatus(t);
}

/** A command is blocked immediately when Matière OR Outillage is red/orange, even before steps exist. */
export function isOrderSelfBlocked(order: Order): boolean {
  const m: ResourceStatus = order.materialStatus ?? (order.materialAvailable ? 'disponible' : 'non-disponible');
  const t: ResourceStatus = order.toolingStatus ?? (order.toolingAvailable ? 'disponible' : 'non-disponible');
  return isBlockingStatus(m) || isBlockingStatus(t);
}

/**
 * Returns the set of step IDs (across all orders) that must be displayed in
 * "blocked" (violet) style: as soon as one step in an order is self-blocked,
 * that step AND all its successor steps in the same order are blocked.
 *
 * If ALL steps of an order have material AND tooling green, none are blocked.
 */
export function computeBlockedStepIds(allSteps: ProductionStep[], allOrders: Order[] = []): Set<string> {
  const blocked = new Set<string>();
  const ordersById = new Map(allOrders.map(o => [o.id, o]));
  const blockedOrderIds = new Set(allOrders.filter(isOrderSelfBlocked).map(o => o.id));
  // Group by orderId
  const byOrder = new Map<string, ProductionStep[]>();
  for (const s of allSteps) {
    if (!byOrder.has(s.orderId)) byOrder.set(s.orderId, []);
    byOrder.get(s.orderId)!.push(s);
  }
  for (const [, steps] of byOrder) {
    const ordered = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const order = ordersById.get(ordered[0]?.orderId);
    let hit = blockedOrderIds.has(ordered[0]?.orderId);
    for (const s of ordered) {
      if (!hit && isStepSelfBlocked(s, order)) hit = true;
      if (hit) blocked.add(s.id);
    }
  }
  return blocked;
}

/** Returns true if the given order has at least one self-blocked step. */
export function isOrderBlocked(orderId: string, allSteps: ProductionStep[], allOrders: Order[] = []): boolean {
  const order = allOrders.find(o => o.id === orderId);
  if (order) return isOrderSelfBlocked(order);
  return allSteps.some(s => s.orderId === orderId && isStepSelfBlocked(s));
}

/** Tailwind classes to apply to blocked cells/rows in synthesis tables (keep text colors). */
export const BLOCKED_TABLE_BG_CLASS = 'bg-blocked';
export const BLOCKED_TABLE_ROW_CLASS = 'bg-blocked hover:bg-blocked/90';

/** Tailwind classes to apply to blocked rows in input modals (black text). */
export const BLOCKED_MODAL_ROW_CLASS = 'bg-blocked text-blocked-foreground hover:bg-blocked/90';

/** Backward-compatible aliases for table usage. */
export const BLOCKED_BG_CLASS = BLOCKED_TABLE_BG_CLASS;
export const BLOCKED_ROW_CLASS = BLOCKED_TABLE_ROW_CLASS;
