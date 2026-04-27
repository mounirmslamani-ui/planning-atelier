import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import type { DeliveredOrder, SalePriceStatus } from '@/types/planning';
import { Download, Trash2 } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { useConfirm } from '@/hooks/use-confirm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const PRICE_META: Record<SalePriceStatus, { emoji: string; label: string }> = {
  'gratuit': { emoji: '⚪', label: 'Gratuit' },
  'non-calcule': { emoji: '🔴', label: 'Prix non calculé' },
  'non-valide': { emoji: '🟠', label: 'Prix non validé' },
  'valide': { emoji: '🟢', label: 'Prix validé' },
};
const PRICE_ORDER: SalePriceStatus[] = ['gratuit', 'non-calcule', 'non-valide', 'valide'];

const DeliveredOrdersPage: React.FC = () => {
  const { deliveredOrders, orders, clients, updateDeliveredOrder, deleteDeliveredOrder } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [pendingPrice, setPendingPrice] = useState<{ entry: DeliveredOrder; next: SalePriceStatus } | null>(null);
  const [observationDrafts, setObservationDrafts] = useState<Record<string, string>>({});
  const [invoiceDialog, setInvoiceDialog] = useState<{ entry: DeliveredOrder; value: string } | null>(null);

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
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(deliveredOrders, accessors);

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
          description={`${deliveredOrders.length} commande(s) archivée(s)`}
          actions={
            <Button onClick={handleExportExcel} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" /> تصدير Excel
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="تاريخ التسليم" columnKey="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-xs font-semibold">ثمن البيع</TableHead>
              <TableHead><ColumnHeader label="رقم الفاتورة" columnKey="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.invoiceNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-xs font-semibold">ملاحظات</TableHead>
              <TableHead className="w-12 text-center text-xs font-semibold">حذف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(entry => {
              const order = getOrder(entry.orderId);
              if (!order) return null;
              const meta = PRICE_META[entry.salePriceStatus];
              const obsValue = observationDrafts[entry.id] !== undefined
                ? observationDrafts[entry.id]
                : (entry.observation || '');
              return (
                <TableRow key={entry.id}>
                  <TableCell><PriorityBadge priority={order.priority} className="" /></TableCell>
                  <TableCell className="font-heading text-sm">{order.orderNumber}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(order.orderDate)}</TableCell>
                  <TableCell className="text-sm">{getClientName(order.clientId)}</TableCell>
                  <TableCell className="text-sm max-w-48 truncate">{order.designation}</TableCell>
                  <TableCell className="text-sm">{order.quantity}</TableCell>
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
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => confirm(
                        'Êtes-vous sûr de vouloir retirer cette commande des livrées ?',
                        () => { deleteDeliveredOrder(entry.id); toast.success('Commande retirée des livrées'); },
                        { variant: 'destructive' }
                      )}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {deliveredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Aucune commande livrée.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
