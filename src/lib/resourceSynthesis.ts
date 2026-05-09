import type { ResourceStatus, ProductionStep, Order } from '@/types/planning';

/**
 * Synthesise plusieurs statuts par étape en un statut global :
 * - Tous Vert => Vert (disponible)
 * - Tous Rouge => Rouge (non-disponible)
 * - Mixte (au moins un différent) => Orange (partiel)
 * Les statuts 'non-applicable' sont ignorés. Si tous sont N/A => N/A.
 */
export function synthesizeResourceStatuses(statuses: ResourceStatus[]): ResourceStatus {
  const filtered = statuses.filter(s => s && s !== 'non-applicable');
  if (filtered.length === 0) return statuses.length > 0 ? 'non-applicable' : 'non-disponible';
  const allGreen = filtered.every(s => s === 'disponible');
  if (allGreen) return 'disponible';
  const allRed = filtered.every(s => s === 'non-disponible');
  if (allRed) return 'non-disponible';
  return 'partiel';
}

/**
 * Calcule les statuts synthétisés (étude / matière / outillage) d'une commande
 * à partir de SES étapes. Si la commande n'a pas encore d'étapes définies,
 * retourne null pour conserver le statut global existant (rétroactivité).
 */
export function computeOrderStatusFromSteps(
  order: Order,
  allSteps: ProductionStep[],
  absenceOperationId?: string,
): { study: ResourceStatus; material: ResourceStatus; tooling: ResourceStatus } | null {
  const orderSteps = allSteps.filter(
    s => s.orderId === order.id && s.operationId !== absenceOperationId,
  );
  if (orderSteps.length === 0) return null;
  return {
    study: synthesizeResourceStatuses(orderSteps.map(s => s.studyStatus ?? 'non-disponible')),
    material: synthesizeResourceStatuses(orderSteps.map(s => s.materialStatus ?? 'non-disponible')),
    tooling: synthesizeResourceStatuses(orderSteps.map(s => s.toolingStatus ?? 'non-disponible')),
  };
}
