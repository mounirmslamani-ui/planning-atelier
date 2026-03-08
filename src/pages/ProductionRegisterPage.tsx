import React, { useState } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

const ProductionRegisterPage: React.FC = () => {
  const { productionRecords, deleteProductionRecord, operators, operations, orders } = usePlanning();

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const getOrder = (id: string) => orders.find(o => o.id === id);

  const operatorsWithRecords = operators.filter(op =>
    productionRecords.some(r => r.operatorId === op.id)
  );

  const [activeTab, setActiveTab] = useState<string | null>(operatorsWithRecords[0]?.id || null);

  // Update activeTab if current one has no records anymore
  const validTab = activeTab && operatorsWithRecords.some(o => o.id === activeTab) ? activeTab : operatorsWithRecords[0]?.id || null;

  const activeRecords = validTab
    ? productionRecords
        .filter(r => r.operatorId === validTab)
        .sort((a, b) => new Date(b.validatedAt).getTime() - new Date(a.validatedAt).getTime())
    : [];

  const totalHours = activeRecords.reduce((sum, r) => sum + r.actualDuration, 0) / 60;
  const activeOperator = operators.find(o => o.id === validTab);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Registre de Production" description="Travaux validés classés par opérateur" />

      {operatorsWithRecords.length === 0 ? (
        <p className="text-muted-foreground text-sm px-4 py-8 text-center">
          Aucun travail validé. Glissez un bloc du planning vers l'icône ⚙✓ pour enregistrer une production.
        </p>
      ) : (
        <>
          {/* Tabs row */}
          <div className="flex items-end gap-0 px-4 pt-4 border-b border-border">
            {operatorsWithRecords.map(op => {
              const isActive = op.id === validTab;
              const opRecords = productionRecords.filter(r => r.operatorId === op.id);
              const opTotal = opRecords.reduce((s, r) => s + r.actualDuration, 0) / 60;
              return (
                <button
                  key={op.id}
                  onClick={() => setActiveTab(op.id)}
                  className={`relative px-4 py-2 text-xs font-medium border border-b-0 rounded-t-md transition-colors ${
                    isActive
                      ? 'bg-background text-foreground border-border -mb-px z-10'
                      : 'bg-muted/60 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className="font-heading">{op.name}</span>
                  <span className="ml-1.5 text-[10px] opacity-60">({opTotal.toFixed(1)}h)</span>
                </button>
              );
            })}
          </div>

          {/* Sheet content */}
          <div className="flex-1 overflow-auto px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm">
                <span className="font-heading font-bold">{activeOperator?.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">({activeOperator?.mainFunction})</span>
              </div>
              <span className="text-xs font-medium text-primary">Total : {totalHours.toFixed(2)}h</span>
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
                {activeRecords.map(rec => {
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
        </>
      )}
    </div>
  );
};

export default ProductionRegisterPage;
