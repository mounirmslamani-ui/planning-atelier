import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import type { DeliveredOrder, SalePriceStatus, OrderCategory } from '@/types/planning';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { isReintegratedOrder } from '@/lib/reintegration';

const PRICE_META: Record<SalePriceStatus, { emoji: string; label: string }> = {
  'gratuit': { emoji: '⚪', label: 'Gratuit' },
  'non-calcule': { emoji: '🔴', label: 'Prix non calculé' },
  'non-valide': { emoji: '🟠', label: 'Prix non validé' },
  'valide': { emoji: '🟢', label: 'Prix validé' },
};
const PRICE_ORDER: SalePriceStatus[] = ['gratuit', 'non-calcule', 'non-valide', 'valide'];

const DeliveredOrdersPage: React.FC = () => {
  const { deliveredOrders, orders, clients, updateDeliveredOrder } = usePlanning();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [pendingPrice, setPendingPrice] = useState<{ entry: DeliveredOrder; next: SalePriceStatus } | null>(null);
  const [observationDrafts, setObservationDrafts] = useState<Record<string, string>>({});
  const [invoiceDialog, setInvoiceDialog] = useState<{ entry: DeliveredOrder; value: string } | null>(null);
  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');

  const visibleDelivered = React.useMemo(
    () => deliveredOrders.filter(d => !isReintegratedOrder(getOrder(d.orderId))),
    [deliveredOrders, orders]
  );
  const filteredDelivered = React.useMemo(
    () => visibleDelivered.filter(d => inferCategoryFromOrderNumber(getOrder(d.orderId)?.orderNumber) === activeCat),
    [visibleDelivered, activeCat, orders]
  );
  const catCount = (cat: OrderCategory) =>
    visibleDelivered.filter(d => inferCategoryFromOrderNumber(getOrder(d.orderId)?.orderNumber) === cat).length;


  const accessors = {
    priority: (d: DeliveredOrder) => getOrder(d.orderId)?.priority || '',
    orderNumber: (d: DeliveredOrder) => getOrder(d.orderId)?.orderNumber || '',
    orderDate: (d: DeliveredOrder) => getOrder(d.orderId)?.orderDate || '',
    client: (d: DeliveredOrder) => getClientName(getOrder(d.orderId)?.clientId || ''),
    designation: (d: DeliveredOrder) => getOrder(d.orderId)?.designation || '',
    quantity: (d: DeliveredOrder) => getOrder(d.orderId)?.quantity ?? 0,
    deliveryDate: (d: DeliveredOrder) => d.deliveryDate,
    salePriceStatus: (d: DeliveredOrder) => PRICE_META[d.salePriceStatus].label,
    invoiceNumber: (d: DeliveredOrder) => d.invoiceNumber || 'في الانتظار',
    observation: (d: DeliveredOrder) => d.observation || '',
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(filteredDelivered, accessors);

  const handleExportExcel = () => {
    exportTableToExcel('طلبيات مسلمة', processed.map(entry => {
      const order = getOrder(entry.orderId);
      return {
        Priorité: order?.priority || '—',
        'رقم الطلبية': order?.orderNumber || '—',
        Date: order ? formatDateFR(order.orderDate) : '—',
        Client: order ? getClientName(order.clientId) : '—',
        Désignation: order?.designation || '—',
        Quantité: order?.quantity ?? '—',
        'تاريخ التسليم': formatDateFR(entry.deliveryDate),
        'ثمن البيع': PRICE_META[entry.salePriceStatus].label,
        'رقم الفاتورة': entry.invoiceNumber || 'في الانتظار',
        Observation: entry.observation || '',
      };
    }), [12, 20, 14, 24, 45, 10, 18, 22, 20, 40]);
  };

  const requestPriceChange = (entry: DeliveredOrder, next: SalePriceStatus) => {
    if (entry.salePriceStatus === next) return;
    setPendingPrice({ entry, next });
  };

  const confirmPriceChange = () => {
    if (!pendingPrice) return;
    updateDeliveredOrder({ ...pendingPrice.entry, salePriceStatus: pendingPrice.next });
    setPendingPrice(null);
    toast.success('Prix de vente mis à jour');
  };

  const commitObservation = (entry: DeliveredOrder) => {
    const draft = observationDrafts[entry.id];
    if (draft === undefined || draft === (entry.observation || '')) return;
    updateDeliveredOrder({ ...entry, observation: draft || undefined });
    setObservationDrafts(o => { const n = { ...o }; delete n[entry.id]; return n; });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="طلبيات مسلمة"
          description={`${deliveredOrders.length} طلبيات منتهية`}
        />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>
          <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as OrderCategory)} className="w-full">
            <div className="flex justify-end mb-2">
              <TabsList className="justify-end">
                {(['fabrication','prestation','divers','slamani'] as OrderCategory[]).map(c => (
                  <TabsTrigger key={c} value={c}>
                    {ORDER_CATEGORY_LABEL[c]}
                    <span className="ml-2 text-xs text-muted-foreground">({catCount(c)})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="الكمية المسلَّمة" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="تاريخ التسليم" columnKey="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-xs font-semibold">ثمن البيع</TableHead>
              <TableHead><ColumnHeader label="رقم الفاتورة" columnKey="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.invoiceNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-xs font-semibold">ملاحظات</TableHead>

            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(entry => {
              const order = getOrder(entry.orderId);
              const meta = PRICE_META[entry.salePriceStatus];
              if (!order) {
                // Orphan delivered entry (source order was deleted) — still show it so user can manage/clean it
                return (
                  <TableRow key={entry.id} className="bg-destructive/5">
                    <TableCell colSpan={6} className="text-xs italic text-muted-foreground">
                      ⚠ Commande source introuvable (supprimée) — ID: {entry.orderId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-sm">{formatDateFR(entry.deliveryDate)}</TableCell>
                    <TableCell><span className="text-xs">{meta.emoji} {meta.label}</span></TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setInvoiceDialog({ entry, value: entry.invoiceNumber || '' })}
                        className={`text-xs px-2 py-1 rounded border hover:bg-accent transition-colors ${entry.invoiceNumber ? 'bg-primary/10 border-primary/30 text-primary font-medium' : 'bg-muted border-muted-foreground/20 text-muted-foreground italic'}`}
                      >
                        {entry.invoiceNumber || 'في الانتظار'}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.observation || '—'}</TableCell>
                  </TableRow>
                );
              }
              const obsValue = observationDrafts[entry.id] !== undefined
                ? observationDrafts[entry.id]
                : (entry.observation || '');
              return (
                <TableRow key={entry.id}>
                  <TableCell><PriorityBadge priority={order.priority} className="" /></TableCell>
                  <TableCell className="font-heading text-sm">
                    <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateFR(order.orderDate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {getClientName(order.clientId)}
                  </TableCell>
                 <TableCell className="text-sm" style={{ minWidth: 200 }}>
                     <DesignationCell orderId={order.id} designation={order.designation} className="text-sm whitespace-normal break-words block" />
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.quantity}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateFR(entry.deliveryDate)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title={meta.label}
                          className="text-base cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-ring rounded inline-flex items-center gap-1.5"
                        >
                          <span>{meta.emoji}</span>
                          <span className="text-xs text-muted-foreground">{meta.label}</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[180px]">
                        {PRICE_ORDER.map(s => (
                          <DropdownMenuItem
                            key={s}
                            onSelect={(e) => { e.preventDefault(); requestPriceChange(entry, s); }}
                            className={entry.salePriceStatus === s ? 'bg-accent' : ''}
                          >
                            <span className="mr-2">{PRICE_META[s].emoji}</span>
                            <span className="text-xs">{PRICE_META[s].label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setInvoiceDialog({ entry, value: entry.invoiceNumber || '' })}
                      className={`text-xs px-2 py-1 rounded border hover:bg-accent transition-colors ${entry.invoiceNumber ? 'bg-primary/10 border-primary/30 text-primary font-medium' : 'bg-muted border-muted-foreground/20 text-muted-foreground italic'}`}
                    >
                      {entry.invoiceNumber || 'في الانتظار'}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={obsValue}
                      onChange={(e) => setObservationDrafts(o => ({ ...o, [entry.id]: e.target.value }))}
                      onBlur={() => commitObservation(entry)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="—"
                      className="h-8 text-xs min-w-48"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {deliveredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Aucune commande livrée.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pendingPrice}
        title="هل تؤكد هذه العملية؟"
        description={pendingPrice ? `Le prix de vente sera défini sur « ${PRICE_META[pendingPrice.next].label} ».` : ''}
        onConfirm={confirmPriceChange}
        onCancel={() => setPendingPrice(null)}
        confirmLabel="Oui"
        cancelLabel="Non"
      />

      <Dialog open={!!invoiceDialog} onOpenChange={(open) => { if (!open) setInvoiceDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">رقم الفاتورة</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={invoiceDialog?.value || ''}
              onChange={(e) => setInvoiceDialog(d => d ? { ...d, value: e.target.value } : d)}
              placeholder="أدخل رقم الفاتورة..."
              className="text-right"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && invoiceDialog) {
                  updateDeliveredOrder({ ...invoiceDialog.entry, invoiceNumber: invoiceDialog.value.trim() || undefined });
                  setInvoiceDialog(null);
                  toast.success('Numéro de facture enregistré');
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Annuler</Button>
            {invoiceDialog?.entry.invoiceNumber && (
              <Button variant="ghost" onClick={() => {
                if (!invoiceDialog) return;
                updateDeliveredOrder({ ...invoiceDialog.entry, invoiceNumber: undefined });
                setInvoiceDialog(null);
                toast.success('Numéro de facture effacé');
              }}>Effacer</Button>
            )}
            <Button onClick={() => {
              if (!invoiceDialog) return;
              updateDeliveredOrder({ ...invoiceDialog.entry, invoiceNumber: invoiceDialog.value.trim() || undefined });
              setInvoiceDialog(null);
              toast.success('Numéro de facture enregistré');
            }}>Valider</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default DeliveredOrdersPage;
