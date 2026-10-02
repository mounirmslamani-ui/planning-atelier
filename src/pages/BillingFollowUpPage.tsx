import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ColumnHeader from '@/components/orders/ColumnHeader';
import DesignationCell from '@/components/DesignationCell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { usePlanning } from '@/context/PlanningContext';
import { useAuth } from '@/context/AuthContext';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { computeOrderBillingBreakdown, type OrderBillingBreakdown } from '@/lib/orderCosting';
import { getExportFilename } from '@/lib/excelExport';
import { cn, formatDateFR } from '@/lib/utils';
import type { DeliveredOrder, Order, OrderCategory, ProductionRecord, ProductionStep } from '@/types/planning';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';

const PAGE_TITLE = 'متابعة فوترة الطلبيات';
const BILLING_RIGHT = { tableau: PAGE_TITLE };

// Mêmes formats que le fichier modèle (montants comptables) ; dates en dd/mm/yyyy (règle du projet).
const MONEY_FMT = '_-* #,##0.00\\ _D_A_-;\\-* #,##0.00\\ _D_A_-;_-* "-"??\\ _D_A_-;_-@_-';
const DATE_FMT = 'dd/mm/yyyy';

type BillingCategory = Extract<OrderCategory, 'fabrication' | 'prestation'>;
const BILLING_CATEGORIES: BillingCategory[] = ['fabrication', 'prestation'];

type Row = {
  order: Order;
  clientName: string;
  deliveryDate: string;      // ISO — dernière livraison de la commande
  invoiceNumbers: string;    // n° de facture distincts, séparés par « - »
  category: BillingCategory;
  breakdown: OrderBillingBreakdown;
};

