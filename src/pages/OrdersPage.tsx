import React, { useState, useMemo, useCallback } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Package, Wrench, Flag, GripVertical, ClipboardPaste, FileCheck, Lock, Unlock, HelpCircle } from 'lucide-react';
import type { Order, OrderPriority } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import ExcelPasteDialog from '@/components/orders/ExcelPasteDialog';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isWeekend, isHoliday } from '@/lib/workTime';

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

const priorityRank: Record<OrderPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 };

type ColumnKey = 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'deliveryDeadline' | 'materialAvailable' | 'toolingAvailable' | 'studyReady' | 'cr';

/** Calculate CR = remaining allocated time / remaining available time */
function computeCR(
  order: Order,
  steps: { orderId: string; operationId: string; estimatedDuration: number }[],
  productionRecords: { orderId: string; actualDuration: number }[],
  holidays: { date: string; name: string }[],
  absenceOpId: string,
): number | null {
  const orderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOpId);
  const totalAllocated = orderSteps.reduce((sum, s) => sum + s.estimatedDuration, 0);
  if (totalAllocated === 0) return null; // indéfini

  const totalDone = productionRecords
    .filter(r => r.orderId === order.id)
    .reduce((sum, r) => sum + r.actualDuration, 0);

  const remainingAllocated = Math.max(0, totalAllocated - totalDone);

  const deadline = order.deliveryDeadline || order.plannedDeadline;
  if (!deadline) return null;

  const deadlineDate = new Date(deadline + 'T16:00:00');
  const now = new Date();

  // Calculate available working minutes from now to deadline
  let availableMinutes = 0;

  // Current day
  if (now <= deadlineDate) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const deadlineDay = new Date(deadlineDate);
    deadlineDay.setHours(0, 0, 0, 0);

    const isWorkDayFn = (d: Date) => {
      const day = d.getDay();
      if (day === 5 || day === 6) return false;
      const str = d.toISOString().split('T')[0];
      return !holidays.some(h => h.date === str);
    };

    if (isWorkDayFn(today)) {
      const nowHour = now.getHours();
      const nowMin = now.getMinutes();
      const nowTotalMin = nowHour * 60 + nowMin;

      if (nowTotalMin < 12 * 60) {
        // Before noon: remaining = (12:00 - now) + 3.5h - 0.5h lunch
        const morningRemaining = Math.max(0, 12 * 60 - nowTotalMin);
        availableMinutes += morningRemaining + 210; // 210 = 3.5h afternoon
      } else if (nowTotalMin < 12.5 * 60) {
        // During lunch
        availableMinutes += 210;
      } else if (nowTotalMin < 16 * 60) {
        // After noon
        availableMinutes += Math.max(0, 16 * 60 - nowTotalMin);
      }
      // After 16:00 = 0
    }

    // Other days
    const cursor = new Date(today);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= deadlineDay) {
      if (isWorkDayFn(cursor)) {
        availableMinutes += 450; // 7.5h
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  if (availableMinutes <= 0) return remainingAllocated > 0 ? 999 : 0;
  return remainingAllocated / availableMinutes;
}

const OrdersPage: React.FC = () => {
  const { orders, addOrder, updateOrder, deleteOrder, clients, setOrders, steps, productionRecords, holidays, absenceOperationId, absenceOrderId } = usePlanning();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [priorityOrder, setPriorityOrder] = useState<Order | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<OrderPriority | ''>('');
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dragIndices, setDragIndices] = useState<number[] | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);

  // CR map
  const crMap = useMemo(() => {
    const map = new Map<string, number | null>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      map.set(o.id, computeCR(o, steps, productionRecords, holidays, absenceOperationId));
    });
    return map;
  }, [orders, steps, productionRecords, holidays]);

  // Default sort: priority desc (P1 first) then CR asc (smallest first)
  const baseSorted = useMemo(() => {
    const real = orders.filter(o => o.id !== absenceOrderId);
    // If any have displayOrder set and frozen, respect that
    // Separate frozen and non-frozen
    const frozen = real.filter(o => o.frozenOrder);
    const nonFrozen = real.filter(o => !o.frozenOrder);

    // Sort non-frozen by priority then CR
    nonFrozen.sort((a, b) => {
      const pa = priorityRank[a.priority] ?? 5;
      const pb = priorityRank[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const crA = crMap.get(a.id);
      const crB = crMap.get(b.id);
      // null CR goes last
      if (crA == null && crB == null) return 0;
      if (crA == null) return 1;
      if (crB == null) return -1;
      return crB - crA; // descending CR (higher CR = more critical = first)
    });

    // Merge: place frozen orders at their displayOrder positions
    const allOrders = [...nonFrozen];
    frozen.sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
    for (const fo of frozen) {
      const pos = Math.min((fo.displayOrder ?? 9999) - 1, allOrders.length);
      allOrders.splice(Math.max(0, pos), 0, fo);
    }

    return allOrders;
  }, [orders, crMap]);

  // Assign displayOrders
  React.useEffect(() => {
    const real = orders.filter(o => o.id !== 'order-absence');
    const needsUpdate = real.some((o, i) => {
      const sorted = baseSorted[i];
      return sorted && o.id === sorted.id && o.displayOrder !== i + 1;
    });
    if (baseSorted.length > 0 && needsUpdate) {
      const absence = orders.find(o => o.id === 'order-absence');
      setOrders([...(absence ? [absence] : []), ...baseSorted.map((o, i) => ({ ...o, displayOrder: i + 1 }))]);
    }
  }, []);

  const getColValue = useCallback((o: Order, key: ColumnKey): string => {
    switch (key) {
      case 'orderNumber': return o.orderNumber;
      case 'orderDate': return o.orderDate;
      case 'client': return getClientName(o.clientId);
      case 'designation': return o.designation;
      case 'quantity': return String(o.quantity);
      case 'priority': return o.priority || '';
      case 'deliveryDeadline': return o.deliveryDeadline || o.plannedDeadline;
      case 'materialAvailable': return o.materialAvailable ? 'Oui' : 'Non';
      case 'toolingAvailable': return o.toolingAvailable ? 'Oui' : 'Non';
      case 'studyReady': return o.studyReady ? 'Oui' : 'Non';
      case 'cr': {
        const cr = crMap.get(o.id);
        return cr != null ? cr.toFixed(2) : '';
      }
      default: return '';
    }
  }, [getClientName, crMap]);

  const displayOrders = useMemo(() => {
    let list = [...baseSorted];
    for (const [key, val] of Object.entries(filters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter(o => getColValue(o, key as ColumnKey).toLowerCase().includes(lower));
    }
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        const va = getColValue(a, sortKey as ColumnKey);
        const vb = getColValue(b, sortKey as ColumnKey);
        if (sortKey === 'quantity' || sortKey === 'cr') {
          const diff = (Number(va) || 0) - (Number(vb) || 0);
          return sortDir === 'asc' ? diff : -diff;
        }
        if (sortKey === 'priority') {
          const diff = (priorityRank[a.priority] ?? 5) - (priorityRank[b.priority] ?? 5);
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

  const emptyOrder = (): Omit<Order, 'id'> => ({
    orderNumber: '', orderDate: new Date().toISOString().split('T')[0], clientId: clients[0]?.id || '',
    designation: '', quantity: 1, priority: 'P3', plannedDeadline: '', materialAvailable: true,
    toolingAvailable: true, studyReady: true, displayOrder: baseSorted.length + 1,
  });
  const [form, setForm] = useState<Omit<Order, 'id'>>(emptyOrder());

  const openNew = () => { setEditing(null); setForm(emptyOrder()); setDialogOpen(true); };
  const openEdit = (o: Order) => { setEditing(o); const { id, ...rest } = o; setForm(rest); setDialogOpen(true); };
  const handleSave = () => {
    const data: Order = { id: editing?.id || crypto.randomUUID(), ...form };
    if (editing) updateOrder(data); else addOrder(data);
    setDialogOpen(false);
  };
  const updateForm = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const openPriorityDialog = (o: Order) => { setPriorityOrder(o); setSelectedPriority(o.priority || ''); setPriorityDialogOpen(true); };
  const handleSavePriority = () => {
    if (priorityOrder && selectedPriority) updateOrder({ ...priorityOrder, priority: selectedPriority as OrderPriority });
    setPriorityDialogOpen(false);
  };

  const handleExcelImport = (imported: Omit<Order, 'id'>[]) => {
    imported.forEach((o, i) => addOrder({ id: crypto.randomUUID(), ...o } as Order));
  };

  // Drag & drop
  const handleDragStart = (e: React.DragEvent, index: number) => {
    const orderId = displayOrders[index].id;
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
    if (sortKey || Object.values(filters).some(v => v)) {
      setDragIndices(null); setDragOverIndex(null); return;
    }

    const items = [...baseSorted];
    const draggedItems = dragIndices.map(i => items[i]).filter(Boolean);
    const remaining = items.filter(o => !draggedItems.some(d => d.id === o.id));
    let insertAt = dropIndex;
    const beforeCount = dragIndices.filter(i => i < dropIndex).length;
    insertAt = insertAt - beforeCount;
    if (insertAt < 0) insertAt = 0;
    remaining.splice(insertAt, 0, ...draggedItems);

    const absence = orders.find(o => o.id === 'order-absence');
    // Mark dragged orders as frozen
    setOrders([
      ...(absence ? [absence] : []),
      ...remaining.map((o, i) => ({
        ...o,
        displayOrder: i + 1,
        frozenOrder: draggedItems.some(d => d.id === o.id) ? true : o.frozenOrder,
      })),
    ]);
    setDragIndices(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => { setDragIndices(null); setDragOverIndex(null); };
  const isDragging = (index: number) => dragIndices?.includes(index) ?? false;
  const hasActiveFilters = sortKey !== null || Object.values(filters).some(v => v);

  const unlockOrder = (o: Order) => updateOrder({ ...o, frozenOrder: false });
  const unlockAll = () => {
    const absence = orders.find(o => o.id === 'order-absence');
    const real = orders.filter(o => o.id !== 'order-absence').map(o => ({ ...o, frozenOrder: false }));
    setOrders([...(absence ? [absence] : []), ...real]);
  };

  const hasFrozenOrders = orders.some(o => o.id !== 'order-absence' && o.frozenOrder);

  const columns: { key: ColumnKey; label: string }[] = [
    { key: 'orderNumber', label: 'N° Commande' },
    { key: 'orderDate', label: 'Date' },
    { key: 'client', label: 'Client' },
    { key: 'designation', label: 'Désignation' },
    { key: 'quantity', label: 'Qté' },
    { key: 'priority', label: 'Priorité' },
    { key: 'deliveryDeadline', label: 'Délai' },
    { key: 'cr', label: 'CR' },
    { key: 'materialAvailable', label: 'Mat.' },
    { key: 'toolingAvailable', label: 'Out.' },
    { key: 'studyReady', label: 'Étude' },
  ];

  const formatCR = (orderId: string) => {
    const cr = crMap.get(orderId);
    if (cr == null) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Indéfini — aucune étape planifiée</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    const color = cr >= 2 ? 'text-urgent' : cr >= 1 ? 'text-urgent-moderate' : 'text-normal';
    return <span className={`text-xs font-bold ${color}`}>{cr.toFixed(2)}</span>;
  };

  return (
    <div className="p-6">
      <PageHeader title="Commandes en cours" description={`${displayOrders.length} commande(s)`} actions={
        <div className="flex gap-2">
          {hasFrozenOrders && (
            <Button onClick={unlockAll} variant="outline" size="sm">
              <Unlock className="w-4 h-4 mr-1" /> Libérer tout
            </Button>
          )}
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
                  <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelect(o.id)} />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {!hasActiveFilters && <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />}
                    {o.frozenOrder && <Lock className="w-3 h-3 text-primary" />}
                    <span className="text-sm font-medium text-muted-foreground">{o.displayOrder ?? index + 1}</span>
                  </div>
                </TableCell>
                <TableCell className="font-heading text-sm">{o.orderNumber}</TableCell>
                <TableCell className="text-sm">{formatDateFR(o.orderDate)}</TableCell>
                <TableCell className="text-sm">{getClientName(o.clientId)}</TableCell>
                <TableCell className="text-sm max-w-48 truncate">{o.designation}</TableCell>
                <TableCell className="text-sm">{o.quantity}</TableCell>
                <TableCell>
                  <Badge className={priorityColors[o.priority]}>{o.priority}</Badge>
                </TableCell>
                <TableCell className="text-sm">{formatDateFR(o.deliveryDeadline || o.plannedDeadline)}</TableCell>
                <TableCell className="text-center">{formatCR(o.id)}</TableCell>
                <TableCell>
                  <Package className={`w-4 h-4 ${o.materialAvailable ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <Wrench className={`w-4 h-4 ${o.toolingAvailable ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <FileCheck className={`w-4 h-4 ${o.studyReady ? 'text-normal' : 'text-destructive'}`} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    {o.frozenOrder && (
                      <Button variant="ghost" size="icon" onClick={() => unlockOrder(o)} title="Libérer">
                        <Unlock className="w-3.5 h-3.5 text-primary" />
                      </Button>
                    )}
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
              <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground py-8">Aucune commande.</TableCell></TableRow>
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
            <div className="space-y-4">
              {(['P1', 'P2', 'P3', 'P4', 'P5'] as OrderPriority[]).map(p => {
                const cfg = priorityConfig[p];
                return (
                  <label key={p} className={`flex items-start gap-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer border-l-4 ${cfg.border}`}>
                    <RadioGroupItem value={p} className="mt-0.5" />
                    <div>
                      <span className={`font-medium text-sm ${cfg.color}`}>{cfg.label}</span>
                      <p className="text-xs text-muted-foreground">{cfg.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </RadioGroup>
          <DialogFooter className="gap-2">
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
              <label className="text-sm font-medium mb-1 block">Priorité</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.priority} onChange={e => updateForm('priority', e.target.value)}>
                {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.studyReady} onChange={e => updateForm('studyReady', e.target.checked)} className="rounded" />
                <FileCheck className="w-4 h-4" /> Étude faite
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
