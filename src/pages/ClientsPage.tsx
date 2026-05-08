import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Star, Download } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { Client, ClientClass, Representative } from '@/types/planning';
import RepresentativesEditor from '@/components/RepresentativesEditor';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { exportTableToExcel } from '@/lib/excelExport';

const CLIENT_CLASSES: { value: ClientClass; label: string; description: string; color: string }[] = [
  { value: 'A', label: 'Classe A - Partenaires Stratégiques', description: 'CA élevé, régularité parfaite, paiement souvent anticipé ou à l\'heure, procédures administratives fluides, échanges constructifs.', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  { value: 'B', label: 'Classe B - Clients Fidèles', description: 'Commandes régulières, respect global des délais de paiement, peu de lourdeur administrative.', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  { value: 'C', label: 'Classe C - Clients Ponctuels', description: 'Commandes épisodiques ou saisonnières. Paiement correct mais sans historique de fidélité forte.', color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  { value: 'D', label: 'Classe D - Clients à Faible Engagement', description: 'Se manifeste très rarement, demande souvent des devis sans donner suite ou possède des processus administratifs très lourds par rapport au volume d\'affaires.', color: 'bg-orange-500/15 text-orange-700 border-orange-500/30' },
  { value: 'E', label: 'Classe E - Clients Sous Conditions', description: 'Historique de retards de paiement, litiges fréquents, ou relationnel difficile. Client très occasionnel et "coûteux" en temps de gestion.', color: 'bg-red-500/15 text-red-700 border-red-500/30' },
];

const getClassInfo = (c?: ClientClass) => CLIENT_CLASSES.find(cl => cl.value === c);

const ClientsPage: React.FC = () => {
  const { clients, addClient, updateClient, deleteClient } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [scoringClient, setScoringClient] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClientClass | ''>('');

  const openNew = () => { setEditing(null); setName(''); setRepresentatives([]); setDialogOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setName(c.name); setRepresentatives(c.representatives || []); setDialogOpen(true); };
  const openScore = (c: Client) => { setScoringClient(c); setSelectedClass(c.clientClass || ''); setScoreDialogOpen(true); };

  const handleSave = () => {
    if (editing) updateClient({ ...editing, name, representatives });
    else addClient({ id: crypto.randomUUID(), name, representatives });
    setDialogOpen(false);
  };

  const handleScoreSave = () => {
    if (scoringClient && selectedClass) {
      updateClient({ ...scoringClient, clientClass: selectedClass as ClientClass });
    }
    setScoreDialogOpen(false);
  };

  const accessors = {
    name: (c: Client) => c.name,
    clientClass: (c: Client) => c.clientClass || '',
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter } = useTableSortFilter(clients, accessors);

  const handleExportExcel = () => {
    exportTableToExcel('الزبائن', processed.map(c => ({
      'اسم الزبون': c.name,
    })), [32]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="الزبائن" description="قائمة الزبائن" actions={
          <>
            <Button onClick={handleExportExcel} variant="outline" size="sm"><Download className="w-4 h-4 mr-1" /> تصدير Excel</Button>
            <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
          </>
        } />
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="اسم الزبون" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.name || ''} onFilter={handleFilter} /></TableHead>
              <TableHead className="w-32">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(c => {
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openScore(c)} title="Classifier">
                        <Star className="w-3.5 h-3.5 text-amber-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteClient(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit/Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} un client</DialogTitle></DialogHeader>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du client" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!name}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score dialog */}
      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Classifier : {scoringClient?.name}
            </DialogTitle>
          </DialogHeader>
          <RadioGroup value={selectedClass} onValueChange={(v) => setSelectedClass(v as ClientClass)} className="space-y-3">
            {CLIENT_CLASSES.map(cl => (
              <label key={cl.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent/50 ${selectedClass === cl.value ? 'border-primary bg-accent/30' : ''}`}>
                <RadioGroupItem value={cl.value} className="mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="font-medium text-sm">{cl.label}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{cl.description}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleScoreSave} disabled={!selectedClass}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsPage;