const fmtAmount = (n: number | undefined): string => {
  if (n == null || !Number.isFinite(n) || n === 0) return '';
  const [intPart, decPart] = n.toFixed(2).split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${decPart}`;
};

/** Numéro de série Excel d'une date ISO (yyyy-mm-dd), sans passer par un objet Date (évite tout décalage de fuseau). */
const isoToExcelSerial = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) + 25569;
};

const amountOrNull = (n: number | undefined): number | null =>
  n != null && Number.isFinite(n) && n !== 0 ? n : null;

const ProformaCell: React.FC<{
  orderId: string;
  value: string;
  canEdit: boolean;
  onSave: (orderId: string, value: string) => Promise<boolean>;
}> = ({ orderId, value, canEdit, onSave }) => {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => { setDraft(value); }, [value]);

  if (!canEdit) return <span>{value || '—'}</span>;

  const commit = async () => {
    const next = draft.trim();
    if (next === value) { setDraft(value); return; }
    const ok = await onSave(orderId, next);
    if (!ok) setDraft(value);
  };

  return (
    <Input
      className="h-8 w-28 text-xs"
      dir="ltr"
      value={draft}
      placeholder="—"
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
};

const BillingFollowUpPage: React.FC = () => {
  const {
    orders, clients, operators, operations, steps, productionRecords, deliveredOrders,
    absenceOrderId, updateOrderProforma,
  } = usePlanning();
  const { hasAccess } = useAuth();
  const level = hasAccess(BILLING_RIGHT);
  const canView = level !== 'denied';
  const canEdit = level === 'RW';

  const [activeCat, setActiveCat] = useState<BillingCategory>('fabrication');

  const rows = useMemo<Row[]>(() => {
    if (!canView) return [];
    const clientNameById = new Map(clients.map(c => [c.id, c.name]));

    const sessionsByOrder = new Map<string, DeliveredOrder[]>();
    for (const d of deliveredOrders) {
      const list = sessionsByOrder.get(d.orderId);
      if (list) list.push(d); else sessionsByOrder.set(d.orderId, [d]);
    }
    const stepsByOrder = new Map<string, ProductionStep[]>();
    for (const s of steps) {
      const list = stepsByOrder.get(s.orderId);
      if (list) list.push(s); else stepsByOrder.set(s.orderId, [s]);
    }
    const recordsByOrder = new Map<string, ProductionRecord[]>();
    for (const r of productionRecords) {
      const list = recordsByOrder.get(r.orderId);
      if (list) list.push(r); else recordsByOrder.set(r.orderId, [r]);
    }

    const result: Row[] = [];
    for (const order of orders) {
      if (order.id === absenceOrderId) continue;
      const category = inferCategoryFromOrderNumber(order.orderNumber);
      if (category !== 'fabrication' && category !== 'prestation') continue; // SLAMANI et Divers exclus de cette rubrique
      const sessions = sessionsByOrder.get(order.id);
      if (!sessions || sessions.length === 0) continue;

      const invoiceNumbers = [...new Set(
        sessions.map(d => (d.invoiceNumber || '').trim()).filter(Boolean),
      )].join(' - ');
      const deliveryDate = sessions.map(d => d.deliveryDate).filter(Boolean).sort().at(-1) || '';

      result.push({
        order,
        clientName: clientNameById.get(order.clientId) || '',
        deliveryDate,
        invoiceNumbers,
       category,
        breakdown: computeOrderBillingBreakdown(
          order,
          (stepsByOrder.get(order.id) || []).slice().sort((a, b) => a.order - b.order),
          recordsByOrder.get(order.id) || [],
          operations,
        ),
      });
    }
    return result.sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
  }, [canView, orders, clients, steps, productionRecords, deliveredOrders, operations, absenceOrderId]);

  const categoryRows = useMemo(() => rows.filter(r => r.category === activeCat), [rows, activeCat]);
  const catCount = (cat: BillingCategory) => rows.filter(r => r.category === cat).length;

  const accessors = useMemo(() => ({
    orderNumber: (r: Row) => r.order.orderNumber,
    orderDate: (r: Row) => r.order.orderDate,
    clientName: (r: Row) => r.clientName,
    designation: (r: Row) => r.order.designation,
    quantity: (r: Row) => r.order.quantity,
    clientRepresentative: (r: Row) => r.order.clientRepresentative || '',
    deliveryDate: (r: Row) => r.deliveryDate,
    proforma: (r: Row) => r.order.proformaNumber || '',
    invoiceNumbers: (r: Row) => r.invoiceNumbers,
  }), []);

  const { processed, sortKey, sortDir, filters, handleSort, handleFilter, allValuesByKey } =
    useTableSortFilter<Row>(categoryRows, accessors);

  // Colonnes opérateurs dynamiques : uniquement ceux qui ont un montant sur au moins une ligne affichée.
  const operatorColumns = useMemo(() => {
    const used = new Set<string>();
    processed.forEach(r => r.breakdown.manufacturingByOperator.forEach((amount, id) => {
      if (amount > 0) used.add(id);
    }));
    return operators.filter(o => used.has(o.id));
  }, [processed, operators]);

  const handleExportExcel = () => {
    const headersBefore = [
      'رقم الطلبية', 'تاريخ الطلبية', 'الزبون', 'تعيين', 'الكمية', 'ممثل الزبون', 'تاريخ التسليم',
      'فاتورة شكلية', 'فاتورة رقم', 'ثمن بيع الوحدة', 'ثمن البيع الإجمالي', 'كلفة الوحدة', 'الكلفة الاجمالية',
    ];
    const headersAfter = [
      'معالجة حرارية', 'مناولة', 'ثمن بيع المواد الأولية', 'كلفة المواد الأولية',
      'مصدر المواد الأولية', 'المواد الأولية المستعملة',
    ];
    const aoa: (string | number | null)[][] = [[
      ...headersBefore, ...operatorColumns.map(o => o.name), ...headersAfter,
    ]];

    for (const { order, clientName, deliveryDate, invoiceNumbers, breakdown: b } of processed) {
      aoa.push([
        order.orderNumber,
        isoToExcelSerial(order.orderDate),
        clientName,
        order.designation,
        order.quantity,
        order.clientRepresentative || null,
        isoToExcelSerial(deliveryDate),
        order.proformaNumber || null,
        invoiceNumbers || null,
        amountOrNull(b.unitSalePrice),
        amountOrNull(b.totalSalePrice),
        amountOrNull(b.unitCost),
        amountOrNull(b.totalCost),
        ...operatorColumns.map(o => amountOrNull(b.manufacturingByOperator.get(o.id))),
        amountOrNull(b.heatTreatmentSale),
        amountOrNull(b.otherSubcontractingSale),
        amountOrNull(b.materialsSaleTotal),
        amountOrNull(b.materialsCostTotal),
        b.suppliers.join(' + ') || null,
        b.materialLabels.join(' + ') || null,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const lastRow = aoa.length - 1;
    const firstMoneyCol = 9;                                   // ثمن بيع الوحدة
    const lastMoneyCol = headersBefore.length + operatorColumns.length + 3; // كلفة المواد الأولية
    for (let r = 1; r <= lastRow; r++) {
      for (const c of [1, 6]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.z = DATE_FMT;
      }
      for (let c = firstMoneyCol; c <= lastMoneyCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.z = MONEY_FMT;
      }
    }
    ws['!cols'] = [
      11, 12, 18, 30, 8, 14, 12, 12, 12, 16, 16, 14, 16,
      ...operatorColumns.map(() => 12),
      14, 10, 18, 16, 22, 28,
    ].map(wch => ({ wch }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, ORDER_CATEGORY_LABEL[activeCat]);
    XLSX.writeFile(wb, getExportFilename(`${PAGE_TITLE} - ${ORDER_CATEGORY_LABEL[activeCat]}`));
  };

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title={PAGE_TITLE} />
        <p className="text-sm text-muted-foreground pl-14">لا تتوفر لديك صلاحية الاطلاع على هذه الصفحة.</p>
      </div>
    );
  }

  const totalCols = 19 + operatorColumns.length;
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
  const plainHeader = (label: string, center = false) => (
    <TableHead className={cn('text-xs font-semibold whitespace-nowrap', center && 'text-center')}>{label}</TableHead>
  );
  const amountCell = (n: number | undefined, bold = false) => (
    <TableCell className={cn('text-xs whitespace-nowrap text-center', bold && 'font-medium')} dir="ltr">
      {fmtAmount(n)}
    </TableCell>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title={PAGE_TITLE} description={`${processed.length} طلبية`} />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm" disabled={processed.length === 0}>
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>
        </div>
      </div>

      <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as BillingCategory)} dir="rtl" className="flex-none mb-2 w-full">
        <TabsList className="justify-start">
          {BILLING_CATEGORIES.map(c => (
            <TabsTrigger key={c} value={c}>
              {ORDER_CATEGORY_LABEL[c]}
              <span className="mr-2 text-xs text-muted-foreground">({catCount(c)})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {header('رقم الطلبية', 'orderNumber')}
              {header('تاريخ الطلبية', 'orderDate')}
              {header('الزبون', 'clientName')}
              {header('تعيين', 'designation')}
              {header('الكمية', 'quantity')}
              {header('ممثل الزبون', 'clientRepresentative')}
              {header('تاريخ التسليم', 'deliveryDate')}
              {header('فاتورة شكلية', 'proforma')}
              {header('فاتورة رقم', 'invoiceNumbers')}
              {plainHeader('ثمن بيع الوحدة', true)}
              {plainHeader('ثمن البيع الإجمالي', true)}
              {plainHeader('كلفة الوحدة', true)}
              {plainHeader('الكلفة الاجمالية', true)}
              {operatorColumns.map(o => <React.Fragment key={o.id}>{plainHeader(o.name, true)}</React.Fragment>)}
              {plainHeader('معالجة حرارية', true)}
              {plainHeader('مناولة', true)}
              {plainHeader('ثمن بيع المواد الأولية', true)}
              {plainHeader('كلفة المواد الأولية', true)}
              {plainHeader('مصدر المواد الأولية')}
              {plainHeader('المواد الأولية المستعملة')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center text-muted-foreground py-8">
                  لا توجد طلبيات مسلمة.
                </TableCell>
              </TableRow>
            )}
            {processed.map(({ order, clientName, deliveryDate, invoiceNumbers, breakdown: b }) => (
              <TableRow key={order.id}>
                <TableCell className="font-heading text-sm whitespace-nowrap">
                  <OrderNumberLink orderId={order.id} orderNumber={order.orderNumber} />
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDateFR(order.orderDate)}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{clientName}</TableCell>
                <TableCell className="text-sm" style={{ minWidth: 200 }}>
                  <DesignationCell orderId={order.id} designation={order.designation} className="text-sm whitespace-normal break-words block" />
                </TableCell>
                <TableCell className="text-sm text-center">{order.quantity}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{order.clientRepresentative || '—'}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDateFR(deliveryDate)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  <ProformaCell orderId={order.id} value={order.proformaNumber || ''} canEdit={canEdit} onSave={updateOrderProforma} />
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap" dir="ltr">{invoiceNumbers || '—'}</TableCell>
                {amountCell(b.unitSalePrice)}
                {amountCell(b.totalSalePrice, true)}
                {amountCell(b.unitCost)}
                {amountCell(b.totalCost, true)}
                {operatorColumns.map(o => (
                  <React.Fragment key={o.id}>{amountCell(b.manufacturingByOperator.get(o.id))}</React.Fragment>
                ))}
                {amountCell(b.heatTreatmentSale)}
                {amountCell(b.otherSubcontractingSale)}
                {amountCell(b.materialsSaleTotal)}
                {amountCell(b.materialsCostTotal)}
                <TableCell className="text-xs">{b.suppliers.join(' + ') || ''}</TableCell>
                <TableCell className="text-xs">{b.materialLabels.join(' + ') || ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
};

export default BillingFollowUpPage;
