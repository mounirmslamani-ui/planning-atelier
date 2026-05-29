import React, { useCallback, useEffect, useState } from 'react';
import AppSidebar from './AppSidebar';
import { usePlanning } from '@/context/PlanningContext';
import { buildOrderQualityControlErrorMessage, getOrderQualityControlCheck } from '@/lib/stepProgress';
import { fetchAllData } from '@/lib/supabase-data';
import { hasCurrentPostProductionFlow } from '@/lib/orderFlow';
import { PanelLeftOpen } from 'lucide-react';

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
    <div className="flex h-screen w-full overflow-hidden">
      <button
        type="button"
        aria-label={isSidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
        onClick={() => setIsSidebarOpen(open => !open)}
        className={`fixed right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition-transform hover:bg-accent hover:text-accent-foreground ${isSidebarOpen ? '-translate-x-60' : 'translate-x-0'}`}
      >
        <PanelLeftOpen className="h-5 w-5" />
      </button>
      <AppSidebar isOpen={isSidebarOpen} onProdDrop={handleProdDrop} onQcDrop={handleQcDrop} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
