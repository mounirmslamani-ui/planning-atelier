import React, { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Operation, OperationCategory } from '@/types/planning';
import MoneyInput from '@/components/ui/money-input';
import { formatDA } from '@/lib/utils';

const OperationsPage: React.FC = () => {
  const { operations, addOperation, updateOperation, deleteOperation, absenceOperationId } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Operation | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<OperationCategory>('operator');
  const [hourlyRate1, setHourlyRate1] = useState<number | undefined>(undefined);
  const [hourlyRate2, setHourlyRate2] = useState<number | undefined>(undefined);

  const operatorOps = operations.filter(o => o.category === 'operator' && o.id !== absenceOperationId);
  const subcontractorOps = operations.filter(o => o.category === 'subcontractor');

  const openNew = (cat: OperationCategory) => {
    setEditing(null);
    setName('');
    setCategory(cat);
    setHourlyRate1(undefined);
    setHourlyRate2(undefined);
    setDialogOpen(true);
  };

  const openEdit = (op: Operation) => {
    setEditing(op);
    setName(op.name);
    setCategory(op.category);
    setHourlyRate1(op.hourlyRate1);
    setHourlyRate2(op.hourlyRate2);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      updateOperation({ ...editing, name, category, hourlyRate1, hourlyRate2 });
    } else {
      addOperation({ id: crypto.randomUUID(), name, category, hourlyRate1, hourlyRate2 });
    }
    setDialogOpen(false);
  };

  const renderTable = (title: string, items: Operation[], cat: OperationCategory) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-base font-heading font-semibold text-foreground">{title}</h2>
        <Button onClick={() => openNew(cat)} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="w-32">التكلفة الساعية 1</TableHead>
              <TableHead className="w-32">التكلفة الساعية 2</TableHead>
              <TableHead className="w-24">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(op => (
              <TableRow key={op.id}>
                <TableCell className="font-medium">{op.name}</TableCell>
                <TableCell>{op.hourlyRate1 != null ? formatDA(op.hourlyRate1) : '—'}</TableCell>
                <TableCell>{op.hourlyRate2 != null ? formatDA(op.hourlyRate2) : '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(op)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm(`هل تؤكد حذف العملية "${op.name}" ؟`, () => deleteOperation(op.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  Aucune opération. Cliquez sur "Ajouter" pour commencer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="العمليات" description="Définir les opérations pour les opérateurs et les sous-traitants" />
      </div>

      <div className="min-h-0 flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-hidden">
        {renderTable('Opérations opérateurs', operatorOps, 'operator')}
        {renderTable('Opérations sous-traitants', subcontractorOps, 'subcontractor')}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? 'Modifier' : 'Ajouter'} une opération {category === 'operator' ? 'opérateur' : 'sous-traitant'}
            </DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l'opération" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">التكلفة الساعية 1</label>
              <MoneyInput value={hourlyRate1} onValueChange={setHourlyRate1} currencyLabel="دج" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">التكلفة الساعية 2</label>
              <MoneyInput value={hourlyRate2} onValueChange={setHourlyRate2} currencyLabel="دج" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!name}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default OperationsPage;
