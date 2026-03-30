import React from 'react';
import PageHeader from '@/components/PageHeader';
import PendingOrdersTable from '@/components/PendingOrdersTable';

const MaterialPurchasesPage: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Achats Matière" description="Commandes dont la matière n'est pas encore disponible" />
      <PendingOrdersTable
        filterFn={order => !order.materialAvailable}
        emptyMessage="Toutes les matières sont disponibles ✓"
      />
    </div>
  );
};

export default MaterialPurchasesPage;
