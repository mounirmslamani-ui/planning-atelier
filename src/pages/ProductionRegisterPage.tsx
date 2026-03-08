import React from 'react';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

const ProductionRegisterPage: React.FC = () => {
  const { productionRecords, deleteProductionRecord, operators, operations, orders } = usePlanning();

  const getOperatorName = (id: string) => operators.find(o => o.id === id)?.name || '—';
  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const getOrder = (id: string) => orders.find(o => o.id === id);

  // Group by operator
  const grouped = operators
    .map(op => ({
      operator: op,
      records: productionRecords
        .filter(r => r.operatorId === op.id)
        .sort((a, b) => new Date(b.validatedAt).getTime() - new Date(a.validatedAt).getTime()),
    }))
    .filter(g => g.records.length > 0);

  const totalHours = (records: typeof productionRecords) =>
    records.reduce((sum, r) => sum + r.actualDuration, 0) / 60;

  return (
    <div>
      <PageHeader title="Registre de Production" description="Travaux validés classés par opérateur" />

      {grouped.length === 0 && (
        <p className="text-muted-foreground text-sm px-4 py-8 text-center">
          Aucun travail validé. Glissez un bloc du planning vers l'icône ⚙✓ pour enregistrer une production.
        </p>
      )}

      {grouped.map(({ operator, records }) => (
        <div key={operator.id} className="mb-8">
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-y">
            <h2 className="font-heading text-sm font-bold">{operator.name}</h2>
            <span className="text-xs text-muted-foreground">({operator.mainFunction})</span>
            <span className="ml-auto text-xs font-medium text-primary">
              Total : {totalHours(records).toFixed(2)}h
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Commande</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead>Opération</TableHead>
                <TableHead className="text-right">Durée réelle (h)</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(rec => {
                const order = getOrder(rec.orderId);
                return (
                  <TableRow key={rec.id}>
                    <TableCell className="text-xs">
                      {new Date(rec.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {' '}
                      {new Date(rec.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="font-medium">{order?.orderNumber || '—'}</TableCell>
                    <TableCell className="text-xs">{order?.designation || '—'}</TableCell>
                    <TableCell>{getOperationName(rec.operationId)}</TableCell>
                    <TableCell className="text-right font-medium">{(rec.actualDuration / 60).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteProductionRecord(rec.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
};

export default ProductionRegisterPage;
