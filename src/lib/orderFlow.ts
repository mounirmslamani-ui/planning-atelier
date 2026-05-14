import type {
  CancelledOrder,
  DeliveryEntry,
  DeliveredOrder,
  Order,
  QualityControlEntry,
} from '@/types/planning';

function isMarkerCurrent(markerTimestamp: string | undefined, reintegratedAt: string | undefined): boolean {
  if (!reintegratedAt) return true;
  if (!markerTimestamp) return true;

  // Date-only values represent a whole day. Treat the same day as current so a
  // second QC/delivery cycle cannot remain visible in active production.
  if (/^\d{4}-\d{2}-\d{2}$/.test(markerTimestamp)) {
    return markerTimestamp >= reintegratedAt.slice(0, 10);
  }

  const markerTime = Date.parse(markerTimestamp);
  const reintegrationTime = Date.parse(reintegratedAt);
  if (Number.isNaN(markerTime) || Number.isNaN(reintegrationTime)) return true;
  return markerTime >= reintegrationTime;
}

export function isDeliveryEntryCurrentForOrder(order: Pick<Order, 'id' | 'reintegratedAt'>, entry: DeliveryEntry): boolean {
  return entry.orderId === order.id && isMarkerCurrent(entry.movedAt || entry.controlDate, order.reintegratedAt);
}

export function isDeliveredOrderCurrentForOrder(order: Pick<Order, 'id' | 'reintegratedAt'>, entry: DeliveredOrder): boolean {
  return entry.orderId === order.id && isMarkerCurrent(entry.createdAt || entry.deliveryDate, order.reintegratedAt);
}

export function isConformingQCEntryCurrentForOrder(order: Pick<Order, 'id' | 'reintegratedAt'>, entry: QualityControlEntry): boolean {
  return entry.orderId === order.id
    && (entry.decision === 'conforme' || entry.decision === 'conforme-derogation')
    && isMarkerCurrent(entry.createdAt || entry.controlDate, order.reintegratedAt);
}

export function hasCurrentPostProductionFlow(order: Pick<Order, 'id' | 'reintegratedAt'>, flow: {
  qcEntries: QualityControlEntry[];
  deliveryEntries: DeliveryEntry[];
  deliveredOrders: DeliveredOrder[];
  cancelledOrders: CancelledOrder[];
}): boolean {
  if (flow.cancelledOrders.some(entry => entry.orderId === order.id)) return true;
  if (flow.deliveryEntries.some(entry => isDeliveryEntryCurrentForOrder(order, entry))) return true;
  if (flow.deliveredOrders.some(entry => isDeliveredOrderCurrentForOrder(order, entry))) return true;
  return flow.qcEntries.some(entry => isConformingQCEntryCurrentForOrder(order, entry));
}

export function buildOutOfActiveProductionSet(orders: Order[], flow: {
  qcEntries: QualityControlEntry[];
  deliveryEntries: DeliveryEntry[];
  deliveredOrders: DeliveredOrder[];
  cancelledOrders: CancelledOrder[];
}): Set<string> {
  const ids = new Set<string>();
  orders.forEach(order => {
    if (hasCurrentPostProductionFlow(order, flow)) ids.add(order.id);
  });
  return ids;
}