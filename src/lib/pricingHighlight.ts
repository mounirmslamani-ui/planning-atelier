import type { Order } from '@/types/planning';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';

/** Couleur « en attente de chiffrage » : violet, distinct du blanc, de l'orange (matière bloquée), du rouge (reprise), du jaune (QC) et du vert/bleu (statuts). */
export const AWAITING_PRICING_ROW_CLASS =
  'bg-violet-100 hover:bg-violet-200 border-l-4 border-l-violet-600 dark:bg-violet-950/40 dark:hover:bg-violet-950/60';

export const AWAITING_PRICING_TITLE = 'في انتظار التسعير — ثمن البيع غير مُدخل';

/** Même critère que la 3e liste de la page تسعير : prix de vente non saisi, hors commandes SLAMANI. */
export function isOrderAwaitingPricing(order: Order | undefined): boolean {
  if (!order) return false;
  if (order.salePricePerUnit != null) return false;
  return inferCategoryFromOrderNumber(order.orderNumber) !== 'slamani';
}
