import React, { useState, useMemo } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { addWorkMinutes, workMinutesBetween } from '@/lib/workTime';
import type { ProductionStep } from '@/types/planning';

const AbsencesPage: React.FC = () => {
  const { operators, steps, holidays, addStep, updateStep, deleteStep, absenceOperationId, absenceOrderId } = usePlanning();

  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [absOperatorId, setAbsOperatorId] = useState('');
  const [absStartDate, setAbsStartDate] = useState('');
  const [absStartTime, setAbsStartTime] = useState('08:00');
  const [absEndDate, setAbsEndDate] = useState('');
  const [absEndTime, setAbsEndTime] = useState('16:00');

  // Filter absence steps (current and future only)
  const absenceSteps = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return steps
      .filter(s => s.operationId === absenceOperationId && s.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [steps, absenceOperationId]);

  const openNew = () => {
    setEditingId(null);
    setAbsOperatorId(operators[0]?.id || '');
    const today = new Date().toISOString().split('T')[0];
    setAbsStartDate(today);
    setAbsEndDate(today);
    setAbsStartTime('08:00');
    setAbsEndTime('16:00');
    setDialogOpen(true);
  };

  const openEdit = (s: ProductionStep) => {
    setEditingId(s.id);
    setAbsOperatorId(s.operatorId);
    setAbsStartDate(s.startDate);
    setAbsStartTime(s.startTime || '08:00');
    setAbsEndDate(s.endDate);
    setAbsEndTime(s.endTime || '16:00');
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!absOperatorId || !absStartDate || !absEndDate) return;

    const absStart = new Date(`${absStartDate}T${absStartTime}`);
    const absEnd = new Date(`${absEndDate}T${absEndTime}`);
    const absDurationMin = workMinutesBetween(absStart, absEnd, holidays);
    if (absDurationMin <= 0) return;

    if (editingId) {
      updateStep({
        ...steps.find(s => s.id === editingId)!,
        operatorId: absOperatorId,
        estimatedDuration: absDurationMin,
        startDate: absStartDate,
        startTime: absStartTime,
        endDate: absEndDate,
        endTime: absEndTime,
      });
    } else {
      const absenceStep: ProductionStep = {
        id: crypto.randomUUID(),
        orderId: absenceOrderId,
        operatorId: absOperatorId,
        operationId: absenceOperationId,
        estimatedDuration: absDurationMin,
        startDate: absStartDate,
        startTime: absStartTime,
        endDate: absEndDate,
        endTime: absEndTime,
        order: 0,
      };
      addStep(absenceStep);

      // Shift overlapping steps for this operator
      const operatorSteps = steps.filter(
        s => s.operatorId === absOperatorId && s.operationId !== absenceOperationId
      );
      operatorSteps.forEach(s => {
        const stepStart = new Date(`${s.startDate}T${s.startTime}`);
        const stepEnd = new Date(`${s.endDate}T${s.endTime}`);
        if (stepStart < absEnd && stepEnd > absStart) {
          const newStart = addWorkMinutes(absEnd, 0, holidays);
          const newEnd = addWorkMinutes(newStart, s.estimatedDuration, holidays);
          updateStep({
            ...s,
            startDate: newStart.toISOString().split('T')[0],
            startTime: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
            endDate: newEnd.toISOString().split('T')[0],
            endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
          });
        }
      });
    }

    setDialogOpen(false);
  };

  const getOperatorName = (id: string) => operators.find(op => op.id === id)?.name || '—';

  const computeDuration = () => {
    if (!absStartDate || !absEndDate) return null;
    const s = new Date(`${absStartDate}T${absStartTime}`);
    const e = new Date(`${absEndDate}T${absEndTime}`);
    const dur = workMinutesBetween(s, e, holidays);
    return dur > 0 ? dur : null;
  };

  const dur = computeDuration();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="الغيابات"
          description="Gestion des absences des opérateurs"
          actions={
            <Button onClick={openNew} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>العامل</TableHead>
              <TableHead>تاريخ البداية</TableHead>
              <TableHead>ساعة البداية</TableHead>
              <TableHead>تاريخ النهاية</TableHead>
              <TableHead>ساعة النهاية</TableHead>
              <TableHead>مدة الغياب (سا)</TableHead>
              <TableHead className="w-24">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {absenceSteps.map(s => {
              const durationH = (s.estimatedDuration / 60).toFixed(1);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{getOperatorName(s.operatorId)}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(s.startDate)}</TableCell>
                  <TableCell className="text-sm">{s.startTime}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(s.endDate)}</TableCell>
                  <TableCell className="text-sm">{s.endTime}</TableCell>
                  <TableCell className="text-sm">{durationH}h</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => confirm('Êtes-vous sûr de vouloir supprimer cette absence ?', () => deleteStep(s.id))}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {absenceSteps.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Aucune absence en cours ou à venir.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingId ? 'Modifier' : 'Déclarer'} une absence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">العامل</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={absOperatorId}
                onChange={e => setAbsOperatorId(e.target.value)}
              >
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">تاريخ البداية</label>
                <Input type="date" value={absStartDate} onChange={e => setAbsStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">ساعة البداية</label>
                <Input type="time" value={absStartTime} onChange={e => setAbsStartTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">تاريخ النهاية</label>
                <Input type="date" value={absEndDate} onChange={e => setAbsEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">ساعة النهاية</label>
                <Input type="time" value={absEndTime} onChange={e => setAbsEndTime(e.target.value)} />
              </div>
            </div>
            {dur && (
              <p className="text-xs text-muted-foreground">
                Durée d'absence : <strong>{(dur / 60).toFixed(2)}h</strong> ({dur} min de travail)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!absOperatorId || !absStartDate || !absEndDate}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default AbsencesPage;
