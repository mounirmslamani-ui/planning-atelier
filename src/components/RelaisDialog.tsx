import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChevronUp, ChevronDown, Check, Plus, Trash2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/searchable-select';
import { usePlanning } from '@/context/PlanningContext';
import { formatDateFR } from '@/lib/utils';
import StepDurationExpiredDialog from '@/components/StepDurationExpiredDialog';
import { PAUSE_SELECT_OPTIONS, isCustomToken, newPauseItem, pauseItemsTotalHHMM, serializePauseItems, type PauseItem } from '@/lib/pauseItems';
import type { Operation, Order, ProductionRecord, ProductionStep } from '@/types/planning';

export type RelaisMode = 'debut_poste' | 'relais' | 'fin_poste';

export interface RelaisFinishedRecord {
  stepId: string;
  orderId: string;
  operatorId: string;
  operationId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  pauseMinutes: number;
  pauseComment?: string;
  actualDuration: number;
  workStatus: 'done' | 'continue';
}

export interface RelaisNextRecord {
  stepId: string;
  orderId: string;
  operatorId: string;
  operationId: string;
  workDate: string;
  startTime: string;
}

export interface RelaisResult {
  finishedRecord: RelaisFinishedRecord | null;
  nextRecord: RelaisNextRecord | null;
}

interface Props {
  open: boolean;
  mode: RelaisMode;
  operatorId: string;
  operatorName: string;
  currentStep: ProductionStep | null;
  currentOrder: Order | null;
  currentStepTotalDoneAlready: number;
  nextStep: ProductionStep | null;
  nextOrder: Order | null;
  nextStepTotalDoneAlready: number;
  onConfirm: (result: RelaisResult) => void;
  onGrantExtraTime: (stepId: string, extraMinutes: number) => void;
  onCancel: () => void;
  operations: Operation[];
  productionRecords: ProductionRecord[];
  /** All non-finished steps for this operator, sorted by planningOrder asc, used for the right-block navigator */
  operatorOpenSteps: { step: ProductionStep; order: Order }[];
  /** Optional override of the left-block ساعة البداية initial value (e.g. from a previous relais) */
  initialStartTimeOverride?: string;
}

