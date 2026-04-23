import React, { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import type { Subcontractor } from '@/types/planning';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';

const SubcontractorsPage: React.FC = () => {
  const { subcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor, operations } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [mainActivity, setMainActivity] = useState('');
  const [secondaryActivities, setSecondaryActivities] = useState<string[]>([]);
  const [newSecondary, setNewSecondary] = useState('');

  const openNew = () => {
    setEditing(null);
    setCompanyName('');
    setMainActivity(operations[0]?.name || '');
    setSecondaryActivities([]);
    setDialogOpen(true);
  };

  const openEdit = (s: Subcontractor) => {
    setEditing(s);
    setCompanyName(s.companyName);
    setMainActivity(s.mainActivity);
    setSecondaryActivities([...s.secondaryActivities]);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const data: Subcontractor = {
      id: editing?.id || crypto.randomUUID(),
      companyName,
      mainActivity,
      secondaryActivities,
    };
    if (editing) updateSubcontractor(data);
    else addSubcontractor(data);
    setDialogOpen(false);
  };

  const addSecondary = () => {
    if (newSecondary && !secondaryActivities.includes(newSecondary)) {
      setSecondaryActivities(prev => [...prev, newSecondary]);
      setNewSecondary('');
    }
  };

  const removeSecondary = (fn: string) => {
    setSecondaryActivities(prev => prev.filter(f => f !== fn));
  };

  const accessors = {
    companyName: (s: Subcontractor) => s.companyName,
    mainActivity: (s: Subcontractor) => s.mainActivity,
    secondaryActivities: (s: Subcontractor) => s.secondaryActivities.join(', '),
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(subcontractors, accessors);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="Sous-traitants"
          description={`${subcontractors.length} sous-traitant(s)`}
          actions={
            <Button onClick={openNew} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="Raison sociale" columnKey="companyName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.companyName || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Activité principale" columnKey="mainActivity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.mainActivity || ''} onFilter={handleFilter} /></TableHead>
              <TableHead><ColumnHeader label="Activités secondaires" columnKey="secondaryActivities" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.secondaryActivities || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.companyName}</TableCell>
                <TableCell>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                    {s.mainActivity}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.secondaryActivities.map(act => (
                      <span key={act} className="inline-block px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                        {act}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm('Êtes-vous sûr de vouloir supprimer ce sous-traitant ?', () => deleteSubcontractor(s.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {subcontractors.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Aucun sous-traitant. Cliquez sur "Ajouter" pour commencer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} un sous-traitant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Raison sociale</label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nom de l'entreprise" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Activité principale</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={mainActivity}
                onChange={e => setMainActivity(e.target.value)}
              >
                {operations.filter(o => o.category === 'subcontractor').map(o => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Activités secondaires</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {secondaryActivities.map(act => (
                  <span key={act} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {act}
                    <button onClick={() => removeSecondary(act)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={newSecondary}
                  onChange={e => setNewSecondary(e.target.value)}
                >
                  <option value="">Sélectionner...</option>
                  {operations.filter(o => o.category === 'subcontractor' && o.name !== mainActivity && !secondaryActivities.includes(o.name)).map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={addSecondary} disabled={!newSecondary}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!companyName || !mainActivity}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default SubcontractorsPage;
