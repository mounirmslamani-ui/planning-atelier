import React, { useState, useMemo } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Package, Wrench, Flag, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Order, UrgencyLevel, OrderPriority } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';

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

const priorityConfig: Record<OrderPriority, { label: string; description: string; level: string }> = {
  'P1-A': {
    label: 'P1-A - Urgences contractuelles',
    description: 'Commandes dont la date d\'expédition est dépassée ou prévue sous 24/48h.',
    level: 'Niveau 1 : Priorité Critique',
  },
  'P1-B': {
    label: 'P1-B - Commandes en finition (90%)',
    description: 'Tout ce qui est presque terminé. On finit ces pièces pour les expédier et libérer l\'espace.',
    level: 'Niveau 1 : Priorité Critique',
  },
  'P1-C': {
    label: 'P1-C - Fort enjeu financier',
    description: 'Commandes à haute valeur ajoutée à facturer avant la fin de la semaine/du mois.',
    level: 'Niveau 1 : Priorité Critique',
  },
  'P2-A': {
    label: 'P2-A - Commandes en retard léger',
    description: 'Celles qui ont glissé de quelques jours et qu\'il faut remettre dans le flux.',
    level: 'Niveau 2 : Priorité de Rattrapage',
  },
  'P2-B': {
    label: 'P2-B - Urgence modérée',
    description: 'Commandes dont l\'échéance est à J+5 ou J+7.',
    level: 'Niveau 2 : Priorité de Rattrapage',
  },
  'P2-C': {
    label: 'P2-C - Commandes groupées',
    description: 'Optimisation technique (même réglage machine, même couleur) pour gagner du temps.',
    level: 'Niveau 2 : Priorité de Rattrapage',
  },
  'P3-A': {
    label: 'P3-A - Flux normal',
    description: 'Commandes avec un délai confortable (2 semaines et plus).',
    level: 'Niveau 3 : Priorité Standard',
  },
  'P3-B': {
    label: 'P3-B - Travaux internes / Anticipation',
    description: 'Préparation de sous-ensembles ou stock tampon si la charge le permet.',
    level: 'Niveau 3 : Priorité Standard',
  },
};

const priorityColors: Record<OrderPriority, string> = {
  'P1-A': 'bg-destructive text-destructive-foreground',
  'P1-B': 'bg-destructive/80 text-destructive-foreground',
  'P1-C': 'bg-destructive/60 text-destructive-foreground',
  'P2-A': 'bg-urgent-moderate text-white',
  'P2-B': 'bg-urgent-moderate/80 text-white',
  'P2-C': 'bg-urgent-moderate/60 text-white',
  'P3-A': 'bg-normal text-white',
  'P3-B': 'bg-normal/70 text-white',
};

type SortField = 'priority' | 'client' | 'deadline' | 'orderNumber' | 'orderDate' | 'quantity' | 'material' | 'tooling';
type SortDirection = 'asc' | 'desc';

