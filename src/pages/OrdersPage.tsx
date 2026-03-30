import React, { useState, useMemo, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Package, Wrench, Flag, GripVertical, ClipboardPaste, FileCheck } from 'lucide-react';
import type { Order, UrgencyLevel, OrderPriority } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import ExcelPasteDialog from '@/components/orders/ExcelPasteDialog';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';

const urgencyLabels: Record<UrgencyLevel, string> = {
  critical: 'مستعجل-أولوية قصوى',
  moderate: 'مستعجل نسبيا',
  low: 'غير مستعجل',
  pending: 'قيد التعليق',
  waiting: '',
};
const urgencyColors: Record<UrgencyLevel, string> = {
  critical: 'bg-urgent/15 text-urgent',
  moderate: 'bg-urgent-moderate/15 text-urgent-moderate',
  low: 'bg-priority-p3/15 text-priority-p3',
  pending: 'bg-priority-p4/15 text-muted-foreground',
  waiting: 'bg-muted text-muted-foreground',
};
const priorityConfig: Record<OrderPriority, { label: string; description: string; color: string; border: string }> = {
  'P1': { label: 'P1 - مستعجل-أولوية قصوى', description: 'Commandes urgentes, en retard CR<1, très important pour facturation. Lancement immédiat dès que matière, outillage, études prêts.', color: 'text-urgent', border: 'border-urgent/30' },
  'P2': { label: 'P2 - مستعجل نسبيا - أولوية متوسطة', description: 'Urgence modérée, livraison 1-3 semaines, en avance sur le délai ou légèrement en retard CR<2.', color: 'text-urgent-moderate', border: 'border-urgent-moderate/30' },
  'P3': { label: 'P3 - غير مستعجل - أقل أولوية', description: 'Commandes pas urgentes, délai ouvert, large avance sur les délais.', color: 'text-priority-p3', border: 'border-priority-p3/30' },
  'P4': { label: 'P4 - قيد التعليق', description: 'Attente validation technique ou autre de la part du client. Statut provisoire, programmer en dernier.', color: 'text-priority-p4', border: 'border-priority-p4/30' },
  'P5': { label: 'P5 - قيد الانتظار', description: 'En attente. Aucune urgence associée.', color: 'text-muted-foreground', border: 'border-muted/30' },
};
const priorityColors: Record<OrderPriority, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
  'P5': 'bg-muted text-muted-foreground',
};

const urgencyRank: Record<UrgencyLevel, number> = { critical: 0, moderate: 1, low: 2, pending: 3, waiting: 4 };

// Column definitions for filter/sort
type ColumnKey = 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'urgency' | 'priority' | 'plannedDeadline' | 'materialAvailable' | 'toolingAvailable' | 'studyReady';

