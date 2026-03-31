import React from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const priorityColors: Record<string, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
  'P5': 'bg-muted text-muted-foreground',
};

const DeliveryPage: React.FC = () => {
  const { deliveryEntries, orders, clients } = usePlanning();
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  return (
    <div className="p-6">
      <PageHeader title="Commandes à livrer" description={`${deliveryEntries.length} commande(s) prête(s)`} />

      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Priorité</TableHead>
              <TableHead>N° Cde</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Désignation</TableHead>
              <TableHead>Quantité</TableHead>
              <TableHead>Délais</TableHead>
              <TableHead>Date Contrôle</TableHead>
              <TableHead>Décision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveryEntries.map(entry => {
              const order = getOrder(entry.orderId);
              if (!order) return null;
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    {order.priority ? (
                      <Badge className={priorityColors[order.priority] || ''}>{order.priority}</Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
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
