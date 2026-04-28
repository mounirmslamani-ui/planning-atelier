import * as XLSX from 'xlsx';
import type {
  Order, ProductionStep, ProductionRecord, Client, Operator, Operation,
  DeliveredOrder, QualityControlEntry,
} from '@/types/planning';
import { formatDateFR, formatDateTimeFR } from '@/lib/utils';
import { getOrderGlobalStatus } from '@/lib/stepProgress';

interface ArchiveData {
  orders: Order[];
  steps: ProductionStep[];
  productionRecords: ProductionRecord[];
  clients: Client[];
  operators: Operator[];
  operations: Operation[];
  deliveredOrders: DeliveredOrder[];
  qcEntries: QualityControlEntry[];
  absenceOrderId: string;
  absenceOperationId: string;
}

const QC_DECISION_LABEL: Record<string, string> = {
  'conforme': 'مطابق',
  'reprise-retouche': 'إعادة / تصحيح',
  'conforme-derogation': 'مطابق مع ترخيص',
  'non-conforme': 'غير مطابق',
};

const PRICE_LABEL: Record<string, string> = {
  'gratuit': 'مجاني',
  'non-calcule': 'غير محسوب',
  'non-valide': 'غير مصادق',
  'valide': 'مصادق',
};

function formatHM(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function getArchiveFilename(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `ARCHIVE_TOTALE_ATELIER_${dd}-${mm}-${yyyy}_${hh}h${mi}.xlsx`;
}

function buildCurrentOrdersSheet(data: ArchiveData) {
  const { orders, steps, productionRecords, clients, deliveredOrders, absenceOrderId, absenceOperationId } = data;
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  const deliveredIds = new Set(deliveredOrders.map(d => d.orderId));

  const atelierMinutes = (orderId: string) => {
    return productionRecords
      .filter(r => r.orderId === orderId && r.operationId !== absenceOperationId)
      .reduce((s, r) => s + (r.actualDuration || 0), 0);
  };

  const sorted = orders
    .filter(o => o.id !== absenceOrderId && !deliveredIds.has(o.id))
    .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));

  return sorted.map((o, idx) => ({
    'الترتيب': o.displayOrder ?? idx + 1,
    'رقم الطلبية': o.orderNumber,
    'التاريخ': formatDateFR(o.orderDate),
    'الزبون': clientMap.get(o.clientId) || '',
    'التعيين': o.designation,
    'الكمية': o.quantity,
    'الأولوية': o.priority || '',
    'أجل التسليم': formatDateFR(o.deliveryDeadline || o.plannedDeadline),
    'ممثل الزبون': o.clientRepresentative || '',
    'تعليمات': o.instructions || '',
    'مخطط/نموذج': o.drawingModel || '',
    'الحالة': getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId),
    'وقت في الورشة': formatHM(atelierMinutes(o.id)),
    'دراسة': o.studyStatus || '',
    'مواد أولية': o.materialStatus || '',
    'عدة': o.toolingStatus || '',
    'تاريخ استلام المواد': formatDateFR(o.materialReceivedDate),
    'ملاحظات': o.observation || '',
    'تاريخ تحديث الملاحظات': formatDateTimeFR(o.notesUpdatedAt),
  }));
}

