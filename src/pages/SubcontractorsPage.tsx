import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const SubcontractorsPage: React.FC = () => {
  const { subcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; companyName: string } | null>(null);
  const [companyName, setCompanyName] = useState('');

  const openNew = () => { setEditing(null); setCompanyName(''); setDialogOpen(true); };
  const openEdit = (s: { id: string; companyName: string }) => { setEditing(s); setCompanyName(s.companyName); setDialogOpen(true); };

  const handleSave = () => {
    if (editing) updateSubcontractor({ id: editing.id, companyName });
    else addSubcontractor({ id: `sub-${Date.now()}`, companyName });
    setDialogOpen(false);
  };

  return (
    <div className="p-6">
      <PageHeader title="Sous-traitants" description="Liste des sous-traitants" actions={
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      } />
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Raison sociale</TableHead><TableHead className="w-24">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {subcontractors.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.companyName}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSubcontractor(s.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {subcontractors.length === 0 && (
              <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">Aucun sous-traitant.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} un sous-traitant</DialogTitle></DialogHeader>
          <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Raison sociale" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!companyName}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubcontractorsPage;
