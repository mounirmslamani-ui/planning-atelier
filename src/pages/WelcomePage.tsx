import React, { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import { useAuth } from '@/context/AuthContext';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import { generateOrderCode } from '@/lib/orderRegistry';
import type { Order } from '@/types/planning';

const WelcomePage: React.FC = () => {
  const { clients, orders, absenceOrderId } = usePlanning();
  const { selectedClientId, setSelectedClient, clearSelectedClient } = useGlobalClientFilter();
  const { hasAccess } = useAuth();
  const canCreateOrder = hasAccess({ tableau: 'سجل الطلبيات', champ_bouton: 'طلبية جديدة' }) === 'RW';
  const [createDraft, setCreateDraft] = useState<Partial<Order> | null>(null);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
    [clients],
  );

  const realOrders = useMemo(() => orders.filter(o => o.id !== absenceOrderId), [orders, absenceOrderId]);

  const handleClientChange = (id: string) => {
    const c = clients.find(cl => cl.id === id);
    if (c) setSelectedClient(c.id, c.name || '');
  };

  const handleNewOrder = () => {
    const today = new Date().toISOString().split('T')[0];
    setCreateDraft({
      orderNumber: generateOrderCode('fabrication', realOrders),
      orderDate: today,
      clientId: selectedClientId || '',
      designation: '',
      quantity: 1,
      priority: 'undetermined',
      plannedDeadline: today,
      materialAvailable: false,
      toolingAvailable: false,
      studyReady: false,
      materialStatus: 'non-disponible',
      toolingStatus: 'non-disponible',
      studyStatus: 'non-disponible',
      category: 'fabrication',
    });
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <PageHeader title="الواجهة" description="الصفحة الرئيسية للتطبيق" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={selectedClientId || ''} onValueChange={handleClientChange}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="اختر زبوناً" />
            </SelectTrigger>
            <SelectContent>
              {sortedClients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={clearSelectedClient}>
            <X className="w-4 h-4 ml-1" />
            إلغاء
          </Button>
        </div>

        {canCreateOrder && (
          <Button onClick={handleNewOrder} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            <span className="font-bold">طلبية جديدة</span>
          </Button>
        )}
      </div>

      <OrderUnifiedSheet
        orderId={null}
        open={!!createDraft}
        onOpenChange={(open) => { if (!open) setCreateDraft(null); }}
        createMode
        initialDraft={createDraft || undefined}
        onCreated={() => setCreateDraft(null)}
      />
    </div>
  );
};

export default WelcomePage;
