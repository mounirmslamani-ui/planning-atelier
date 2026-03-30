import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, CalendarCheck } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { scheduleOrder } from '@/lib/scheduler';
import type { Order } from '@/types/planning';
import type { OperationToSchedule } from '@/lib/scheduler';

interface OperationRow {
  id: string;
  stepId?: string;
  order: number;
  operationId: string;
  estimatedDuration: number;
  assignType: 'operator' | 'subcontractor';
  option1: string;
  option2: string;
  option3: string;
  equipmentIds: string[];
}

interface Props {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OrderPlanningDialog: React.FC<Props> = ({ order, open, onOpenChange }) => {
  const {
    operators, subcontractors, operations, steps, orders, holidays, equipments,
    addStep, updateStep, deleteStep,
  } = usePlanning();

  const [rows, setRows] = useState<OperationRow[]>([]);

  // Pre-populate rows from existing steps when dialog opens
  useEffect(() => {
    if (!open) return;

    const existingSteps = steps
      .filter(s => s.orderId === order.id && s.operationId !== 'op-8')
      .sort((a, b) => a.order - b.order);

    if (existingSteps.length > 0) {
      setRows(existingSteps.map((s, i) => {
        const isSub = !!s.subcontractorId;
        return {
          id: `row-${s.id}`,
          stepId: s.id,
          order: i + 1,
          operationId: s.operationId,
          estimatedDuration: s.estimatedDuration,
          assignType: isSub ? 'subcontractor' : 'operator',
          option1: isSub ? s.subcontractorId! : s.operatorId,
          option2: '',
          option3: '',
          equipmentIds: s.equipmentIds || [],
        };
      }));
    } else {
      setRows([]);
    }
  }, [open, order.id, steps]);

  const addRow = () => {
    setRows(prev => [...prev, {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      order: prev.length + 1,
      operationId: operations[0]?.id || '',
      estimatedDuration: 60,
      assignType: 'operator',
      option1: '',
      option2: '',
      option3: '',
      equipmentIds: [],
    }]);
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id).map((r, i) => ({ ...r, order: i + 1 })));
  };

  const updateRow = (id: string, field: keyof OperationRow, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'assignType') {
        updated.option1 = '';
        updated.option2 = '';
        updated.option3 = '';
      }
      return updated;
    }));
  };

  const getAssigneeOptions = (type: 'operator' | 'subcontractor') => {
    if (type === 'operator') {
      return operators.map(op => ({ value: op.id, label: op.name }));
    }
    return subcontractors.map(s => ({ value: s.id, label: s.companyName }));
  };

  const handlePlanifier = () => {
    const deadline = order.deliveryDeadline || order.plannedDeadline || '9999-12-31';

    // Remove all existing steps for this order (will be re-created by scheduler)
    const existingOrderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== 'op-8');
    existingOrderSteps.forEach(s => deleteStep(s.id));

    // Build operations to schedule from current rows
    const stepsWithoutThisOrder = steps.filter(s => s.orderId !== order.id || s.operationId === 'op-8');

    const opsToSchedule: OperationToSchedule[] = rows.map(row => {
      const isSub = row.assignType === 'subcontractor';
      const options = [row.option1, row.option2, row.option3]
        .filter(Boolean)
        .map(id => ({ id, isSub }));

      return {
        operationId: row.operationId,
        estimatedDuration: row.estimatedDuration,
        options,
      };
    });

    const { newSteps, updatedSteps } = scheduleOrder(
      order.id,
      deadline,
      opsToSchedule,
      stepsWithoutThisOrder,
      orders,
      holidays
    );

    newSteps.forEach(s => addStep(s));
    updatedSteps.forEach(s => updateStep(s));

    onOpenChange(false);
  };

  const renderAssigneeSelect = (row: OperationRow, field: 'option1' | 'option2' | 'option3') => {
    const options = getAssigneeOptions(row.assignType);
    return (
      <select
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        value={row[field]}
        onChange={e => updateRow(row.id, field, e.target.value)}
      >
        <option value="">— Aucun —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  };

  const durationUnit = (type: 'operator' | 'subcontractor') =>
    type === 'subcontractor' ? 'j' : 'h';

  const durationStep = (type: 'operator' | 'subcontractor') =>
    type === 'subcontractor' ? 0.5 : 0.25;

  const durationFactor = (type: 'operator' | 'subcontractor') =>
    type === 'subcontractor' ? 450 : 60;

  const hasExistingSteps = steps.some(s => s.orderId === order.id && s.operationId !== 'op-8');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {hasExistingSteps ? 'Modifier' : 'Planifier'} la commande {order.orderNumber}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {order.designation} — Délai : {order.deliveryDeadline || order.plannedDeadline || 'Non défini'}
          </p>
        </DialogHeader>

        <div className="bg-card rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Opération</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-24">Durée est.</TableHead>
                <TableHead>Option 1</TableHead>
                <TableHead>Option 2</TableHead>
                <TableHead>Option 3</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm font-medium">{row.order}</TableCell>
                  <TableCell>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      value={row.operationId}
                      onChange={e => updateRow(row.id, 'operationId', e.target.value)}
                    >
                      {operations
                        .filter(o => o.id !== 'op-8' && o.category === row.assignType)
                        .map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      value={row.assignType}
                      onChange={e => updateRow(row.id, 'assignType', e.target.value)}
                    >
                      <option value="operator">Opérateur</option>
                      <option value="subcontractor">Sous-trait.</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        step={durationStep(row.assignType)}
                        className="h-8 text-xs w-16"
                        value={parseFloat((row.estimatedDuration / durationFactor(row.assignType)).toFixed(2))}
                        onChange={e => updateRow(row.id, 'estimatedDuration',
                          Math.round((parseFloat(e.target.value) || 0) * durationFactor(row.assignType))
                        )}
                      />
                      <span className="text-xs text-muted-foreground">{durationUnit(row.assignType)}</span>
                    </div>
                  </TableCell>
                  <TableCell>{renderAssigneeSelect(row, 'option1')}</TableCell>
                  <TableCell>{renderAssigneeSelect(row, 'option2')}</TableCell>
                  <TableCell>{renderAssigneeSelect(row, 'option3')}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(row.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Ajoutez des opérations pour cette commande.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter une opération
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handlePlanifier} disabled={rows.length === 0 || rows.every(r => !r.option1)}>
            <CalendarCheck className="w-4 h-4 mr-1" /> {hasExistingSteps ? 'Replanifier' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderPlanningDialog;