const OrdersPage: React.FC = () => {
  const { orders, addOrder, updateOrder, deleteOrder, clients, setOrders } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [priorityOrder, setPriorityOrder] = useState<Order | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<OrderPriority | ''>('');
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sort & Filter state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Drag state
  const [dragIndices, setDragIndices] = useState<number[] | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);

  // Base sorted orders by displayOrder
  const baseSorted = useMemo(() => {
    const real = orders.filter(o => o.id !== 'order-absence');
    return [...real].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
  }, [orders]);

  // Ensure displayOrders
  React.useEffect(() => {
    const real = orders.filter(o => o.id !== 'order-absence');
    if (real.some(o => o.displayOrder == null)) {
      const sorted = [...real].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
      const absence = orders.find(o => o.id === 'order-absence');
      setOrders([...(absence ? [absence] : []), ...sorted.map((o, i) => ({ ...o, displayOrder: i + 1 }))]);
    }
  }, []);

  // Get column value for sort/filter
  const getColValue = useCallback((o: Order, key: ColumnKey): string => {
    switch (key) {
      case 'orderNumber': return o.orderNumber;
      case 'orderDate': return o.orderDate;
      case 'client': return getClientName(o.clientId);
      case 'designation': return o.designation;
      case 'quantity': return String(o.quantity);
      case 'urgency': return urgencyLabels[o.urgency];
      case 'priority': return o.priority || '';
      case 'plannedDeadline': return o.plannedDeadline;
      case 'materialAvailable': return o.materialAvailable ? 'Oui' : 'Non';
      case 'toolingAvailable': return o.toolingAvailable ? 'Oui' : 'Non';
      default: return '';
    }
  }, [getClientName]);

  // Filtered + sorted orders
  const displayOrders = useMemo(() => {
    let list = [...baseSorted];

    // Apply filters
    for (const [key, val] of Object.entries(filters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter(o => getColValue(o, key as ColumnKey).toLowerCase().includes(lower));
    }

    // Apply sort (overrides displayOrder temporarily for viewing)
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        const va = getColValue(a, sortKey as ColumnKey);
        const vb = getColValue(b, sortKey as ColumnKey);
        // Numeric sort for quantity
        if (sortKey === 'quantity') {
          const diff = Number(va) - Number(vb);
          return sortDir === 'asc' ? diff : -diff;
        }
        // Urgency sort by rank
        if (sortKey === 'urgency') {
          const diff = urgencyRank[a.urgency] - urgencyRank[b.urgency];
          return sortDir === 'asc' ? diff : -diff;
        }
        const cmp = va.localeCompare(vb, 'fr', { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [baseSorted, filters, sortKey, sortDir, getColValue]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(dir ? key : null); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === displayOrders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayOrders.map(o => o.id)));
  };

  // Order form
  const emptyOrder = (): Omit<Order, 'id'> => ({
    orderNumber: '', orderDate: new Date().toISOString().split('T')[0], clientId: clients[0]?.id || '',
    designation: '', quantity: 1, urgency: 'normal', plannedDeadline: '', materialAvailable: true,
    toolingAvailable: true, displayOrder: baseSorted.length + 1,
  });
  const [form, setForm] = useState<Omit<Order, 'id'>>(emptyOrder());

  const openNew = () => { setEditing(null); setForm(emptyOrder()); setDialogOpen(true); };
  const openEdit = (o: Order) => { setEditing(o); const { id, ...rest } = o; setForm(rest); setDialogOpen(true); };
  const handleSave = () => {
    const data: Order = { id: editing?.id || `ord-${Date.now()}`, ...form };
    if (editing) updateOrder(data); else addOrder(data);
    setDialogOpen(false);
  };
  const updateForm = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  // Priority
  const openPriorityDialog = (o: Order) => { setPriorityOrder(o); setSelectedPriority(o.priority || ''); setPriorityDialogOpen(true); };
  const handleSavePriority = () => {
    if (priorityOrder && selectedPriority) updateOrder({ ...priorityOrder, priority: selectedPriority as OrderPriority });
    else if (priorityOrder) { const { priority, ...rest } = priorityOrder; updateOrder(rest as Order); }
    setPriorityDialogOpen(false);
  };

  // Excel paste import
  const handleExcelImport = (imported: Omit<Order, 'id'>[]) => {
    imported.forEach((o, i) => addOrder({ id: `ord-${Date.now()}-${i}`, ...o } as Order));
  };

  // Drag & drop (supports multi-select)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    const orderId = displayOrders[index].id;
    // If dragging a selected item, drag all selected; otherwise drag just this one
    if (selectedIds.has(orderId) && selectedIds.size > 1) {
      const indices = displayOrders.map((o, i) => selectedIds.has(o.id) ? i : -1).filter(i => i >= 0);
      setDragIndices(indices);
    } else {
      setDragIndices([index]);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (!dragIndices || dragIndices.length === 0) { setDragIndices(null); setDragOverIndex(null); return; }

    // Only allow reorder when no sort/filter active
    if (sortKey || Object.values(filters).some(v => v)) {
      setDragIndices(null); setDragOverIndex(null); return;
    }

    const items = [...baseSorted];
    // Extract dragged items
    const draggedItems = dragIndices.map(i => items[i]).filter(Boolean);
    const remaining = items.filter(o => !draggedItems.some(d => d.id === o.id));

    // Insert at drop position (adjusted for removed items)
    let insertAt = dropIndex;
    // Count how many dragged items were before dropIndex
    const beforeCount = dragIndices.filter(i => i < dropIndex).length;
    insertAt = insertAt - beforeCount;
    if (insertAt < 0) insertAt = 0;

    remaining.splice(insertAt, 0, ...draggedItems);

    const absence = orders.find(o => o.id === 'order-absence');
    setOrders([...(absence ? [absence] : []), ...remaining.map((o, i) => ({ ...o, displayOrder: i + 1 }))]);
    setDragIndices(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => { setDragIndices(null); setDragOverIndex(null); };

  const isDragging = (index: number) => dragIndices?.includes(index) ?? false;
  const hasActiveFilters = sortKey !== null || Object.values(filters).some(v => v);

  const columns: { key: ColumnKey; label: string }[] = [
    { key: 'orderNumber', label: 'N° Commande' },
    { key: 'orderDate', label: 'Date' },
    { key: 'client', label: 'Client' },
    { key: 'designation', label: 'Désignation' },
    { key: 'quantity', label: 'Qté' },
    { key: 'urgency', label: 'Urgence' },
    { key: 'priority', label: 'Priorité' },
    { key: 'plannedDeadline', label: 'Délai' },
    { key: 'materialAvailable', label: 'Mat.' },
    { key: 'toolingAvailable', label: 'Out.' },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Commandes en cours" description={`${displayOrders.length} commande(s)`} actions={
        <div className="flex gap-2">
          <Button onClick={() => setPasteDialogOpen(true)} variant="outline" size="sm">
            <ClipboardPaste className="w-4 h-4 mr-1" /> Coller depuis Excel
          </Button>
          <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
        </div>
      } />

      {hasActiveFilters && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tri/filtre actif — le glisser-déposer est désactivé.</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSortKey(null); setSortDir(null); setFilters({}); }}>
            Réinitialiser
          </Button>
        </div>
      )}

      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedIds.size === displayOrders.length && displayOrders.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-16 text-center text-xs">Ordre</TableHead>
              {columns.map(col => (
                <TableHead key={col.key}>
                  <ColumnHeader
                    label={col.label}
                    columnKey={col.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    filterValue={filters[col.key] || ''}
                    onFilter={handleFilter}
                  />
                </TableHead>
              ))}
              <TableHead className="w-28 text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayOrders.map((o, index) => (
              <TableRow
                key={o.id}
                draggable={!hasActiveFilters}
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => handleDragOver(e, index)}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`transition-colors ${
                  !hasActiveFilters ? 'cursor-grab active:cursor-grabbing' : ''
                } ${dragOverIndex === index ? 'bg-accent/50 border-t-2 border-accent' : ''
                } ${isDragging(index) ? 'opacity-40' : ''
                } ${selectedIds.has(o.id) ? 'bg-primary/5' : ''}`}
                onClick={() => setPlanningOrder(o)}
              >
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(o.id)}
                    onCheckedChange={() => toggleSelect(o.id)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {!hasActiveFilters && <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium text-muted-foreground">{o.displayOrder ?? index + 1}</span>
                  </div>
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
                <TableCell>
                  {o.priority ? (
                    <Badge className={priorityColors[o.priority]}>{o.priority}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{o.plannedDeadline}</TableCell>
                <TableCell>
                  <Package className={`w-4 h-4 ${o.materialAvailable ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <Wrench className={`w-4 h-4 ${o.toolingAvailable ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => openPriorityDialog(o)} title="Définir priorité">
                      <Flag className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteOrder(o.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {displayOrders.length === 0 && (
              <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">Aucune commande.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Priority Dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Définir la priorité</DialogTitle>
            {priorityOrder && (
              <p className="text-sm text-muted-foreground">
                Commande : <span className="font-medium">{priorityOrder.orderNumber}</span> - {priorityOrder.designation}
              </p>
            )}
          </DialogHeader>
          <RadioGroup value={selectedPriority} onValueChange={(v) => setSelectedPriority(v as OrderPriority)}>
            <div className="space-y-6">
              {[
                { level: 'Niveau 1 : Priorité Critique', keys: ['P1-A', 'P1-B', 'P1-C'] as OrderPriority[], color: 'text-destructive', border: 'border-destructive/30' },
                { level: 'Niveau 2 : Priorité de Rattrapage', keys: ['P2-A', 'P2-B', 'P2-C'] as OrderPriority[], color: 'text-urgent-moderate', border: 'border-urgent-moderate/30' },
                { level: 'Niveau 3 : Priorité Standard', keys: ['P3-A', 'P3-B'] as OrderPriority[], color: 'text-normal', border: 'border-normal/30' },
              ].map(group => (
                <div key={group.level}>
                  <h3 className={`text-sm font-semibold ${group.color} mb-2 flex items-center gap-2`}>
                    <Flag className="w-4 h-4" /> {group.level}
                  </h3>
                  <div className={`space-y-2 pl-4 border-l-2 ${group.border}`}>
                    {group.keys.map(p => (
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
              ))}
            </div>
          </RadioGroup>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedPriority('')}>Effacer</Button>
            <Button variant="outline" onClick={() => setPriorityDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSavePriority}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
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

      {/* Excel Paste Dialog */}
      <ExcelPasteDialog
        open={pasteDialogOpen}
        onOpenChange={setPasteDialogOpen}
        onImport={handleExcelImport}
        clients={clients}
        nextDisplayOrder={baseSorted.length + 1}
      />

      {planningOrder && (
        <OrderPlanningDialog
          order={planningOrder}
          open={!!planningOrder}
          onOpenChange={(open) => { if (!open) setPlanningOrder(null); }}
        />
      )}
    </div>
  );
};

export default OrdersPage;
