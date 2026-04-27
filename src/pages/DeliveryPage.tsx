import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import type { DeliveryEntry, DeliveredOrder } from '@/types/planning';
import { Download, Trash2 } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';

const DeliveryPage: React.FC = () => {
  const { deliveryEntries, orders, clients, addDeliveredOrder, deleteDeliveryEntry, deleteOrder } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [pending, setPending] = useState<{ entryId: string; date: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(deliveryEntries, accessors);

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
              <TableHead className="w-12 text-center text-xs font-semibold">حذف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(entry => {
              const order = getOrder(entry.orderId);
              if (!order) return null;
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <PriorityBadge priority={order.priority} className="" />
                  </TableCell>
                  <TableCell className="font-heading text-sm">{order.orderNumber}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(order.orderDate)}</TableCell>
                  <TableCell className="text-sm">{getClientName(order.clientId)}</TableCell>
                  <TableCell className="text-sm max-w-48 truncate">{order.designation}</TableCell>
                  <TableCell className="text-sm">{order.quantity}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(order.plannedDeadline)}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(entry.controlDate)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-normal/15 text-normal">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => confirm(
                        'Êtes-vous sûr de vouloir retirer cette commande de la livraison ?',
                        () => { deleteDeliveryEntry(entry.id); toast.success('Commande retirée de la livraison'); },
                        { variant: 'destructive' }
                      )}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {deliveryEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
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
    </div>
  );
};

export default DeliveryPage;
