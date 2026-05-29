import React, { useState, useMemo } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import type { CancelledOrder, OrderCategory } from '@/types/planning';
import { ORDER_CATEGORY_LABEL } from '@/types/planning';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inferCategoryFromOrderNumber } from '@/lib/orderRegistry';
import { formatDateFR } from '@/lib/utils';
import DesignationCell from '@/components/DesignationCell';
import { OrderNumberLink } from '@/context/OrderSheetContext';

const CancelledOrdersPage: React.FC = () => {
  const { cancelledOrders, updateCancelledOrder, deleteCancelledOrder } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [editing, setEditing] = useState<CancelledOrder | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');

  const sorted = useMemo(() => {
    return [...cancelledOrders].sort((a, b) => (b.cancelDate || '').localeCompare(a.cancelDate || ''));
  }, [cancelledOrders]);

  const byCat = useMemo(
    () => sorted.filter(c => inferCategoryFromOrderNumber(c.orderNumberSnapshot) === activeCat),
    [sorted, activeCat]
  );
  const catCount = (cat: OrderCategory) =>
    cancelledOrders.filter(c => inferCategoryFromOrderNumber(c.orderNumberSnapshot) === cat).length;

  const filtered = useMemo(() => byCat.filter(c => {
    return Object.entries(filters).every(([k, v]) => {
      if (!v) return true;
      const val = v.toLowerCase();
      switch (k) {
        case 'orderNumber': return c.orderNumberSnapshot.toLowerCase().includes(val);
        case 'orderDate': return (c.orderDateSnapshot || '').includes(val);
        case 'client': return (c.clientNameSnapshot || '').toLowerCase().includes(val);
        case 'designation': return c.designationSnapshot.toLowerCase().includes(val);
        case 'cancelDate': return (c.cancelDate || '').includes(val);
        case 'reason': return c.reason.toLowerCase().includes(val);
        case 'note': return (c.note || '').toLowerCase().includes(val);
        default: return true;
      }
    });
  }), [sorted, filters]);

  const setF = (k: string, v: string) => setFilters(p => ({ ...p, [k]: v }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="طلبيات ملغاة" />
        <p className="text-sm text-muted-foreground">عدد الطلبيات الملغاة: {cancelledOrders.length}</p>

        <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as OrderCategory)} className="w-full">
          <div className="flex w-full justify-end mt-2">
            <TabsList className="justify-end">
              {(['fabrication','prestation','divers','slamani'] as OrderCategory[]).map(c => (
                <TabsTrigger key={c} value={c}>
                  {ORDER_CATEGORY_LABEL[c]}
                  <span className="ml-2 text-xs text-muted-foreground">({catCount(c)})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-right">رقم الطلبية</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الزبون</TableHead>
              <TableHead className="text-right">تعيين</TableHead>
              <TableHead className="text-center">الكمية</TableHead>
              <TableHead className="text-right">تاريخ الإلغاء</TableHead>
              <TableHead className="text-right">سبب الإلغاء</TableHead>
              <TableHead className="text-right">ملاحظة</TableHead>
              <TableHead className="text-center w-24">إجراءات</TableHead>
            </TableRow>
            <TableRow className="bg-muted/20">
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.orderNumber || ''} onChange={e => setF('orderNumber', e.target.value)} /></TableHead>
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.orderDate || ''} onChange={e => setF('orderDate', e.target.value)} /></TableHead>
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.client || ''} onChange={e => setF('client', e.target.value)} /></TableHead>
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.designation || ''} onChange={e => setF('designation', e.target.value)} /></TableHead>
              <TableHead />
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.cancelDate || ''} onChange={e => setF('cancelDate', e.target.value)} /></TableHead>
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.reason || ''} onChange={e => setF('reason', e.target.value)} /></TableHead>
              <TableHead><Input className="h-7 text-xs" placeholder="بحث" value={filters.note || ''} onChange={e => setF('note', e.target.value)} /></TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">لا توجد طلبيات ملغاة</TableCell></TableRow>
            )}
            {filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-semibold"><OrderNumberLink orderId={c.orderId} orderNumber={c.orderNumberSnapshot} /></TableCell>
                <TableCell className="text-xs">{c.orderDateSnapshot ? formatDateFR(c.orderDateSnapshot) : '—'}</TableCell>
                <TableCell>{c.clientNameSnapshot || '—'}</TableCell>
              <TableCell style={{ minWidth: 200 }}><DesignationCell orderId={c.orderId} designation={c.designationSnapshot} className="text-sm whitespace-normal break-words block" /></TableCell>
                <TableCell className="text-center">{c.quantitySnapshot}</TableCell>
              <TableCell className="text-xs">{formatDateFR(c.cancelDate)}</TableCell>
                <TableCell><span className="inline-block rounded-full border border-orange-400/40 bg-orange-50 dark:bg-orange-900/20 text-orange-600 px-2 py-0.5 text-xs">{c.reason}</span></TableCell>
                <TableCell className="max-w-[260px] truncate" title={c.note || ''}>{c.note || '—'}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)} title="تعديل">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="حذف نهائي"
                      onClick={() => confirm(`حذف نهائي للسجل ${c.orderNumberSnapshot}؟`, () => deleteCancelledOrder(c.id), { variant: 'destructive' })}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>


      {editing && (
        <CancelOrderDialog
          open={!!editing}
          mode="edit"
          orderLabel={editing.orderNumberSnapshot}
          initial={{ cancelDate: editing.cancelDate, reason: editing.reason, note: editing.note }}
          onClose={() => setEditing(null)}
          onConfirm={(data) => {
            updateCancelledOrder({
              ...editing,
              cancelDate: data.cancelDate,
              reason: data.reason,
              note: data.note || undefined,
            });
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default CancelledOrdersPage;
