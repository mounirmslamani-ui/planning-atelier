import React, { useMemo, useState, useRef, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, X, Check, ChevronsUpDown, Eye } from 'lucide-react';
import { cn, formatDateFR } from '@/lib/utils';
import { usePlanning } from '@/context/PlanningContext';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import { useAuth } from '@/context/AuthContext';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import DesignationCell from '@/components/DesignationCell';
import { generateOrderCode } from '@/lib/orderRegistry';
import { isReintegratedOrder } from '@/lib/reintegration';
import { getOrderGlobalStatus, getOrderStepStatusDetails, type OrderGlobalStatus } from '@/lib/stepProgress';
import ClientContactDetailsContent from '@/components/ClientContactDetailsContent';
import type { Order, OrderCategory } from '@/types/planning';
import logoUrl from '@/assets/slamani-tasnie-logo-bg.png';

const globalStatusClass: Record<OrderGlobalStatus, string> = {
  'En attente': 'border-muted-foreground/30 bg-muted text-muted-foreground',
  'En cours': 'border-accent/30 bg-accent/10 text-accent',
  'Terminée': 'border-primary/30 bg-primary/10 text-primary',
};
const globalStatusLabel: Record<OrderGlobalStatus, string> = {
  'En attente': 'قيد الانتظار',
  'En cours': 'قيد الإنجاز',
  'Terminée': 'جاهزة',
};
function GlobalStatusBadge({ status }: { status: OrderGlobalStatus }) {
  return <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${globalStatusClass[status]}`}>{globalStatusLabel[status]}</span>;
}

const OrderCountBox: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div className="flex flex-col items-center gap-2">
    <span className="text-sm font-medium text-foreground text-center">{label}</span>
    <div className="w-36 h-36 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center text-7xl font-bold shadow-sm">
      {count}
    </div>
  </div>
);

const WelcomePage: React.FC = () => {
  const { clients, orders, absenceOrderId, absenceOperationId, steps, productionRecords, qcEntries, deliveredOrders, cancelledOrders } = usePlanning();
  const { selectedClientId, selectedClientName, setSelectedClient, clearSelectedClient } = useGlobalClientFilter();
  const { hasAccess } = useAuth();
  const canCreateOrder = hasAccess({ tableau: 'سجل الطلبيات', champ_bouton: 'طلبية جديدة' }) === 'RW';
  const [createDraft, setCreateDraft] = useState<Partial<Order> | null>(null);
  const [p1SheetOrderId, setP1SheetOrderId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
    [clients],
  );

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId), [clients, selectedClientId]);

  // Même logique que سجل الطلبيات الجارية (OrdersPage.tsx) : une commande ne
  // compte plus comme "en cours" une fois livrée, annulée, ou validée en QC
  // (sauf si elle a été réintégrée depuis).
  const outOfActiveProductionIds = useMemo(() => {
    const ids = new Set<string>();
    orders.forEach(o => {
      if (isReintegratedOrder(o)) return;
      if (deliveredOrders.some(d => d.orderId === o.id)) { ids.add(o.id); return; }
      if (cancelledOrders.some(c => c.orderId === o.id)) { ids.add(o.id); return; }
      if (qcEntries.some(q => q.orderId === o.id && (q.decision === 'conforme' || q.decision === 'conforme-derogation'))) {
        ids.add(o.id);
      }
    });
    return ids;
  }, [orders, qcEntries, deliveredOrders, cancelledOrders]);

  const clientOrderCounts = useMemo(() => {
    if (!selectedClientId) return null;
    const clientOrders = orders.filter(
      o => o.id !== absenceOrderId && o.clientId === selectedClientId && !outOfActiveProductionIds.has(o.id)
    );
    return {
      fabrication: clientOrders.filter(o => o.category === 'fabrication').length,
      prestation: clientOrders.filter(o => o.category === 'prestation').length,
      divers: clientOrders.filter(o => o.category === 'divers').length,
      total: clientOrders.length,
    };
  }, [orders, absenceOrderId, selectedClientId, outOfActiveProductionIds]);

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

        {selectedClient && (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {clientOrderCounts && (
              <div className="flex items-start gap-6 flex-wrap">
                {clientOrderCounts.fabrication > 0 && (
                  <OrderCountBox label="عدد الطلبيات الحالية Fabrication" count={clientOrderCounts.fabrication} />
                )}
                {clientOrderCounts.prestation > 0 && (
                  <OrderCountBox label="عدد الطلبيات الحالية Prestation" count={clientOrderCounts.prestation} />
                )}
                {clientOrderCounts.divers > 0 && (
                  <OrderCountBox label="عدد الطلبيات الحالية Divers" count={clientOrderCounts.divers} />
                )}
                <OrderCountBox label="العدد الكلي للطلبيات الحالية" count={clientOrderCounts.total} />
              </div>
            )}

            {showClientDetails && (
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
