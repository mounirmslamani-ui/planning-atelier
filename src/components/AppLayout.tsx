import React, { useCallback } from 'react';
import AppSidebar from './AppSidebar';
import { usePlanning } from '@/context/PlanningContext';
import { buildOrderQualityControlErrorMessage, getOrderQualityControlCheck } from '@/lib/stepProgress';
import { fetchAllData } from '@/lib/supabase-data';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, steps, productionRecords, absenceOperationId, absenceOrderId, qcEntries, addQCEntry } = usePlanning();

  const handleProdDrop = useCallback((stepId: string) => {
    window.dispatchEvent(new CustomEvent('prod-register-drop', { detail: { stepId } }));
  }, []);

  const handleQcDrop = useCallback((stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step || step.orderId === absenceOrderId) return;

    const tryTransfer = async () => {
      let check = getOrderQualityControlCheck(step.orderId, steps, productionRecords, absenceOperationId);

      if (!check.isReady) {
        const freshData = await fetchAllData();
        check = getOrderQualityControlCheck(step.orderId, freshData.steps, freshData.productionRecords, absenceOperationId);
      }

      if (!check.isReady) {
        const reason = buildOrderQualityControlErrorMessage(step.orderId, check.details.map(detail => detail.step), productionRecords, absenceOperationId);
        window.alert(`Impossible de transférer : certaines étapes ne sont pas encore terminées. ${reason}`);
        return;
      }

      if (!qcEntries.some(entry => entry.orderId === step.orderId)) {
        addQCEntry({
          id: crypto.randomUUID(),
          orderId: step.orderId,
          controlDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
        });
      }
    };

    void tryTransfer();
  }, [steps, absenceOrderId, productionRecords, absenceOperationId, qcEntries, addQCEntry]);

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
    <div className="flex min-h-screen">
      <AppSidebar onProdDrop={handleProdDrop} onQcDrop={handleQcDrop} />
      <main className="flex-1 overflow-auto h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
