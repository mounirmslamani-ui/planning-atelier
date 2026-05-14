import type {
  Order,
  ProductionStep,
  ProductionRecord,
  QualityControlEntry,
  DeliveryEntry,
  DeliveredOrder,
} from '@/types/planning';
import { getOrderGlobalStatus } from '@/lib/stepProgress';
import { isReintegratedOrder } from '@/lib/reintegration';

/**
 * Set of order IDs that must be excluded from the preparation lists
 * (Achat matières / Achat outillage / Étude).
 *
 * An order is excluded when it has reached one of the post-fabrication stages:
 *   - QC decision = conforme / conforme-derogation (transient — usually moves to delivery)
 *   - في انتظار التسليم  (delivery_entries row exists)
 *   - مسلّمة             (delivered_orders row exists)
 *   - مفوترة             (delivered_orders row with invoice_number)
 *   - ملغاة              (cancelled_orders row exists)
 *   - global production status = 'Terminée' (all active steps done — ready for QC)
 *
 * Reintegrated orders (SAV / Reprise/Retouche) are KEPT visible only when their
 * production is back to "En cours" with new active steps requiring the resource.
 * Once their new cycle is delivered again, they leave the list automatically.
 */
export function buildOutOfPreparationFlowSet(args: {
  orders: Order[];
  steps: ProductionStep[];
  productionRecords: ProductionRecord[];
  qcEntries: QualityControlEntry[];
  deliveryEntries: DeliveryEntry[];
  deliveredOrders: DeliveredOrder[];
  cancelledOrders: { orderId: string }[];
  absenceOperationId: string;
}): Set<string> {
  const { orders, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOperationId } = args;
  const ids = new Set<string>();

  deliveryEntries.forEach(d => ids.add(d.orderId));
  deliveredOrders.forEach(d => ids.add(d.orderId));
  cancelledOrders.forEach(c => ids.add(c.orderId));
  qcEntries.forEach(q => {
    if (q.decision === 'conforme' || q.decision === 'conforme-derogation') ids.add(q.orderId);
  });

  // Orders whose entire active production is finished are "ready for QC" and
  // must no longer appear in preparation lists either.
  orders.forEach(o => {
    const hasActiveStep = steps.some(s => s.orderId === o.id && s.operationId !== absenceOperationId);
    if (!hasActiveStep) return;
    const g = getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId);
    if (g === 'Terminée') ids.add(o.id);
  });

  // SAV / Reintegration override: if a reintegrated order is back to "En cours"
  // it must reappear in preparation lists when one of its new steps still
  // requires a resource. We strip it from the exclusion set; the per-page
  // resource-status filter then decides whether to actually show it.
  orders.forEach(o => {
    if (!isReintegratedOrder(o)) return;
    const g = getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId);
    if (g === 'En cours' || g === 'En attente') ids.delete(o.id);
  });

  return ids;
}
