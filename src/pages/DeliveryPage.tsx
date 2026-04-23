import React from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import type { DeliveryEntry } from '@/types/planning';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';

const DeliveryPage: React.FC = () => {
  const { deliveryEntries, orders, clients } = usePlanning();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const accessors = {
    priority: (e: DeliveryEntry) => getOrder(e.orderId)?.priority || '',
    orderNumber: (e: DeliveryEntry) => getOrder(e.orderId)?.orderNumber || '',
    orderDate: (e: DeliveryEntry) => getOrder(e.orderId)?.orderDate || '',
    client: (e: DeliveryEntry) => getClientName(getOrder(e.orderId)?.clientId || ''),
    designation: (e: DeliveryEntry) => getOrder(e.orderId)?.designation || '',
    quantity: (e: DeliveryEntry) => getOrder(e.orderId)?.quantity ?? 0,
    deadline: (e: DeliveryEntry) => getOrder(e.orderId)?.plannedDeadline || '',
    controlDate: (e: DeliveryEntry) => e.controlDate,
    decision: (e: DeliveryEntry) => e.decision === 'conforme' ? 'Conforme' : 'Conforme avec dérogation',
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(deliveryEntries, accessors);

  const handleExportExcel = () => {
    exportTableToExcel('Commandes à livrer', processed.map(entry => {
      const order = getOrder(entry.orderId);
      return {
        Priorité: order?.priority || '—',
        'N° Cde': order?.orderNumber || '—',
        Date: order ? formatDateFR(order.orderDate) : '—',
        Client: order ? getClientName(order.clientId) : '—',
        Désignation: order?.designation || '—',
        Quantité: order?.quantity ?? '—',
        Délais: order ? formatDateFR(order.plannedDeadline) : '—',
        'Date Contrôle': formatDateFR(entry.controlDate),
        Décision: entry.decision === 'conforme' ? 'Conforme' : 'Conforme avec dérogation',
      };
    }), [12, 20, 14, 24, 45, 10, 14, 16, 26]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="Commandes à livrer" description={`${deliveryEntries.length} commande(s) prête(s)`} actions={
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> Exporter Excel
          </Button>
        } />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="Priorité" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="N° Cde" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Date" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Client" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Désignation" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Quantité" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Délais" columnKey="deadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deadline || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Date Contrôle" columnKey="controlDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.controlDate || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Décision" columnKey="decision" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.decision || ''} onFilter={handleFilter} /></TableHead>
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
                      {entry.decision === 'conforme' ? 'Conforme' : 'Conforme avec dérogation'}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {deliveryEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Aucune commande à livrer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DeliveryPage;
