import type { Order } from '@/types/planning';

/** Marker placed in observation by useReintegrateOrder */
export const REINTEGRATION_TAG = '⟲ Reprise/Retouche';

/**
 * An order is "reintegrated" once it has been pushed back from QC / Delivery /
 * Delivered / Pending-invoicing into الطلبيات الحالية. We detect this via the
 * persistent observation marker so that the active list shows it again EVEN IF
 * an invoiced delivered_orders row was preserved for accounting integrity.
 */
export function isReintegratedOrder(order: Pick<Order, 'observation'> | undefined | null): boolean {
  if (!order?.observation) return false;
  return order.observation.includes(REINTEGRATION_TAG);
}
