import type { Order, DeliveredOrder } from '@/types/planning';
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

// Même valeur que PRICING_CUTOFF_DATE dans PricingPage : livraisons antérieures au calcul des prix, ignorées.
const PRICING_CUTOFF_DATE = '2026-09-15';

/** Ligne de la page الطلبيات المسلمة : prix non saisi, hors « Gratuit », hors livraisons antérieures à la date de référence. */
export function isDeliveredEntryAwaitingPricing(order: Order | undefined, entry: DeliveredOrder): boolean {
  if (entry.salePriceStatus === 'gratuit') return false;
  if (entry.deliveryDate && entry.deliveryDate.slice(0, 10) < PRICING_CUTOFF_DATE) return false;
   return isOrderAwaitingPricing(order);
}
