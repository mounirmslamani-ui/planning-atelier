import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { usePlanning } from '@/context/PlanningContext';
import type { Order } from '@/types/planning';

/**
 * Reintegration of an order from QC / Ready for delivery / Delivered / Pending invoicing
 * back into "Active orders" (الطلبيات الحالية).
 *
 * Rules:
 * - Order is bumped to priority P1 and tagged as "Reprise/Retouche" via observation.
 * - QC entries and Delivery entries linked to that order are removed (so the order
 *   reappears in active flows and the planning dialog is unlocked).
 * - Delivered record:
 *     • If it has an invoice number → KEEP IT INTACT (financial integrity).
 *       The order is still removed from "active" delivered tables because
 *       a new production cycle is starting; the historical invoice stays in DB.
 *     • If no invoice yet → delete the delivered record (clears delivery date).
 * - Existing production steps remain so history is preserved; new corrective
 *   steps can be added through the normal planning dialog (now unlocked).
 */
export function useReintegrateOrder() {
  const {
    orders, qcEntries, deliveryEntries, deliveredOrders,
    deleteQCEntry, deleteDeliveryEntry, deleteDeliveredOrder,
    updateOrder,
  } = usePlanning();

  const [pending, setPending] = useState<{ orderId: string } | null>(null);

  const requestReintegrate = useCallback((orderId: string) => {
    setPending({ orderId });
  }, []);

  const cancelReintegrate = useCallback(() => setPending(null), []);

  const confirmReintegrate = useCallback(() => {
    if (!pending) return;
    const orderId = pending.orderId;
    const order = orders.find(o => o.id === orderId);
    if (!order) { setPending(null); return; }

    // 1. Remove QC entries
    qcEntries.filter(q => q.orderId === orderId).forEach(q => deleteQCEntry(q.id));
    // 2. Remove delivery (ready-for-delivery) entries
    deliveryEntries.filter(d => d.orderId === orderId).forEach(d => deleteDeliveryEntry(d.id));
    // 3. Delivered entries: only delete if NOT invoiced (preserve accounting trail)
    const delivered = deliveredOrders.filter(d => d.orderId === orderId);
    for (const d of delivered) {
      if (!d.invoiceNumber) {
        deleteDeliveredOrder(d.id);
      }
      // else: keep the row intact (invoice_number + delivery_date preserved)
    }

    // 4. Bump priority + mark as "Reprise/Retouche" in the observation
    // 4. Bump priority + mark as "Reprise/Retouche" (persistent column + observation tag for visibility)
    const reprisedTag = '⟲ Reprise/Retouche';
    const baseObs = (order.observation || '').replace(/⟲ Reprise\/Retouche\s*[—-]?\s*/g, '').trim();
    const stamp = new Date().toLocaleDateString('fr-FR');
    const nextObs = `${reprisedTag} (${stamp})${baseObs ? ` — ${baseObs}` : ''}`;
    const next: Order = { ...order, priority: 'P1', observation: nextObs, reintegratedAt: order.reintegratedAt || new Date().toISOString() };
    updateOrder(next);

    toast.success(`Commande ${order.orderNumber} réintégrée dans 'الطلبيات الحالية' (P1 — Reprise)`);
    setPending(null);
  }, [pending, orders, qcEntries, deliveryEntries, deliveredOrders, deleteQCEntry, deleteDeliveryEntry, deleteDeliveredOrder, updateOrder]);

  return { pending, requestReintegrate, confirmReintegrate, cancelReintegrate };
}
