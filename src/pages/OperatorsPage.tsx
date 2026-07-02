import React, { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import type { Operator } from '@/types/planning';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { getOperationLabel, resolveOperationId } from '@/lib/operationLinks';

const OperatorsPage: React.FC = () => {
  const { operators, addOperator, updateOperator, deleteOperator, operations, equipments, absenceOperationId } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [name, setName] = useState('');
  const [mainFunction, setMainFunction] = useState('');
  const [secondaryFunctions, setSecondaryFunctions] = useState<string[]>([]);
  const [newSecondary, setNewSecondary] = useState('');
  const [mainEquipment, setMainEquipment] = useState('');
  const [secondaryEquipments, setSecondaryEquipments] = useState<string[]>([]);
  const [newSecEquip, setNewSecEquip] = useState('');

  const operatorOps = operations.filter(o => o.category === 'operator' && o.id !== absenceOperationId);

  const openNew = () => {
    setEditing(null);
    setName('');
    setMainFunction(operatorOps[0]?.id || '');
    setSecondaryFunctions([]);
    setMainEquipment('');
    setSecondaryEquipments([]);
    setDialogOpen(true);
  };

  const openEdit = (op: Operator) => {
    setEditing(op);
    setName(op.name);
    setMainFunction(resolveOperationId(op.mainFunction, operations, 'operator') || operatorOps[0]?.id || '');
    setSecondaryFunctions(op.secondaryFunctions.map(fn => resolveOperationId(fn, operations, 'operator')).filter(Boolean));
    setMainEquipment(op.mainEquipment || '');
    setSecondaryEquipments([...(op.secondaryEquipments || [])]);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const data: Operator = {
      id: editing?.id || crypto.randomUUID(),
      name,
      mainFunction,
      secondaryFunctions,
      mainEquipment: mainEquipment || undefined,
      secondaryEquipments: secondaryEquipments.length > 0 ? secondaryEquipments : undefined,
    };
    if (editing) updateOperator(data);
    else addOperator(data);
    setDialogOpen(false);
  };

  const addSecondary = () => {
    if (newSecondary && !secondaryFunctions.includes(newSecondary)) {
      setSecondaryFunctions(prev => [...prev, newSecondary]);
      setNewSecondary('');
    }
  };

  const removeSecondary = (fn: string) => {
    setSecondaryFunctions(prev => prev.filter(f => f !== fn));
  };

  const addSecEquip = () => {
    if (newSecEquip && !secondaryEquipments.includes(newSecEquip)) {
      setSecondaryEquipments(prev => [...prev, newSecEquip]);
      setNewSecEquip('');
    }
  };

  const removeSecEquip = (id: string) => {
    setSecondaryEquipments(prev => prev.filter(e => e !== id));
  };

  const getEquipName = (id: string) => equipments.find(e => e.id === id)?.designation || id;

  const accessors = {
    name: (o: Operator) => o.name,
    mainFunction: (o: Operator) => getOperationLabel(o.mainFunction, operations, 'operator'),
    secondaryFunctions: (o: Operator) => o.secondaryFunctions.map(fn => getOperationLabel(fn, operations, 'operator')).join(', '),
    mainEquipment: (o: Operator) => o.mainEquipment ? getEquipName(o.mainEquipment) : '',
    secondaryEquipments: (o: Operator) => (o.secondaryEquipments || []).map(getEquipName).join(', '),
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter, allValuesByKey } = useTableSortFilter(operators, accessors);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="العمال"
          description={`${operators.length} opérateur(s) enregistré(s) — max 25`}
          actions={
            <Button onClick={openNew} disabled={operators.length >= 25} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="الاسم" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.name || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="اختصاص" columnKey="mainFunction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.mainFunction || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="مهارات أخرى" columnKey="secondaryFunctions" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.secondaryFunctions || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="الآلة الرئيسية" columnKey="mainEquipment" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.mainEquipment || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="آلات أخرى" columnKey="secondaryEquipments" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.secondaryEquipments || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="w-24">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(op => (
              <TableRow key={op.id}>
                <TableCell className="font-medium">{op.name}</TableCell>
                <TableCell>
                  {resolveOperationId(op.mainFunction, operations, 'operator') === absenceOperationId ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive">
                      ⚠ Non définie
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      {getOperationLabel(op.mainFunction, operations, 'operator')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {op.secondaryFunctions.map(fn => (
                      <span key={fn} className="inline-block px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                        {getOperationLabel(fn, operations, 'operator')}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {op.mainEquipment && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      {getEquipName(op.mainEquipment)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(op.secondaryEquipments || []).map(eqId => (
                      <span key={eqId} className="inline-block px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                        {getEquipName(eqId)}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(op)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm(`هل تؤكد حذف العامل "${op.name}" ؟`, () => deleteOperator(op.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {operators.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Aucun opérateur. Cliquez sur "Ajouter" pour commencer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'تعديل عامل' : 'Ajouter un opérateur'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">الاسم</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom de l'opérateur" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">اختصاص</label>
              <select 
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={mainFunction} 
                onChange={e => setMainFunction(e.target.value)}
              >
                  {operatorOps.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">مهارات أخرى</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {secondaryFunctions.map(fn => (
                  <span key={fn} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {getOperationLabel(fn, operations, 'operator')}
                    <button onClick={() => removeSecondary(fn)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select 
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  value={newSecondary} 
                  onChange={e => setNewSecondary(e.target.value)}
                >
                  <option value="">Sélectionner...</option>
                  {operatorOps.filter(o => o.id !== mainFunction && !secondaryFunctions.includes(o.id)).map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={addSecondary} disabled={!newSecondary}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Equipment sections */}
            <div>
              <label className="text-sm font-medium mb-1 block">الآلة الرئيسية</label>
              <select 
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={mainEquipment} 
                onChange={e => setMainEquipment(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {equipments.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.designation} ({eq.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">آلات أخرى</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {secondaryEquipments.map(eqId => (
                  <span key={eqId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {getEquipName(eqId)}
                    <button onClick={() => removeSecEquip(eqId)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select 
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  value={newSecEquip} 
                  onChange={e => setNewSecEquip(e.target.value)}
                >
                  <option value="">Sélectionner...</option>
                  {equipments.filter(eq => eq.id !== mainEquipment && !secondaryEquipments.includes(eq.id)).map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.designation} ({eq.type})</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={addSecEquip} disabled={!newSecEquip}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!name || !mainFunction}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default OperatorsPage;
