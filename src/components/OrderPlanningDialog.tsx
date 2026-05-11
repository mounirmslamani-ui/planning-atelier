import React, { useState, useEffect } from 'react';
import { formatDateFR } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, CalendarCheck, ChevronUp, ChevronDown } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { scheduleOrder } from '@/lib/scheduler';
import type { Order, ProductionRecord, ResourceStatus } from '@/types/planning';
import type { OperationToSchedule } from '@/lib/scheduler';
import DatePromptDialog from '@/components/DatePromptDialog';
import ResourceStatusPill from '@/components/ResourceStatusPill';
import ConfirmDialog from '@/components/ConfirmDialog';
import { BLOCKED_MODAL_ROW_CLASS } from '@/lib/blockedSteps';
import { getStepProgressStatus } from '@/lib/stepProgress';
import { synthesizeResourceStatuses } from '@/lib/resourceSynthesis';
import { toast } from 'sonner';
import { isReintegratedOrder } from '@/lib/reintegration';

interface OperationRow {
  id: string;
  stepId?: string;
  order: number;
  operationId: string;
  estimatedDuration: number;
  assignType: 'operator' | 'subcontractor';
  option1: string;
  equipmentIds: string[];
  studyStatus: ResourceStatus;
  materialStatus: ResourceStatus;
  toolingStatus: ResourceStatus;
  studyDeadline: string;
  materialDeadline: string;
  toolingDeadline: string;
  specialToolingNeeds: string[];
  rawMaterialNeeds: string[];
}

interface Props {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OrderPlanningDialog: React.FC<Props> = ({ order, open, onOpenChange }) => {
  const {
    operators, subcontractors, operations, steps, orders, holidays, equipments, clients, productionRecords,
    qcEntries, deliveryEntries, deliveredOrders, deleteQCEntry,
    addStep, updateStep, deleteStep, updateOrder, updateProductionRecord, absenceOperationId,
  } = usePlanning();

  const currentOrder = orders.find(o => o.id === order.id) || order;

  // Lock planning ONLY after a final conformity validation (delivery / delivered).
  // While the order is still in QC with a non-final decision (none / non-conforme /
  // reprise-retouche), the gamme stays editable so retouches can be added.
  const qcEntryForOrder = qcEntries.find(e => e.orderId === order.id);
  const isInQC = !!qcEntryForOrder;
  const isInDelivery = deliveryEntries.some(e => e.orderId === order.id);
  const isDelivered = deliveredOrders.some(d => d.orderId === order.id);
  // A reintegrated order (⟲ Reprise/Retouche) is back in production:
  // unlock the gamme even if an invoiced delivered_orders row was preserved.
  const isReintegrated = isReintegratedOrder(currentOrder);
  const isLocked = !isReintegrated && (isInDelivery || isDelivered);
  const lockReason = isLocked
    ? (isDelivered
        ? 'الطلبية مسلَّمة — تعديل المراحل غير مسموح'
        : 'الطلبية في طور التسليم — تعديل المراحل غير مسموح')
    : '';
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [datePrompt, setDatePrompt] = useState<{ rowId: string; field: 'studyDeadline' | 'materialDeadline' | 'toolingDeadline'; label: string } | null>(null);
  const [forcePrompt, setForcePrompt] = useState<{ rowIds: string[] } | null>(null);

  // Track whether we've initialized for this dialog open session
  const initializedRef = React.useRef(false);
  const prevOpenRef = React.useRef(false);

