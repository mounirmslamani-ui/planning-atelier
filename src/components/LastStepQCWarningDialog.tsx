import React from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onConfirm: () => void;
  onAddStage: () => void;
}

const LastStepQCWarningDialog: React.FC<Props> = ({ open, onConfirm, onAddStage }) => {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onConfirm(); }}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>تنبيه</AlertDialogTitle>
          <AlertDialogDescription>
            كانت هذه آخر مرحلة لإنجاز هذه الطلبية وسوف توجه هذه الطلبية لمراقبة الجودة
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onAddStage}>إضافة مرحلة إضافية</Button>
          <Button onClick={onConfirm}>تأكيد</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LastStepQCWarningDialog;
