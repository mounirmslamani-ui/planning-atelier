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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import type { DeliveredOrder, SalePriceStatus, Order, OrderCategory } from '@/types/planning';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Trash2, Pencil, Check, X } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { useConfirm } from '@/hooks/use-confirm';
import ReintegrateButton from '@/components/orders/ReintegrateButton';
import { useReintegrateOrder } from '@/hooks/useReintegrateOrder';
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
  const { deliveredOrders, orders, clients, updateDeliveredOrder, deleteDeliveredOrder, deleteOrder, updateOrder } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const reint = useReintegrateOrder();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [pendingPrice, setPendingPrice] = useState<{ entry: DeliveredOrder; next: SalePriceStatus } | null>(null);
  const [observationDrafts, setObservationDrafts] = useState<Record<string, string>>({});
  const [invoiceDialog, setInvoiceDialog] = useState<{ entry: DeliveredOrder; value: string } | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Order>>({});
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

  const startEdit = (order: Order) => {
    setEditingOrderId(order.id);
    setEditDraft({
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      clientId: order.clientId,
      designation: order.designation,
      quantity: order.quantity,
    });
  };
  const cancelEdit = () => { setEditingOrderId(null); setEditDraft({}); };
  const saveEdit = (order: Order) => {
    updateOrder({ ...order, ...editDraft } as Order);
    setEditingOrderId(null); setEditDraft({});
  };

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
          actions={
            <Button onClick={handleExportExcel} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" /> تصدير Excel
            </Button>
          }
        />
  />
        <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as OrderCategory)} className="flex-none mb-2 w-full">
          <TabsList className="justify-end">
            {(['fabrication','prestation','divers','slamani'] as OrderCategory[]).map(c => (
              <TabsTrigger key={c} value={c}>
                {ORDER_CATEGORY_LABEL[c]}
                <span className="ml-2 text-xs text-muted-foreground">({catCount(c)})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

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
              <TableHead className="text-center text-xs font-semibold whitespace-nowrap">إعادة إدماج</TableHead>
              <TableHead className="text-center text-xs font-semibold whitespace-nowrap">إجراءات</TableHead>
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
                    <TableCell className="text-center">—</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => confirm(
                          'Cette ligne est orpheline (commande source supprimée). Supprimer définitivement cette entrée livrée ?',
                          () => {
                            deleteDeliveredOrder(entry.id);
                            toast.success('Entrée orpheline supprimée');
                          },
                          { variant: 'destructive' }
                        )}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }
              const obsValue = observationDrafts[entry.id] !== undefined
                ? observationDrafts[entry.id]
                : (entry.observation || '');
              const isEditing = editingOrderId === order.id;
              return (
                <TableRow key={entry.id}>
                  <TableCell><PriorityBadge priority={order.priority} className="" /></TableCell>
                  <TableCell className="font-heading text-sm">
                    {isEditing
                      ? <Input value={editDraft.orderNumber ?? ''} onChange={e => setEditDraft(d => ({ ...d, orderNumber: e.target.value }))} className="h-8 w-28" />
                      : <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} />}
                  </TableCell>
                  <TableCell className="text-sm">
                    {isEditing
                      ? <Input type="date" value={editDraft.orderDate ?? ''} onChange={e => setEditDraft(d => ({ ...d, orderDate: e.target.value }))} className="h-8 w-36" />
                      : formatDateFR(order.orderDate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {isEditing ? (
                      <Select value={editDraft.clientId ?? ''} onValueChange={v => setEditDraft(d => ({ ...d, clientId: v }))}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : getClientName(order.clientId)}
                  </TableCell>
                  <TableCell className="text-sm max-w-48">
                    {isEditing
                      ? <Input value={editDraft.designation ?? ''} onChange={e => setEditDraft(d => ({ ...d, designation: e.target.value }))} className="h-8 w-56" />
                      : <span className="truncate block" title={order.designation}>{order.designation}</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {isEditing
                      ? <Input type="number" value={editDraft.quantity ?? 0} onChange={e => setEditDraft(d => ({ ...d, quantity: Number(e.target.value) }))} className="h-8 w-20" />
                      : order.quantity}
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
                  <TableCell className="text-center">
                    <ReintegrateButton onClick={() => reint.requestReintegrate(order.id)} />
                  </TableCell>
                  <TableCell className="text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => saveEdit(order)} title="Enregistrer">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} title="Annuler">
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(order)} title="Modifier">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => confirm(
                              'Êtes-vous sûr de vouloir supprimer définitivement cette commande ? Elle sera retirée de tous les tableaux et de la base de données.',
                              () => {
                                deleteDeliveredOrder(entry.id);
                                deleteOrder(entry.orderId);
                                toast.success('Commande supprimée définitivement');
                              },
                              { variant: 'destructive' }
                            )}
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {deliveredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
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

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        variant={confirmState.variant}
        confirmLabel="Supprimer"
      />

      <ConfirmDialog
        open={!!reint.pending}
        title="إعادة إدماج الطلبية"
        description="La commande sera réinjectée dans 'الطلبيات الحالية' (P1 — Reprise/Retouche). Si une facture existe déjà, son numéro et sa date sont CONSERVÉS intacts pour préserver l'intégrité comptable. Sinon, l'enregistrement de livraison est supprimé."
        onConfirm={reint.confirmReintegrate}
        onCancel={reint.cancelReintegrate}
        confirmLabel="Oui, réintégrer"
        cancelLabel="Annuler"
      />
    </div>
  );
};

export default DeliveredOrdersPage;
