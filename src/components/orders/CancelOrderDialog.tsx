import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CancelledOrder } from '@/types/planning';

export const CANCEL_REASONS = [
  'Client désisté',
  'Problème technique',
  'Matière indisponible',
  'Autre',
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { cancelDate: string; reason: string; note: string }) => void;
  orderLabel: string;
  initial?: Partial<Pick<CancelledOrder, 'cancelDate' | 'reason' | 'note'>>;
  mode?: 'create' | 'edit';
}

const CancelOrderDialog: React.FC<Props> = ({ open, onClose, onConfirm, orderLabel, initial, mode = 'create' }) => {
  const today = new Date().toISOString().split('T')[0];
  const [cancelDate, setCancelDate] = useState(today);
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setCancelDate(initial?.cancelDate || today);
      setReason(initial?.reason || CANCEL_REASONS[0]);
      setNote(initial?.note || '');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {mode === 'edit' ? 'تعديل سبب الإلغاء' : 'إلغاء الطلبية'} — {orderLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">تاريخ الإلغاء</Label>
            <Input type="date" value={cancelDate} onChange={e => setCancelDate(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">سبب الإلغاء</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ملاحظة</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            variant={mode === 'edit' ? 'default' : 'destructive'}
            disabled={!cancelDate || !reason}
            onClick={() => onConfirm({ cancelDate, reason, note })}
          >
            {mode === 'edit' ? 'حفظ' : 'تأكيد الإلغاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CancelOrderDialog;