// ───────── Utility functions ─────────
function parseHHMM(value: string): number | null {
  if (!value || typeof value !== 'string' || !value.includes(':')) return null;
  const [hStr, mStr] = value.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function formatMinutesToHM(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function computeActualDuration(startTime: string, endTime: string, pauseTime: string): number | null {
  const s = parseHHMM(startTime);
  const e = parseHHMM(endTime);
  const p = parseHHMM(pauseTime) ?? 0;
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return Math.max(0, e - s - p);
}

function computeAutoPause(startTime: string, endTime: string): number {
  const s = parseHHMM(startTime);
  const e = parseHHMM(endTime);
  if (s === null || e === null) return 0;
  if (s < 720 && e > 750) return 30;
  return 0;
}

function incrementTime(timeStr: string, deltaMinutes: number): string {
  const t = parseHHMM(timeStr);
  if (t === null) return timeStr;
  const total = ((t + deltaMinutes) % 1440 + 1440) % 1440;
  return formatMinutesToHM(total);
}

// Auto-inserts ":" as the user types digits, so the user never types it manually
function formatMaskedTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ───────── Sub-component: HH:mm input with up/down arrows ─────────
interface TimeFieldProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}
const TimeField: React.FC<TimeFieldProps> = ({ value, onChange, disabled, className }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const commit = () => {
    if (/^\d{2}:\d{2}$/.test(local) && parseHHMM(local) !== null) {
      onChange(local);
    } else {
      setLocal(value);
    }
  };
  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      <Input
        value={local}
        disabled={disabled}
        onChange={e => setLocal(formatMaskedTime(e.target.value))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-20 text-center font-mono"
        placeholder="HH:mm"
      />
      <div className="flex flex-col">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(incrementTime(value, 1))}
          className="h-4 w-5 flex items-center justify-center border rounded-t hover:bg-muted disabled:opacity-40"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(incrementTime(value, -1))}
          className="h-4 w-5 flex items-center justify-center border-x border-b rounded-b hover:bg-muted disabled:opacity-40"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ───────── Main component ─────────
const RelaisDialog: React.FC<Props> = ({
  open, mode, operatorId, operatorName,
  currentStep, currentOrder, currentStepTotalDoneAlready,
  nextStep: initialNextStep, nextOrder: initialNextOrder, nextStepTotalDoneAlready: initialNextDone,
  onConfirm, onGrantExtraTime, onCancel, operations, productionRecords, operatorOpenSteps, initialStartTimeOverride,
}) => {
  const { clients } = usePlanning();


  // Right-block navigator state — index inside operatorOpenSteps
  const initialNextIdx = useMemo(() => {
    if (!initialNextStep) return 0;
    const i = operatorOpenSteps.findIndex(s => s.step.id === initialNextStep.id);
    return i >= 0 ? i : 0;
  }, [initialNextStep, operatorOpenSteps]);
  const [nextIdx, setNextIdx] = useState(initialNextIdx);
  useEffect(() => { setNextIdx(initialNextIdx); }, [initialNextIdx, open]);

  const nextStep = mode === 'fin_poste' ? null : (operatorOpenSteps[nextIdx]?.step ?? initialNextStep);
  const nextOrder = mode === 'fin_poste' ? null : (operatorOpenSteps[nextIdx]?.order ?? initialNextOrder);
  const nextTotalDone = useMemo(() => {
    if (!nextStep) return 0;
    if (nextStep === initialNextStep) return initialNextDone;
    return productionRecords
      .filter(r => r.stepId === nextStep.id)
      .reduce((sum, r) => sum + (r.actualDuration || 0), 0);
  }, [nextStep, initialNextStep, initialNextDone, productionRecords]);

  // Left block (finished order)
  const initialStart = useMemo(() => {
    if (initialStartTimeOverride) return initialStartTimeOverride;
    const recsToday = productionRecords
      .filter(r => r.operatorId === operatorId && r.workDate === todayISO() && r.endTime)
      .sort((a, b) => (b.endTime || '').localeCompare(a.endTime || ''));
    return recsToday[0]?.endTime || '08:00';
  }, [productionRecords, operatorId, initialStartTimeOverride]);


  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('08:00');
  const [pauseTime, setPauseTime] = useState('00:00');
  const [pauseItems, setPauseItems] = useState<PauseItem[]>([]);
  const [pauseManual, setPauseManual] = useState(false);
  const [workStatus, setWorkStatus] = useState<'done' | 'continue'>('continue');
  const [rightStartTime, setRightStartTime] = useState('08:00');
  const [rightStartManual, setRightStartManual] = useState(false);

  const [leftConfirmed, setLeftConfirmed] = useState(false);
  const [rightConfirmed, setRightConfirmed] = useState(false);
  const [leftPayload, setLeftPayload] = useState<RelaisFinishedRecord | null>(null);
  const [rightPayload, setRightPayload] = useState<RelaisNextRecord | null>(null);
  const [expiryAlertOpen, setExpiryAlertOpen] = useState(false);
  const [expiryAcknowledgedStepId, setExpiryAcknowledgedStepId] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    const start = initialStart;
    const now = nowHHMM();
    setStartTime(start);
    setEndTime(now);
    setPauseTime(formatMinutesToHM(computeAutoPause(start, now)).replace(/^(\d):/, '0$1:'));
    setPauseManual(false);
    setPauseItems([]);
    setWorkStatus('continue');
    setRightStartTime(mode === 'debut_poste' ? '08:00' : now);
    setRightStartManual(false);
    setLeftConfirmed(false);
    setRightConfirmed(false);
    setLeftPayload(null);
    setRightPayload(null);
    setExpiryAlertOpen(false);
    setExpiryAcknowledgedStepId(null);
  }, [open, initialStart, mode]);

  // Auto-update pause when start/end change unless user edited it
  useEffect(() => {
    if (pauseManual) return;
    const auto = computeAutoPause(startTime, endTime);
    setPauseTime(`${String(Math.floor(auto / 60)).padStart(2, '0')}:${String(auto % 60).padStart(2, '0')}`);
  }, [startTime, endTime, pauseManual]);

  // When at least one pause line exists, لوقت المستقطع = somme automatique des lignes.
  useEffect(() => {
    if (pauseItems.length === 0) return;
    setPauseManual(true);
    setPauseTime(pauseItemsTotalHHMM(pauseItems));
  }, [pauseItems]);

  // Sync right startTime with left endTime unless user edited it
  useEffect(() => {
    if (mode === 'debut_poste') return;
    if (rightStartManual) return;
    setRightStartTime(endTime);
  }, [endTime, mode, rightStartManual]);

  const actualDuration = computeActualDuration(startTime, endTime, pauseTime);
  const durationError = actualDuration === null;

  const todayDate = todayISO();
  const getClientName = (id?: string) => clients.find(c => c.id === id)?.name || '—';
  const getOperationName = (id?: string) => operations.find(o => o.id === id)?.name || '—';

  const totalEstimatedRemaining = currentStep
    ? Math.max(0, currentStep.estimatedDuration - currentStepTotalDoneAlready - (actualDuration ?? 0))
    : 0;
  const totalDoneInclusive = currentStep
    ? currentStepTotalDoneAlready + (actualDuration ?? 0)
    : 0;

  const nextRemaining = nextStep ? Math.max(0, nextStep.estimatedDuration - nextTotalDone) : 0;

  // ───────── Handlers ─────────
  const handleLeftConfirm = (statusOverride?: 'done' | 'continue') => {
    if (!currentStep || !currentOrder || actualDuration === null) return;
    const finalStatus = statusOverride ?? workStatus;
    const payload: RelaisFinishedRecord = {
      stepId: currentStep.id,
      orderId: currentOrder.id,
      operatorId,
      operationId: currentStep.operationId,
      workDate: todayDate,
      startTime,
      endTime,
      pauseMinutes: parseHHMM(pauseTime) ?? 0,
      pauseComment: pauseComment.trim() || undefined,
      actualDuration,
      workStatus: finalStatus,
    };
    setWorkStatus(finalStatus);
    setLeftPayload(payload);
    setLeftConfirmed(true);
  };

  // Trigger expiry alert when allocated duration is fully consumed while status is not 'done'
  useEffect(() => {
    if (!currentStep) return;
    if (workStatus === 'done') return;
    if (leftConfirmed) return;
    if (actualDuration === null) return;
    if (expiryAcknowledgedStepId === currentStep.id) return;
    const realRemaining = currentStep.estimatedDuration - currentStepTotalDoneAlready - actualDuration;
    if (realRemaining <= 0) setExpiryAlertOpen(true);
  }, [currentStep, currentStepTotalDoneAlready, actualDuration, workStatus, leftConfirmed, expiryAcknowledgedStepId]);

  const handleFinishStepFromAlert = () => {
    handleLeftConfirm('done');
    setExpiryAcknowledgedStepId(currentStep?.id ?? null);
    setExpiryAlertOpen(false);
  };

  const handleGrantExtraTimeFromAlert = (extraMinutes: number) => {
    if (!currentStep) return;
    onGrantExtraTime(currentStep.id, extraMinutes);
    setExpiryAcknowledgedStepId(currentStep.id);
    setExpiryAlertOpen(false);
  };

  const handleRightConfirm = () => {
    if (!nextStep || !nextOrder) return;
    const payload: RelaisNextRecord = {
      stepId: nextStep.id,
      orderId: nextOrder.id,
      operatorId,
      operationId: nextStep.operationId,
      workDate: todayDate,
      startTime: rightStartTime,
    };
    setRightPayload(payload);
    setRightConfirmed(true);
  };

  const handleLeftUndo = () => { setLeftConfirmed(false); setLeftPayload(null); };
  const handleRightUndo = () => { setRightConfirmed(false); setRightPayload(null); };

  const canConfirm =
    mode === 'debut_poste' ? rightConfirmed :
    mode === 'fin_poste' ? leftConfirmed :
    leftConfirmed && rightConfirmed;

  const handleFinalConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      finishedRecord: mode === 'debut_poste' ? null : leftPayload,
      nextRecord: mode === 'fin_poste' ? null : rightPayload,
    });
  };

  const showLeft = mode !== 'debut_poste';
  const showRight = mode !== 'fin_poste';

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-5xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">تبديل الشغل</DialogTitle>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <span>العامل: <span className="font-semibold text-foreground">{operatorName}</span></span>
            <span>التاريخ: <span className="font-semibold text-foreground">{formatDateFR(todayDate)}</span></span>
            <span>الساعة: <span className="font-semibold text-foreground">{nowHHMM()}</span></span>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:divide-x md:divide-x-reverse">
          {/* LEFT BLOCK — الطلبية المنتهية */}
          {showLeft && (
            <div className={`p-4 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 ${leftConfirmed ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-amber-900 dark:text-amber-200">الطلبية المنتهية</h3>
                {leftConfirmed && <Check className="w-5 h-5 text-emerald-600" />}
              </div>

              {currentStep && currentOrder ? (
                <div className="space-y-2 text-sm">
                  <Row label="رقم الطلبية" value={currentOrder.orderNumber} />
                  <Row label="الزبون" value={getClientName(currentOrder.clientId)} />
                  <Row label="التعيين" value={currentOrder.designation} />
                  <Row label="الكمية" value={String(currentOrder.quantity)} />
                  <Row label="العملية" value={getOperationName(currentStep.operationId)} />
                  <Row label="المدة الكلية المقدرة للمرحلة" value={formatMinutesToHM(currentStep.estimatedDuration)} />

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div>
                      <Label className="text-xs">ساعة البداية</Label>
                      <TimeField value={startTime} onChange={setStartTime} disabled={leftConfirmed} />
                    </div>
                    <div>
                      <Label className="text-xs">ساعة النهاية</Label>
                      <TimeField value={endTime} onChange={setEndTime} disabled={leftConfirmed} />
                    </div>
                    <div>
                      <Label className="text-xs">الوقت المستقطع</Label>
                      <TimeField value={pauseTime} onChange={v => { setPauseManual(true); setPauseTime(v); }} disabled={leftConfirmed} />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">ملاحظة الوقت المستقطع</Label>
                    <Textarea
                      value={pauseComment}
                      onChange={e => setPauseComment(e.target.value)}
                      disabled={leftConfirmed}
                      placeholder="سبب التوقف"
                      className="text-xs resize-none min-h-[60px]"
                      rows={3}
                    />
                  </div>

                  <div className="pt-2 space-y-1">
                    {durationError ? (
                      <p className="text-destructive text-xs">ساعة النهاية يجب أن تكون بعد ساعة البداية</p>
                    ) : (
                      <Row label="المدة الفعلية" value={formatMinutesToHM(actualDuration ?? 0)} />
                    )}
                    <Row label="المدة الفعلية الإجمالية" value={formatMinutesToHM(totalDoneInclusive)} />
                    <Row label="المدة المقدرة المتبقية للمرحلة" value={formatMinutesToHM(totalEstimatedRemaining)} />
                  </div>

                  {mode !== 'fin_poste' && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={workStatus === 'done' ? 'default' : 'outline'}
                        onClick={() => setWorkStatus('done')}
                        disabled={leftConfirmed}
                      >
                        انتهى
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={workStatus === 'continue' ? 'default' : 'outline'}
                        onClick={() => setWorkStatus('continue')}
                        disabled={leftConfirmed}
                      >
                        يتبع
                      </Button>
                    </div>
                  )}

                  <div className="pt-3 flex gap-2">
                    <Button
                      type="button"
                      onClick={() => handleLeftConfirm()}
                      disabled={leftConfirmed || durationError}
                      className="flex-1"
                    >
                      انهاء
                    </Button>
                    {leftConfirmed && (
                      <Button type="button" variant="outline" onClick={handleLeftUndo}>
                        إلغاء
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد مرحلة جارية لهذا العامل.</p>
              )}
            </div>
          )}


          {/* RIGHT BLOCK — الطلبية التالية */}
          {showRight && (
            <div className={`p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 ${rightConfirmed ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-emerald-900 dark:text-emerald-200">الطلبية التالية</h3>
                {rightConfirmed && <Check className="w-5 h-5 text-emerald-600" />}
              </div>

              {nextStep && nextOrder ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">رقم الطلبية</Label>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{nextOrder.orderNumber}</span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={rightConfirmed || nextIdx <= 0}
                          onClick={() => setNextIdx(i => Math.max(0, i - 1))}
                          className="h-4 w-5 flex items-center justify-center border rounded-t hover:bg-muted disabled:opacity-40"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={rightConfirmed || nextIdx >= operatorOpenSteps.length - 1}
                          onClick={() => setNextIdx(i => Math.min(operatorOpenSteps.length - 1, i + 1))}
                          className="h-4 w-5 flex items-center justify-center border-x border-b rounded-b hover:bg-muted disabled:opacity-40"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <Row label="الزبون" value={getClientName(nextOrder.clientId)} />
                  <Row label="التعيين" value={nextOrder.designation} />
                  <Row label="الكمية" value={String(nextOrder.quantity)} />
                  <Row label="العملية" value={getOperationName(nextStep.operationId)} />
                  <Row label="المدة الكلية المقدرة للمرحلة" value={formatMinutesToHM(nextStep.estimatedDuration)} />

                  <div className="pt-2">
                    <Label className="text-xs">ساعة البداية</Label>
                    <TimeField
                      value={rightStartTime}
                      onChange={v => { setRightStartManual(true); setRightStartTime(v); }}
                      disabled={rightConfirmed}
                    />
                  </div>

                  <div className="pt-2">
                    <Row label="المدة المقدرة المتبقية للمرحلة" value={formatMinutesToHM(nextRemaining)} />
                  </div>

                  <div className="pt-3 flex gap-2">
                    <Button
                      type="button"
                      onClick={handleRightConfirm}
                      disabled={rightConfirmed}
                      className="flex-1"
                    >
                      بدء
                    </Button>
                    {rightConfirmed && (
                      <Button type="button" variant="outline" onClick={handleRightUndo}>
                        إلغاء
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد طلبية تالية متاحة.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button onClick={handleFinalConfirm} disabled={!canConfirm}>تأكيد</Button>
        </div>

      </DialogContent>
    </Dialog>
    <StepDurationExpiredDialog
      open={expiryAlertOpen}
      onFinishStep={handleFinishStepFromAlert}
      onGrantExtraTime={handleGrantExtraTimeFromAlert}
    />
    </>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground text-right truncate">{value}</span>
  </div>
);

export default RelaisDialog;