  useEffect(() => {
    // Reset initialization flag when dialog closes
    if (!open) {
      if (prevOpenRef.current) {
        initializedRef.current = false;
      }
      prevOpenRef.current = open;
      return;
    }
    prevOpenRef.current = open;

    // Only initialize once per dialog open
    if (initializedRef.current) return;
    initializedRef.current = true;

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
          assignType: (isSub ? 'subcontractor' : 'operator') as 'operator' | 'subcontractor',
          option1: isSub ? s.subcontractorId! : s.operatorId,
          equipmentIds: s.equipmentIds || [],
          // Per-step statuses (granular). Fallback to order-level only when the step
          // has never been edited (rétroactivité : commandes existantes sans détail par étape).
          studyStatus: (s.studyStatus ?? currentOrder.studyStatus ?? 'non-disponible') as ResourceStatus,
          materialStatus: (s.materialStatus ?? currentOrder.materialStatus ?? 'non-disponible') as ResourceStatus,
          toolingStatus: (s.toolingStatus ?? currentOrder.toolingStatus ?? 'non-disponible') as ResourceStatus,
          studyDeadline: s.studyDeadline || '',
          materialDeadline: s.materialDeadline || '',
          toolingDeadline: s.toolingDeadline || '',
          specialToolingNeeds: (s.specialToolingNeeds && s.specialToolingNeeds.length > 0) ? s.specialToolingNeeds : [''],
          rawMaterialNeeds: (s.rawMaterialNeeds && s.rawMaterialNeeds.length > 0) ? s.rawMaterialNeeds : [''],
        };
      }));
    } else {
      setRows([]);
    }
  }, [open, order.id, steps, absenceOperationId]);

  // Re-sync only deadlines from DB when steps change (no longer override per-row statuses
  // with the order-level value — statuses are now per-step).
  useEffect(() => {
    if (!open || rows.length === 0) return;
    setRows(prev => prev.map(row => {
      if (!row.stepId) return row;
      const step = steps.find(s => s.id === row.stepId);
      if (!step) return row;
      return {
        ...row,
        studyDeadline: step.studyDeadline || row.studyDeadline,
        materialDeadline: step.materialDeadline || row.materialDeadline,
        toolingDeadline: step.toolingDeadline || row.toolingDeadline,
      };
    }));
  }, [open, steps]);

  const addRow = () => {
    setRows(prev => [...prev, {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      order: prev.length + 1,
      operationId: operations.filter(o => o.id !== absenceOperationId)[0]?.id || '',
      estimatedDuration: 60,
      assignType: 'operator' as 'operator' | 'subcontractor',
      option1: '',
      equipmentIds: [],
      studyStatus: currentOrder.studyStatus ?? 'non-disponible' as ResourceStatus,
      materialStatus: currentOrder.materialStatus ?? 'non-disponible' as ResourceStatus,
      toolingStatus: currentOrder.toolingStatus ?? 'non-disponible' as ResourceStatus,
      studyDeadline: '', materialDeadline: '', toolingDeadline: '',
      specialToolingNeeds: [''],
      rawMaterialNeeds: [''],
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
      if (field === 'assignType' || field === 'operationId') {
        updated.option1 = '';
      }
      return updated;
    }));
  };

  const updateNeedField = (rowId: string, field: 'specialToolingNeeds' | 'rawMaterialNeeds', index: number, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const arr = [...(r[field] || [''])];
      arr[index] = value;
      return { ...r, [field]: arr };
    }));
  };

  const addNeedField = (rowId: string, field: 'specialToolingNeeds' | 'rawMaterialNeeds') => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const arr = [...(r[field] || []), ''];
      return { ...r, [field]: arr };
    }));
  };

  const removeNeedField = (rowId: string, field: 'specialToolingNeeds' | 'rawMaterialNeeds', index: number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const arr = (r[field] || []).filter((_, i) => i !== index);
      return { ...r, [field]: arr.length > 0 ? arr : [''] };
    }));
  };

  const handleStatusChange = (rowId: string, field: 'study' | 'material' | 'tooling', status: ResourceStatus) => {
    const statusKey = `${field}Status` as 'studyStatus' | 'materialStatus' | 'toolingStatus';
    const deadlineKey = `${field}Deadline` as 'studyDeadline' | 'materialDeadline' | 'toolingDeadline';

    // Update only the targeted row (granular per-step status).
    setRows(prev => prev.map(row => row.id !== rowId ? row : ({
      ...row,
      [statusKey]: status,
      ...(status === 'disponible' || status === 'non-applicable' ? { [deadlineKey]: '' } : {}),
    } as OperationRow)));

    if (status === 'non-disponible' || status === 'partiel') {
      const labels = {
        study: 'Date prévue pour fin Étude',
        material: 'Date prévue pour disponibilité Matière',
        tooling: 'Date prévue pour disponibilité Outillage',
      };
      setDatePrompt({ rowId, field: deadlineKey, label: labels[field] });
    }
  };

  const getAssigneeOptions = (type: 'operator' | 'subcontractor', operationId: string) => {
    const op = operations.find(o => o.id === operationId);
    if (!op) return [];
    const opName = op.name.trim().toLowerCase();
    const matches = (a: string) => (a || '').trim().toLowerCase() === opName;
    if (type === 'operator') {
      return operators
        .filter(o => matches(o.mainFunction) || (o.secondaryFunctions || []).some(matches))
        .map(o => ({ value: o.id, label: o.name }));
    }
    return subcontractors
      .filter(s => matches(s.mainActivity) || (s.secondaryActivities || []).some(matches))
      .map(s => ({ value: s.id, label: s.companyName }));
  };

  const handlePlanifier = () => {
    // Hard guard: never wipe steps for orders that have moved past production.
    if (isLocked) {
      toast.error(lockReason);
      return;
    }

    // Validation: prevent any row with duration <= 0 from being saved — EXCEPT
    // for steps already marked "منتهية" (Terminée), where reassigning the operator
    // must not require re-entering a duration.
    const invalidRow = rows.find(r => {
      if (r.estimatedDuration && r.estimatedDuration > 0) return false;
      const existing = r.stepId ? steps.find(s => s.id === r.stepId) : undefined;
      const isFinished = existing ? getStepProgressStatus(existing, productionRecords) === 'Terminée' : false;
      return !isFinished;
    });
    if (invalidRow) {
      toast.error(`المرحلة #${invalidRow.order} : المدة المخصصة يجب أن تكون أكبر من 0`);
      return;
    }
    // Validation: every row must have an assignee selected. Without this check,
    // the scheduler silently skips the row (op.options.length === 0), which
    // caused an index misalignment between newSteps and schedulableRows and
    // corrupted Adel's duration to 0h00.
    const noAssignee = rows.find(r => !r.option1);
    if (noAssignee) {
      toast.error(`المرحلة #${noAssignee.order} : الرجاء اختيار العامل أو المناول`);
      return;
    }

    const deadline = order.deliveryDeadline || order.plannedDeadline || '9999-12-31';
    const existingOrderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOperationId);

    const isHistorical = (stepId: string): boolean => {
      const recs = productionRecords.filter(r => r.stepId === stepId);
      if (recs.some(r => (r.workStatus || '').toLowerCase() === 'done' || (r.workStatus || '').toLowerCase() === 'continue')) return true;
      const st = existingOrderSteps.find(s => s.id === stepId);
      if (st?.subcontractingDone) return true;
      return false;
    };
    const historicalStepIds = new Set(existingOrderSteps.filter(s => isHistorical(s.id)).map(s => s.id));

    // Only delete NON-historical steps. Historical (completed / in-progress) stays.
    existingOrderSteps.forEach(s => { if (!historicalStepIds.has(s.id)) deleteStep(s.id); });

    const schedulableRows = rows.filter(r => !r.stepId || !historicalStepIds.has(r.stepId));

    const stepsWithoutThisOrder = steps.filter(s =>
      s.orderId !== order.id || s.operationId === absenceOperationId || historicalStepIds.has(s.id)
    );
    const opsToSchedule: OperationToSchedule[] = schedulableRows.map(row => {
      const isSub = row.assignType === 'subcontractor';
      const options = [row.option1].filter(Boolean).map(id => ({ id, isSub }));
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

    const schedulableIdsByIdx: (string | undefined)[] = schedulableRows.map(r => {
      if (!r.stepId) return undefined;
      return existingOrderSteps.find(s => s.id === r.stepId)?.id;
    });

    // UI row position is authoritative for step_order — fixes "ordre inversé" bug.
    const orderByRowId = new Map<string, number>();
    rows.forEach((r, idx) => orderByRowId.set(r.id, idx + 1));

    newSteps.forEach((s, i) => {
      const sourceRow = schedulableRows[i];
      if (sourceRow) {
        s.studyStatus = sourceRow.studyStatus;
        s.materialStatus = sourceRow.materialStatus;
        s.toolingStatus = sourceRow.toolingStatus;
        s.studyReady = s.studyStatus === 'disponible';
        s.materialAvailable = s.materialStatus === 'disponible';
        s.toolingAvailable = s.toolingStatus === 'disponible';
        s.studyDeadline = sourceRow.studyDeadline;
        s.materialDeadline = sourceRow.materialDeadline;
        s.toolingDeadline = sourceRow.toolingDeadline;
        s.specialToolingNeeds = (sourceRow.specialToolingNeeds || []).filter(v => v.trim());
        s.rawMaterialNeeds = (sourceRow.rawMaterialNeeds || []).filter(v => v.trim());
        // ALWAYS trust the user-entered duration. The scheduler may keep its
        // own value, but the source of truth is what the user typed in the UI.
        // This locks duration against any silent reset (0h00 bug on Adel/F101/26).
        s.estimatedDuration = sourceRow.estimatedDuration;
        s.order = orderByRowId.get(sourceRow.id) ?? (i + 1);
      }
      const reusedId = schedulableIdsByIdx[i];
      if (reusedId) s.id = reusedId;
      addStep(s);
    });
    updatedSteps.forEach(s => updateStep(s));

    // Re-sync step_order on historical steps too — UI row order is authoritative.
    rows.forEach((row, idx) => {
      if (!row.stepId || !historicalStepIds.has(row.stepId)) return;
      const hist = existingOrderSteps.find(s => s.id === row.stepId);
      if (hist && hist.order !== idx + 1) {
        updateStep({ ...hist, order: idx + 1 });
      }
    });

    // Synthesize order-level status from ALL steps (including historical ones)
    // so the main table's global indicators reflect per-step granularity.
    const historicalSteps = existingOrderSteps.filter(s => historicalStepIds.has(s.id));
    const allFinalSteps = [...historicalSteps, ...newSteps];
    const syntheticOrder: Order = {
      ...currentOrder,
      studyStatus: synthesizeResourceStatuses(allFinalSteps.map(s => s.studyStatus ?? 'non-disponible')),
      materialStatus: synthesizeResourceStatuses(allFinalSteps.map(s => s.materialStatus ?? 'non-disponible')),
      toolingStatus: synthesizeResourceStatuses(allFinalSteps.map(s => s.toolingStatus ?? 'non-disponible')),
    } as Order;
    syntheticOrder.studyReady = syntheticOrder.studyStatus === 'disponible';
    syntheticOrder.materialAvailable = syntheticOrder.materialStatus === 'disponible';
    syntheticOrder.toolingAvailable = syntheticOrder.toolingStatus === 'disponible';
    updateOrder(syntheticOrder);

    // Re-link production_records that pointed to old (now-deleted) step IDs.
    // Match by (orderId + operationId + operatorId) so validated work stays
    // visible as "منتهية" / "قيد الإنجاز" in the gamme after re-planning.
    const recordsForOrder = productionRecords.filter(r => r.orderId === order.id);
    const liveStepIdsAfter = new Set(newSteps.map(ns => ns.id));
    recordsForOrder.forEach(rec => {
      if (liveStepIdsAfter.has(rec.stepId)) return; // still valid
      const match = newSteps.find(ns =>
        ns.operationId === rec.operationId &&
        ns.operatorId && ns.operatorId === rec.operatorId,
      );
      if (match && match.id !== rec.stepId) {
        updateProductionRecord({ ...rec, stepId: match.id });
      }
    });

    // If the order was sitting in QC (waiting / non-conforme / reprise-retouche)
    // and the user re-edited the gamme, send it back to active production
    // ("قيد الانجاز") by removing the QC entry. AppLayout will re-transfer it
    // to QC automatically once all steps are complete again.
    if (qcEntryForOrder) {
      deleteQCEntry(qcEntryForOrder.id);
      toast.success('تمت إعادة الطلبية إلى الإنتاج (قيد الانجاز)');
    }

    onOpenChange(false);
  };

  const renderAssigneeSelect = (row: OperationRow) => {
    const options = getAssigneeOptions(row.assignType, row.operationId);
    const placeholder = !row.operationId
      ? "— Sélectionnez d'abord une opération —"
      : options.length === 0
        ? '— Aucune ressource compétente —'
        : '— Aucun —';
    return (
      <select
        className="h-9 w-full min-w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={row.option1}
        onChange={e => updateRow(row.id, 'option1', e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  };

  const durationUnit = (type: 'operator' | 'subcontractor') => type === 'subcontractor' ? 'يوم' : 'سا';
  const durationStep = (type: 'operator' | 'subcontractor') => type === 'subcontractor' ? 0.5 : 0.25;
  const durationFactor = (type: 'operator' | 'subcontractor') => type === 'subcontractor' ? 450 : 60;
  const STATUS_DOT: Record<ResourceStatus, string> = {
    'disponible': 'bg-green-500',
    'partiel': 'bg-orange-500',
    'non-disponible': 'bg-red-500',
    'non-applicable': 'bg-gray-300',
  };
  const StatusDot: React.FC<{ status: ResourceStatus; title?: string }> = ({ status, title }) => (
    <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} title={title || status} />
  );
  const PROGRESS_AR: Record<'Non entamée' | 'En cours' | 'Terminée', string> = {
    'Non entamée': 'لم تبدأ',
    'En cours': 'قيد الإنجاز',
    'Terminée': 'منتهية',
  };
  const getRowRecords = (row: OperationRow): ProductionRecord[] => {
    if (!row.stepId) return [];
    return productionRecords.filter(record => record.stepId === row.stepId);
  };
  const getRowProgressStatus = (row: OperationRow): 'Non entamée' | 'En cours' | 'Terminée' => {
    if (!row.stepId) return 'Non entamée';
    const step = steps.find(s => s.id === row.stepId);
    return step ? getStepProgressStatus(step, productionRecords) : 'Non entamée';
  };
  const getRowActualDuration = (row: OperationRow): string => {
    if (row.assignType === 'subcontractor') return 'NA';
    const total = getRowRecords(row).reduce((sum, record) => sum + record.actualDuration, 0);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  };
  const hasExistingSteps = steps.some(s => s.orderId === order.id && s.operationId !== absenceOperationId);
  const clientName = clients.find(c => c.id === order.clientId)?.name || '*******';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-none w-screen h-screen sm:rounded-none p-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">تحديد المراحل وتوزيعها</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {clientName} - Commande N° {order.orderNumber} — {order.designation} — Qté : {order.quantity} — Délai : {formatDateFR(order.deliveryDeadline || order.plannedDeadline) || 'Non défini'}
            </p>
          </DialogHeader>

          {isLocked && (
            <div className="rounded-md border border-urgent-moderate/40 bg-urgent-moderate/10 px-4 py-2 text-sm text-urgent-moderate font-medium">
              🔒 {lockReason}. لا يمكن إعادة برمجة المراحل.
            </div>
          )}

          <div className="bg-card rounded-lg border overflow-x-auto">
            <Table className="w-full min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-64">العملية</TableHead>
                  <TableHead className="w-32">فئة</TableHead>
                  <TableHead className="w-24">المدة المخصصة</TableHead>
                  <TableHead className="w-72">العامل</TableHead>
                  <TableHead className="w-56">احتياجات عدة خاصة</TableHead>
                  <TableHead className="w-56">احتياجات المواد الأولية والمكونات</TableHead>
                  <TableHead className="w-24">الحالة</TableHead>
                  <TableHead className="w-20">المدة الفعلية</TableHead>
                  <TableHead className="w-12 text-center text-xs">دراسة</TableHead>
                  <TableHead className="w-12 text-center text-xs">مواد أولية</TableHead>
                  <TableHead className="w-12 text-center text-xs">عدة</TableHead>
                  <TableHead className="w-12">الترتيب</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Compute blocked rows: as soon as one row's material OR tooling
                  // is partiel/non-disponible, that row and all following rows are violet.
                  const blockedSet = new Set<string>();
                  let hit = false;
                  for (const r of rows) {
                    const bad = (s: ResourceStatus) => s === 'partiel' || s === 'non-disponible';
                    if (!hit && (bad(r.materialStatus) || bad(r.toolingStatus))) hit = true;
                    if (hit) blockedSet.add(r.id);
                  }
                  return rows.map(row => {
                    const blocked = blockedSet.has(row.id);
                    return (
                  <TableRow
                    key={row.id}
                    className={blocked ? `${BLOCKED_MODAL_ROW_CLASS} [&_*]:!text-blocked-foreground` : ''}
                  >
                    <TableCell className="text-sm font-medium">{row.order}</TableCell>
                    <TableCell>
                      <select
                        className="h-9 w-full min-w-72 rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                        className="h-9 w-full min-w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.assignType}
                        onChange={e => updateRow(row.id, 'assignType', e.target.value)}
                      >
                        <option value="operator">ورشة</option>
                        <option value="subcontractor">مناولة</option>
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
                    <TableCell>{renderAssigneeSelect(row)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {(row.specialToolingNeeds && row.specialToolingNeeds.length > 0 ? row.specialToolingNeeds : ['']).map((val, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <StatusDot status={row.toolingStatus} title="حالة العدة" />
                            <Input
                              className="h-8 text-xs"
                              value={val}
                              onChange={e => updateNeedField(row.id, 'specialToolingNeeds', idx, e.target.value)}
                              placeholder="أداة خاصة..."
                            />
                            {idx === (row.specialToolingNeeds?.length ?? 1) - 1 ? (
                              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => addNeedField(row.id, 'specialToolingNeeds')}>
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeNeedField(row.id, 'specialToolingNeeds', idx)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {(row.rawMaterialNeeds && row.rawMaterialNeeds.length > 0 ? row.rawMaterialNeeds : ['']).map((val, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <StatusDot status={row.materialStatus} title="حالة المواد الأولية" />
                            <Input
                              className="h-8 text-xs"
                              value={val}
                              onChange={e => updateNeedField(row.id, 'rawMaterialNeeds', idx, e.target.value)}
                              placeholder="مادة أولية..."
                            />
                            {idx === (row.rawMaterialNeeds?.length ?? 1) - 1 ? (
                              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => addNeedField(row.id, 'rawMaterialNeeds')}>
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeNeedField(row.id, 'rawMaterialNeeds', idx)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{PROGRESS_AR[getRowProgressStatus(row)]}</TableCell>
                    <TableCell className="text-xs font-mono">{getRowActualDuration(row)}</TableCell>
                    <TableCell className="text-center">
                      <ResourceStatusPill
                        value={row.studyStatus}
                        onChange={(s) => handleStatusChange(row.id, 'study', s)}
                        deadline={row.studyDeadline}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <ResourceStatusPill
                        value={row.materialStatus}
                        onChange={(s) => handleStatusChange(row.id, 'material', s)}
                        deadline={row.materialDeadline}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <ResourceStatusPill
                        value={row.toolingStatus}
                        onChange={(s) => handleStatusChange(row.id, 'tooling', s)}
                        deadline={row.toolingDeadline}
                      />
                    </TableCell>
                    {/* S-T column removed per spec */}
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
                    );
                  });
                })()}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground py-6">
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={handlePlanifier} disabled={isLocked || rows.length === 0 || rows.every(r => !r.option1)}>
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
            // Apply deadline to the targeted row only
            setRows(prev => prev.map(row => row.id !== datePrompt.rowId ? row : ({ ...row, [datePrompt.field]: date } as OperationRow)));
            setDatePrompt(null);
          }}
          onCancel={() => {
            // Revert that row's status to "disponible" since user cancelled (no cascade to the order)
            const statusMap: Record<string, 'studyStatus' | 'materialStatus' | 'toolingStatus'> = {
              studyDeadline: 'studyStatus',
              materialDeadline: 'materialStatus',
              toolingDeadline: 'toolingStatus',
            };
            const statusKey = statusMap[datePrompt.field];
            setRows(prev => prev.map(row => row.id !== datePrompt.rowId ? row : ({ ...row, [statusKey]: 'disponible', [datePrompt.field]: '' } as OperationRow)));
            setDatePrompt(null);
          }}
        />
      )}
    </>
  );
};

export default OrderPlanningDialog;
