import React, { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, X, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanning } from '@/context/PlanningContext';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import { useAuth } from '@/context/AuthContext';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import { generateOrderCode } from '@/lib/orderRegistry';
import type { Order, OrderCategory } from '@/types/planning';

const WelcomePage: React.FC = () => {
  const { clients, orders, absenceOrderId } = usePlanning();
  const { selectedClientId, selectedClientName, setSelectedClient, clearSelectedClient } = useGlobalClientFilter();
  const { hasAccess } = useAuth();
  const canCreateOrder = hasAccess({ tableau: 'سجل الطلبيات', champ_bouton: 'طلبية جديدة' }) === 'RW';
  const [createDraft, setCreateDraft] = useState<Partial<Order> | null>(null);
  const [open, setOpen] = useState(false);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
    [clients],
  );

  const realOrders = useMemo(() => orders.filter(o => o.id !== absenceOrderId), [orders, absenceOrderId]);

  const handleNewOrder = (category: OrderCategory) => {
    const today = new Date().toISOString().split('T')[0];
    setCreateDraft({
      orderNumber: generateOrderCode(category, realOrders),
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
      category,
    });
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <PageHeader title="الواجهة" description="الصفحة الرئيسية للتطبيق" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={open} className="w-64 justify-between">
                <span className={cn('truncate', !selectedClientName && 'text-muted-foreground')}>
                  {selectedClientName || 'اختر أو اكتب اسم الزبون'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="ابحث عن زبون..." />
                <CommandList>
                  <CommandEmpty>لا يوجد زبون</CommandEmpty>
                  <CommandGroup>
                    {sortedClients.map(c => (
                      <CommandItem
                        key={c.id}
                        value={c.name || ''}
                        onSelect={() => {
                          setSelectedClient(c.id, c.name || '');
                          setOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selectedClientId === c.id ? 'opacity-100' : 'opacity-0')} />
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
