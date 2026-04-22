import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  open: boolean;
  label: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  defaultDate?: string;
}

const DatePromptDialog: React.FC<Props> = ({ open, label, onConfirm, onCancel, defaultDate }) => {
  const [date, setDate] = useState(defaultDate || '');

  React.useEffect(() => {
    if (open) setDate(defaultDate || '');
  }, [open, defaultDate]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading">{label}</DialogTitle>
        </DialogHeader>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
          <Button onClick={() => { if (date) onConfirm(date); }} disabled={!date}>Confirmer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DatePromptDialog;
