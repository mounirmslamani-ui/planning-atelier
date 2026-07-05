import React, { useMemo, useState, useRef, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, X, Check, ChevronsUpDown, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanning } from '@/context/PlanningContext';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import { useAuth } from '@/context/AuthContext';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import { generateOrderCode } from '@/lib/orderRegistry';
import ClientContactDetailsContent from '@/components/ClientContactDetailsContent';
import type { Order, OrderCategory } from '@/types/planning';
import logoUrl from '@/assets/slamani-tasnie-logo-bg.png';

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

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId), [clients, selectedClientId]);

  const [showClientDetails, setShowClientDetails] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleClientDetails = () => {
    if (!selectedClient) return;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setShowClientDetails(prev => {
      const next = !prev;
      if (next) {
        hideTimerRef.current = setTimeout(() => {
          setShowClientDetails(false);
          hideTimerRef.current = null;
        }, 60000);
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setShowClientDetails(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, [selectedClientId]);

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
<div className="relative min-h-screen p-6 space-y-6 overflow-hidden" dir="rtl">
      <div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <img
          src={logoUrl}
          alt=""
          className="w-[50%] max-w-none select-none opacity-100 mix-blend-multiply"
        />
      </div>

      <div className="relative z-10 space-y-6">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleToggleClientDetails}
              disabled={!selectedClient}
              title="عرض تفاصيل الزبون"
            >
              <Eye className="w-4 h-4 text-primary" />
            </Button>
          </div>

          {canCreateOrder && (
            <div className="flex items-center gap-2">
              <Button onClick={() => handleNewOrder('fabrication')} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                <span className="font-bold">طلبية جديدة F</span>
              </Button>
              <Button onClick={() => handleNewOrder('prestation')} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                <span className="font-bold">طلبية جديدة P</span>
              </Button>
              <Button onClick={() => handleNewOrder('divers')} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                <span className="font-bold">طلبية جديدة D</span>
              </Button>
            </div>
          )}
        </div>

        {showClientDetails && selectedClient && (
          <div className="rounded-md border bg-card p-4 max-w-2xl">
            <ClientContactDetailsContent
              companyName={selectedClient.name}
              activity={selectedClient.activity}
              phones={selectedClient.phones}
              emails={selectedClient.emails}
              addresses={selectedClient.addresses}
              addressDetails={selectedClient.addressDetails}
              representatives={selectedClient.representatives}
            />
          </div>
        )}

        <OrderUnifiedSheet
          orderId={null}
          open={!!createDraft}
          onOpenChange={(open) => { if (!open) setCreateDraft(null); }}
          createMode
          initialDraft={createDraft || undefined}
          onCreated={() => setCreateDraft(null)}
        />
      </div>
    </div>
  );
};

export default WelcomePage;
