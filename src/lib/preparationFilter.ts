import type {
  Order,
  ProductionStep,
  ProductionRecord,
  QualityControlEntry,
  DeliveryEntry,
  DeliveredOrder,
} from '@/types/planning';
import { getOrderGlobalStatus } from '@/lib/stepProgress';
import { hasCurrentPostProductionFlow } from '@/lib/orderFlow';

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

  orders.forEach(o => {
    if (hasCurrentPostProductionFlow(o, { qcEntries, deliveryEntries, deliveredOrders, cancelledOrders })) ids.add(o.id);
  });

  // Orders whose entire active production is finished are "ready for QC" and
  // must no longer appear in preparation lists either.
  orders.forEach(o => {
    const hasActiveStep = steps.some(s => s.orderId === o.id && s.operationId !== absenceOperationId);
    if (!hasActiveStep) return;
    const g = getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId);
    if (g === 'Terminée') ids.add(o.id);
  });

  return ids;
}
