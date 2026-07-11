import React, { useRef } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDiscard: () => void;
}

const UnsavedChangesDialog: React.FC<Props> = ({ open, onConfirm, onCancel, onDiscard }) => {
  const handledRef = useRef(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={o => {
        if (o) return;
        if (handledRef.current) { handledRef.current = false; return; }
        onCancel();
      }}
    >
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>هل تأكد التعديلات التي قمت بها ؟</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-start gap-2">
          <Button variant="outline" onClick={() => { handledRef.current = true; onCancel(); }}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={() => { handledRef.current = true; onDiscard(); }}>
            تجاهل
          </Button>
          <Button onClick={() => { handledRef.current = true; onConfirm(); }}>
            تأكيد
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UnsavedChangesDialog;
