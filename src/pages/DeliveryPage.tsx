import React from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const urgencyLabels: Record<string, string> = {
  urgent: 'Urgent', moderate: 'Modéré', normal: 'Normal', 'not-urgent': 'Pas urgent',
};
const urgencyColors: Record<string, string> = {
  urgent: 'bg-urgent/15 text-urgent',
  moderate: 'bg-urgent-moderate/15 text-urgent-moderate',
  normal: 'bg-normal/15 text-normal',
  'not-urgent': 'bg-muted text-muted-foreground',
};
const priorityColors: Record<string, string> = {
  'P1-A': 'bg-destructive text-destructive-foreground',
  'P1-B': 'bg-destructive/80 text-destructive-foreground',
  'P1-C': 'bg-destructive/60 text-destructive-foreground',
  'P2-A': 'bg-urgent-moderate text-white',
  'P2-B': 'bg-urgent-moderate/80 text-white',
  'P2-C': 'bg-urgent-moderate/60 text-white',
  'P3-A': 'bg-normal text-white',
  'P3-B': 'bg-normal/70 text-white',
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
              <TableHead>Urgence</TableHead>
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
                  <TableCell className="text-sm">{order.orderDate}</TableCell>
                  <TableCell className="text-sm">{getClientName(order.clientId)}</TableCell>
                  <TableCell className="text-sm max-w-48 truncate">{order.designation}</TableCell>
                  <TableCell className="text-sm">{order.quantity}</TableCell>
                  <TableCell>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${urgencyColors[order.urgency] || ''}`}>
                      {urgencyLabels[order.urgency] || order.urgency}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{order.plannedDeadline}</TableCell>
                  <TableCell className="text-sm">{entry.controlDate}</TableCell>
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
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
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
