import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, CalendarCheck, ChevronUp, ChevronDown, Save, Pencil } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { scheduleOrder } from '@/lib/scheduler';
import type { OperationToSchedule } from '@/lib/scheduler';
import type { Order, ProductionRecord, ResourceStatus } from '@/types/planning';

import ResourceStatusPill from '@/components/ResourceStatusPill';
import ConfirmDialog from '@/components/ConfirmDialog';
import { BLOCKED_MODAL_ROW_CLASS } from '@/lib/blockedSteps';
import { getStepProgressStatus } from '@/lib/stepProgress';
import { synthesizeResourceStatuses } from '@/lib/resourceSynthesis';
import { toast } from 'sonner';
import { isReintegratedOrder } from '@/lib/reintegration';
import { isLinkedToOperation } from '@/lib/operationLinks';

export interface OperationRow {
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
  specialToolingNeeds: string[];
  rawMaterialNeeds: string[];
  stepNotes: string;
  resourceNotes: string;
  /** Subcontracting progress state — only meaningful when assignType === 'subcontractor'. */
  subcontractingDone?: boolean;
  subcontractingInProgress?: boolean;
}

const PROGRESS_AR: Record<'Non entamée' | 'En cours' | 'Terminée', string> = {
  'Non entamée': 'لم تبدأ',
  'En cours': 'قيد الإنجاز',
  'Terminée': 'منتهية',
};

const isBadStatus = (s: ResourceStatus) => s === 'partiel' || s === 'non-disponible';