function buildPlanningTableauSheet(data: ArchiveData) {
  const { steps, orders, clients, operators, operations, productionRecords, absenceOrderId } = data;
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  const orderMap = new Map(orders.map(o => [o.id, o]));
  const operatorMap = new Map(operators.map(o => [o.id, o.name]));
  const operationMap = new Map(operations.map(o => [o.id, o.name]));

  const doneByStep = new Map<string, number>();
  productionRecords.forEach(r => {
    doneByStep.set(r.stepId, (doneByStep.get(r.stepId) || 0) + (r.actualDuration || 0));
  });

  const rows = steps
    .filter(s => s.orderId !== absenceOrderId)
    .slice()
    .sort((a, b) => {
      const da = `${a.startDate || ''} ${a.startTime || ''}`;
      const db = `${b.startDate || ''} ${b.startTime || ''}`;
      return da.localeCompare(db);
    });

  return rows.map(s => {
    const o = orderMap.get(s.orderId);
    const done = doneByStep.get(s.id) || 0;
    const pct = s.estimatedDuration > 0 ? Math.min(100, Math.round((done / s.estimatedDuration) * 100)) : 0;
    return {
      'تاريخ البداية': formatDateFR(s.startDate),
      'وقت البداية': s.startTime || '',
      'تاريخ النهاية': formatDateFR(s.endDate),
      'وقت النهاية': s.endTime || '',
      'العامل': operatorMap.get(s.operatorId || '') || '',
      'العملية': operationMap.get(s.operationId) || '',
      'رقم الطلبية': o?.orderNumber || '',
      'الزبون': o ? (clientMap.get(o.clientId) || '') : '',
      'التعيين': o?.designation || '',
      'الكمية': o?.quantity ?? '',
      'الأولوية': o?.priority || '',
      'أجل التسليم': formatDateFR(o?.deliveryDeadline || o?.plannedDeadline),
      'المدة المقدرة': formatHM(s.estimatedDuration),
      'المنجز': formatHM(done),
      'نسبة التقدم': `${pct}%`,
      'دراسة': s.studyStatus || '',
      'مواد أولية': s.materialStatus || '',
      'عدة': s.toolingStatus || '',
      'مثبت': s.frozen ? 'نعم' : '',
      'ملاحظات الطلبية': o?.observation || '',
      'تاريخ تحديث الملاحظات': formatDateTimeFR(o?.notesUpdatedAt),
    };
  });
}

function buildDeliveredOrdersSheet(data: ArchiveData) {
  const { deliveredOrders, orders, clients } = data;
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  const orderMap = new Map(orders.map(o => [o.id, o]));

  return deliveredOrders.map(d => {
    const o = orderMap.get(d.orderId);
    return {
      'الأولوية': o?.priority || '',
      'رقم الطلبية': o?.orderNumber || '',
      'التاريخ': formatDateFR(o?.orderDate),
      'الزبون': o ? (clientMap.get(o.clientId) || '') : '',
      'التعيين': o?.designation || '',
      'الكمية': o?.quantity ?? '',
      'تاريخ التسليم': formatDateFR(d.deliveryDate),
      'ثمن البيع': PRICE_LABEL[d.salePriceStatus] || d.salePriceStatus,
      'رقم الفاتورة': d.invoiceNumber || 'في الانتظار',
      'ملاحظات': d.observation || '',
    };
  });
}

function buildPendingInvoicingSheet(data: ArchiveData) {
  const { deliveredOrders, orders, clients } = data;
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  const orderMap = new Map(orders.map(o => [o.id, o]));

  // Pending invoicing = delivered without invoice number
  return deliveredOrders
    .filter(d => !d.invoiceNumber || !d.invoiceNumber.trim())
    .map(d => {
      const o = orderMap.get(d.orderId);
      return {
        'الزبون': o ? (clientMap.get(o.clientId) || '') : '',
        'رقم الطلبية': o?.orderNumber || '',
        'التاريخ': formatDateFR(o?.orderDate),
        'التعيين': o?.designation || '',
        'الكمية': o?.quantity ?? '',
        'ممثل الزبون': o?.clientRepresentative || '',
        'الأولوية': o?.priority || '',
        'أجل التسليم': formatDateFR(o?.deliveryDeadline),
        'تاريخ التسليم': formatDateFR(d.deliveryDate),
        'ثمن البيع': PRICE_LABEL[d.salePriceStatus] || d.salePriceStatus,
        'ملاحظات': d.observation || '',
      };
    });
}

export function exportGlobalArchive(data: ArchiveData) {
  const wb = XLSX.utils.book_new();

  const sheets: { name: string; rows: Record<string, string | number>[] }[] = [
    { name: 'الطلبيات الحالية', rows: buildCurrentOrdersSheet(data) as Record<string, string | number>[] },
    { name: 'جدول البرمجة', rows: buildPlanningTableauSheet(data) as Record<string, string | number>[] },
    { name: 'طلبيات مسلمة', rows: buildDeliveredOrdersSheet(data) as Record<string, string | number>[] },
    { name: 'طلبيات قيد الانتظار', rows: buildPendingInvoicingSheet(data) as Record<string, string | number>[] },
  ];

  sheets.forEach(s => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length > 0 ? s.rows : [{ '—': 'لا توجد بيانات' }]);
    // RTL-friendly: reasonable default widths
    const headers = s.rows.length > 0 ? Object.keys(s.rows[0]) : ['—'];
    ws['!cols'] = headers.map(h => ({ wch: Math.max(12, Math.min(40, h.length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });

  XLSX.writeFile(wb, getArchiveFilename());
}
