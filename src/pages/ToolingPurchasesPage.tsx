import React from 'react';
import PageHeader from '@/components/PageHeader';
import PendingOrdersTable from '@/components/PendingOrdersTable';

const ToolingPurchasesPage: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Achats Outillage" description="Commandes dont l'outillage n'est pas encore disponible" />
      <PendingOrdersTable
        filterFn={order => !order.toolingAvailable}
        emptyMessage="Tout l'outillage est disponible ✓"
      />
    </div>
  );
};

export default ToolingPurchasesPage;