export function usePlanningEditor(order: Order | null, open: boolean) {
  const ctx = usePlanning();
  const {
    operators, subcontractors, operations, steps, orders, holidays, equipments, clients, productionRecords,
    qcEntries, deliveryEntries, deliveredOrders, deleteQCEntry,
    addStep, updateStep, deleteStep, updateOrder, updateProductionRecord, addProductionRecord, absenceOperationId,
  } = ctx;

  const currentOrder = order ? (orders.find(o => o.id === order.id) || order) : null;
  const qcEntryForOrder = order ? qcEntries.find(e => e.orderId === order.id) : undefined;
  const isInDelivery = order ? deliveryEntries.some(e => e.orderId === order.id) : false;
  const isDelivered = order ? deliveredOrders.some(d => d.orderId === order.id) : false;
  const isReintegrated = currentOrder ? isReintegratedOrder(currentOrder) : false;
  const isLocked = !isReintegrated && (isInDelivery || isDelivered);
  const lockReason = isLocked
    ? (isDelivered ? 'الطلبية مسلَّمة — تعديل المراحل غير مسموح'
        : 'الطلبية في طور التسليم — تعديل المراحل غير مسموح')
    : '';

  const [rows, setRows] = useState<OperationRow[]>([]);
  
  const [forcePrompt, setForcePrompt] = useState<{ rowIds: string[] } | null>(null);
  const [removePrompt, setRemovePrompt] = useState<{ rowId: string; label: string } | null>(null);
  const [closeStepPrompt, setCloseStepPrompt] = useState<{ rowId: string; label: string } | null>(null);
  const [editDurationPrompt, setEditDurationPrompt] = useState<{ rowId: string } | null>(null);
  const [savePrompt, setSavePrompt] = useState<OperationRow[] | null>(null);

  const initializedRef = useRef(false);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (!open || !order) {
      if (prevOpenRef.current) initializedRef.current = false;
      prevOpenRef.current = open;
      return;
    }
    prevOpenRef.current = open;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const existingSteps = steps
      .filter(s => s.orderId === order.id && s.operationId !== absenceOperationId)
      .sort((a, b) => {
        if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

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
          studyStatus: (s.studyStatus ?? currentOrder!.studyStatus ?? 'non-disponible') as ResourceStatus,
          materialStatus: (s.materialStatus ?? currentOrder!.materialStatus ?? 'non-disponible') as ResourceStatus,
          toolingStatus: (s.toolingStatus ?? currentOrder!.toolingStatus ?? 'non-disponible') as ResourceStatus,
          specialToolingNeeds: (s.specialToolingNeeds && s.specialToolingNeeds.length > 0) ? s.specialToolingNeeds : [''],
          rawMaterialNeeds: (s.rawMaterialNeeds && s.rawMaterialNeeds.length > 0) ? s.rawMaterialNeeds : [''],
          stepNotes: s.stepNotes ?? '',
          resourceNotes: s.resourceNotes ?? '',
          subcontractingDone: isSub ? !!s.subcontractingDone : false,
          subcontractingInProgress: isSub ? !!s.subcontractingInProgress : false,
        };
      }));
    } else {
      setRows([]);
    }
  }, [open, order?.id, steps, absenceOperationId]);


  const blockedSet = useMemo(() => {
    const set = new Set<string>();
    let hit = false;
    for (const r of rows) {
      if (!hit && (isBadStatus(r.materialStatus) || isBadStatus(r.toolingStatus))) hit = true;
      if (hit) set.add(r.id);
    }
    return set;
  }, [rows]);

  const addRow = () => {
    if (!currentOrder) return;
    setRows(prev => [...prev, {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      order: prev.length + 1,
      operationId: operations.filter(o => o.id !== absenceOperationId)[0]?.id || '',
      estimatedDuration: 60,
      assignType: 'operator',
      option1: '',
      equipmentIds: [],
      studyStatus: currentOrder.studyStatus ?? 'non-disponible',
      materialStatus: currentOrder.materialStatus ?? 'non-disponible',
      toolingStatus: currentOrder.toolingStatus ?? 'non-disponible',
      specialToolingNeeds: [''],
      rawMaterialNeeds: [''],
      stepNotes: '',
      resourceNotes: '',
    }]);
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
      const updated = { ...r, [field]: value } as OperationRow;
      if (field === 'assignType' || field === 'operationId') updated.option1 = '';
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
    setRows(prev => prev.map(r => r.id !== rowId ? r : ({ ...r, [field]: [...(r[field] || []), ''] })));
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
    setRows(prev => prev.map(row => row.id !== rowId ? row : ({ ...row, [statusKey]: status } as OperationRow)));
  };

  const handleColumnStatusChange = (field: 'study' | 'material' | 'tooling', status: ResourceStatus) => {
    const statusKey = `${field}Status` as 'studyStatus' | 'materialStatus' | 'toolingStatus';
    setRows(prev => prev.map(row => ({ ...row, [statusKey]: status } as OperationRow)));
  };

  const getAssigneeOptions = (type: 'operator' | 'subcontractor', operationId: string) => {
    const op = operations.find(o => o.id === operationId);
    if (!op) return [];
    if (type === 'operator') {
      return operators
        .filter(o => isLinkedToOperation(o.mainFunction, op, operations) || (o.secondaryFunctions || []).some(fn => isLinkedToOperation(fn, op, operations)))
        .map(o => ({ value: o.id, label: o.name }));
    }
    return subcontractors
      .filter(s => isLinkedToOperation(s.mainActivity, op, operations) || (s.secondaryActivities || []).some(act => isLinkedToOperation(act, op, operations)))
      .map(s => ({ value: s.id, label: s.companyName }));
  };

  const normalizeNeeds = (values?: string[]) => (values || []).map(v => v.trim()).filter(Boolean).join('|');
  const buildRowSignature = (row: OperationRow) => [
    row.operationId, row.assignType, row.option1, row.estimatedDuration,
    [...(row.equipmentIds || [])].sort().join(','),
    normalizeNeeds(row.specialToolingNeeds), normalizeNeeds(row.rawMaterialNeeds),
  ].join('::');

  const validateRowsBeforeSave = (rowsToValidate: OperationRow[]): boolean => {
    const ordersSeen = new Set<number>();
    const signaturesSeen = new Set<string>();
    for (const row of rowsToValidate) {
      if (ordersSeen.has(row.order)) { toast.error(`لا يمكن حفظ مرحلتين بنفس رقم الترتيب #${row.order}`); return false; }
      ordersSeen.add(row.order);
      const sig = buildRowSignature(row);
      if (signaturesSeen.has(sig)) { toast.error(`المرحلة #${row.order} مكررة بنفس الخصائص`); return false; }
      signaturesSeen.add(sig);
    }
    return true;
  };

  const handlePlanifier = () => {
    if (!order) return;
    if (isLocked) { toast.error(lockReason); return; }
    const invalidRow = rows.find(r => {
      if (r.estimatedDuration && r.estimatedDuration > 0) return false;
      const existing = r.stepId ? steps.find(s => s.id === r.stepId) : undefined;
      const isFinished = existing ? getStepProgressStatus(existing, productionRecords) === 'Terminée' : false;
      return !isFinished;
    });
    if (invalidRow) { toast.error(`المرحلة #${invalidRow.order} : المدة المخصصة يجب أن تكون أكبر من 0`); return; }
    const noAssignee = rows.find(r => !r.option1);
    if (noAssignee) { toast.error(`المرحلة #${noAssignee.order} : الرجاء اختيار العامل أو المناول`); return; }
    if (!validateRowsBeforeSave(rows)) return;

    const finishedWithBadRes = rows.filter(r => {
      const step = r.stepId ? steps.find(s => s.id === r.stepId) : undefined;
      const finished = step ? getStepProgressStatus(step, productionRecords) === 'Terminée' : false;
      if (!finished) return false;
      return isBadStatus(r.studyStatus) || isBadStatus(r.materialStatus) || isBadStatus(r.toolingStatus);
    });
    if (finishedWithBadRes.length > 0) {
      setForcePrompt({ rowIds: finishedWithBadRes.map(r => r.id) });
      return;
    }
    setSavePrompt(rows.map(r => ({ ...r })));
  };

  const doSave = (rowsToSave: OperationRow[]) => {
    if (!order || !currentOrder) return;
    const finalRows = rowsToSave.map((row, idx) => ({ ...row, order: idx + 1 }));
    if (!validateRowsBeforeSave(finalRows)) return;

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
    const schedulableRows = finalRows.filter(r => !r.stepId || !historicalStepIds.has(r.stepId));
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
        sourceId: row.id,
      };
    });

    const { newSteps, updatedSteps, failures, sourceIdByStepId } = scheduleOrder(
      order.id, deadline, opsToSchedule, stepsWithoutThisOrder, orders, holidays, equipments
    );

    if (failures.length > 0 || newSteps.length !== schedulableRows.length) {
      const reasons = failures.map(f => {
        const op = operations.find(o => o.id === f.operationId)?.name || '?';
        const why = f.reason === 'equipment-down' ? 'معدّة معطّلة' : f.reason === 'no-options' ? 'بدون عامل' : 'لا يوجد فضاء زمني';
        return `${op} (${why})`;
      }).join('، ');
      toast.error(`فشل التخطيط: لم تُحفظ أي تعديلات. ${reasons || ''}`);
      return;
    }

    const orderByRowId = new Map<string, number>();
    finalRows.forEach((r, idx) => orderByRowId.set(r.id, idx + 1));

    const reusedIds = new Set<string>();
    newSteps.forEach(s => {
      const rowId = sourceIdByStepId[s.id];
      const sourceRow = finalRows.find(r => r.id === rowId);
      // Always resolve order from finalRows position (rowId match, then stepId match), never fall back to scheduler index
      const resolvedOrderIdx = sourceRow
        ? finalRows.findIndex(r => r.id === sourceRow.id)
        : finalRows.findIndex(r => r.stepId === s.id);
      if (resolvedOrderIdx >= 0) s.order = resolvedOrderIdx + 1;
      let reused = false;
      if (sourceRow) {
        s.studyStatus = sourceRow.studyStatus;
        s.materialStatus = sourceRow.materialStatus;
        s.toolingStatus = sourceRow.toolingStatus;
        s.studyReady = s.studyStatus === 'disponible';
        s.materialAvailable = s.materialStatus === 'disponible';
        s.toolingAvailable = s.toolingStatus === 'disponible';
        s.studyDeadline = undefined;
        s.materialDeadline = undefined;
        s.toolingDeadline = undefined;
        s.specialToolingNeeds = (sourceRow.specialToolingNeeds || []).filter(v => v.trim());
        s.rawMaterialNeeds = (sourceRow.rawMaterialNeeds || []).filter(v => v.trim());
        s.stepNotes = sourceRow.stepNotes || undefined;
        s.resourceNotes = sourceRow.resourceNotes || undefined;
        s.estimatedDuration = sourceRow.estimatedDuration;
        if (sourceRow.stepId && existingOrderSteps.some(es => es.id === sourceRow.stepId)) {
          s.id = sourceRow.stepId;
          reusedIds.add(sourceRow.stepId);
          reused = true;
        }
      }
      if (reused) updateStep(s); else addStep(s);
    });
    updatedSteps.forEach(s => updateStep(s));

    existingOrderSteps.forEach(s => {
      if (historicalStepIds.has(s.id)) return;
      if (reusedIds.has(s.id)) return;
      deleteStep(s.id);
    });

    finalRows.forEach((row, idx) => {
      if (!row.stepId || !historicalStepIds.has(row.stepId)) return;
      const hist = existingOrderSteps.find(s => s.id === row.stepId);
      if (!hist) return;
      updateStep({
        ...hist,
        order: idx + 1,
        estimatedDuration: row.estimatedDuration,
        studyStatus: row.studyStatus,
        materialStatus: row.materialStatus,
        toolingStatus: row.toolingStatus,
        studyReady: row.studyStatus === 'disponible',
        materialAvailable: row.materialStatus === 'disponible',
        toolingAvailable: row.toolingStatus === 'disponible',
        studyDeadline: undefined,
        materialDeadline: undefined,
        toolingDeadline: undefined,
        specialToolingNeeds: (row.specialToolingNeeds || []).filter(v => v.trim()),
        rawMaterialNeeds: (row.rawMaterialNeeds || []).filter(v => v.trim()),
        stepNotes: row.stepNotes || undefined,
        resourceNotes: row.resourceNotes || undefined,
      });
    });

    const historicalSteps = existingOrderSteps
      .filter(s => historicalStepIds.has(s.id))
      .map(s => {
        const row = finalRows.find(r => r.stepId === s.id);
        return row ? { ...s, studyStatus: row.studyStatus, materialStatus: row.materialStatus, toolingStatus: row.toolingStatus } : s;
      });
    const allFinalSteps = [...historicalSteps, ...newSteps];
    const syntheticOrder: Order = {
      ...currentOrder,
      studyStatus: synthesizeResourceStatuses(allFinalSteps.map(s => s.studyStatus ?? 'non-disponible')),
      materialStatus: synthesizeResourceStatuses(allFinalSteps.map(s => s.materialStatus ?? 'non-disponible')),
      toolingStatus: synthesizeResourceStatuses(allFinalSteps.map(s => s.toolingStatus ?? 'non-disponible')),
    };
    syntheticOrder.studyReady = syntheticOrder.studyStatus === 'disponible';
    syntheticOrder.materialAvailable = syntheticOrder.materialStatus === 'disponible';
    syntheticOrder.toolingAvailable = syntheticOrder.toolingStatus === 'disponible';
    updateOrder(syntheticOrder);

    const recordsForOrder = productionRecords.filter(r => r.orderId === order.id);
    const liveStepIdsAfter = new Set([...historicalSteps, ...newSteps].map(ns => ns.id));
    recordsForOrder.forEach(rec => {
      if (liveStepIdsAfter.has(rec.stepId)) return;
      const match = newSteps.find(ns => ns.operationId === rec.operationId && ns.operatorId && ns.operatorId === rec.operatorId);
      if (match && match.id !== rec.stepId) updateProductionRecord({ ...rec, stepId: match.id });
    });

    if (qcEntryForOrder) {
      deleteQCEntry(qcEntryForOrder.id);
      toast.success('تمت إعادة الطلبية إلى الإنتاج (قيد الانجاز)');
    } else {
      toast.success('تم حفظ التخطيط');
    }
  };

  /** Save resources only — no rescheduling. */
  const saveResourcesOnly = () => {
    if (!order || !currentOrder) return;
    if (isLocked) { toast.error(lockReason); return; }
    const existingOrderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOperationId);
    let updated = 0;
    rows.forEach(row => {
      if (!row.stepId) return;
      const st = existingOrderSteps.find(s => s.id === row.stepId);
      if (!st) return;
      updateStep({
        ...st,
        estimatedDuration: row.estimatedDuration,
        studyStatus: row.studyStatus,
        materialStatus: row.materialStatus,
        toolingStatus: row.toolingStatus,
        studyReady: row.studyStatus === 'disponible',
        materialAvailable: row.materialStatus === 'disponible',
        toolingAvailable: row.toolingStatus === 'disponible',
        studyDeadline: undefined,
        materialDeadline: undefined,
        toolingDeadline: undefined,
        specialToolingNeeds: (row.specialToolingNeeds || []).filter(v => v.trim()),
        rawMaterialNeeds: (row.rawMaterialNeeds || []).filter(v => v.trim()),
        stepNotes: row.stepNotes || undefined,
        resourceNotes: row.resourceNotes || undefined,
      });
      updated++;
    });
    // Synthesize order-level statuses from row state (treat historical + live identically)
    const syntheticOrder: Order = {
      ...currentOrder,
      studyStatus: synthesizeResourceStatuses(rows.map(r => r.studyStatus)),
      materialStatus: synthesizeResourceStatuses(rows.map(r => r.materialStatus)),
      toolingStatus: synthesizeResourceStatuses(rows.map(r => r.toolingStatus)),
    };
    syntheticOrder.studyReady = syntheticOrder.studyStatus === 'disponible';
    syntheticOrder.materialAvailable = syntheticOrder.materialStatus === 'disponible';
    syntheticOrder.toolingAvailable = syntheticOrder.toolingStatus === 'disponible';
    updateOrder(syntheticOrder);
    toast.success(`تم حفظ موارد ${updated} مرحلة`);
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

  const clientName = order ? (clients.find(c => c.id === order.clientId)?.name || '*******') : '';

  return {
    rows, setRows, isLocked, lockReason, blockedSet,
    addRow, moveRow, updateRow, updateNeedField, addNeedField, removeNeedField,
    handleStatusChange, getAssigneeOptions,
    handlePlanifier, saveResourcesOnly, doSave,
    handleColumnStatusChange,
    forcePrompt, setForcePrompt,
    removePrompt, setRemovePrompt,
    closeStepPrompt, setCloseStepPrompt,
    editDurationPrompt, setEditDurationPrompt,
    savePrompt, setSavePrompt,
    getRowProgressStatus, getRowActualDuration, getRowRecords,
    operations, operators, subcontractors, absenceOperationId,
    addProductionRecord, updateProductionRecord, clientName,
  };
}

