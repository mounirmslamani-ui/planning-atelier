import React, { useCallback } from 'react';
import AppSidebar from './AppSidebar';
import { usePlanning } from '@/context/PlanningContext';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading } = usePlanning();

  const handleProdDrop = useCallback((stepId: string) => {
    window.dispatchEvent(new CustomEvent('prod-register-drop', { detail: { stepId } }));
  }, []);

  const handleQcDrop = useCallback((stepId: string) => {
    window.dispatchEvent(new CustomEvent('qc-drop', { detail: { stepId } }));
  }, []);

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
