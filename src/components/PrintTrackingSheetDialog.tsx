import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import type { Order } from '@/types/planning';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  getClientName: (id: string) => string;
  onConfirm: (order: Order) => void;
}

const PrintTrackingSheetDialog: React.FC<Props> = ({ open, onOpenChange, orders, getClientName, onConfirm }) => {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders.slice(0, 50);
    return orders
      .filter(o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.designation.toLowerCase().includes(q) ||
        getClientName(o.clientId).toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [orders, query, getClientName]);

  const selected = orders.find(o => o.id === selectedId) || null;

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected);
    onOpenChange(false);
    setQuery('');
    setSelectedId(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setQuery(''); setSelectedId(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">طباعة بطاقة متابعة انجاز طلبية</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedId(null); }}
              placeholder="ابحث برقم الطلبية..."
              className="pr-9 text-right"
            />
          </div>

          <div className="max-h-72 overflow-auto rounded-md border bg-card">
            {filtered.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">لا توجد نتائج</div>
            )}
            {filtered.map(o => {
              const isSel = o.id === selectedId;
              return (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  onDoubleClick={() => { setSelectedId(o.id); setTimeout(handleConfirm, 0); }}
                  className={`w-full text-right px-3 py-2 text-sm border-b last:border-b-0 transition-colors ${
                    isSel ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground truncate">{o.designation}</span>
                    <span className="font-medium">{o.orderNumber}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{getClientName(o.clientId)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>الغاء</Button>
          <Button onClick={handleConfirm} disabled={!selected}>إنشاء بطاقة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintTrackingSheetDialog;
