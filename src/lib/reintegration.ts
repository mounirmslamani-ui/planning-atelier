import type { Order } from '@/types/planning';

/** Legacy marker kept in observation for backward compatibility */
export const REINTEGRATION_TAG = '⟲ Reprise/Retouche';

/**
 * An order is "reintegrated" once it has been pushed back from QC / Delivery /
 * Delivered / Pending-invoicing into الطلبيات الحالية.
 *
 * The authoritative signal is the persistent `reintegratedAt` column (set by
 * useReintegrateOrder and never touched when the user edits the observation).
 * The observation tag is kept as a fallback for legacy rows that predate the
 * column.
 */
export function isReintegratedOrder(order: Pick<Order, 'observation' | 'reintegratedAt'> | undefined | null): boolean {
  if (!order) return false;
  if (order.reintegratedAt) return true;
  return !!order.observation && order.observation.includes(REINTEGRATION_TAG);
}
