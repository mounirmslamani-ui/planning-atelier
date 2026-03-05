import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const ClientsPage: React.FC = () => {
  const { clients, addClient, updateClient, deleteClient } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');

  const openNew = () => { setEditing(null); setName(''); setDialogOpen(true); };
  const openEdit = (c: { id: string; name: string }) => { setEditing(c); setName(c.name); setDialogOpen(true); };

  const handleSave = () => {
    if (editing) updateClient({ id: editing.id, name });
    else addClient({ id: `cl-${Date.now()}`, name });
    setDialogOpen(false);
  };

  return (
    <div className="p-6">
      <PageHeader title="Clients" description="Liste des clients" actions={
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      } />
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead className="w-24">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {clients.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteClient(c.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} un client</DialogTitle></DialogHeader>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du client" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!name}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsPage;
