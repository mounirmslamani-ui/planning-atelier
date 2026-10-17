import React, { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import ColumnHeader from '@/components/orders/ColumnHeader';
import DesignationCell from '@/components/DesignationCell';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { usePlanning } from '@/context/PlanningContext';
import { useAuth } from '@/context/AuthContext';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { getOrderGlobalStatus, getStepProgressStatus } from '@/lib/stepProgress';
import {
  getOrderRegistryStatus, inferCategoryFromOrderNumber, REGISTRY_STATUS_CLASS, type RegistryStatus,
} from '@/lib/orderRegistry';
import { cn, formatDateFR } from '@/lib/utils';
import type { Order, OrderCategory, ProductionRecord, ProductionStep } from '@/types/planning';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';

const PAGE_TITLE = 'تسعير';
// Même droit que l'onglet حساب التكلفة/ثمن البيع de la fiche de suivi (aucune migration nécessaire).
const PRICING_RIGHT = { tableau: '', formulaire: '', sous_formulaire: 'حساب التكلفة/ثمن البيع', champ_bouton: 'Tous' };

type PricingCategory = Extract<OrderCategory, 'fabrication' | 'prestation' | 'divers'>;
const PRICING_CATEGORIES: PricingCategory[] = ['fabrication', 'prestation', 'divers'];

type Row = {
  order: Order;
  clientName: string;
  status: RegistryStatus;
  details: string[];
};

type CategoryLists = { materials: Row[]; subcontracting: Row[]; salePrice: Row[] };

const SECTIONS: { key: keyof CategoryLists; title: string; detailLabel?: string }[] = [
  { key: 'materials', title: 'المادة الأولية متوفرة — ثمن الشراء أو الهامش غير مُدخل', detailLabel: 'المواد المعنية' },
  { key: 'subcontracting', title: 'المناولة منتهية — تكلفة المناولة أو الهامش غير مُدخل', detailLabel: 'المناولة المعنية' },
  { key: 'salePrice', title: 'جميع المراحل منتهية — ثمن البيع غير مُدخل' },
];

const missingLabels = (cost: number | undefined, margin: number | undefined, costLabel: string): string[] => {
  const missing: string[] = [];
  if (cost == null) missing.push(costLabel);
  if (margin == null) missing.push('الهامش');
  return missing;
};

const PricingTable: React.FC<{ title: string; detailLabel?: string; rows: Row[] }> = ({ title, detailLabel, rows }) => {
  const accessors = useMemo(() => ({
    orderNumber: (r: Row) => r.order.orderNumber,
    orderDate: (r: Row) => r.order.orderDate,
    clientName: (r: Row) => r.clientName,
    designation: (r: Row) => r.order.designation,
    quantity: (r: Row) => r.order.quantity,
    status: (r: Row) => r.status,
    details: (r: Row) => r.details.join(' + '),
  }), []);

  const { processed, sortKey, sortDir, filters, handleSort, handleFilter, allValuesByKey } =
    useTableSortFilter<Row>(rows, accessors);

  const header = (label: string, key: keyof typeof accessors) => (
    <TableHead className="text-xs font-semibold whitespace-nowrap">
      <ColumnHeader
        label={label}
        columnKey={key}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        filterValue={filters[key] || ''}
        onFilter={handleFilter}
        allValues={allValuesByKey[key]}
      />
    </TableHead>
  );

  const totalCols = detailLabel ? 7 : 6;

  return (
    <section className="rounded-lg border bg-card">
      <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold flex items-center justify-between">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{processed.length} طلبية</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {header('رقم الطلبية', 'orderNumber')}
              {header('تاريخ الطلبية', 'orderDate')}
              {header('الزبون', 'clientName')}
              {header('تعيين', 'designation')}
              {header('الكمية', 'quantity')}
              {header('الحالة', 'status')}
              {detailLabel && header(detailLabel, 'details')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center text-muted-foreground py-6">
                  لا توجد طلبيات ✓
                </TableCell>
              </TableRow>
            )}
            {processed.map(({ order, clientName, status, details }) => (
              <TableRow key={order.id}>
                <TableCell className="font-heading text-sm whitespace-nowrap">
                  <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} tab="costing" />
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDateFR(order.orderDate)}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{clientName}</TableCell>
                <TableCell className="text-sm" style={{ minWidth: 200 }}>
                  <DesignationCell orderId={order.id} designation={order.designation} className="text-sm whitespace-normal break-words block" />
                </TableCell>
                <TableCell className="text-sm text-center">{order.quantity}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={cn('rounded border px-2 py-0.5 text-xs', REGISTRY_STATUS_CLASS[status])}>{status}</span>
                </TableCell>
                {detailLabel && (
                  <TableCell className="text-xs">
                    {details.map((d, i) => <div key={i}>{d}</div>)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </section>
  );
};

const PricingPage: React.FC = () => {
  const {
    orders, clients, operations, subcontractors, steps, productionRecords,
    qcEntries, deliveryEntries, deliveredOrders, cancelledOrders,
    absenceOrderId, absenceOperationId,
  } = usePlanning();
  const { hasAccess } = useAuth();
  const canView = hasAccess(PRICING_RIGHT) !== 'denied';

  const [activeCat, setActiveCat] = useState<PricingCategory>('fabrication');

  const lists = useMemo(() => {
    const result: Record<PricingCategory, CategoryLists> = {
      fabrication: { materials: [], subcontracting: [], salePrice: [] },
      prestation: { materials: [], subcontracting: [], salePrice: [] },
      divers: { materials: [], subcontracting: [], salePrice: [] },
    };
    if (!canView) return result;

    const clientNameById = new Map(clients.map(c => [c.id, c.name]));
    const operationNameById = new Map(operations.map(o => [o.id, o.name]));
    const subcontractorNameById = new Map(subcontractors.map(s => [s.id, s.companyName]));

    const stepsByOrder = new Map<string, ProductionStep[]>();
    for (const s of steps) {
      if (s.operationId === absenceOperationId) continue;
      const list = stepsByOrder.get(s.orderId);
      if (list) list.push(s); else stepsByOrder.set(s.orderId, [s]);
    }
    const recordsByOrder = new Map<string, ProductionRecord[]>();
    for (const r of productionRecords) {
      const list = recordsByOrder.get(r.orderId);
      if (list) list.push(r); else recordsByOrder.set(r.orderId, [r]);
    }
    const cancelledOrderIds = new Set(cancelledOrders.map(c => c.orderId));

    const sortedOrders = [...orders].sort((a, b) =>
      (b.orderDate || '').localeCompare(a.orderDate || '')
      || b.orderNumber.localeCompare(a.orderNumber));

    for (const order of sortedOrders) {
      if (order.id === absenceOrderId || cancelledOrderIds.has(order.id)) continue;
      const category = inferCategoryFromOrderNumber(order.orderNumber);
      if (category === 'slamani') continue;

      const orderSteps = (stepsByOrder.get(order.id) ?? []).slice().sort((a, b) => a.order - b.order);
      const orderRecords = recordsByOrder.get(order.id) ?? [];

      const base = {
        order,
        clientName: clientNameById.get(order.clientId) || '',
        status: getOrderRegistryStatus(order, orderSteps, orderRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId),
      };

      const materialDetails: string[] = [];
      const subcontractingDetails: string[] = [];

      for (const step of orderSteps) {
        if (step.nonBillable) continue; // même règle que l'onglet حساب التكلفة/ثمن البيع

        for (const item of step.rawMaterialItems || []) {
          if (!item.label || !item.label.trim()) continue;
          if (item.status !== 'disponible') continue;
          const missing = missingLabels(item.costPrice, item.margin, 'ثمن الشراء');
          if (missing.length > 0) materialDetails.push(`${item.label.trim()} (${missing.join(' + ')})`);
        }

        if (step.subcontractorId && getStepProgressStatus(step, orderRecords) === 'Terminée') {
          const missing = missingLabels(step.subcontractingCost, step.subcontractingMargin, 'تكلفة المناولة');
          if (missing.length > 0) {
            const opName = operationNameById.get(step.operationId) || '—';
            const subName = subcontractorNameById.get(step.subcontractorId) || '—';
            subcontractingDetails.push(`${opName} — ${subName} (${missing.join(' + ')})`);
          }
        }
      }

      if (materialDetails.length > 0) result[category].materials.push({ ...base, details: materialDetails });
      if (subcontractingDetails.length > 0) result[category].subcontracting.push({ ...base, details: subcontractingDetails });

      if (
        orderSteps.length > 0
        && order.salePricePerUnit == null
        && getOrderGlobalStatus(order.id, orderSteps, orderRecords, absenceOrderId) === 'Terminée'
      ) {
        result[category].salePrice.push({ ...base, details: [] });
      }
    }
    return result;
  }, [
    canView, orders, clients, operations, subcontractors, steps, productionRecords,
    qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, absenceOrderId, absenceOperationId,
  ]);

  const catCount = (cat: PricingCategory) => {
    const ids = new Set<string>();
    SECTIONS.forEach(s => lists[cat][s.key].forEach(r => ids.add(r.order.id)));
    return ids.size;
  };

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title={PAGE_TITLE} />
        <p className="text-sm text-muted-foreground pl-14">لا تتوفر لديك صلاحية الاطلاع على هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title={PAGE_TITLE} description="طلبيات في انتظار تحديد الأسعار" />
      </div>

      <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as PricingCategory)} dir="rtl" className="flex-none mb-2 w-full">
        <TabsList className="justify-start">
          {PRICING_CATEGORIES.map(c => (
            <TabsTrigger key={c} value={c}>
              {ORDER_CATEGORY_LABEL[c]}
              <span className="mr-2 text-xs text-muted-foreground">({catCount(c)})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-auto space-y-4 pb-2">
        {SECTIONS.map(s => (
          <PricingTable
            key={`${activeCat}-${s.key}`}
            title={s.title}
            detailLabel={s.detailLabel}
            rows={lists[activeCat][s.key]}
          />
        ))}
      </div>
    </div>
  );
};

export default PricingPage;
