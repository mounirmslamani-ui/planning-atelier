import React from 'react';
import PageHeader from '@/components/PageHeader';
import PendingOrdersTable from '@/components/PendingOrdersTable';

const StudyPage: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Études" description="Commandes dont l'étude n'est pas encore faite" />
      <PendingOrdersTable
        filterFn={order => !order.studyReady}
        emptyMessage="Toutes les études sont faites ✓"
      />
    </div>
  );
};

export default StudyPage;