const OrdersPage: React.FC = () => {
  const { orders, addOrder, updateOrder, deleteOrder, clients } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [priorityOrder, setPriorityOrder] = useState<Order | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<OrderPriority | ''>('');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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

  const openPriorityDialog = (o: Order) => {
    setPriorityOrder(o);
    setSelectedPriority(o.priority || '');
    setPriorityDialogOpen(true);
  };

  const handleSavePriority = () => {
    if (priorityOrder && selectedPriority) {
      updateOrder({ ...priorityOrder, priority: selectedPriority as OrderPriority });
    } else if (priorityOrder && !selectedPriority) {
      const { priority, ...rest } = priorityOrder;
      updateOrder(rest as Order);
    }
    setPriorityDialogOpen(false);
  };

  const handleSave = () => {
    const data: Order = { id: editing?.id || `ord-${Date.now()}`, ...form };
    if (editing) updateOrder(data);
    else addOrder(data);
    setDialogOpen(false);
  };

  const updateForm = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));
  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || '—';

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 ml-1" /> 
      : <ArrowDown className="w-3.5 h-3.5 ml-1" />;
  };

  // Sort orders
  const sortedOrders = useMemo(() => {
    const priorityRank = ['P1-A', 'P1-B', 'P1-C', 'P2-A', 'P2-B', 'P2-C', 'P3-A', 'P3-B'];
    
    return [...orders].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'priority': {
          const aIndex = a.priority ? priorityRank.indexOf(a.priority) : 999;
          const bIndex = b.priority ? priorityRank.indexOf(b.priority) : 999;
          comparison = aIndex - bIndex;
          break;
        }
        case 'client': {
          const aName = getClientName(a.clientId);
          const bName = getClientName(b.clientId);
          comparison = aName.localeCompare(bName);
          break;
        }
        case 'deadline': {
          const aDate = a.plannedDeadline || '9999-12-31';
          const bDate = b.plannedDeadline || '9999-12-31';
          comparison = aDate.localeCompare(bDate);
          break;
        }
        case 'orderNumber': {
          comparison = a.orderNumber.localeCompare(b.orderNumber);
          break;
        }
        case 'orderDate': {
          comparison = a.orderDate.localeCompare(b.orderDate);
          break;
        }
        case 'quantity': {
          comparison = a.quantity - b.quantity;
          break;
        }
        case 'material': {
          comparison = (a.materialAvailable === b.materialAvailable) ? 0 : a.materialAvailable ? -1 : 1;
          break;
        }
        case 'tooling': {
          comparison = (a.toolingAvailable === b.toolingAvailable) ? 0 : a.toolingAvailable ? -1 : 1;
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [orders, sortField, sortDirection, clients]);

  return (
    <div className="p-6">
      <PageHeader title="Commandes" description={`${orders.length} commande(s)`} actions={
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      } />
      
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('priority')}>
                <span className="flex items-center gap-1">Priorité <SortIcon field="priority" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('orderNumber')}>
                <span className="flex items-center gap-1">N° Commande <SortIcon field="orderNumber" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('orderDate')}>
                <span className="flex items-center gap-1">Date <SortIcon field="orderDate" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('client')}>
                <span className="flex items-center gap-1">Client <SortIcon field="client" /></span>
              </TableHead>
              <TableHead>Désignation</TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('quantity')}>
                <span className="flex items-center gap-1">Qté <SortIcon field="quantity" /></span>
              </TableHead>
              <TableHead>Urgence</TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('deadline')}>
                <span className="flex items-center gap-1">Délai <SortIcon field="deadline" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('material')}>
                <span className="flex items-center gap-1">Mat. <SortIcon field="material" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('tooling')}>
                <span className="flex items-center gap-1">Out. <SortIcon field="tooling" /></span>
              </TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map(o => (
              <TableRow key={o.id}>
                <TableCell>
                  {o.priority ? (
                    <Badge className={priorityColors[o.priority]}>{o.priority}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
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
                    <Button variant="ghost" size="icon" onClick={() => openPriorityDialog(o)} title="Définir priorité">
                      <Flag className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteOrder(o.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Aucune commande.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Priority Dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Définir la priorité de la commande</DialogTitle>
            {priorityOrder && (
              <p className="text-sm text-muted-foreground">
                Commande : <span className="font-medium">{priorityOrder.orderNumber}</span> - {priorityOrder.designation}
              </p>
            )}
          </DialogHeader>
          <RadioGroup value={selectedPriority} onValueChange={(v) => setSelectedPriority(v as OrderPriority)}>
            <div className="space-y-6">
              {/* Niveau 1 */}
              <div>
                <h3 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                  <Flag className="w-4 h-4" /> Niveau 1 : Priorité Critique
                </h3>
                <p className="text-xs text-muted-foreground mb-3">L'urgence et le "Cash" — Libérer de la place, facturer, respecter les engagements immédiats.</p>
                <div className="space-y-2 pl-4 border-l-2 border-destructive/30">
                  {(['P1-A', 'P1-B', 'P1-C'] as OrderPriority[]).map(p => (
                    <label key={p} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value={p} className="mt-0.5" />
                      <div>
                        <span className="font-medium text-sm">{priorityConfig[p].label}</span>
                        <p className="text-xs text-muted-foreground">{priorityConfig[p].description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* Niveau 2 */}
              <div>
                <h3 className="text-sm font-semibold text-urgent-moderate mb-2 flex items-center gap-2">
                  <Flag className="w-4 h-4" /> Niveau 2 : Priorité de Rattrapage et Flux
                </h3>
                <p className="text-xs text-muted-foreground mb-3">Stabiliser la production pour éviter qu'elles ne basculent en P1.</p>
                <div className="space-y-2 pl-4 border-l-2 border-urgent-moderate/30">
                  {(['P2-A', 'P2-B', 'P2-C'] as OrderPriority[]).map(p => (
                    <label key={p} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value={p} className="mt-0.5" />
                      <div>
                        <span className="font-medium text-sm">{priorityConfig[p].label}</span>
                        <p className="text-xs text-muted-foreground">{priorityConfig[p].description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* Niveau 3 */}
              <div>
                <h3 className="text-sm font-semibold text-normal mb-2 flex items-center gap-2">
                  <Flag className="w-4 h-4" /> Niveau 3 : Priorité Standard
                </h3>
                <p className="text-xs text-muted-foreground mb-3">Le fond de cuve — Occuper les postes de travail de manière fluide.</p>
                <div className="space-y-2 pl-4 border-l-2 border-normal/30">
                  {(['P3-A', 'P3-B'] as OrderPriority[]).map(p => (
                    <label key={p} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value={p} className="mt-0.5" />
                      <div>
                        <span className="font-medium text-sm">{priorityConfig[p].label}</span>
                        <p className="text-xs text-muted-foreground">{priorityConfig[p].description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </RadioGroup>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSelectedPriority(''); }}>Effacer</Button>
            <Button variant="outline" onClick={() => setPriorityDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSavePriority}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