export type PlanningEditor = ReturnType<typeof usePlanningEditor>;

const durationUnit = (t: 'operator' | 'subcontractor') => t === 'subcontractor' ? 'يوم' : 'سا';
const durationStep = (t: 'operator' | 'subcontractor') => t === 'subcontractor' ? 0.5 : 0.25;
const durationFactor = (t: 'operator' | 'subcontractor') => t === 'subcontractor' ? 450 : 60;

/** Editable Steps tab table. */
export const StepsEditorTable: React.FC<{ editor: PlanningEditor; onCancel?: () => void }> = ({ editor, onCancel }) => {
  const e = editor;
  const hasExistingSteps = e.rows.some(r => !!r.stepId);
  return (
    <div className="space-y-3">
      {e.isLocked && (
        <div className="rounded-md border border-urgent-moderate/40 bg-urgent-moderate/10 px-4 py-2 text-sm text-urgent-moderate font-medium">
          🔒 {e.lockReason}. لا يمكن إعادة برمجة المراحل.
        </div>
      )}
      <div className="bg-card rounded-md border w-full">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '4%' }} />
            <col style={{ width: '4%' }} />
          </colgroup>
          <thead className="bg-muted/40">
            <tr>
              <th className="p-1.5 text-right">#</th>
              <th className="p-1.5 text-right">العملية</th>
              <th className="p-1.5 text-right">فئة</th>
              <th className="p-1.5 text-right">المدة</th>
              <th className="p-1.5 text-right">العامل / المناول</th>
              <th className="p-1.5 text-right">التقدم</th>
              <th className="p-1.5 text-right">المدة الفعلية</th>
              <th className="p-1.5 text-right">ملاحظات وتعليمات</th>
              <th className="p-1.5"></th>
              <th className="p-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {e.rows.map(row => {
              const blocked = e.blockedSet.has(row.id);
              const assignees = e.getAssigneeOptions(row.assignType, row.operationId);
              const placeholder = !row.operationId ? "— اختر عملية —" : assignees.length === 0 ? '— لا توجد موارد —' : '— لا أحد —';
              return (
                <tr key={row.id} className={`border-t ${blocked ? `${BLOCKED_MODAL_ROW_CLASS} [&_*]:!text-blocked-foreground` : ''}`}>
                  <td className="p-1.5 font-medium">{row.order}</td>
                  <td className="p-1.5">
                    <select
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={row.operationId}
                      onChange={ev => e.updateRow(row.id, 'operationId', ev.target.value)}
                      disabled={e.isLocked}
                    >
                      {e.operations.filter(o => o.id !== e.absenceOperationId && o.category === row.assignType).map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <select
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={row.assignType}
                      onChange={ev => e.updateRow(row.id, 'assignType', ev.target.value)}
                      disabled={e.isLocked}
                    >
                      <option value="operator">ورشة</option>
                      <option value="subcontractor">مناولة</option>
                    </select>
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        step={durationStep(row.assignType)}
                        className="h-8 text-xs px-1"
                        value={parseFloat((row.estimatedDuration / durationFactor(row.assignType)).toFixed(2))}
                        onChange={ev => e.updateRow(row.id, 'estimatedDuration', Math.round((parseFloat(ev.target.value) || 0) * durationFactor(row.assignType)))}
                        disabled={e.isLocked}
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">{durationUnit(row.assignType)}</span>
                    </div>
                  </td>
                  <td className="p-1.5">
                    <select
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={row.option1}
                      onChange={ev => e.updateRow(row.id, 'option1', ev.target.value)}
                      disabled={e.isLocked}
                    >
                      <option value="">{placeholder}</option>
                      {assignees.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5 text-xs font-medium">
                    {(() => {
                      const st = e.getRowProgressStatus(row);
                      if (st === 'En cours' && row.stepId) {
                        const opName = e.operations.find(o => o.id === row.operationId)?.name || '?';
                        return (
                          <button
                            type="button"
                            className="underline decoration-dotted text-primary hover:text-primary/80"
                            onClick={() => e.setCloseStepPrompt({ rowId: row.id, label: `#${row.order} — ${opName}` })}
                          >
                            {PROGRESS_AR[st]}
                          </button>
                        );
                      }
                      return PROGRESS_AR[st];
                    })()}
                  </td>
                  <td className="p-1.5 text-xs font-mono">{e.getRowActualDuration(row)}</td>
                  <td className="p-1.5">
                    <Input
                      className="h-8 text-xs px-1"
                      value={row.stepNotes || ''}
                      onChange={ev => e.updateRow(row.id, 'stepNotes', ev.target.value)}
                      placeholder="..."
                      disabled={e.isLocked}
                    />
                  </td>
                  <td className="p-1.5">
                    <div className="flex flex-col items-center">
                      <button type="button" className="h-5 w-5 inline-flex items-center justify-center hover:bg-accent rounded" onClick={() => e.moveRow(row.id, 'up')} disabled={row.order === 1 || e.isLocked}>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="h-5 w-5 inline-flex items-center justify-center hover:bg-accent rounded" onClick={() => e.moveRow(row.id, 'down')} disabled={row.order === e.rows.length || e.isLocked}>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        className="h-7 w-7 inline-flex items-center justify-center hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => e.setEditDurationPrompt({ rowId: row.id })}
                        disabled={!row.stepId || e.getRowRecords(row).length === 0 || row.assignType === 'subcontractor'}
                        title="تعديل مدة إنجاز الطلبية"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="h-7 w-7 inline-flex items-center justify-center hover:bg-accent rounded"
                        onClick={() => {
                          const opName = e.operations.find(o => o.id === row.operationId)?.name || '?';
                          e.setRemovePrompt({ rowId: row.id, label: `#${row.order} — ${opName}` });
                        }}
                        disabled={e.isLocked}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {e.rows.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-6 text-xs">لا توجد مراحل. أضف عملية.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={e.addRow} disabled={e.isLocked}>
          <Plus className="w-4 h-4 mr-1" /> إضافة عملية
        </Button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>إلغاء</Button>
          )}
          <Button onClick={e.handlePlanifier} disabled={e.isLocked || e.rows.length === 0 || e.rows.every(r => !r.option1)}>
            <CalendarCheck className="w-4 h-4 mr-1" /> تأكيد
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Editable Resources tab table. */
export const ResourcesEditorTable: React.FC<{ editor: PlanningEditor; onCancel?: () => void }> = ({ editor, onCancel }) => {
  const e = editor;
  const materialSynth = useMemo(() => synthesizeResourceStatuses(e.rows.map(r => r.materialStatus)), [e.rows]);
  const toolingSynth = useMemo(() => synthesizeResourceStatuses(e.rows.map(r => r.toolingStatus)), [e.rows]);
  const studySynth = useMemo(() => synthesizeResourceStatuses(e.rows.map(r => r.studyStatus)), [e.rows]);
  return (
    <div className="space-y-3">
      {e.isLocked && (
        <div className="rounded-md border border-urgent-moderate/40 bg-urgent-moderate/10 px-4 py-2 text-sm text-urgent-moderate font-medium">
          🔒 {e.lockReason}
        </div>
      )}
      <div className="bg-card rounded-md border w-full">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead className="bg-muted/40">
            <tr>
              <th className="p-1.5 text-right">#</th>
              <th className="p-1.5 text-right">العملية</th>
              <th className="p-1.5 text-right">
                <div className="flex items-center gap-1.5">
                  <ResourceStatusPill value={materialSynth} onChange={s => e.handleColumnStatusChange('material', s)} readOnly={e.isLocked || e.rows.length === 0} />
                  <span>المواد الأولية</span>
                </div>
              </th>
              <th className="p-1.5 text-right">
                <div className="flex items-center gap-1.5">
                  <ResourceStatusPill value={toolingSynth} onChange={s => e.handleColumnStatusChange('tooling', s)} readOnly={e.isLocked || e.rows.length === 0} />
                  <span>العدة</span>
                </div>
              </th>
              <th className="p-1.5 text-right">
                <div className="flex items-center gap-1.5">
                  <ResourceStatusPill value={studySynth} onChange={s => e.handleColumnStatusChange('study', s)} readOnly={e.isLocked || e.rows.length === 0} />
                  <span>الدراسة</span>
                </div>
              </th>
              <th className="p-1.5 text-right">ملاحظات وتعليمات</th>
            </tr>
          </thead>
          <tbody>
            {e.rows.map(row => {
              const opName = e.operations.find(o => o.id === row.operationId)?.name || '—';
              const blocked = e.blockedSet.has(row.id);
              return (
                <tr key={row.id} className={`border-t ${blocked ? `${BLOCKED_MODAL_ROW_CLASS} [&_*]:!text-blocked-foreground` : ''}`}>
                  <td className="p-1.5 font-medium">{row.order}</td>
                  <td className="p-1.5">{opName}</td>
                  <td className="p-1.5">
                    <div className="flex flex-col gap-1">
                      <ResourceStatusPill value={row.materialStatus} onChange={s => e.handleStatusChange(row.id, 'material', s)} />
                      {(row.rawMaterialNeeds.length > 0 ? row.rawMaterialNeeds : ['']).map((val, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Input className="h-7 text-xs px-1" value={val} onChange={ev => e.updateNeedField(row.id, 'rawMaterialNeeds', idx, ev.target.value)} placeholder="مادة..." disabled={e.isLocked} />
                          {idx === row.rawMaterialNeeds.length - 1 ? (
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => e.addNeedField(row.id, 'rawMaterialNeeds')} disabled={e.isLocked}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => e.removeNeedField(row.id, 'rawMaterialNeeds', idx)} disabled={e.isLocked}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-1.5">
                    <div className="flex flex-col gap-1">
                      <ResourceStatusPill value={row.toolingStatus} onChange={s => e.handleStatusChange(row.id, 'tooling', s)} />
                      {(row.specialToolingNeeds.length > 0 ? row.specialToolingNeeds : ['']).map((val, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Input className="h-7 text-xs px-1" value={val} onChange={ev => e.updateNeedField(row.id, 'specialToolingNeeds', idx, ev.target.value)} placeholder="أداة..." disabled={e.isLocked} />
                          {idx === row.specialToolingNeeds.length - 1 ? (
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => e.addNeedField(row.id, 'specialToolingNeeds')} disabled={e.isLocked}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => e.removeNeedField(row.id, 'specialToolingNeeds', idx)} disabled={e.isLocked}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-1.5 text-center">
                    <ResourceStatusPill value={row.studyStatus} onChange={s => e.handleStatusChange(row.id, 'study', s)} />
                  </td>
                  <td className="p-1.5">
                    <Input
                      className="h-8 text-xs px-1"
                      value={row.resourceNotes || ''}
                      onChange={ev => e.updateRow(row.id, 'resourceNotes', ev.target.value)}
                      placeholder="..."
                      disabled={e.isLocked}
                    />
                  </td>
                </tr>
              );
            })}
            {e.rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-6 text-xs">لا توجد مراحل بعد. عرّفها أولًا في علامة التبويب «مراحل الإنجاز».</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        )}
        <Button onClick={e.saveResourcesOnly} disabled={e.isLocked || e.rows.length === 0}>
          <Save className="w-4 h-4 mr-1" /> تأكيد
        </Button>
      </div>
    </div>
  );
};

/** All confirmation/date prompt dialogs driven by the editor. */
export const PlanningEditorDialogs: React.FC<{ editor: PlanningEditor; order: Order }> = ({ editor, order }) => {
  const e = editor;
  return (
    <>
      {e.forcePrompt && (
        <ConfirmDialog
          open={!!e.forcePrompt}
          title="تم إنجاز هذه المرحلة مع وجود مورد واحد على الأقل غير متوفر. فرض تغيير حالة الموارد إلى متوفرة؟"
          confirmLabel="فرض التغيير"
          cancelLabel="إلغاء"
          onConfirm={() => {
            const ids = new Set(e.forcePrompt!.rowIds);
            const forced = e.rows.map(r => ids.has(r.id) ? ({
              ...r,
              studyStatus: 'disponible' as ResourceStatus,
              materialStatus: 'disponible' as ResourceStatus,
              toolingStatus: 'disponible' as ResourceStatus,
              
            }) : r);
            e.setRows(forced);
            e.setForcePrompt(null);
            e.setSavePrompt(forced.map(r => ({ ...r })));
          }}
          onCancel={() => {
            const snapshot = e.rows;
            e.setForcePrompt(null);
            e.setSavePrompt(snapshot.map(r => ({ ...r })));
          }}
        />
      )}

      {e.savePrompt && (
        <ConfirmDialog
          open={!!e.savePrompt}
          title={`هل تريد حفظ هذه ${e.savePrompt.length} مرحلة؟`}
          description="ستتلقّى قاعدة البيانات الصفوف المعروضة حاليًا بهذا الترتيب."
          confirmLabel="نعم، احفظ"
          cancelLabel="إلغاء"
          onConfirm={() => {
            const snapshot = e.savePrompt!;
            e.setSavePrompt(null);
            e.doSave(snapshot);
          }}
          onCancel={() => e.setSavePrompt(null)}
        />
      )}

      {e.closeStepPrompt && (() => {
        const row = e.rows.find(r => r.id === e.closeStepPrompt!.rowId);
        return (
          <ConfirmDialog
            open={!!e.closeStepPrompt}
            title={`إغلاق هذه المرحلة يدويًا كـ « منتهية »؟ (${e.closeStepPrompt!.label})`}
            description="سيتم تسجيل هذه المرحلة كمنتهية حتى مع نفاد الوقت المخصص (0:00)."
            confirmLabel="نعم، أغلق المرحلة"
            cancelLabel="إلغاء"
            onConfirm={() => {
              if (row && row.stepId && row.assignType === 'operator' && row.option1) {
                const op = e.operations.find(o => o.id === row.operationId);
                e.addProductionRecord({
                  id: crypto.randomUUID(),
                  stepId: row.stepId,
                  orderId: order.id,
                  operatorId: row.option1,
                  operationId: row.operationId,
                  actualDuration: 0,
                  validatedAt: new Date().toISOString(),
                  workStatus: 'done',
                  orderNumberSnapshot: order.orderNumber,
                  clientNameSnapshot: e.clientName,
                  designationSnapshot: order.designation,
                  quantitySnapshot: order.quantity,
                  operationNameSnapshot: op?.name,
                });
                toast.success('تم إغلاق المرحلة كمنتهية');
              }
              e.setCloseStepPrompt(null);
            }}
            onCancel={() => e.setCloseStepPrompt(null)}
          />
        );
      })()}

      {e.removePrompt && (
        <ConfirmDialog
          open={!!e.removePrompt}
          title={`حذف هذه المرحلة من القائمة؟ (${e.removePrompt.label})`}
          description="لن يتم تطبيق الحذف نهائيًا إلا بعد الضغط على « إعادة التخطيط »."
          confirmLabel="نعم، احذف"
          cancelLabel="إلغاء"
          variant="destructive"
          onConfirm={() => {
            const rid = e.removePrompt!.rowId;
            e.setRemovePrompt(null);
            e.setRows(prev => prev.filter(r => r.id !== rid).map((r, i) => ({ ...r, order: i + 1 })));
          }}
          onCancel={() => e.setRemovePrompt(null)}
        />
      )}

      {e.editDurationPrompt && (() => {
        const row = e.rows.find(r => r.id === e.editDurationPrompt!.rowId);
        if (!row) return null;
        const records = e.getRowRecords(row);
        return (
          <EditStepDurationDialog
            open={!!e.editDurationPrompt}
            records={records}
            operators={e.operators}
            operations={e.operations}
            onClose={() => e.setEditDurationPrompt(null)}
            onSave={(updates) => {
              updates.forEach(u => e.updateProductionRecord(u));
              e.setEditDurationPrompt(null);
              toast.success('تم تحديث المدد');
            }}
          />
        );
      })()}
    </>
  );
};

// ───────── Edit step duration dialog ─────────
const parseHHMMStr = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const fmtHHMM = (mins: number): string => {
  const h = Math.floor(Math.max(0, mins) / 60);
  const m = Math.max(0, mins) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

interface EditStepDurationDialogProps {
  open: boolean;
  records: ProductionRecord[];
  operators: { id: string; name: string }[];
  operations: { id: string; name: string }[];
  onClose: () => void;
  onSave: (updates: ProductionRecord[]) => void;
}

const EditStepDurationDialog: React.FC<EditStepDurationDialogProps> = ({ open, records, operators, operations, onClose, onSave }) => {
  type RowState = { id: string; startTime: string; endTime: string; pauseHHMM: string };
  const [draft, setDraft] = useState<RowState[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(records.map(r => ({
      id: r.id,
      startTime: r.startTime ?? '',
      endTime: r.endTime ?? '',
      pauseHHMM: fmtHHMM(r.pauseMinutes ?? 0),
    })));
  }, [open, records]);

  const computeDur = (d: RowState): number => {
    const s = d.startTime ? parseHHMMStr(d.startTime) : null;
    const e = d.endTime ? parseHHMMStr(d.endTime) : null;
    const p = parseHHMMStr(d.pauseHHMM) ?? 0;
    if (s === null || e === null || e <= s) return 0;
    return Math.max(0, e - s - p);
  };

  const totalDur = useMemo(() => draft.reduce((sum, d) => sum + computeDur(d), 0), [draft]);

  const update = (id: string, field: keyof RowState, value: string) => {
    setDraft(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleConfirm = () => {
    const updates: ProductionRecord[] = [];
    draft.forEach(d => {
      const original = records.find(r => r.id === d.id);
      if (!original) return;
      const dur = computeDur(d);
      if (dur <= 0) return;
      updates.push({
        ...original,
        startTime: d.startTime || undefined,
        endTime: d.endTime || undefined,
        pauseMinutes: parseHHMMStr(d.pauseHHMM) || undefined,
        actualDuration: dur,
      });
    });
    onSave(updates);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل مدة إنجاز الطلبية</DialogTitle>
        </DialogHeader>

        {draft.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">لا توجد تسجيلات إنجاز لهذه المرحلة.</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="p-1.5 text-right">العامل</th>
                  <th className="p-1.5 text-right">تاريخ الأشغال</th>
                  <th className="p-1.5 text-center">ساعة البداية</th>
                  <th className="p-1.5 text-center">ساعة النهاية</th>
                  <th className="p-1.5 text-center">الوقت المستقطع</th>
                  <th className="p-1.5 text-center">المدة الفعلية</th>
                </tr>
              </thead>
              <tbody>
                {draft.map(d => {
                  const rec = records.find(r => r.id === d.id)!;
                  const opName = operators.find(o => o.id === rec.operatorId)?.name ?? '—';
                  const dur = computeDur(d);
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="p-1.5">{opName}</td>
                      <td className="p-1.5 whitespace-nowrap">{rec.workDate ?? rec.validatedAt.slice(0, 10)}</td>
                      <td className="p-1.5">
                        <Input type="time" value={d.startTime} onChange={ev => update(d.id, 'startTime', ev.target.value)} className="h-8 text-xs font-mono" />
                      </td>
                      <td className="p-1.5">
                        <Input type="time" value={d.endTime} onChange={ev => update(d.id, 'endTime', ev.target.value)} className="h-8 text-xs font-mono" />
                      </td>
                      <td className="p-1.5">
                        <Input value={d.pauseHHMM} onChange={ev => update(d.id, 'pauseHHMM', ev.target.value)} placeholder="00:00" className="h-8 text-xs font-mono text-center" />
                      </td>
                      <td className="p-1.5 text-center font-mono font-medium">{fmtHHMM(dur)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={5} className="p-1.5 text-right font-semibold">المدة الإجمالية</td>
                  <td className="p-1.5 text-center font-mono font-semibold">{fmtHHMM(totalDur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={handleConfirm} disabled={draft.length === 0}>تأكيد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
