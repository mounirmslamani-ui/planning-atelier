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
import ColumnHeader from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePromptDialog from '@/components/DatePromptDialog';
import { getOrderQualityControlCheck, buildOrderQualityControlErrorMessage } from '@/lib/stepProgress';
import { Download, Trash2 } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';

const decisionLabels: Record<QCDecision, string> = {
  'conforme': 'مطابق للمواصفات',
  'reprise-retouche': 'إعادة/تعديل',
  'conforme-derogation': 'مطابق للمواصفات بصفة استثنائية',
  'non-conforme': 'غير مطابق للمواصفات',
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
    productionRecords, absenceOperationId,
  } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [reworkEntry, setReworkEntry] = useState<QualityControlEntry | null>(null);
  const [reworkNotes, setReworkNotes] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{ entry: QualityControlEntry; decision: QCDecision } | null>(null);
  const [datePromptOpen, setDatePromptOpen] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const applyDecisionChange = (entry: QualityControlEntry, decision: QCDecision, controlDate: string) => {
    const datedEntry = { ...entry, controlDate };
    if (decision === 'reprise-retouche') {
      setReworkEntry(datedEntry);
      setReworkNotes(datedEntry.reworkNotes || '');
      setReworkDialogOpen(true);
      return;
    }

    if (decision === 'conforme' || decision === 'conforme-derogation') {
      addDeliveryEntry({
        id: crypto.randomUUID(),
        orderId: datedEntry.orderId,
        controlDate,
        decision,
        movedAt: new Date().toISOString(),
      });
      deleteQCEntry(datedEntry.id);
      return;
    }

    updateQCEntry({ ...datedEntry, decision });
  };

  const handleDecisionChange = (entry: QualityControlEntry, decision: QCDecision) => {
    if (!decision) return;
    setPendingDecision({ entry, decision });
  };

  const handleReworkSave = () => {
    if (!reworkEntry) return;
    updateQCEntry({ ...reworkEntry, decision: 'reprise-retouche', reworkNotes });
    deleteQCEntry(reworkEntry.id);
    setReworkDialogOpen(false);
    setReworkEntry(null);
  };

  const accessors = {
    priority: (e: QualityControlEntry) => getOrder(e.orderId)?.priority || '',
    orderNumber: (e: QualityControlEntry) => getOrder(e.orderId)?.orderNumber || '',
    orderDate: (e: QualityControlEntry) => getOrder(e.orderId)?.orderDate || '',
    client: (e: QualityControlEntry) => getClientName(getOrder(e.orderId)?.clientId || ''),
    designation: (e: QualityControlEntry) => getOrder(e.orderId)?.designation || '',
    quantity: (e: QualityControlEntry) => getOrder(e.orderId)?.quantity ?? 0,
    deadline: (e: QualityControlEntry) => getOrder(e.orderId)?.plannedDeadline || '',
    controlDate: (e: QualityControlEntry) => e.controlDate,
    decision: (e: QualityControlEntry) => e.decision ? decisionLabels[e.decision] : '',
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(qcEntries, accessors);

  const handleExportExcel = () => {
    exportTableToExcel('مراقبة الجودة', processed.map(entry => {
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
        Décision: entry.decision ? decisionLabels[entry.decision] : '—',
      };
    }), [12, 20, 14, 24, 45, 10, 14, 16, 26]);
  };
  const testDiagnostic = (() => {
    const testOrders = orders.filter(order => order.orderNumber.trim().toLowerCase() === 'test');
    if (testOrders.length === 0) return null;
    const candidates = testOrders
      .map(order => ({ order, check: getOrderQualityControlCheck(order.id, steps, productionRecords, absenceOperationId) }))
      .sort((a, b) => b.check.totalSteps - a.check.totalSteps);
    const current = candidates[0];
    if (!current) return null;
    if (current.check.isReady) {
      const inQc = qcEntries.some(entry => entry.orderId === current.order.id);
      return `Diagnostic Test : ${current.check.completedSteps}/${current.check.totalSteps} étape(s) terminée(s). ${inQc ? 'Transfert vers Contrôle Qualité effectué.' : 'Prête pour transfert automatique.'}`;
    }
    const reason = buildOrderQualityControlErrorMessage(current.order.id, steps, productionRecords, absenceOperationId);
    return `Diagnostic Test : ${current.check.completedSteps}/${current.check.totalSteps} étape(s) terminée(s). Blocage : ${reason}`;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="مراقبة الجودة" description={`${qcEntries.length} commande(s) en contrôle`} actions={
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        } />
        {testDiagnostic && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground">
            {testDiagnostic}
          </div>
        )}
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
                      <option value="conforme">مطابق للمواصفات</option>
                      <option value="reprise-retouche">إعادة/تعديل</option>
                      <option value="conforme-derogation">مطابق للمواصفات بصفة استثنائية</option>
                      <option value="non-conforme">غير مطابق للمواصفات</option>
                    </select>
                    {entry.decision && (
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${decisionColors[entry.decision]}`}>
                        {decisionLabels[entry.decision]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => confirm(
                        'Êtes-vous sûr de vouloir retirer cette commande du contrôle qualité ?',
                        () => { deleteQCEntry(entry.id); toast.success('Commande retirée du contrôle qualité'); },
                        { variant: 'destructive' }
                      )}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {qcEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
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
            <DialogTitle className="font-heading">تعديلات مطلوبة</DialogTitle>
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
            <Button variant="outline" onClick={() => setReworkDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleReworkSave}>إعادة إلى الإنتاج</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDecision && !datePromptOpen}
        title="هل تؤكد هذه العملية؟"
        onConfirm={() => setDatePromptOpen(true)}
        onCancel={() => setPendingDecision(null)}
      />

      {pendingDecision && datePromptOpen && (
        <DatePromptDialog
          open={datePromptOpen}
          label="تاريخ مراقبة الجودة"
          defaultDate={pendingDecision.entry.controlDate || today}
          onConfirm={(date) => {
            applyDecisionChange(pendingDecision.entry, pendingDecision.decision, date);
            setDatePromptOpen(false);
            setPendingDecision(null);
          }}
          onCancel={() => {
            setDatePromptOpen(false);
            setPendingDecision(null);
          }}
        />
      )}
    </div>
  );
};

export default QualityControlPage;
