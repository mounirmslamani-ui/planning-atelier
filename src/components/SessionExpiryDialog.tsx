import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onExtend: () => void;
  onLogout: () => void;
}

const SessionExpiryDialog: React.FC<Props> = ({ open, onExtend, onLogout }) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onExtend(); }}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>الجلسة على وشك الانتهاء</DialogTitle>
          <DialogDescription>
            ستنتهي جلستك تلقائياً خلال دقيقتين بسبب عدم النشاط. هل تريد متابعة العمل؟
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onLogout}>تسجيل الخروج</Button>
          <Button onClick={onExtend}>متابعة الجلسة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionExpiryDialog;
