import type { Order, ProductionStep, ProductionRecord, Operation, OrderCategory } from '@/types/planning';

export const MARGIN_OPTIONS = [30, 50] as const;
export type MarginPercent = 30 | 50;

/** Palier d'ajustement manuel (+ / -) du taux horaire d'une étape, en DZD. */
export const HOURLY_RATE_STEP = 500;

/**
 * Taux horaire par défaut d'une opération selon la catégorie de la commande :
 *   fabrication / prestation → التكلفة الساعية 1
 *   divers                   → التكلفة الساعية 2
 *   slamani                  → 0 (forfaitaire, non facturé)
 * Retourne undefined si l'opération ne définit pas le taux correspondant
 * (l'utilisateur devra alors le renseigner via les boutons + / -).
 */
export function getDefaultHourlyRate(
  category: OrderCategory | undefined,
  operation: Operation | undefined,
): number | undefined {
  if (category === 'slamani') return 0;
  if (category === 'divers') return operation?.hourlyRate2;
  return operation?.hourlyRate1; // fabrication / prestation / non défini
}

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
