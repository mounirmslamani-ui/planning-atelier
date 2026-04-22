import type { ProductionRecord, ProductionStep } from '@/types/planning';

export type StepProgressStatus = 'Non entamée' | 'En cours' | 'Terminée';

export interface OrderStepStatusDetail {
  step: ProductionStep;
  lineNumber: number;
  scopeLabel: 'Atelier' | 'Sous-traitance';
  status: StepProgressStatus;
}

export interface OrderQualityControlCheck {
  totalSteps: number;
  completedSteps: number;
  isReady: boolean;
  blocker: OrderStepStatusDetail | null;
  details: OrderStepStatusDetail[];
}

function normalizeRecordStatus(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function getStepProgressStatus(step: ProductionStep, records: ProductionRecord[]): StepProgressStatus {
  if (step.subcontractorId) {
    return step.subcontractingDone ? 'Terminée' : 'Non entamée';
  }

  const stepRecords = records.filter(record => record.stepId === step.id);
  if (stepRecords.some(record => normalizeRecordStatus(record.workStatus) === 'done')) return 'Terminée';
  if (stepRecords.some(record => normalizeRecordStatus(record.workStatus) === 'continue')) return 'En cours';
  return 'Non entamée';
}

export function getOrderProductionSteps(
  orderId: string,
  allSteps: ProductionStep[],
  absenceOperationId: string,
): ProductionStep[] {
  return allSteps
    .filter(step => step.orderId === orderId && step.operationId !== absenceOperationId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function isOrderReadyForQualityControl(
  orderId: string,
  allSteps: ProductionStep[],
  records: ProductionRecord[],
  absenceOperationId: string,
): boolean {
  return getOrderQualityControlCheck(orderId, allSteps, records, absenceOperationId).isReady;
}

export function getOrderStepStatusDetails(
  orderId: string,
  allSteps: ProductionStep[],
  records: ProductionRecord[],
  absenceOperationId: string,
): OrderStepStatusDetail[] {
  return getOrderProductionSteps(orderId, allSteps, absenceOperationId).map((step, index) => ({
    step,
    lineNumber: step.order || index + 1,
    scopeLabel: step.subcontractorId ? 'Sous-traitance' : 'Atelier',
    status: getStepProgressStatus(step, records),
  }));
}

export function getOrderQualityControlCheck(
  orderId: string,
  allSteps: ProductionStep[],
  records: ProductionRecord[],
  absenceOperationId: string,
): OrderQualityControlCheck {
  const details = getOrderStepStatusDetails(orderId, allSteps, records, absenceOperationId);
  const completedSteps = details.filter(detail => detail.status === 'Terminée').length;
  const blocker = details.find(detail => detail.status !== 'Terminée') || null;

  return {
    totalSteps: details.length,
    completedSteps,
    isReady: details.length > 0 && completedSteps === details.length,
    blocker,
    details,
  };
}

export function buildOrderQualityControlErrorMessage(
  orderId: string,
  allSteps: ProductionStep[],
  records: ProductionRecord[],
  absenceOperationId: string,
): string {
  const check = getOrderQualityControlCheck(orderId, allSteps, records, absenceOperationId);

  if (check.totalSteps === 0) {
    return 'aucune étape n’est définie pour cette commande.';
  }

  if (!check.blocker) {
    return `validation incomplète (${check.completedSteps}/${check.totalSteps} étapes terminées).`;
  }

  if (check.blocker.scopeLabel === 'Sous-traitance') {
    return `Ligne ${check.blocker.lineNumber} : Sous-traitance non terminée.`;
  }

  if (check.blocker.status === 'En cours') {
    return `Ligne ${check.blocker.lineNumber} : Atelier en cours.`;
  }

  return `Ligne ${check.blocker.lineNumber} : Atelier non entamé.`;
}