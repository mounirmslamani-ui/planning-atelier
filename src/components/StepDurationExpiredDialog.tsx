import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onFinishStep: () => void;
  onGrantExtraTime: (extraMinutes: number) => void;
}

// Strict hh:mm validator (2 digits hours, 2 digits minutes, minutes <= 59)
function parseDurationHHMM(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (m > 59) return null;
  return h * 60 + m;
}

const StepDurationExpiredDialog: React.FC<Props> = ({ open, onFinishStep, onGrantExtraTime }) => {
  const [view, setView] = useState<'choice' | 'extra'>('choice');
  const [extraValue, setExtraValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setView('choice');
      setExtraValue('');
      setError(null);
    }
  }, [open]);

  const parsed = parseDurationHHMM(extraValue);
  const canConfirmExtra = parsed !== null && parsed > 0;

  const handleConfirmExtra = () => {
    const mins = parseDurationHHMM(extraValue);
    if (mins === null || mins <= 0) {
      setError('صيغة غير صحيحة (hh:mm، الدقائق ≤ 59)');
      return;
    }
    onGrantExtraTime(mins);
  };

  return (
    <AlertDialog open={open} onOpenChange={() => { /* blocking: cannot close via escape / outside */ }}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>انتهت المدة المخصصة لهذه المرحلة</AlertDialogTitle>
        </AlertDialogHeader>

        {view === 'choice' ? (
          <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setView('extra')}>
              منح وقت إضافي
            </Button>
            <AlertDialogAction onClick={onFinishStep}>
              إنهاء المرحلة
            </AlertDialogAction>
          </AlertDialogFooter>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">المدة الإضافية (hh:mm)</Label>
              <Input
                value={extraValue}
                onChange={e => { setExtraValue(e.target.value); setError(null); }}
                placeholder="hh:mm"
                className="w-32 text-center font-mono"
                autoFocus
              />
              {error && <p className="text-destructive text-xs mt-1">{error}</p>}
            </div>
            <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => { setView('choice'); setError(null); }}>
                رجوع
              </Button>
              <AlertDialogAction disabled={!canConfirmExtra} onClick={handleConfirmExtra}>
                تأكيد
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default StepDurationExpiredDialog;
