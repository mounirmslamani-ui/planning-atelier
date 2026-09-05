import type { Order, ProductionStep, ProductionRecord, Operation } from '@/types/planning';

export const MARGIN_OPTIONS = [30, 50] as const;
export type MarginPercent = 30 | 50;

export const MANUFACTURING_HOURLY_RATES = [1500, 2000, 2500, 3000, 3500, 4000, 4500];

export interface OrderCostingBreakdown {
  materialsSaleTotal: number;
  subcontractingSaleTotal: number;
  manufacturingSaleTotal: number;
  totalCost: number;        // = matériaux(vente) + sous-traitance(vente) + fabrication
  unitCost: number;         // = totalCost / quantity
  unitSalePrice?: number;   // = order.salePricePerUnit (manuel, peut être vide)
  totalSalePrice?: number;  // = unitSalePrice * quantity
}

const applyMargin = (cost: number, margin: MarginPercent | undefined): number =>
  cost * (1 + ((margin ?? 0) / 100));

/** Heures facturables cumulées d'une étape (somme des production_records liés). */
export function getStepBillableHours(stepId: string, records: ProductionRecord[]): number {
  return records
    .filter(r => r.stepId === stepId)
    .reduce((sum, r) => sum + (r.billableHours ?? 0), 0);
}

/**
 * Calcule le coût / prix de vente d'une commande à partir de ses étapes.
 * orderSteps et orderRecords doivent déjà être filtrés sur orderId (l'appelant s'en charge).
 */
export function computeOrderCosting(
  order: Order,
  orderSteps: ProductionStep[],
  orderRecords: ProductionRecord[],
  operations: Operation[],
): OrderCostingBreakdown {
  let materialsSaleTotal = 0;
  let subcontractingSaleTotal = 0;
  let manufacturingSaleTotal = 0;

  for (const step of orderSteps) {
    const isSubcontracted = !!step.subcontractorId;

    if (isSubcontracted) {
      subcontractingSaleTotal += applyMargin(step.subcontractingCost ?? 0, step.subcontractingMargin);
    } else {
      const billableHours = getStepBillableHours(step.id, orderRecords);
      manufacturingSaleTotal += billableHours * (step.hourlyRate ?? 0);
    }

    for (const item of step.rawMaterialItems || []) {
      if (!item.label || !item.label.trim()) continue; // ignorer les lignes vides
      materialsSaleTotal += applyMargin(item.costPrice ?? 0, item.margin);
    }
  }

  const totalCost = materialsSaleTotal + subcontractingSaleTotal + manufacturingSaleTotal;
  const unitCost = order.quantity > 0 ? totalCost / order.quantity : 0;
  const unitSalePrice = order.salePricePerUnit;
  const totalSalePrice = unitSalePrice != null ? unitSalePrice * order.quantity : undefined;

  return { materialsSaleTotal, subcontractingSaleTotal, manufacturingSaleTotal, totalCost, unitCost, unitSalePrice, totalSalePrice };
}
