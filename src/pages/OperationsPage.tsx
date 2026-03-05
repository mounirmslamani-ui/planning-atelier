import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const OperationsPage: React.FC = () => {
  const { operations, addOperation, updateOperation, deleteOperation } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');

  const openNew = () => { setEditing(null); setName(''); setDialogOpen(true); };
  const openEdit = (op: { id: string; name: string }) => { setEditing(op); setName(op.name); setDialogOpen(true); };

  const handleSave = () => {
    if (editing) updateOperation({ id: editing.id, name });
    else addOperation({ id: `op-${Date.now()}`, name });
    setDialogOpen(false);
  };

  return (
    <div className="p-6">
      <PageHeader title="Opérations" description="Liste des opérations d'usinage" actions={
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      } />
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead className="w-24">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {operations.map(op => (
              <TableRow key={op.id}>
                <TableCell className="font-medium">{op.name}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(op)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteOperation(op.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} une opération</DialogTitle></DialogHeader>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l'opération" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!name}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OperationsPage;
