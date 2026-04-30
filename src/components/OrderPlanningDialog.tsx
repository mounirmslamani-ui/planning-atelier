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
import { BLOCKED_MODAL_ROW_CLASS } from '@/lib/blockedSteps';
import { getStepProgressStatus } from '@/lib/stepProgress';
import { toast } from 'sonner';

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
    qcEntries, deliveryEntries, deliveredOrders,
    addStep, updateStep, deleteStep, updateOrder, absenceOperationId,
  } = usePlanning();

  const currentOrder = orders.find(o => o.id === order.id) || order;

  // Lock planning if the order has already moved past production
  const isInQC = qcEntries.some(e => e.orderId === order.id);
  const isInDelivery = deliveryEntries.some(e => e.orderId === order.id);
  const isDelivered = deliveredOrders.some(d => d.orderId === order.id);
  const isLocked = isInQC || isInDelivery || isDelivered;
  const lockReason = isDelivered
    ? 'الطلبية مسلَّمة — تعديل المراحل غير مسموح'
    : isInDelivery
      ? 'الطلبية في طور التسليم — تعديل المراحل غير مسموح'
      : isInQC
        ? 'الطلبية في مراقبة الجودة — تعديل المراحل غير مسموح'
        : '';
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [datePrompt, setDatePrompt] = useState<{ rowId: string; field: 'studyDeadline' | 'materialDeadline' | 'toolingDeadline'; label: string } | null>(null);

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
          studyStatus: (currentOrder.studyStatus ?? s.studyStatus ?? 'non-disponible') as ResourceStatus,
          materialStatus: (currentOrder.materialStatus ?? s.materialStatus ?? 'non-disponible') as ResourceStatus,
          toolingStatus: (currentOrder.toolingStatus ?? s.toolingStatus ?? 'non-disponible') as ResourceStatus,
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
  }, [open, order.id, steps, absenceOperationId, currentOrder.studyStatus, currentOrder.materialStatus, currentOrder.toolingStatus]);

  useEffect(() => {
    if (!open || rows.length === 0) return;
    setRows(prev => prev.map(row => {
      const step = row.stepId ? steps.find(s => s.id === row.stepId) : undefined;
      return {
        ...row,
        studyStatus: (currentOrder.studyStatus ?? step?.studyStatus ?? row.studyStatus) as ResourceStatus,
        materialStatus: (currentOrder.materialStatus ?? step?.materialStatus ?? row.materialStatus) as ResourceStatus,
        toolingStatus: (currentOrder.toolingStatus ?? step?.toolingStatus ?? row.toolingStatus) as ResourceStatus,
        studyDeadline: step?.studyDeadline || row.studyDeadline,
        materialDeadline: step?.materialDeadline || row.materialDeadline,
        toolingDeadline: step?.toolingDeadline || row.toolingDeadline,
      };
    }));
  }, [open, steps, currentOrder.studyStatus, currentOrder.materialStatus, currentOrder.toolingStatus]);

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
    const boolKey = field === 'study' ? 'studyReady' : field === 'material' ? 'materialAvailable' : 'toolingAvailable';
    const isAvailable = status === 'disponible';
    const updatedOrder = {
      ...currentOrder,
      [statusKey]: status,
      [boolKey]: isAvailable,
      ...(field === 'material' && !isAvailable ? { materialReceivedDate: undefined } : {}),
    } as Order;

    updateOrder(updatedOrder);
    setRows(prev => prev.map(row => ({
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

    const deadline = order.deliveryDeadline || order.plannedDeadline || '9999-12-31';
    const existingOrderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOperationId);

    // Snapshot the existing step IDs (in row order) BEFORE deleting, so we can
    // reuse them for unchanged rows. This preserves the link with
    // production_records (validations) and prevents ghost/orphan data.
    const existingIdsByRow: (string | undefined)[] = rows.map(r => {
      if (!r.stepId) return undefined;
      // Only reuse if the step still exists in DB
      return existingOrderSteps.find(s => s.id === r.stepId)?.id;
    });

    existingOrderSteps.forEach(s => deleteStep(s.id));

    const stepsWithoutThisOrder = steps.filter(s => s.orderId !== order.id || s.operationId === absenceOperationId);
    const opsToSchedule: OperationToSchedule[] = rows.map(row => {
      const isSub = row.assignType === 'subcontractor';
      const options = [row.option1]
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

    // Attach step-level prerequisites from rows AND reuse existing IDs where possible
    newSteps.forEach((s, i) => {
      if (rows[i]) {
        s.studyStatus = currentOrder.studyStatus ?? rows[i].studyStatus;
        s.materialStatus = currentOrder.materialStatus ?? rows[i].materialStatus;
        s.toolingStatus = currentOrder.toolingStatus ?? rows[i].toolingStatus;
        s.studyReady = s.studyStatus === 'disponible';
        s.materialAvailable = s.materialStatus === 'disponible';
        s.toolingAvailable = s.toolingStatus === 'disponible';
        s.studyDeadline = rows[i].studyDeadline;
        s.materialDeadline = rows[i].materialDeadline;
        s.toolingDeadline = rows[i].toolingDeadline;
        s.specialToolingNeeds = (rows[i].specialToolingNeeds || []).filter(v => v.trim());
        s.rawMaterialNeeds = (rows[i].rawMaterialNeeds || []).filter(v => v.trim());
      }
      // Preserve original step ID for rows that already existed → keeps
      // production_records linkage intact, no ghost data.
      const reusedId = existingIdsByRow[i];
      if (reusedId) {
        s.id = reusedId;
      }
      addStep(s);
    });
    updatedSteps.forEach(s => updateStep(s));
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
                        <option value="operator">العامل</option>
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
            setRows(prev => prev.map(row => ({ ...row, [datePrompt.field]: date } as OperationRow)));
            setDatePrompt(null);
          }}
          onCancel={() => {
            // Revert status to "disponible" since user cancelled
            const statusMap: Record<string, 'studyStatus' | 'materialStatus' | 'toolingStatus'> = {
              studyDeadline: 'studyStatus',
              materialDeadline: 'materialStatus',
              toolingDeadline: 'toolingStatus',
            };
            const statusKey = statusMap[datePrompt.field];
            const field = statusKey.replace('Status', '') as 'study' | 'material' | 'tooling';
            const boolKey = field === 'study' ? 'studyReady' : field === 'material' ? 'materialAvailable' : 'toolingAvailable';
            updateOrder({ ...currentOrder, [statusKey]: 'disponible', [boolKey]: true } as Order);
            setRows(prev => prev.map(row => ({ ...row, [statusKey]: 'disponible', [datePrompt.field]: '' } as OperationRow)));
            setDatePrompt(null);
          }}
        />
      )}
    </>
  );
};

export default OrderPlanningDialog;
