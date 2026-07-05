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

const OperationsPage: React.FC = () => {
  const { operations, addOperation, updateOperation, deleteOperation, absenceOperationId } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Operation | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<OperationCategory>('operator');

  const operatorOps = operations.filter(o => o.category === 'operator' && o.id !== absenceOperationId);
  const subcontractorOps = operations.filter(o => o.category === 'subcontractor');

  const openNew = (cat: OperationCategory) => {
    setEditing(null);
    setName('');
    setCategory(cat);
    setDialogOpen(true);
  };

  const openEdit = (op: Operation) => {
    setEditing(op);
    setName(op.name);
    setCategory(op.category);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      updateOperation({ ...editing, name, category });
    } else {
      addOperation({ id: crypto.randomUUID(), name, category });
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
              <TableHead className="w-24">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(op => (
              <TableRow key={op.id}>
                <TableCell className="font-medium">{op.name}</TableCell>
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
                <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
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

      <div className="min-h-0 flex-1 space-y-8 overflow-auto">
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
