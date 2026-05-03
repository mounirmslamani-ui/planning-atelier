import React, { useState, useMemo } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import type { CancelledOrder } from '@/types/planning';
import { formatDateFR } from '@/lib/utils';

const CancelledOrdersPage: React.FC = () => {
  const { cancelledOrders, updateCancelledOrder, deleteCancelledOrder } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [editing, setEditing] = useState<CancelledOrder | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const sorted = useMemo(() => {
    return [...cancelledOrders].sort((a, b) => (b.cancelDate || '').localeCompare(a.cancelDate || ''));
  }, [cancelledOrders]);

  const filtered = useMemo(() => sorted.filter(c => {
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
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader title="طلبيات ملغاة" subtitle={`عدد الطلبيات الملغاة: ${cancelledOrders.length}`} />

      <div className="border rounded-md overflow-x-auto">
        <Table>
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
                <TableCell className="font-mono font-semibold">{c.orderNumberSnapshot}</TableCell>
                <TableCell>{c.orderDateSnapshot ? formatDateFR(c.orderDateSnapshot) : '—'}</TableCell>
                <TableCell>{c.clientNameSnapshot || '—'}</TableCell>
                <TableCell className="max-w-[260px] truncate" title={c.designationSnapshot}>{c.designationSnapshot}</TableCell>
                <TableCell className="text-center">{c.quantitySnapshot}</TableCell>
                <TableCell>{formatDateFR(c.cancelDate)}</TableCell>
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
        </Table>
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
