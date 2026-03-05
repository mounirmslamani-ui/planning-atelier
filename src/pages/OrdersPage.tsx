import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Package, Wrench } from 'lucide-react';
import type { Order, UrgencyLevel } from '@/types/planning';

const urgencyLabels: Record<UrgencyLevel, string> = {
  urgent: 'Urgent',
  moderate: 'Modéré',
  normal: 'Normal',
  'not-urgent': 'Pas urgent',
};

const urgencyColors: Record<UrgencyLevel, string> = {
  urgent: 'bg-urgent/15 text-urgent',
  moderate: 'bg-urgent-moderate/15 text-urgent-moderate',
  normal: 'bg-normal/15 text-normal',
  'not-urgent': 'bg-muted text-muted-foreground',
};

const OrdersPage: React.FC = () => {
  const { orders, addOrder, updateOrder, deleteOrder, clients } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  const emptyOrder = (): Omit<Order, 'id'> => ({
    orderNumber: '',
    orderDate: new Date().toISOString().split('T')[0],
    clientId: clients[0]?.id || '',
    designation: '',
    quantity: 1,
    urgency: 'normal',
    plannedDeadline: '',
    materialAvailable: true,
    toolingAvailable: true,
  });

  const [form, setForm] = useState<Omit<Order, 'id'>>(emptyOrder());

  const openNew = () => { setEditing(null); setForm(emptyOrder()); setDialogOpen(true); };
  const openEdit = (o: Order) => { setEditing(o); const { id, ...rest } = o; setForm(rest); setDialogOpen(true); };

  const handleSave = () => {
    const data: Order = { id: editing?.id || `ord-${Date.now()}`, ...form };
    if (editing) updateOrder(data);
    else addOrder(data);
    setDialogOpen(false);
  };

  const updateForm = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));
  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '—';

  return (
    <div className="p-6">
      <PageHeader title="Commandes" description={`${orders.length} commande(s)`} actions={
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      } />
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° Commande</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Désignation</TableHead>
              <TableHead>Qté</TableHead>
              <TableHead>Urgence</TableHead>
              <TableHead>Délai</TableHead>
              <TableHead>Mat.</TableHead>
              <TableHead>Out.</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map(o => (
              <TableRow key={o.id}>
                <TableCell className="font-heading text-sm">{o.orderNumber}</TableCell>
                <TableCell className="text-sm">{o.orderDate}</TableCell>
                <TableCell className="text-sm">{getClientName(o.clientId)}</TableCell>
                <TableCell className="text-sm max-w-48 truncate">{o.designation}</TableCell>
                <TableCell className="text-sm">{o.quantity}</TableCell>
                <TableCell>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${urgencyColors[o.urgency]}`}>
                    {urgencyLabels[o.urgency]}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{o.plannedDeadline}</TableCell>
                <TableCell>
                  <Package className={`w-4 h-4 ${o.materialAvailable ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <Wrench className={`w-4 h-4 ${o.toolingAvailable ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteOrder(o.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Aucune commande.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} une commande</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">N° Commande</label>
              <Input value={form.orderNumber} onChange={e => updateForm('orderNumber', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date de commande</label>
              <Input type="date" value={form.orderDate} onChange={e => updateForm('orderDate', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Client</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.clientId} onChange={e => updateForm('clientId', e.target.value)}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Urgence</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.urgency} onChange={e => updateForm('urgency', e.target.value)}>
                {Object.entries(urgencyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">Désignation</label>
              <Input value={form.designation} onChange={e => updateForm('designation', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Quantité</label>
              <Input type="number" min={1} value={form.quantity} onChange={e => updateForm('quantity', parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Délai planifié</label>
              <Input type="date" value={form.plannedDeadline} onChange={e => updateForm('plannedDeadline', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Qté prototype</label>
              <Input type="number" min={0} value={form.prototypeQuantity || ''} onChange={e => updateForm('prototypeQuantity', parseInt(e.target.value) || undefined)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Délai prototype</label>
              <Input type="date" value={form.prototypeDeadline || ''} onChange={e => updateForm('prototypeDeadline', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Délai livraison souhaité</label>
              <Input type="date" value={form.deliveryDeadline || ''} onChange={e => updateForm('deliveryDeadline', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Qté complémentaire</label>
              <Input type="number" min={0} value={form.complementaryQuantity || ''} onChange={e => updateForm('complementaryQuantity', parseInt(e.target.value) || undefined)} />
            </div>
            <div className="flex items-center gap-6 col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.materialAvailable} onChange={e => updateForm('materialAvailable', e.target.checked)} className="rounded" />
                <Package className="w-4 h-4" /> Matière disponible
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.toolingAvailable} onChange={e => updateForm('toolingAvailable', e.target.checked)} className="rounded" />
                <Wrench className="w-4 h-4" /> Outillage disponible
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.orderNumber || !form.designation}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
