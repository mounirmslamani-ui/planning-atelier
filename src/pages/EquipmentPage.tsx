import React, { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Equipment, EquipmentType, EquipmentState } from '@/types/planning';

const EQUIPMENT_TYPES: EquipmentType[] = [
  'Fraiseuse conventionnelle', 'Tour conventionnel', 'Tour CNC',
  'Rectifieuse plane', 'Rectifieuse cylindrique', 'Étau limeur',
  'Perceuse à colonne', 'Four', 'Touret', 'Scie mécanique',
  'Scie circulaire', 'Autres (Visseuse, meuleuse, perceuse, ...)',
  'Plateau diviseur', 'Plateau circulaire', 'Tête taraudeuse',
];

const EQUIPMENT_STATES: EquipmentState[] = [
  'En marche', 'Mode dégradé', 'Maintenance/réparation', 'En panne',
];

const stateColors: Record<EquipmentState, string> = {
  'En marche': 'bg-green-100 text-green-800',
  'Mode dégradé': 'bg-yellow-100 text-yellow-800',
  'Maintenance/réparation': 'bg-orange-100 text-orange-800',
  'En panne': 'bg-red-100 text-red-800',
};

const EquipmentPage: React.FC = () => {
  const { equipments, addEquipment, updateEquipment, deleteEquipment } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [designation, setDesignation] = useState('');
  const [type, setType] = useState<EquipmentType>(EQUIPMENT_TYPES[0]);
  const [capacity, setCapacity] = useState('');
  const [state, setState] = useState<EquipmentState>('En marche');

  const openNew = () => {
    setEditing(null);
    setDesignation('');
    setType(EQUIPMENT_TYPES[0]);
    setCapacity('');
    setState('En marche');
    setDialogOpen(true);
  };

  const openEdit = (eq: Equipment) => {
    setEditing(eq);
    setDesignation(eq.designation);
    setType(eq.type);
    setCapacity(eq.capacity);
    setState(eq.state);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const data: Equipment = {
      id: editing?.id || crypto.randomUUID(),
      designation,
      type,
      capacity,
      state,
    };
    if (editing) updateEquipment(data);
    else addEquipment(data);
    setDialogOpen(false);
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Équipements"
        description={`${equipments.length} équipement(s) enregistré(s)`}
        actions={
          <Button onClick={openNew} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        }
      />

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Désignation</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Capacité</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipments.map(eq => (
              <TableRow key={eq.id}>
                <TableCell className="font-medium">{eq.designation}</TableCell>
                <TableCell className="text-sm">{eq.type}</TableCell>
                <TableCell className="text-sm">{eq.capacity}</TableCell>
                <TableCell>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stateColors[eq.state]}`}>
                    {eq.state}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(eq)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm('Êtes-vous sûr de vouloir supprimer cet équipement ?', () => deleteEquipment(eq.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {equipments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucun équipement. Cliquez sur "Ajouter" pour commencer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} un équipement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Désignation</label>
              <Input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="Nom de l'équipement" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={type}
                onChange={e => setType(e.target.value as EquipmentType)}
              >
                {EQUIPMENT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Capacité</label>
              <Input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Capacité de l'équipement" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">État</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={state}
                onChange={e => setState(e.target.value as EquipmentState)}
              >
                {EQUIPMENT_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!designation}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default EquipmentPage;
