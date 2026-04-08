import React, { useCallback } from 'react';
import AppSidebar from './AppSidebar';
import { usePlanning } from '@/context/PlanningContext';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading } = usePlanning();

  const handleProdDrop = useCallback((stepId: string) => {
    // Dispatch a custom event that PlanningTableauPage listens for
    window.dispatchEvent(new CustomEvent('prod-register-drop', { detail: { stepId } }));
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
      <AppSidebar onProdDrop={handleProdDrop} />
      <main className="flex-1 overflow-auto h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
