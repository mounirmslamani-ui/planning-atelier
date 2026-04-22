import type { ProductionRecord, ProductionStep } from '@/types/planning';

export type StepProgressStatus = 'Non entamée' | 'En cours' | 'Terminée';

export function getStepProgressStatus(step: ProductionStep, records: ProductionRecord[]): StepProgressStatus {
  if (step.subcontractorId && step.subcontractingDone) return 'Terminée';

  const stepRecords = records.filter(record => record.stepId === step.id);
  if (stepRecords.some(record => record.workStatus === 'done')) return 'Terminée';
  if (stepRecords.some(record => record.workStatus === 'continue')) return 'En cours';
  return 'Non entamée';
}

export function getOrderProductionSteps(
  orderId: string,
  allSteps: ProductionStep[],
  absenceOperationId: string,
): ProductionStep[] {
  return allSteps.filter(step => step.orderId === orderId && step.operationId !== absenceOperationId);
}

export function isOrderReadyForQualityControl(
  orderId: string,
  allSteps: ProductionStep[],
  records: ProductionRecord[],
  absenceOperationId: string,
): boolean {
  const orderSteps = getOrderProductionSteps(orderId, allSteps, absenceOperationId);
  return orderSteps.length > 0 && orderSteps.every(step => getStepProgressStatus(step, records) === 'Terminée');
}