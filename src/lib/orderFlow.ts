/**
 * Order flow helpers — Partial Quality Control & Partial Delivery.
 *
 * A single order can now have multiple QC sessions and multiple delivery
 * sessions (each represented by a row with its own `*_qty`). Legacy entries
 * with NULL qty are treated as "covers the full order quantity" for
 * back-compat.
 */
import type { Order, QualityControlEntry, DeliveryEntry, DeliveredOrder } from '@/types/planning';
import { isReintegratedOrder } from '@/lib/reintegration';

const fullQty = (o: Order | undefined | null): number => (o?.quantity ?? 0);

/**
 * Backward-compat helpers retained for callers that pre-date the
 * partial-QC/Delivery model. They answer the binary question
 * "is this order currently in a post-production flow (and therefore
 *  must not appear in active-production / preparation lists)?".
 *
 * A reintegrated order (SAV/Reprise) is considered back in active production
 * and returns false until it reaches the post-production flow again.
 */
export function hasCurrentPostProductionFlow(
  order: Pick<Order, 'id' | 'observation' | 'reintegratedAt'>,
  data: {
    qcEntries: { orderId: string }[];
    deliveryEntries: { orderId: string }[];
    deliveredOrders: { orderId: string }[];
    cancelledOrders: { orderId: string }[];
  },
): boolean {
  if (isReintegratedOrder(order)) return false;
  return (
    data.qcEntries.some(e => e.orderId === order.id) ||
    data.deliveryEntries.some(e => e.orderId === order.id) ||
    data.deliveredOrders.some(e => e.orderId === order.id) ||
    data.cancelledOrders.some(e => e.orderId === order.id)
  );
}

export function buildOutOfActiveProductionSet(
  orders: Pick<Order, 'id' | 'observation' | 'reintegratedAt'>[],
  data: {
    qcEntries: { orderId: string }[];
    deliveryEntries: { orderId: string }[];
    deliveredOrders: { orderId: string }[];
    cancelledOrders: { orderId: string }[];
  },
): Set<string> {
  const ids = new Set<string>();
  orders.forEach(o => {
    if (hasCurrentPostProductionFlow(o, data)) ids.add(o.id);
  });
  return ids;
}


// ──────────────── Quality Control ────────────────

export function getQCControlled(orderId: string, qc: QualityControlEntry[], orderQty: number): number {
  return qc
    .filter(q => q.orderId === orderId)
    .reduce((s, q) => s + (q.controlledQty ?? orderQty), 0);
}

export function getQCAccepted(orderId: string, qc: QualityControlEntry[], orderQty: number): number {
  return qc
    .filter(q => q.orderId === orderId)
    .reduce((s, q) => {
      if (q.acceptedQty != null) return s + q.acceptedQty;
      // legacy entry without qty: full order if decision is accept-style
      if (q.decision === 'conforme' || q.decision === 'conforme-derogation') return s + orderQty;
      return s;
    }, 0);
}

export function isQCForceClosed(orderId: string, qc: QualityControlEntry[]): boolean {
  return qc.some(q => q.orderId === orderId && q.forceClosed);
}

export function getQCRemaining(order: Order, qc: QualityControlEntry[]): number {
  if (isQCForceClosed(order.id, qc)) return 0;
  return Math.max(0, fullQty(order) - getQCControlled(order.id, qc, order.quantity));
}

/** True when the order's QC is fully done (controlled = qty) or force-closed. */
export function isQCClosed(order: Order, qc: QualityControlEntry[]): boolean {
  return getQCRemaining(order, qc) <= 0;
}

// ──────────────── Delivery ────────────────

export function getDeliveredQty(orderId: string, delivered: DeliveredOrder[], orderQty: number): number {
  return delivered
    .filter(d => d.orderId === orderId)
    .reduce((s, d) => s + (d.deliveredQty ?? orderQty), 0);
}

export function getReadyQty(orderId: string, entries: DeliveryEntry[], orderQty: number): number {
  return entries
    .filter(d => d.orderId === orderId)
    .reduce((s, d) => s + (d.deliveredQty ?? orderQty), 0);
}

export function isDeliveryForceClosed(orderId: string, delivered: DeliveredOrder[]): boolean {
  return delivered.some(d => d.orderId === orderId && d.forceClosed);
}

/**
 * Quantity that has been accepted by QC but not yet shipped.
 *  deliverable = accepted − delivered  (clamped at 0)
 */
export function getDeliverableRemaining(
  order: Order,
  qc: QualityControlEntry[],
  delivered: DeliveredOrder[],
): number {
  const accepted = getQCAccepted(order.id, qc, order.quantity);
  const shipped = getDeliveredQty(order.id, delivered, order.quantity);
  return Math.max(0, accepted - shipped);
}

export function getDeliveryRemaining(order: Order, delivered: DeliveredOrder[]): number {
  if (isDeliveryForceClosed(order.id, delivered)) return 0;
  return Math.max(0, fullQty(order) - getDeliveredQty(order.id, delivered, order.quantity));
}

export function isDeliveryClosed(order: Order, delivered: DeliveredOrder[]): boolean {
  return getDeliveryRemaining(order, delivered) <= 0;
}
