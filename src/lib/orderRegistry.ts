import type { Order, OrderCategory, ProductionStep, ProductionRecord, QualityControlEntry, DeliveryEntry, DeliveredOrder } from '@/types/planning';
import { ORDER_CATEGORY_PREFIX } from '@/types/planning';
import { getOrderGlobalStatus } from '@/lib/stepProgress';

export type RegistryStatus =
  | 'قيد الانتظار'
  | 'قيد الإنجاز'
  | 'في انتظار مراقبة الجودة'
  | 'في انتظار التسليم'
  | 'في انتظار الفوترة'
  | 'مفوترة';

export function generateOrderCode(category: OrderCategory, existingOrders: Order[], year?: number): string {
  const yy = String((year ?? new Date().getFullYear()) % 100).padStart(2, '0');
  const prefix = ORDER_CATEGORY_PREFIX[category];
  // Match pattern aa/Pxxx or aa/xxx
  const pattern = new RegExp(`^${yy}\\/${prefix}(\\d+)$`);
  let max = 0;
  existingOrders.forEach(o => {
    const m = (o.orderNumber || '').match(pattern);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  const next = String(max + 1).padStart(3, '0');
  return `${yy}/${prefix}${next}`;
}

export function getOrderRegistryStatus(
  order: Order,
  steps: ProductionStep[],
  records: ProductionRecord[],
  qcEntries: QualityControlEntry[],
  deliveryEntries: DeliveryEntry[],
  deliveredOrders: DeliveredOrder[],
  absenceOperationId: string,
): RegistryStatus {
  const delivered = deliveredOrders.find(d => d.orderId === order.id);
  if (delivered) {
    if (delivered.invoiceNumber && delivered.invoiceNumber.trim()) return 'مفوترة';
    return 'في انتظار الفوترة';
  }
  if (deliveryEntries.some(d => d.orderId === order.id)) return 'في انتظار التسليم';
  if (qcEntries.some(q => q.orderId === order.id)) return 'في انتظار مراقبة الجودة';
  const g = getOrderGlobalStatus(order.id, steps, records, absenceOperationId);
  if (g === 'Terminée') return 'في انتظار مراقبة الجودة';
  if (g === 'En cours') return 'قيد الإنجاز';
  return 'قيد الانتظار';
}

export const REGISTRY_STATUS_CLASS: Record<RegistryStatus, string> = {
  'قيد الانتظار': 'bg-muted text-muted-foreground border-muted-foreground/30',
  'قيد الإنجاز': 'bg-accent/10 text-accent border-accent/30',
  'في انتظار مراقبة الجودة': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  'في انتظار التسليم': 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  'في انتظار الفوترة': 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  'مفوترة': 'bg-primary/10 text-primary border-primary/30',
};
