import React, { useState, useEffect } from 'react';
import { formatDateFR } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, CalendarCheck, ChevronUp, ChevronDown } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { scheduleOrder } from '@/lib/scheduler';
import type { Order } from '@/types/planning';
import type { OperationToSchedule } from '@/lib/scheduler';
import DatePromptDialog from '@/components/DatePromptDialog';

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
  studyReady: boolean;
  materialAvailable: boolean;
  toolingAvailable: boolean;
  subcontractingDone: boolean;
  studyDeadline: string;
  materialDeadline: string;
  toolingDeadline: string;
  subcontractingDeadline: string;
}

interface Props {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OrderPlanningDialog: React.FC<Props> = ({ order, open, onOpenChange }) => {
  const {
    operators, subcontractors, operations, steps, orders, holidays, equipments,
    addStep, updateStep, deleteStep, absenceOperationId,
  } = usePlanning();

  const [rows, setRows] = useState<OperationRow[]>([]);
  const [datePrompt, setDatePrompt] = useState<{ rowId: string; field: 'studyDeadline' | 'materialDeadline' | 'toolingDeadline' | 'subcontractingDeadline'; label: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const existingSteps = steps
      .filter(s => s.orderId === order.id && s.operationId !== absenceOperationId)
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
          studyReady: s.studyReady ?? true,
          materialAvailable: s.materialAvailable ?? true,
          toolingAvailable: s.toolingAvailable ?? true,
          subcontractingDone: s.subcontractingDone ?? false,
          studyDeadline: s.studyDeadline || '',
          materialDeadline: s.materialDeadline || '',
          toolingDeadline: s.toolingDeadline || '',
          subcontractingDeadline: s.subcontractingDeadline || '',
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
      operationId: operations.filter(o => o.id !== absenceOperationId)[0]?.id || '',
      estimatedDuration: 60,
      assignType: 'operator',
      option1: '', option2: '', option3: '',
      equipmentIds: [],
      studyReady: true, materialAvailable: true, toolingAvailable: true, subcontractingDone: true,
      studyDeadline: '', materialDeadline: '', toolingDeadline: '', subcontractingDeadline: '',
    }]);
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id).map((r, i) => ({ ...r, order: i + 1 })));
  };

  const moveRow = (id: string, direction: 'up' | 'down') => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy.map((r, i) => ({ ...r, order: i + 1 }));
    });
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

  const handleCheckboxToggle = (rowId: string, field: 'studyReady' | 'materialAvailable' | 'toolingAvailable' | 'subcontractingDone', currentValue: boolean) => {
    if (currentValue) {
      // Unchecking: open date prompt
      const labels: Record<string, string> = {
        studyReady: 'Date prévue pour fin Étude',
        materialAvailable: 'Date prévue pour achat Matière',
        toolingAvailable: 'Date prévue pour achat Outillage',
        subcontractingDone: 'Date prévue pour fin Sous-traitance',
      };
      const deadlineFields: Record<string, 'studyDeadline' | 'materialDeadline' | 'toolingDeadline' | 'subcontractingDeadline'> = {
        studyReady: 'studyDeadline',
        materialAvailable: 'materialDeadline',
        toolingAvailable: 'toolingDeadline',
        subcontractingDone: 'subcontractingDeadline',
      };
      setDatePrompt({ rowId, field: deadlineFields[field], label: labels[field] });
      updateRow(rowId, field, false);
    } else {
      // Re-checking: clear the deadline
      const deadlineClear: Record<string, string> = {
        studyReady: 'studyDeadline',
        materialAvailable: 'materialDeadline',
        toolingAvailable: 'toolingDeadline',
        subcontractingDone: 'subcontractingDeadline',
      };
      updateRow(rowId, field, true);
      updateRow(rowId, deadlineClear[field] as keyof OperationRow, '');
    }
  };

  const getAssigneeOptions = (type: 'operator' | 'subcontractor') => {
    if (type === 'operator') return operators.map(op => ({ value: op.id, label: op.name }));
    return subcontractors.map(s => ({ value: s.id, label: s.companyName }));
  };

  const handlePlanifier = () => {
    const deadline = order.deliveryDeadline || order.plannedDeadline || '9999-12-31';
    const existingOrderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOperationId);
    existingOrderSteps.forEach(s => deleteStep(s.id));

    const stepsWithoutThisOrder = steps.filter(s => s.orderId !== order.id || s.operationId === absenceOperationId);
    const opsToSchedule: OperationToSchedule[] = rows.map(row => {
      const isSub = row.assignType === 'subcontractor';
      const options = [row.option1, row.option2, row.option3]
        .filter(Boolean)
        .map(id => ({ id, isSub }));
      return {
        operationId: row.operationId,
        estimatedDuration: row.estimatedDuration,
        options,
        equipmentIds: row.equipmentIds,
      };
    });

    const { newSteps, updatedSteps } = scheduleOrder(
      order.id, deadline, opsToSchedule, stepsWithoutThisOrder, orders, holidays, equipments
    );

    // Attach step-level prerequisites from rows
    newSteps.forEach((s, i) => {
      if (rows[i]) {
        s.studyReady = rows[i].studyReady;
        s.materialAvailable = rows[i].materialAvailable;
        s.toolingAvailable = rows[i].toolingAvailable;
        s.subcontractingDone = rows[i].subcontractingDone;
        s.studyDeadline = rows[i].studyDeadline;
        s.materialDeadline = rows[i].materialDeadline;
        s.toolingDeadline = rows[i].toolingDeadline;
        s.subcontractingDeadline = rows[i].subcontractingDeadline;
      }
      addStep(s);
    });
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

  const durationUnit = (type: 'operator' | 'subcontractor') => type === 'subcontractor' ? 'j' : 'h';
  const durationStep = (type: 'operator' | 'subcontractor') => type === 'subcontractor' ? 0.5 : 0.25;
  const durationFactor = (type: 'operator' | 'subcontractor') => type === 'subcontractor' ? 450 : 60;
  const hasExistingSteps = steps.some(s => s.orderId === order.id && s.operationId !== absenceOperationId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Définition des tâches et affectations</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {order.orderNumber} — {order.designation} — Délai : {formatDateFR(order.deliveryDeadline || order.plannedDeadline) || 'Non défini'}
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
                  <TableHead className="w-12 text-center text-xs">Étude</TableHead>
                  <TableHead className="w-12 text-center text-xs">Mat.</TableHead>
                  <TableHead className="w-12 text-center text-xs">Out.</TableHead>
                  <TableHead className="w-12 text-center text-xs">S-T</TableHead>
                  <TableHead className="w-12">Ordre</TableHead>
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
                          .filter(o => o.id !== absenceOperationId && o.category === row.assignType)
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
                    <TableCell className="text-center">
                      <Checkbox
                        checked={row.studyReady}
                        onCheckedChange={() => handleCheckboxToggle(row.id, 'studyReady', row.studyReady)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={row.materialAvailable}
                        onCheckedChange={() => handleCheckboxToggle(row.id, 'materialAvailable', row.materialAvailable)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={row.toolingAvailable}
                        onCheckedChange={() => handleCheckboxToggle(row.id, 'toolingAvailable', row.toolingAvailable)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={row.subcontractingDone}
                        onCheckedChange={() => handleCheckboxToggle(row.id, 'subcontractingDone', row.subcontractingDone)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 items-center">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRow(row.id, 'up')} disabled={row.order === 1}>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRow(row.id, 'down')} disabled={row.order === rows.length}>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeRow(row.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-muted-foreground py-6">
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handlePlanifier} disabled={rows.length === 0 || rows.every(r => !r.option1)}>
              <CalendarCheck className="w-4 h-4 mr-1" /> {hasExistingSteps ? 'Replanifier' : 'Planifier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {datePrompt && (
        <DatePromptDialog
          open={!!datePrompt}
          label={datePrompt.label}
          onConfirm={(date) => {
            updateRow(datePrompt.rowId, datePrompt.field, date);
            setDatePrompt(null);
          }}
          onCancel={() => {
            // Re-check the box since user cancelled
            const fieldMap: Record<string, keyof OperationRow> = {
              studyDeadline: 'studyReady',
              materialDeadline: 'materialAvailable',
              toolingDeadline: 'toolingAvailable',
              subcontractingDeadline: 'subcontractingDone',
            };
            updateRow(datePrompt.rowId, fieldMap[datePrompt.field], true);
            setDatePrompt(null);
          }}
        />
      )}
    </>
  );
};

export default OrderPlanningDialog;
