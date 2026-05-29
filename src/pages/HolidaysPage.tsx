import React, { useState, useMemo } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const HolidaysPage: React.FC = () => {
  const { holidays, addHoliday, updateHoliday, deleteHoliday } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  // Filter out past holidays
  const visibleHolidays = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return holidays
      .filter(h => h.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays]);

  const openNew = () => {
    setEditingId(null);
    setDate('');
    setName('');
    setDialogOpen(true);
  };

  const openEdit = (h: { id: string; date: string; name: string }) => {
    setEditingId(h.id);
    setDate(h.date);
    setName(h.name);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!date || !name) return;
    if (editingId) {
      updateHoliday({ id: editingId, date, name });
    } else {
      addHoliday({ id: crypto.randomUUID(), date, name });
    }
    setDialogOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="العطل الرسمية"
          description="Les jours fériés sont écartés du planning"
          actions={
            <Button onClick={openNew} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>العطلة</TableHead>
              <TableHead className="w-24">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleHolidays.map(h => (
              <TableRow key={h.id}>
                <TableCell className="font-heading text-sm">{formatDateFR(h.date)}</TableCell>
                <TableCell className="text-sm">{h.name}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(h)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm('Êtes-vous sûr de vouloir supprimer ce jour férié ?', () => deleteHoliday(h.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {visibleHolidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  Aucun jour férié à venir.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingId ? 'Modifier' : 'Ajouter'} un jour férié</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">العطلة</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du jour férié" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!date || !name}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default HolidaysPage;
