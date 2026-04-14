import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { QCDecision, QualityControlEntry } from '@/types/planning';

const priorityColors: Record<string, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
};

const decisionLabels: Record<QCDecision, string> = {
  'conforme': 'Conforme',
  'reprise-retouche': 'Reprise/Retouche',
  'conforme-derogation': 'Conforme avec dérogation',
  'non-conforme': 'Non conforme',
};

const decisionColors: Record<QCDecision, string> = {
  'conforme': 'bg-normal/15 text-normal',
  'reprise-retouche': 'bg-urgent/15 text-urgent',
  'conforme-derogation': 'bg-urgent-moderate/15 text-urgent-moderate',
  'non-conforme': 'bg-destructive/15 text-destructive',
};

const QualityControlPage: React.FC = () => {
  const {
    qcEntries, updateQCEntry, orders, clients,
    addDeliveryEntry, deleteQCEntry, deleteOrder,
    addStep, steps, holidays, operations, operators,
  } = usePlanning();

  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [reworkEntry, setReworkEntry] = useState<QualityControlEntry | null>(null);
  const [reworkNotes, setReworkNotes] = useState('');

  const handleDecisionChange = (entry: QualityControlEntry, decision: QCDecision) => {
    if (decision === 'reprise-retouche') {
      setReworkEntry(entry);
      setReworkNotes(entry.reworkNotes || '');
      setReworkDialogOpen(true);
      return;
    }

    if (decision === 'conforme' || decision === 'conforme-derogation') {
      addDeliveryEntry({
        id: crypto.randomUUID(),
        orderId: entry.orderId,
        controlDate: entry.controlDate,
        decision,
        movedAt: new Date().toISOString(),
      });
      deleteQCEntry(entry.id);
      return;
    }

    updateQCEntry({ ...entry, decision });
  };

  const handleReworkSave = () => {
    if (!reworkEntry) return;
    updateQCEntry({ ...reworkEntry, decision: 'reprise-retouche', reworkNotes });
    deleteQCEntry(reworkEntry.id);
    setReworkDialogOpen(false);
    setReworkEntry(null);
  };

  return (
    <div className="p-6">
      <PageHeader title="Contrôle Qualité" description={`${qcEntries.length} commande(s) en contrôle`} />

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
            {qcEntries.map(entry => {
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
                  <TableCell>
                    <Input
                      type="date"
                      value={entry.controlDate}
                      onChange={e => updateQCEntry({ ...entry, controlDate: e.target.value })}
                      className="w-36 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      value={entry.decision || ''}
                      onChange={e => handleDecisionChange(entry, e.target.value as QCDecision)}
                    >
                      <option value="">— Choisir —</option>
                      <option value="conforme">Conforme</option>
                      <option value="reprise-retouche">Reprise/Retouche</option>
                      <option value="conforme-derogation">Conforme avec dérogation</option>
                      <option value="non-conforme">Non conforme</option>
                    </select>
                    {entry.decision && (
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${decisionColors[entry.decision]}`}>
                        {decisionLabels[entry.decision]}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {qcEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Aucune commande en contrôle qualité.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Rework Dialog */}
      <Dialog open={reworkDialogOpen} onOpenChange={setReworkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Retouches nécessaires</DialogTitle>
            {reworkEntry && (() => {
              const order = getOrder(reworkEntry.orderId);
              return order ? (
                <p className="text-sm text-muted-foreground">
                  Commande : <span className="font-medium">{order.orderNumber}</span> — {order.designation}
                </p>
              ) : null;
            })()}
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium block">Décrivez les retouches à effectuer :</label>
            <Textarea
              value={reworkNotes}
              onChange={e => setReworkNotes(e.target.value)}
              placeholder="Détails des retouches nécessaires..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReworkDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleReworkSave}>Renvoyer en production</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QualityControlPage;
