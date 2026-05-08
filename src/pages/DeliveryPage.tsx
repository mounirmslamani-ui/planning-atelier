import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import type { DeliveryEntry, DeliveredOrder, Order, OrderCategory, QCDecision, QualityControlEntry } from '@/types/planning';
import { Download, Trash2, Pencil, Check, X } from 'lucide-react';
import ReintegrateButton from '@/components/orders/ReintegrateButton';
import { useReintegrateOrder } from '@/hooks/useReintegrateOrder';
import { exportTableToExcel } from '@/lib/excelExport';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';

const DeliveryPage: React.FC = () => {
  const { deliveryEntries, orders, clients, addDeliveredOrder, deleteDeliveryEntry, deleteOrder, updateOrder, addQCEntry } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const reint = useReintegrateOrder();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [pending, setPending] = useState<{ entryId: string; date: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Order>>({});
  const [reintegratePending, setReintegratePending] = useState<{ entry: DeliveryEntry; decision: 'reprise-retouche' | 'non-conforme' } | null>(null);
  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');

  const filteredEntries = React.useMemo(
    () => deliveryEntries.filter(e => inferCategoryFromOrderNumber(getOrder(e.orderId)?.orderNumber) === activeCat),
    [deliveryEntries, activeCat, orders]
  );
  const catCount = (cat: OrderCategory) =>
    deliveryEntries.filter(e => inferCategoryFromOrderNumber(getOrder(e.orderId)?.orderNumber) === cat).length;

  const reintegrateOrder = (entry: DeliveryEntry, decision: 'reprise-retouche' | 'non-conforme') => {
    // Recreate a QC entry marking it as "en attente de reprise"
    const qc: QualityControlEntry = {
      id: crypto.randomUUID(),
      orderId: entry.orderId,
      controlDate: entry.controlDate,
      decision,
      reworkNotes: decision === 'reprise-retouche' ? 'Réintégration depuis طلبيات جاهزة للتسليم' : undefined,
      createdAt: new Date().toISOString(),
    };
    addQCEntry(qc);
    // Bump priority to P1 (urgent rework)
    const order = orders.find(o => o.id === entry.orderId);
    if (order && order.priority !== 'P1') {
      updateOrder({ ...order, priority: 'P1' });
    }
    // Remove from delivery list — this auto-unlocks the planning dialog
    deleteDeliveryEntry(entry.id);
    toast.success('تمت إعادة الطلبية إلى الإنتاج كأولوية عاجلة');
  };

  const startEdit = (order: Order) => {
    setEditingOrderId(order.id);
    setEditDraft({
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      clientId: order.clientId,
      designation: order.designation,
      quantity: order.quantity,
      plannedDeadline: order.plannedDeadline,
    });
  };
  const cancelEdit = () => { setEditingOrderId(null); setEditDraft({}); };
  const saveEdit = (order: Order) => {
    updateOrder({ ...order, ...editDraft } as Order);
    setEditingOrderId(null); setEditDraft({});
  };

  const accessors = {
    priority: (e: DeliveryEntry) => getOrder(e.orderId)?.priority || '',
    orderNumber: (e: DeliveryEntry) => getOrder(e.orderId)?.orderNumber || '',
    orderDate: (e: DeliveryEntry) => getOrder(e.orderId)?.orderDate || '',
    client: (e: DeliveryEntry) => getClientName(getOrder(e.orderId)?.clientId || ''),
    designation: (e: DeliveryEntry) => getOrder(e.orderId)?.designation || '',
    quantity: (e: DeliveryEntry) => getOrder(e.orderId)?.quantity ?? 0,
    deadline: (e: DeliveryEntry) => getOrder(e.orderId)?.plannedDeadline || '',
    controlDate: (e: DeliveryEntry) => e.controlDate,
    decision: (e: DeliveryEntry) => e.decision === 'conforme' ? 'مطابق للمواصفات' : 'مطابق للمواصفات بصفة استثنائية',
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(filteredEntries, accessors);

  const handleExportExcel = () => {
    exportTableToExcel('طلبيات جاهزة للتسليم', processed.map(entry => {
      const order = getOrder(entry.orderId);
      return {
        Priorité: order?.priority || '—',
        'رقم الطلبية': order?.orderNumber || '—',
        Date: order ? formatDateFR(order.orderDate) : '—',
        Client: order ? getClientName(order.clientId) : '—',
        Désignation: order?.designation || '—',
        Quantité: order?.quantity ?? '—',
        Délais: order ? formatDateFR(order.plannedDeadline) : '—',
        'تاريخ مراقبة الجودة': formatDateFR(entry.controlDate),
        Décision: entry.decision === 'conforme' ? 'مطابق للمواصفات' : 'مطابق للمواصفات بصفة استثنائية',
      };
    }), [12, 20, 14, 24, 45, 10, 14, 16, 26]);
  };

  const handleDateChange = (entryId: string, date: string) => {
    setDrafts(d => ({ ...d, [entryId]: date }));
    if (date) setPending({ entryId, date });
  };

  const handleConfirmTransfer = () => {
    if (!pending) return;
    const entry = deliveryEntries.find(e => e.id === pending.entryId);
    if (!entry) { setPending(null); return; }
    const delivered: DeliveredOrder = {
      id: crypto.randomUUID(),
      orderId: entry.orderId,
      deliveryDate: pending.date,
      salePriceStatus: 'non-calcule',
      observation: undefined,
    };
    addDeliveredOrder(delivered);
    deleteDeliveryEntry(entry.id);
    setDrafts(d => { const n = { ...d }; delete n[pending.entryId]; return n; });
    setPending(null);
    toast.success('Commande transférée vers les Commandes livrées');
  };

  const handleCancelTransfer = () => {
    if (pending) {
      setDrafts(d => { const n = { ...d }; delete n[pending.entryId]; return n; });
    }
    setPending(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="طلبيات جاهزة للتسليم" description={`${deliveryEntries.length} commande(s) prête(s)`} actions={
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        } />
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
              <TableHead><ColumnHeader label="أجل التسليم" columnKey="deadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deadline || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="تاريخ مراقبة الجودة" columnKey="controlDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.controlDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="قرار" columnKey="decision" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.decision || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="text-xs font-semibold">التسليم</TableHead>
              <TableHead className="text-center text-xs font-semibold whitespace-nowrap">إعادة إدماج</TableHead>
              <TableHead className="text-center text-xs font-semibold whitespace-nowrap">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(entry => {
              const order = getOrder(entry.orderId);
              if (!order) return null;
              const isEditing = editingOrderId === order.id;
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <PriorityBadge priority={order.priority} className="" />
                  </TableCell>
                  <TableCell className="font-heading text-sm">
                    {isEditing
                      ? <Input value={editDraft.orderNumber ?? ''} onChange={e => setEditDraft(d => ({ ...d, orderNumber: e.target.value }))} className="h-8 w-28" />
                      : order.orderNumber}
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
                  <TableCell className="text-sm">
                    {isEditing
                      ? <Input type="date" value={editDraft.plannedDeadline ?? ''} onChange={e => setEditDraft(d => ({ ...d, plannedDeadline: e.target.value }))} className="h-8 w-36" />
                      : formatDateFR(order.plannedDeadline)}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateFR(entry.controlDate)}</TableCell>
                  <TableCell>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      value={entry.decision}
                      onChange={e => {
                        const next = e.target.value as QCDecision;
                        if (next === entry.decision) return;
                        if (next === 'reprise-retouche' || next === 'non-conforme') {
                          setReintegratePending({ entry, decision: next });
                        }
                      }}
                      title="Modifier la décision"
                    >
                      <option value="conforme">مطابق للمواصفات</option>
                      <option value="conforme-derogation">مطابق للمواصفات بصفة استثنائية</option>
                      <option value="reprise-retouche">إعادة/تعديل</option>
                      <option value="non-conforme">غير مطابق للمواصفات</option>
                    </select>
                    <Badge variant="outline" className="mt-1 bg-normal/15 text-normal">
                      {entry.decision === 'conforme' ? 'مطابق للمواصفات' : 'مطابق للمواصفات بصفة استثنائية'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      value={drafts[entry.id] || ''}
                      onChange={(e) => handleDateChange(entry.id, e.target.value)}
                      className="h-8 w-36 text-xs"
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
                                deleteDeliveryEntry(entry.id);
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
            {deliveryEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  Aucune commande à livrer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="هل تؤكد هذه العملية؟"
        description={pending ? `La commande sera transférée vers 'طلبيات مسلمة' avec la date du ${formatDateFR(pending.date)}.` : ''}
        onConfirm={handleConfirmTransfer}
        onCancel={handleCancelTransfer}
        confirmLabel="Oui, transférer"
        cancelLabel="Non"
      />

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
        open={!!reintegratePending}
        title="إعادة الطلبية إلى الإنتاج؟"
        description={
          reintegratePending
            ? `La commande sera retirée de 'طلبيات جاهزة للتسليم', réintégrée dans 'الطلبيات الحالية' avec la décision « ${reintegratePending.decision === 'reprise-retouche' ? 'إعادة/تعديل' : 'غير مطابق'} », sa priorité passera à P1 (urgence) et la fenêtre 'تحديد المراحل وتوزيعها' sera déverrouillée pour permettre l'ajout d'étapes de retouche.`
            : ''
        }
        onConfirm={() => {
          if (reintegratePending) reintegrateOrder(reintegratePending.entry, reintegratePending.decision);
          setReintegratePending(null);
        }}
        onCancel={() => setReintegratePending(null)}
        confirmLabel="Oui, réintégrer"
        cancelLabel="Annuler"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!reint.pending}
        title="إعادة إدماج الطلبية"
        description="La commande sera retirée de 'طلبيات جاهزة للتسليم' et réinjectée dans 'الطلبيات الحالية' (P1 — Reprise/Retouche). La date de livraison n'a pas encore été enregistrée, rien à supprimer côté facturation."
        onConfirm={reint.confirmReintegrate}
        onCancel={reint.cancelReintegrate}
        confirmLabel="Oui, réintégrer"
        cancelLabel="Annuler"
      />
    </div>
  );
};

export default DeliveryPage;
