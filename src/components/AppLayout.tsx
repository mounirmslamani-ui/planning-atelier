import React, { useCallback, useEffect, useState } from 'react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import AppSidebar from './AppSidebar';
import { usePlanning } from '@/context/PlanningContext';
import { buildOrderQualityControlErrorMessage, getOrderQualityControlCheck } from '@/lib/stepProgress';
import { fetchAllData } from '@/lib/supabase-data';
import { hasCurrentPostProductionFlow } from '@/lib/orderFlow';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, orders, steps, productionRecords, absenceOperationId, absenceOrderId, qcEntries, addQCEntry, deliveryEntries, deliveredOrders, cancelledOrders } = usePlanning();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const transferOrderToQualityControl = useCallback((orderId: string) => {
    if (orderId === absenceOrderId) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (qcEntries.some(entry => entry.orderId === orderId)) return;
    if (hasCurrentPostProductionFlow(order, { qcEntries, deliveryEntries, deliveredOrders, cancelledOrders })) return;
    addQCEntry({
      id: crypto.randomUUID(),
      orderId,
      controlDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    });
  }, [absenceOrderId, orders, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, addQCEntry]);

  useEffect(() => {
    if (loading) return;
    orders.forEach(order => {
      if (order.id === absenceOrderId) return;
      if (qcEntries.some(entry => entry.orderId === order.id)) return;
      if (hasCurrentPostProductionFlow(order, { qcEntries, deliveryEntries, deliveredOrders, cancelledOrders })) return;
      const check = getOrderQualityControlCheck(order.id, steps, productionRecords, absenceOperationId);
      if (check.isReady) transferOrderToQualityControl(order.id);
    });
  }, [loading, orders, steps, productionRecords, absenceOperationId, absenceOrderId, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, transferOrderToQualityControl]);

  const handleProdDrop = useCallback((stepId: string) => {
    window.dispatchEvent(new CustomEvent('prod-register-drop', { detail: { stepId } }));
  }, []);

  const handleQcDrop = useCallback((stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step || step.orderId === absenceOrderId) return;

    const tryTransfer = async () => {
      let stepsForCheck = steps;
      let recordsForCheck = productionRecords;
      let check = getOrderQualityControlCheck(step.orderId, stepsForCheck, recordsForCheck, absenceOperationId);

      if (!check.isReady) {
        const freshData = await fetchAllData();
        stepsForCheck = freshData.steps;
        recordsForCheck = freshData.productionRecords;
        check = getOrderQualityControlCheck(step.orderId, stepsForCheck, recordsForCheck, absenceOperationId);
      }

      if (!check.isReady) {
        const reason = buildOrderQualityControlErrorMessage(step.orderId, stepsForCheck, recordsForCheck, absenceOperationId);
        window.alert(`Impossible de transférer : certaines étapes ne sont pas encore terminées. ${reason}`);
        return;
      }

      transferOrderToQualityControl(step.orderId);
    };

    void tryTransfer();
  }, [steps, absenceOrderId, productionRecords, absenceOperationId, transferOrderToQualityControl]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">Chargement des données…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <AppSidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(open => !open)} onProdDrop={handleProdDrop} onQcDrop={handleQcDrop} />
            <main className="min-w-0 flex-1 overflow-auto h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
