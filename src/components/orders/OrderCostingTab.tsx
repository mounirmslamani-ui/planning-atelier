import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/ui/searchable-select';
import MoneyInput from '@/components/ui/money-input';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { useAuth } from '@/context/AuthContext';
import { useSubFormLock } from '@/components/orders/SubFormLock';
import { cn, formatDAPrefix, formatHoursHHMM } from '@/lib/utils';
import { getStepProgressStatus } from '@/lib/stepProgress';
import {
  computeOrderCosting, getStepBillableHours, getDefaultHourlyRate, HOURLY_RATE_STEP, MARGIN_OPTIONS,
} from '@/lib/orderCosting';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import type { Order, ProductionStep, ResourceItem } from '@/types/planning';

interface Props {
  order: Order;
  open: boolean;
}

const marginOptions = MARGIN_OPTIONS.map(m => ({ value: String(m), label: `${m} %` }));

// Mise en forme conditionnelle — section المناولة (حساب التكلفة/ثمن البيع)
const SUB_RED = 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200';
const SUB_GREEN = 'bg-green-100 text-green-900 dark:bg-green-950/40 dark:text-green-200';

const OrderCostingTab: React.FC<Props> = ({ order, open }) => {
  const { steps, productionRecords, operations, subcontractors, operators, updateStep, updateOrder } = usePlanning();
  const { hasAccess } = useAuth();
  const canEdit = hasAccess({ tableau: '', formulaire: '', sous_formulaire: 'حساب التكلفة/ثمن البيع', champ_bouton: 'Tous' }) === 'RW';
  const lock = useSubFormLock(canEdit, open);

  const orderSteps = React.useMemo(
    () => steps.filter(s => s.orderId === order.id).sort((a, b) => a.order - b.order),
    [steps, order.id],
  );
  const orderRecords = React.useMemo(
    () => productionRecords.filter(r => r.orderId === order.id),
    [productionRecords, order.id],
  );

  // Brouillon local — validé en une seule fois
  const [draftSteps, setDraftSteps] = React.useState<ProductionStep[]>(orderSteps);
  const [draftSalePrice, setDraftSalePrice] = React.useState<number | undefined>(order.salePricePerUnit);

  React.useEffect(() => {
    const category = inferCategoryFromOrderNumber(order.orderNumber);
    setDraftSteps(orderSteps.map(s => {
      // On ne touche jamais à un taux déjà renseigné (manuellement ou précédemment) — uniquement le pré-remplissage initial.
      if (s.subcontractorId || s.hourlyRate != null) return s;
      const operation = operations.find(o => o.id === s.operationId);
      const defaultRate = getDefaultHourlyRate(category, operation);
      return defaultRate != null ? { ...s, hourlyRate: defaultRate } : s;
    }));
    setDraftSalePrice(order.salePricePerUnit);
  }, [orderSteps, order.salePricePerUnit, order.orderNumber, open, operations]);

  const opName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const resourceName = (s: ProductionStep) =>
    s.subcontractorId
      ? (subcontractors.find(x => x.id === s.subcontractorId)?.companyName || '—')
      : (operators.find(x => x.id === s.operatorId)?.name || '—');

  const patchStep = (stepId: string, patch: Partial<ProductionStep>) =>
    setDraftSteps(prev => prev.map(s => (s.id === stepId ? { ...s, ...patch } : s)));

  const patchItem = (stepId: string, itemId: string, patch: Partial<ResourceItem>) =>
    setDraftSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, rawMaterialItems: (s.rawMaterialItems || []).map(it => it.id === itemId ? { ...it, ...patch } : it) }
      : s));

  const breakdown = React.useMemo(
    () => computeOrderCosting({ ...order, salePricePerUnit: draftSalePrice }, draftSteps, orderRecords, operations),
    [order, draftSalePrice, draftSteps, orderRecords, operations],
  );
    // Mise en forme conditionnelle des lignes المناولة : rouge tant que l'étape
  // n'est pas منتهية ; une fois منتهية, chaque case passe au vert dès qu'elle
  // est renseignée (ثمن البيع ne devient verte que si تكلفة المناولة ET هامش
  // الربح sont tous deux renseignés).
  const subcontractedRows = React.useMemo(() => draftSteps
    .filter(s => s.subcontractorId)
    .map(step => {
      const isDone = getStepProgressStatus(step, orderRecords) === 'Terminée';
      const costFilled = step.subcontractingCost != null;
      const marginFilled = step.subcontractingMargin != null;
      const saleOk = isDone && costFilled && marginFilled;
      return {
        step,
        costClass: isDone && costFilled ? SUB_GREEN : SUB_RED,
        marginClass: isDone && marginFilled ? SUB_GREEN : SUB_RED,
        saleClass: saleOk ? SUB_GREEN : SUB_RED,
        saleOk,
      };
    }), [draftSteps, orderRecords]);

    // Mise en forme conditionnelle des lignes المواد الأولية : si la matière est
  // "disponible" (تحضير الطلبية والموارد), chaque case (المورد / ثمن الشراء /
  // الهامش) passe au vert dès qu'elle est renseignée, rouge sinon ; ثمن البيع
  // ne devient verte que si les trois sont renseignées. Si la matière n'est
  // pas "disponible" (non-disponible ou partiel), les quatre cases restent rouges.
  const materialRows = React.useMemo(() => draftSteps.flatMap(step =>
    (step.rawMaterialItems || [])
      .filter(it => it.label && it.label.trim())
      .map(it => {
        const isAvailable = it.status === 'disponible';
        const supplierFilled = !!(it.supplier && it.supplier.trim());
        const costFilled = it.costPrice != null;
        const marginFilled = it.margin != null;
        const allFilled = supplierFilled && costFilled && marginFilled;
        const sale = (it.costPrice ?? 0) * (1 + ((it.margin ?? 0) / 100));
        return {
          step,
          item: it,
          sale,
          supplierClass: isAvailable && supplierFilled ? SUB_GREEN : SUB_RED,
          costClass: isAvailable && costFilled ? SUB_GREEN : SUB_RED,
          marginClass: isAvailable && marginFilled ? SUB_GREEN : SUB_RED,
          saleClass: isAvailable && allFilled ? SUB_GREEN : SUB_RED,
        };
      })), [draftSteps]);
  
  const subcontractingTotalClass = subcontractedRows.length === 0
    ? ''
    : subcontractedRows.every(r => r.saleOk)
      ? `${SUB_GREEN} px-2 py-0.5 rounded`
      : `${SUB_RED} px-2 py-0.5 rounded`;

  const handleSave = () => {
    draftSteps.forEach(s => {
      const original = orderSteps.find(o => o.id === s.id);
      if (JSON.stringify(original) !== JSON.stringify(s)) updateStep(s);
    });
    if (draftSalePrice !== order.salePricePerUnit) {
      updateOrder({ ...order, salePricePerUnit: draftSalePrice });
    }
    lock.lock();
    toast.success('تم تسجيل حساب التكلفة');
  };

  const handleCancel = () => {
    setDraftSteps(orderSteps);
    setDraftSalePrice(order.salePricePerUnit);
    lock.lock();
  };

  return (
    <div className="space-y-5">
      <fieldset disabled={lock.locked} className="border-0 p-0 m-0 space-y-5">

        {/* MATIÈRES PREMIÈRES */}
        <section className="rounded-lg border bg-card">
          <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold">المواد الأولية</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20 text-muted-foreground">
                  <th className="p-2 text-start">المرحلة</th>
                  <th className="p-2 text-start">المادة</th>
                  <th className="p-2 text-start">المورّد</th>
                  <th className="p-2 text-start">ثمن الشراء</th>
                  <th className="p-2 text-start">الهامش</th>
                  <th className="p-2 text-start">ثمن البيع</th>
                </tr>
              </thead>
              <tbody>
                {materialRows.map(({ step, item: it, sale, supplierClass, costClass, marginClass, saleClass }) => (
                  <tr key={`${step.id}-${it.id}`} className="border-b last:border-0">
                    <td className="p-2">{opName(step.operationId)}</td>
                    <td className="p-2">{it.label}</td>
                    <td className="p-2 min-w-40">
                      <Input
                        className={cn('h-8 text-xs', supplierClass)}
                        value={it.supplier || ''}
                        placeholder="—"
                        onChange={e => patchItem(step.id, it.id, { supplier: e.target.value })}
                      />
                    </td>
                    <td className="p-2 min-w-36">
                      <MoneyInput value={it.costPrice} onValueChange={v => patchItem(step.id, it.id, { costPrice: v })} currencyPosition="start" currencyLabel="دج" className={costClass} />
                    </td>
                    <td className="p-2 min-w-28">
                      <SearchableSelect
                        value={it.margin != null ? String(it.margin) : ''}
                        onValueChange={v => patchItem(step.id, it.id, { margin: v ? (Number(v) as 30 | 50) : undefined })}
                        options={marginOptions}
                        placeholder="—"
                        className={cn('h-8 text-xs', marginClass)}
                      />
                    </td>
                    <td className={`p-2 whitespace-nowrap font-medium ${saleClass}`} dir="ltr">{formatDAPrefix(sale)}</td>
                  </tr>
                ))}
                {materialRows.length === 0 && (
                  <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">لا توجد مواد أولية مسجّلة.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t text-xs flex justify-between">
            <span className="text-muted-foreground">مجموع ثمن بيع المواد الأولية</span>
            <span className="font-semibold" dir="ltr">{formatDAPrefix(breakdown.materialsSaleTotal)}</span>
          </div>
        </section>

        {/* SOUS-TRAITANCE */}
        <section className="rounded-lg border bg-card">
          <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold">المناولة</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20 text-muted-foreground">
                  <th className="p-2 text-start">المرحلة</th>
                  <th className="p-2 text-start">المناول</th>
                  <th className="p-2 text-start">تكلفة المناولة</th>
                  <th className="p-2 text-start">الهامش</th>
                  <th className="p-2 text-start">ثمن البيع</th>
                </tr>
              </thead>
              <tbody>
                {subcontractedRows.map(({ step, costClass, marginClass, saleClass }) => {
                  const sale = (step.subcontractingCost ?? 0) * (1 + ((step.subcontractingMargin ?? 0) / 100));
                  return (
                    <tr key={step.id} className="border-b last:border-0">
                      <td className="p-2">{opName(step.operationId)}</td>
                      <td className="p-2">{resourceName(step)}</td>
                      <td className="p-2 min-w-36">
                        <MoneyInput value={step.subcontractingCost} onValueChange={v => patchStep(step.id, { subcontractingCost: v })} currencyPosition="start" currencyLabel="دج" className={costClass} />
                      </td>
                      <td className="p-2 min-w-28">
                        <SearchableSelect
                          value={step.subcontractingMargin != null ? String(step.subcontractingMargin) : ''}
                          onValueChange={v => patchStep(step.id, { subcontractingMargin: v ? (Number(v) as 30 | 50) : undefined })}
                          options={marginOptions}
                          placeholder="—"
                          className={cn('h-8 text-xs', marginClass)}
                        />
                      </td>
                      <td className={`p-2 whitespace-nowrap font-medium ${saleClass}`} dir="ltr">{formatDAPrefix(sale)}</td>
                    </tr>
                  );
                })}
                {subcontractedRows.length === 0 && (
                  <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">لا توجد مراحل مناولة.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t text-xs flex justify-between">
            <span className="text-muted-foreground">مجموع ثمن بيع المناولة</span>
            <span className={cn('font-semibold', subcontractingTotalClass)} dir="ltr">{formatDAPrefix(breakdown.subcontractingSaleTotal)}</span>
          </div>
        </section>

        {/* FABRICATION INTERNE */}
        <section className="rounded-lg border bg-card">
          <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold">التصنيع الداخلي</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20 text-muted-foreground">
                  <th className="p-2 text-start">المرحلة</th>
                  <th className="p-2 text-start">العامل</th>
                  <th className="p-2 text-start">المدة المفوترة</th>
                  <th className="p-2 text-start">التكلفة الساعية</th>
                  <th className="p-2 text-start">ثمن البيع</th>
                </tr>
              </thead>
              <tbody>
                {manufacturingRows.map(({ step, hours, sale, saleClass }) => (
                    <tr key={step.id} className="border-b last:border-0">
                      <td className="p-2">{opName(step.operationId)}</td>
                      <td className="p-2">{resourceName(step)}</td>
                      <td className="p-2 whitespace-nowrap">{formatHoursHHMM(hours)}</td>
                      <td className="p-2 min-w-40">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => patchStep(step.id, { hourlyRate: Math.max(0, (step.hourlyRate ?? 0) - HOURLY_RATE_STEP) })}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="min-w-20 text-center whitespace-nowrap" dir="ltr">
                            {step.hourlyRate != null ? formatDAPrefix(step.hourlyRate) : '—'}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => patchStep(step.id, { hourlyRate: (step.hourlyRate ?? 0) + HOURLY_RATE_STEP })}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className={`p-2 whitespace-nowrap font-medium ${saleClass}`} dir="ltr">{formatDAPrefix(sale)}</td>
                    </tr>
                ))}
                {manufacturingRows.length === 0 && (
                  <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">لا توجد مراحل تصنيع داخلي.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t text-xs flex justify-between">
            <span className="text-muted-foreground">مجموع ثمن بيع التصنيع</span>
            <span className={cn('font-semibold', manufacturingTotalClass)} dir="ltr">{formatDAPrefix(breakdown.manufacturingSaleTotal)}</span>
          </div>
        </section>

        {/* SYNTHÈSE */}
        <section className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">التكلفة الإجمالية للطلبية</span><span className="font-semibold" dir="ltr">{formatDAPrefix(breakdown.totalCost)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">تكلفة الوحدة ({order.quantity})</span><span className="font-semibold" dir="ltr">{formatDAPrefix(breakdown.unitCost)}</span></div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <Label className="text-muted-foreground font-normal">ثمن بيع الوحدة</Label>
            <div className="w-48"><MoneyInput value={draftSalePrice} onValueChange={setDraftSalePrice} currencyPosition="start" currencyLabel="دج" /></div>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">ثمن البيع الإجمالي</span>
            <span className="font-bold text-base" dir="ltr">{breakdown.totalSalePrice != null ? formatDAPrefix(breakdown.totalSalePrice) : '—'}</span>
          </div>
        </section>
      </fieldset>

      <div className="flex justify-end gap-2 pt-1">
        <lock.EditButton />
        {!lock.locked && (
          <>
            <Button variant="outline" onClick={handleCancel}>إلغاء</Button>
            <Button onClick={handleSave}>تأكيد</Button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderCostingTab;
