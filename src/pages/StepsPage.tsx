import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { ProductionStep, Holiday } from '@/types/planning';
import { addWorkMinutes, workMinutesBetween } from '@/lib/workTime';

function computeThirdField(
  startDate: string, startTime: string, endDate: string, endTime: string, duration: number, holidays: Holiday[]
): { endDate: string; endTime: string; duration: number } {
  // If start + duration → compute end (using work-time)
  if (startDate && startTime && duration > 0 && (!endDate || !endTime)) {
    const start = new Date(`${startDate}T${startTime}`);
    const end = addWorkMinutes(start, duration, holidays);
    return {
      endDate: end.toISOString().split('T')[0],
      endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
      duration
    };
  }
  // If start + end → compute duration (using work-time)
  if (startDate && startTime && endDate && endTime && duration <= 0) {
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    const workMin = workMinutesBetween(start, end, holidays);
    return { endDate, endTime, duration: Math.max(0, workMin) };
  }
  // If end + duration → compute start (keep end, return)
  return { endDate, endTime, duration };
}

const StepsPage: React.FC = () => {
  const { steps, addStep, updateStep, deleteStep, orders, operators, operations, holidays, subcontractors } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionStep | null>(null);
  const [assignType, setAssignType] = useState<'operator' | 'subcontractor'>('operator');

  const emptyStep = (): Omit<ProductionStep, 'id'> => ({
    orderId: orders[0]?.id || '',
    operatorId: operators[0]?.id || '',
    subcontractorId: undefined,
    operationId: operations[0]?.id || '',
    estimatedDuration: 60,
    startDate: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endDate: '',
    endTime: '',
    order: steps.length + 1,
  });

  const [form, setForm] = useState<Omit<ProductionStep, 'id'>>(emptyStep());

  const openNew = () => { setEditing(null); setForm(emptyStep()); setAssignType('operator'); setDialogOpen(true); };
  const openEdit = (s: ProductionStep) => {
    setEditing(s);
    const { id, ...rest } = s;
    setForm(rest);
    setAssignType(s.subcontractorId ? 'subcontractor' : 'operator');
    setDialogOpen(true);
  };

  const handleSave = () => {
    const computed = computeThirdField(form.startDate, form.startTime, form.endDate, form.endTime, form.estimatedDuration, holidays);
    const data: ProductionStep = { id: editing?.id || `step-${Date.now()}`, ...form, ...computed, estimatedDuration: computed.duration };
    if (editing) updateStep(data);
    else addStep(data);
    setDialogOpen(false);
  };

  const updateForm = (key: string, value: any) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Auto-compute when 2 of 3 fields are set
      if (['startDate', 'startTime', 'estimatedDuration'].includes(key)) {
        if (next.startDate && next.startTime && next.estimatedDuration > 0) {
          const c = computeThirdField(next.startDate, next.startTime, '', '', next.estimatedDuration, holidays);
          next.endDate = c.endDate;
          next.endTime = c.endTime;
        }
      }
      if (['endDate', 'endTime'].includes(key)) {
        if (next.startDate && next.startTime && next.endDate && next.endTime) {
          const c = computeThirdField(next.startDate, next.startTime, next.endDate, next.endTime, 0, holidays);
          next.estimatedDuration = c.duration;
        }
      }
      return next;
    });
  };

  const getOrderNumber = (id: string) => orders.find(o => o.id === id)?.orderNumber || '—';
  const getOperatorName = (id: string) => operators.find(o => o.id === id)?.name || '—';
  const getSubcontractorName = (id: string) => subcontractors.find(s => s.id === id)?.companyName || '—';
  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const getAssigneeName = (s: ProductionStep) => s.subcontractorId ? `🏭 ${getSubcontractorName(s.subcontractorId)}` : getOperatorName(s.operatorId);

  return (
    <div className="p-6">
      <PageHeader title="Affectations" description="Assignation des opérateurs et durées estimatives" actions={
        <Button onClick={openNew} size="sm" disabled={orders.length === 0}><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      } />
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Commande</TableHead>
              <TableHead>Assigné à</TableHead>
              <TableHead>Opération</TableHead>
              <TableHead>Durée (min)</TableHead>
              <TableHead>Début</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.sort((a, b) => a.order - b.order).map(s => (
              <TableRow key={s.id}>
                <TableCell className="text-sm">{s.order}</TableCell>
                <TableCell className="font-heading text-sm">{getOrderNumber(s.orderId)}</TableCell>
                <TableCell className="text-sm">{getAssigneeName(s)}</TableCell>
                <TableCell className="text-sm">{getOperationName(s.operationId)}</TableCell>
                <TableCell className="text-sm">{s.estimatedDuration}</TableCell>
                <TableCell className="text-sm">{s.startDate} {s.startTime}</TableCell>
                <TableCell className="text-sm">{s.endDate} {s.endTime}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteStep(s.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {steps.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Aucune étape. Ajoutez d'abord une commande.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} une étape</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Commande</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.orderId} onChange={e => updateForm('orderId', e.target.value)}>
                {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} — {o.designation}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Assigner à</label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${assignType === 'operator' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  onClick={() => { setAssignType('operator'); updateForm('subcontractorId', undefined); updateForm('operatorId', operators[0]?.id || ''); }}
                >
                  Opérateur
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${assignType === 'subcontractor' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  onClick={() => { setAssignType('subcontractor'); updateForm('operatorId', ''); updateForm('subcontractorId', subcontractors[0]?.id || ''); }}
                >
                  Sous-traitant
                </button>
              </div>
              {assignType === 'operator' ? (
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.operatorId} onChange={e => updateForm('operatorId', e.target.value)}>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : (
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.subcontractorId || ''} onChange={e => updateForm('subcontractorId', e.target.value)}>
                  {subcontractors.map(s => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Opération</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.operationId} onChange={e => updateForm('operationId', e.target.value)}>
                {operations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Ordre chronologique</label>
              <Input type="number" min={1} value={form.order} onChange={e => updateForm('order', parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date début</label>
              <Input type="date" value={form.startDate} onChange={e => updateForm('startDate', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Heure début</label>
              <Input type="time" value={form.startTime} onChange={e => updateForm('startTime', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Durée estimée (min)</label>
              <Input type="number" min={0} value={form.estimatedDuration} onChange={e => updateForm('estimatedDuration', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date fin (auto-calculée)</label>
              <Input type="date" value={form.endDate} onChange={e => updateForm('endDate', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Heure fin (auto-calculée)</label>
              <Input type="time" value={form.endTime} onChange={e => updateForm('endTime', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Dépend de (étape)</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.dependsOn || ''} onChange={e => updateForm('dependsOn', e.target.value || undefined)}>
                <option value="">Aucune dépendance</option>
                {steps.filter(s => s.id !== editing?.id).map(s => (
                  <option key={s.id} value={s.id}>#{s.order} — {getOrderNumber(s.orderId)}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.orderId || !form.operatorId}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StepsPage;
