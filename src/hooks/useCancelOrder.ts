import { useCallback } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import type { CancelledOrder } from '@/types/planning';
import { toast } from 'sonner';

/**
 * Cancels an order: removes it from the active workshop list (orders table)
 * and inserts a snapshot row into cancelled_orders.
 *
 * Distinct from deleteOrder which permanently destroys data.
 */
export function useCancelOrder() {
  const { orders, clients, deleteOrder, addCancelledOrder } = usePlanning();

  return useCallback(async (orderId: string, data: { cancelDate: string; reason: string; note: string }) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      toast.error('Commande introuvable');
      return false;
    }

    const clientName = clients.find(c => c.id === order.clientId)?.name;
    const entry: CancelledOrder = {
      id: crypto.randomUUID(),
      orderId: order.id,
      orderNumberSnapshot: order.orderNumber,
      clientNameSnapshot: clientName,
      designationSnapshot: order.designation,
      quantitySnapshot: order.quantity,
      orderDateSnapshot: order.orderDate || undefined,
      cancelDate: data.cancelDate,
      reason: data.reason,
      note: data.note || undefined,
    };

    const ok = await addCancelledOrder(entry);
    if (!ok) {
      toast.error("Échec de l'annulation");
      return false;
    }

    // Remove order from active list (and its dependent QC/delivery if any)
    // Note: order itself stays in DB (preserved in سجل الطلبيات registry).
    // Only the active workshop view filters out cancelled orders.
    toast.success(`Commande ${order.orderNumber} annulée`);
    return true;
  }, [orders, clients, addCancelledOrder]);
}
