import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, GripVertical, ClipboardPaste, Lock, Unlock, HelpCircle, CalendarCheck, Undo2, Redo2, MoveVertical, ListPlus } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import type { Order, OrderPriority } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import ExcelPasteDialog from '@/components/orders/ExcelPasteDialog';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const priorityConfig: Record<OrderPriority, { label: string; description: string; color: string; border: string }> = {
  'P1': { label: 'P1 - مستعجل-أولوية قصوى', description: 'Commandes urgentes, en retard CR<1, très important pour facturation.', color: 'text-urgent', border: 'border-urgent/30' },
  'P2': { label: 'P2 - مستعجل نسبيا - أولوية متوسطة', description: 'Urgence modérée, livraison 1-3 semaines.', color: 'text-urgent-moderate', border: 'border-urgent-moderate/30' },
  'P3': { label: 'P3 - غير مستعجل - أقل أولوية', description: 'Commandes pas urgentes, délai ouvert.', color: 'text-priority-p3', border: 'border-priority-p3/30' },
  'P4': { label: 'P4 - قيد التعليق', description: 'Attente validation technique ou autre.', color: 'text-priority-p4', border: 'border-priority-p4/30' },
};
const priorityColors: Record<OrderPriority, string> = {
  'P1': 'bg-urgent text-white',
  'P2': 'bg-urgent-moderate text-white',
  'P3': 'bg-priority-p3 text-foreground',
  'P4': 'bg-priority-p4 text-foreground',
};

const priorityRank: Record<OrderPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

type ColumnKey = 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'deliveryDeadline' | 'cr' | 'atelierTime' | 'study' | 'material' | 'tooling' | 'observation';

function computeCR(
  order: Order,
  steps: { orderId: string; operationId: string; estimatedDuration: number; subcontractorId?: string }[],
  productionRecords: { orderId: string; actualDuration: number }[],
  holidays: { date: string; name: string }[],
  absenceOpId: string,
): number | null {
  // Only operator steps (no subcontractor, no absence)
  const orderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOpId && !s.subcontractorId);
  const totalAllocated = orderSteps.reduce((sum, s) => sum + s.estimatedDuration, 0);
  if (totalAllocated === 0) return null;
  const totalDone = productionRecords.filter(r => r.orderId === order.id).reduce((sum, r) => sum + r.actualDuration, 0);
  const remainingAllocated = Math.max(0, totalAllocated - totalDone);
  const deadline = order.deliveryDeadline || order.plannedDeadline;
  if (!deadline) return null;
  const deadlineDate = new Date(deadline + 'T16:00:00');
  const now = new Date();
  let availableMinutes = 0;
  if (now <= deadlineDate) {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const deadlineDay = new Date(deadlineDate); deadlineDay.setHours(0, 0, 0, 0);
    const isWorkDayFn = (d: Date) => {
      const day = d.getDay();
      if (day === 5 || day === 6) return false;
      const str = d.toISOString().split('T')[0];
      return !holidays.some(h => h.date === str);
    };
    if (isWorkDayFn(today)) {
      const nowTotalMin = now.getHours() * 60 + now.getMinutes();
      if (nowTotalMin < 12 * 60) { availableMinutes += Math.max(0, 12 * 60 - nowTotalMin) + 210; }
      else if (nowTotalMin < 12.5 * 60) { availableMinutes += 210; }
      else if (nowTotalMin < 16 * 60) { availableMinutes += Math.max(0, 16 * 60 - nowTotalMin); }
    }
    const cursor = new Date(today); cursor.setDate(cursor.getDate() + 1);
    while (cursor <= deadlineDay) { if (isWorkDayFn(cursor)) availableMinutes += 450; cursor.setDate(cursor.getDate() + 1); }
  }
  if (availableMinutes <= 0) return remainingAllocated > 0 ? 999 : 0;
  return remainingAllocated / availableMinutes;
}

function computeAtelierTime(
  orderId: string,
  steps: { orderId: string; operationId: string; estimatedDuration: number; subcontractorId?: string }[],
  absenceOpId: string,
): number {
  return steps
    .filter(s => s.orderId === orderId && s.operationId !== absenceOpId && !s.subcontractorId)
    .reduce((sum, s) => sum + s.estimatedDuration, 0);
}

function formatMinutesToHM(minutes: number): string {
  if (minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h00`;
}

const OrdersPage: React.FC = () => {
  const { orders, addOrder, updateOrder, deleteOrder, clients, setOrders, steps, updateStep, productionRecords, holidays, absenceOperationId, absenceOrderId, deliveryEntries } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dragIndices, setDragIndices] = useState<number[] | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Inline editing
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineEdits, setInlineEdits] = useState<Record<string, Partial<Order>>>({});

  // Undo/Redo (page-level)
  const [history, setHistory] = useState<{ orders: Order[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedo = useRef(false);

  useEffect(() => {
    if (isUndoRedo.current) { isUndoRedo.current = false; return; }
    const real = orders.filter(o => o.id !== absenceOrderId);
    if (real.length === 0) return;
    setHistory(prev => {
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push({ orders: real });
      if (newHist.length > 50) newHist.shift();
      return newHist;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [orders]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    isUndoRedo.current = true;
    const prev = history[historyIndex - 1];
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...prev.orders]);
    setHistoryIndex(i => i - 1);
  }, [canUndo, history, historyIndex, orders, absenceOrderId, setOrders]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    isUndoRedo.current = true;
    const next = history[historyIndex + 1];
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...next.orders]);
    setHistoryIndex(i => i + 1);
  }, [canRedo, history, historyIndex, orders, absenceOrderId, setOrders]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const getClientName = useCallback((id: string) => {
    if (!id) return '*******';
    return clients.find(c => c.id === id)?.name || '*******';
  }, [clients]);

  const crMap = useMemo(() => {
    const map = new Map<string, number | null>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      map.set(o.id, computeCR(o, steps, productionRecords, holidays, absenceOperationId));
    });
    return map;
  }, [orders, steps, productionRecords, holidays, absenceOrderId, absenceOperationId]);

  const atelierTimeMap = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      map.set(o.id, computeAtelierTime(o.id, steps, absenceOperationId));
    });
    return map;
  }, [orders, steps, absenceOperationId, absenceOrderId]);

  // Order-level study/material/tooling status (worst case from steps)
  const orderNeedsMap = useMemo(() => {
    const map = new Map<string, { study: boolean; material: boolean; tooling: boolean }>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      const orderSteps = steps.filter(s => s.orderId === o.id && s.operationId !== absenceOperationId);
      if (orderSteps.length === 0) {
        map.set(o.id, { study: o.studyReady, material: o.materialAvailable, tooling: o.toolingAvailable });
        return;
      }
      // If ANY step has it false → order is false (worst case)
      const study = orderSteps.every(s => s.studyReady !== false);
      const material = orderSteps.every(s => s.materialAvailable !== false);
      const tooling = orderSteps.every(s => s.toolingAvailable !== false);
      map.set(o.id, { study, material, tooling });
    });
    return map;
  }, [orders, steps, absenceOrderId, absenceOperationId]);

  // Toggle order-level need and propagate to all steps
  const toggleOrderNeed = useCallback((orderId: string, field: 'study' | 'material' | 'tooling') => {
    const current = orderNeedsMap.get(orderId);
    if (!current) return;
    const newValue = !(current as any)[field];
    
    // Update all steps for this order
    const orderSteps = steps.filter(s => s.orderId === orderId && s.operationId !== absenceOperationId);
    orderSteps.forEach(s => {
      if (field === 'study') updateStep({ ...s, studyReady: newValue, studyDeadline: newValue ? undefined : s.studyDeadline });
      if (field === 'material') updateStep({ ...s, materialAvailable: newValue, materialDeadline: newValue ? undefined : s.materialDeadline });
      if (field === 'tooling') updateStep({ ...s, toolingAvailable: newValue, toolingDeadline: newValue ? undefined : s.toolingDeadline });
    });

    // Also update order-level flags
    const order = orders.find(o => o.id === orderId);
    if (order) {
      if (field === 'study') updateOrder({ ...order, studyReady: newValue });
      if (field === 'material') updateOrder({ ...order, materialAvailable: newValue });
      if (field === 'tooling') updateOrder({ ...order, toolingAvailable: newValue });
    }
  }, [orderNeedsMap, steps, orders, absenceOperationId, updateStep, updateOrder]);

  const autoSortOrders = useCallback((orderList: Order[]): Order[] => {
    return [...orderList].sort((a, b) => {
      // Primary: priority rank
      const pa = priorityRank[a.priority] ?? 5;
      const pb = priorityRank[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;

      // Secondary: latest availability date among study/material/tooling deadlines
      const getLatestAvailDate = (o: Order): string => {
        const orderSteps = steps.filter(s => s.orderId === o.id && s.operationId !== absenceOperationId);
        let latest = '';
        orderSteps.forEach(s => {
          if (s.studyDeadline && s.studyDeadline !== 'warning' && s.studyDeadline !== 'pending' && s.studyDeadline > latest) latest = s.studyDeadline;
          if (s.materialDeadline && s.materialDeadline !== 'warning' && s.materialDeadline !== 'pending' && s.materialDeadline > latest) latest = s.materialDeadline;
          if (s.toolingDeadline && s.toolingDeadline !== 'warning' && s.toolingDeadline !== 'pending' && s.toolingDeadline > latest) latest = s.toolingDeadline;
        });
        return latest || '0000-00-00'; // no deadline = available now = sort first
      };

      const da = getLatestAvailDate(a);
      const db = getLatestAvailDate(b);
      return da.localeCompare(db);
    });
  }, [steps, absenceOperationId]);

  // Sort by displayOrder ascending (playlist style)
  // IDs of orders that have been delivered (conforme / conforme-derogation)
  const deliveredOrderIds = useMemo(() => new Set(deliveryEntries.map(de => de.orderId)), [deliveryEntries]);

  const baseSorted = useMemo(() => {
    const real = orders.filter(o => o.id !== absenceOrderId && !deliveredOrderIds.has(o.id));
    return [...real].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
  }, [orders, absenceOrderId, deliveredOrderIds]);

  // Track if order has been validated (saved to DB)
  const [orderValidated, setOrderValidated] = useState(true);

  // On first load, reindex if needed
  useEffect(() => {
    const real = orders.filter(o => o.id !== absenceOrderId);
    if (real.length === 0) return;
    const sorted = [...real].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
    const needsReindex = sorted.some((o, i) => o.displayOrder !== i + 1);
    if (needsReindex) {
      const absence = orders.find(o => o.id === absenceOrderId);
      setOrders([...(absence ? [absence] : []), ...sorted.map((o, i) => ({ ...o, displayOrder: i + 1 }))]);
    }
  }, []);

  // Auto-sort and apply when clicking "Trier auto"
  const handleAutoSort = useCallback(() => {
    const real = orders.filter(o => o.id !== absenceOrderId);
    const sorted = autoSortOrders(real).map((o, i) => ({ ...o, displayOrder: i + 1 }));
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...sorted]);
    setOrderValidated(false);
  }, [orders, absenceOrderId, autoSortOrders, setOrders]);

  // Validate: persist order to DB
  const handleValidateOrder = useCallback(() => {
    const real = orders.filter(o => o.id !== absenceOrderId);
    const absence = orders.find(o => o.id === absenceOrderId);
    const reindexed = real.sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999)).map((o, i) => ({ ...o, displayOrder: i + 1 }));
    setOrders([...(absence ? [absence] : []), ...reindexed]);
    setOrderValidated(true);
  }, [orders, absenceOrderId, setOrders]);

  const getColValue = useCallback((o: Order, key: ColumnKey): string => {
    switch (key) {
      case 'orderNumber': return o.orderNumber;
      case 'orderDate': return o.orderDate;
      case 'client': return getClientName(o.clientId);
      case 'designation': return o.designation;
      case 'quantity': return String(o.quantity);
      case 'priority': return o.priority || '';
      case 'deliveryDeadline': return o.deliveryDeadline || o.plannedDeadline;
      case 'cr': { const cr = crMap.get(o.id); return cr != null ? cr.toFixed(2) : ''; }
      case 'atelierTime': return String(atelierTimeMap.get(o.id) || 0);
      case 'study': { const n = orderNeedsMap.get(o.id); return n?.study ? '1' : '0'; }
      case 'material': { const n = orderNeedsMap.get(o.id); return n?.material ? '1' : '0'; }
      case 'tooling': { const n = orderNeedsMap.get(o.id); return n?.tooling ? '1' : '0'; }
      case 'observation': return o.observation || '';
      default: return '';
    }
  }, [getClientName, crMap, atelierTimeMap, orderNeedsMap]);

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
        if (sortKey === 'quantity' || sortKey === 'cr' || sortKey === 'atelierTime') {
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
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === displayOrders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayOrders.map(o => o.id)));
  };

  // ---- Bulk move by Cn (saves only on Valider) ----
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetCn, setMoveTargetCn] = useState<string>('');

  const openMoveDialog = (extraId?: string) => {
    const ids = new Set(selectedIds);
    if (extraId) ids.add(extraId);
    if (ids.size === 0) return;
    if (extraId && !selectedIds.has(extraId)) setSelectedIds(ids);
    const selectedSorted = baseSorted.filter(o => ids.has(o.id));
    const minCn = Math.min(...selectedSorted.map(o => o.displayOrder ?? 9999));
    setMoveTargetCn(String(minCn));
    setMoveDialogOpen(true);
  };

  const applyMoveSelection = () => {
    const target = parseInt(moveTargetCn, 10);
    if (!target || target < 1) return;
    const selectedItems = baseSorted.filter(o => selectedIds.has(o.id));
    if (selectedItems.length === 0) { setMoveDialogOpen(false); return; }
    const remaining = baseSorted.filter(o => !selectedIds.has(o.id));
    const insertAt = Math.min(Math.max(0, target - 1), remaining.length);
    const newList = [...remaining.slice(0, insertAt), ...selectedItems, ...remaining.slice(insertAt)];
    const reindexed = newList.map((o, i) => ({ ...o, displayOrder: i + 1 }));
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...reindexed]);
    setOrderValidated(false);
    setMoveDialogOpen(false);
    setSelectedIds(new Set());
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

  const handleExcelImport = (imported: Omit<Order, 'id'>[]) => {
    imported.forEach((o) => addOrder({ id: crypto.randomUUID(), ...o } as Order));
    setOrderValidated(false);
  };

  // Inline edit helpers
  const getInlineValue = (o: Order, field: keyof Order) => {
    return inlineEdits[o.id]?.[field] ?? o[field];
  };
  const setInlineValue = (id: string, field: keyof Order, value: any) => {
    setInlineEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const saveInlineEdits = (id: string) => {
    const changes = inlineEdits[id];
    const order = orders.find(o => o.id === id);
    if (order && changes && Object.keys(changes).length > 0) {
      updateOrder({ ...order, ...changes });
    }
    setInlineEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingRowId(null);
  };
  const cancelInlineEdits = (id: string) => {
    setInlineEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingRowId(null);
  };

  // Drag & drop — playlist-style reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    const orderId = displayOrders[index].id;
    if (selectedIds.has(orderId) && selectedIds.size > 1) {
      const indices = displayOrders.map((o, i) => selectedIds.has(o.id) ? i : -1).filter(i => i >= 0);
      setDragIndices(indices);
    } else { setDragIndices([index]); }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIndex(index); };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (!dragIndices || dragIndices.length === 0) { setDragIndices(null); setDragOverIndex(null); return; }
    if (sortKey || Object.values(filters).some(v => v)) { setDragIndices(null); setDragOverIndex(null); return; }
    const items = [...baseSorted];
    const draggedItems = dragIndices.map(i => items[i]).filter(Boolean);
    const remaining = items.filter(o => !draggedItems.some(d => d.id === o.id));
    let insertAt = dropIndex - dragIndices.filter(i => i < dropIndex).length;
    if (insertAt < 0) insertAt = 0;
    remaining.splice(insertAt, 0, ...draggedItems);
    // Reindex all orders 1, 2, 3, ... and freeze dragged items
    const absence = orders.find(o => o.id === absenceOrderId);
    const reindexed = remaining.map((o, i) => ({
      ...o,
      displayOrder: i + 1,
      frozenOrder: draggedItems.some(d => d.id === o.id) ? true : o.frozenOrder,
    }));
    setOrders([...(absence ? [absence] : []), ...reindexed]);
    setDragIndices(null); setDragOverIndex(null);
    setOrderValidated(false);
  };
  const handleDragEnd = () => { setDragIndices(null); setDragOverIndex(null); };
  const isDragging = (index: number) => dragIndices?.includes(index) ?? false;
  const hasActiveFilters = sortKey !== null || Object.values(filters).some(v => v);

  const unlockOrder = (o: Order) => updateOrder({ ...o, frozenOrder: false });
  const unlockAll = () => {
    const absence = orders.find(o => o.id === absenceOrderId);
    const real = orders.filter(o => o.id !== absenceOrderId).map(o => ({ ...o, frozenOrder: false }));
    setOrders([...(absence ? [absence] : []), ...real]);
  };

  const hasFrozenOrders = orders.some(o => o.id !== absenceOrderId && o.frozenOrder);

  const columns: { key: ColumnKey; label: string; className?: string }[] = [
    { key: 'orderNumber', label: 'N° Cmd', className: 'w-[90px]' },
    { key: 'orderDate', label: 'Date', className: 'w-[80px]' },
    { key: 'client', label: 'Client', className: 'w-[100px]' },
    { key: 'designation', label: 'Désignation', className: 'max-w-[120px]' },
    { key: 'quantity', label: 'Qté', className: 'w-[50px]' },
    { key: 'priority', label: 'Priorité', className: 'w-[70px]' },
    { key: 'deliveryDeadline', label: 'Délai', className: 'w-[85px]' },
    { key: 'cr', label: 'CR', className: 'w-[50px]' },
    { key: 'atelierTime', label: 'T. Atelier', className: 'w-[70px]' },
    { key: 'study', label: 'Ét.', className: 'w-[35px]' },
    { key: 'material', label: 'Mat.', className: 'w-[35px]' },
    { key: 'tooling', label: 'Out.', className: 'w-[35px]' },
    { key: 'observation', label: 'Observation', className: 'w-[170px]' },
  ];

  const formatCR = (orderId: string) => {
    const cr = crMap.get(orderId);
    if (cr == null) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="w-4 h-4 text-destructive" />
            </TooltipTrigger>
            <TooltipContent>Indéfini — aucune étape planifiée</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    const color = cr >= 2 ? 'text-urgent' : cr >= 1 ? 'text-urgent-moderate' : 'text-normal';
    return <span className={`text-xs font-bold ${color}`}>{cr.toFixed(2)}</span>;
  };

  const renderCell = (o: Order, col: ColumnKey, index: number) => {
    const isEditing = editingRowId === o.id;
    const editableFields: ColumnKey[] = ['orderNumber', 'designation', 'quantity', 'priority', 'observation', 'deliveryDeadline', 'client'];
    if (isEditing && editableFields.includes(col)) {
      if (col === 'client') {
        return (
          <Select
            value={(getInlineValue(o, 'clientId') as string) || o.clientId}
            onValueChange={val => setInlineValue(o.id, 'clientId', val)}
          >
            <SelectTrigger className="h-7 text-xs w-full" onClick={e => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      if (col === 'priority') {
        return (
          <select
            className="w-full rounded-md border border-input bg-background px-1 py-1 text-xs"
            value={(getInlineValue(o, 'priority') as string) || o.priority}
            onChange={e => setInlineValue(o.id, 'priority', e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            {Object.entries(priorityConfig).map(([k]) => <option key={k} value={k}>{k}</option>)}
          </select>
        );
      }
      if (col === 'quantity') {
        return (
          <Input type="number" min={1} className="h-7 w-16 text-xs"
            value={getInlineValue(o, 'quantity') as number}
            onChange={e => setInlineValue(o.id, 'quantity', parseInt(e.target.value) || 1)}
            onClick={e => e.stopPropagation()} />
        );
      }
      if (col === 'observation') {
        return (
          <Input className="h-7 text-xs min-w-[100px]"
            value={(getInlineValue(o, 'observation') as string) || ''}
            onChange={e => setInlineValue(o.id, 'observation', e.target.value)}
            onClick={e => e.stopPropagation()}
            placeholder="Note..." />
        );
      }
      if (col === 'deliveryDeadline') {
        return (
          <Input type="date" className="h-7 text-xs"
            value={(getInlineValue(o, 'deliveryDeadline') as string) || o.deliveryDeadline || o.plannedDeadline}
            onChange={e => setInlineValue(o.id, 'deliveryDeadline', e.target.value)}
            onClick={e => e.stopPropagation()} />
        );
      }
      if (col === 'orderNumber' || col === 'designation') {
        return (
          <Input className="h-7 text-xs"
            value={(getInlineValue(o, col) as string) || ''}
            onChange={e => setInlineValue(o.id, col, e.target.value)}
            onClick={e => e.stopPropagation()} />
        );
      }
    }

    // Read-only display
    switch (col) {
      case 'orderNumber': return <span className="font-heading text-xs">{o.orderNumber}</span>;
      case 'orderDate': return <span className="text-xs">{formatDateFR(o.orderDate)}</span>;
      case 'client': return <span className="text-xs">{getClientName(o.clientId)}</span>;
      case 'designation': return <span className="text-xs truncate block">{o.designation}</span>;
      case 'quantity': return <span className="text-xs">{o.quantity}</span>;
      case 'priority': return <Badge className={`${priorityColors[o.priority]} text-xs`}>{o.priority}</Badge>;
      case 'deliveryDeadline': return <span className="text-xs">{formatDateFR(o.deliveryDeadline || o.plannedDeadline)}</span>;
      case 'cr': return formatCR(o.id);
      case 'atelierTime': {
        const mins = atelierTimeMap.get(o.id) || 0;
        return <span className="text-xs font-medium">{formatMinutesToHM(mins)}</span>;
      }
      case 'study': {
        const needs = orderNeedsMap.get(o.id);
        const available = needs?.study ?? true;
        return (
          <span className="text-sm cursor-pointer select-none" onClick={() => toggleOrderNeed(o.id, 'study')} title="Cliquer pour changer">
            {available ? '🟢' : '🔴'}
          </span>
        );
      }
      case 'material': {
        const needs = orderNeedsMap.get(o.id);
        const available = needs?.material ?? true;
        return (
          <span className="text-sm cursor-pointer select-none" onClick={() => toggleOrderNeed(o.id, 'material')} title="Cliquer pour changer">
            {available ? '🟢' : '🔴'}
          </span>
        );
      }
      case 'tooling': {
        const needs = orderNeedsMap.get(o.id);
        const available = needs?.tooling ?? true;
        return (
          <span className="text-sm cursor-pointer select-none" onClick={() => toggleOrderNeed(o.id, 'tooling')} title="Cliquer pour changer">
            {available ? '🟢' : '🔴'}
          </span>
        );
      }
      case 'observation': return <span className="text-xs text-muted-foreground max-w-[170px] truncate block">{o.observation || '—'}</span>;
      default: return null;
    }
  };

  // Compute last order numbers for each series (F, P, numeric) — priorité à l'année (après /), puis au numéro (avant /)
  const lastSeriesNumbers = useMemo(() => {
    // Returns [year, num] or null
    const parse = (on: string, prefix: 'F' | 'P' | '') => {
      const re = prefix
        ? new RegExp(`^${prefix}(\\d+)\\s*/\\s*(\\d+)`, 'i')
        : /^(\d+)\s*\/\s*(\d+)/;
      const m = on.match(re);
      if (!m) return null;
      return { num: parseInt(m[1], 10), year: parseInt(m[2], 10) };
    };
    const isBetter = (a: { num: number; year: number }, b: { num: number; year: number } | null) => {
      if (!b) return true;
      if (a.year !== b.year) return a.year > b.year;
      return a.num > b.num;
    };
    const allOrders = orders.filter(o => o.orderNumber !== 'ABS');
    let lastF = '', lastP = '', lastNum = '';
    let bestF: { num: number; year: number } | null = null;
    let bestP: { num: number; year: number } | null = null;
    let bestN: { num: number; year: number } | null = null;
    for (const o of allOrders) {
      const on = o.orderNumber.trim();
      if (/^F\d/i.test(on)) {
        const p = parse(on, 'F');
        if (p && isBetter(p, bestF)) { bestF = p; lastF = on; }
      } else if (/^P\d/i.test(on)) {
        const p = parse(on, 'P');
        if (p && isBetter(p, bestP)) { bestP = p; lastP = on; }
      } else if (/^\d/.test(on)) {
        const p = parse(on, '');
        if (p && isBetter(p, bestN)) { bestN = p; lastNum = on; }
      }
    }
    return { lastF, lastP, lastNum };
  }, [orders]);

  return (
    <div className="p-6">
      <PageHeader title="Commandes en cours" description={
        <div className="flex items-center gap-3">
          <span>{displayOrders.length} commande(s)</span>
          {lastSeriesNumbers.lastF && (
            <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
              {lastSeriesNumbers.lastF}
            </span>
          )}
          {lastSeriesNumbers.lastP && (
            <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
              {lastSeriesNumbers.lastP}
            </span>
          )}
          {lastSeriesNumbers.lastNum && (
            <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
              {lastSeriesNumbers.lastNum}
            </span>
          )}
        </div>
      } actions={
        <div className="flex gap-2 items-center">
          <Button onClick={undo} variant="outline" size="icon" disabled={!canUndo} title="Annuler (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button onClick={redo} variant="outline" size="icon" disabled={!canRedo} title="Rétablir (Ctrl+Y)">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button onClick={handleAutoSort} variant="outline" size="sm" title="Trier par priorité puis disponibilité">
            Trier auto
          </Button>
          {selectedIds.size > 0 && (
            <Button onClick={() => openMoveDialog()} variant="outline" size="sm" title="Déplacer la sélection à une position Cn">
              <MoveVertical className="w-4 h-4 mr-1" /> Déplacer ({selectedIds.size})
            </Button>
          )}
          <Button onClick={handleValidateOrder} size="sm" disabled={orderValidated} className={!orderValidated ? 'animate-pulse bg-primary' : ''} title="Valider l'ordre et le figer en base">
            ✓ Valider
          </Button>
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
              <TableHead className="w-8 px-1">
                <Checkbox checked={selectedIds.size === displayOrders.length && displayOrders.length > 0} onCheckedChange={toggleSelectAll} />
              </TableHead>
              <TableHead className="w-14 text-center text-xs px-1">Ordre</TableHead>
              {columns.map(col => (
                <TableHead key={col.key} className={col.className}>
                  <ColumnHeader label={col.label} columnKey={col.key} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters[col.key] || ''} onFilter={handleFilter} />
                </TableHead>
              ))}
              <TableHead className="w-24 text-xs px-1">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayOrders.map((o, index) => {
              const isRowEditing = editingRowId === o.id;
              return (
              <ContextMenu key={o.id}>
                <ContextMenuTrigger asChild>
                  <TableRow
                    draggable={!hasActiveFilters && !isRowEditing}
                    onDragStart={e => handleDragStart(e, index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={e => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`transition-colors ${
                      !hasActiveFilters && !isRowEditing ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${dragOverIndex === index ? 'bg-accent/50 border-t-2 border-accent' : ''
                    } ${isDragging(index) ? 'opacity-40' : ''
                    } ${selectedIds.has(o.id) ? 'bg-primary/5' : ''
                    } ${isRowEditing ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
                  >
                    <TableCell className="px-1" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelect(o.id)} />
                    </TableCell>
                    <TableCell className="text-center px-1">
                      <div className="flex items-center justify-center gap-0.5">
                        {!hasActiveFilters && !isRowEditing && <GripVertical className="w-3 h-3 text-muted-foreground" />}
                        {o.frozenOrder && <Lock className="w-3 h-3 text-primary" />}
                        <span className="text-xs font-medium text-muted-foreground">{o.displayOrder ?? index + 1}</span>
                      </div>
                    </TableCell>
                    {columns.map(col => (
                      <TableCell key={col.key} className="py-1.5 px-2">{renderCell(o, col.key, index)}</TableCell>
                    ))}
                    <TableCell className="px-1">
                      <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                        {o.frozenOrder && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => unlockOrder(o)} title="Libérer">
                            <Unlock className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPlanningOrder(o)} title="Affectations">
                          <CalendarCheck className="w-3.5 h-3.5" />
                        </Button>
                        {isRowEditing ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveInlineEdits(o.id)} title="Enregistrer">
                              <span className="text-normal text-sm font-bold">✓</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cancelInlineEdits(o.id)} title="Annuler">
                              <span className="text-destructive text-sm font-bold">✕</span>
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRowId(o.id); setInlineEdits(prev => ({ ...prev, [o.id]: {} })); }} title="Éditer sur la ligne">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirm('Êtes-vous sûr de vouloir supprimer cette commande ?', () => deleteOrder(o.id), { variant: 'destructive' })}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => openMoveDialog(o.id)}>
                    <MoveVertical className="w-4 h-4 mr-2" />
                    Déplacer la sélection {selectedIds.size > 0 ? `(${selectedIds.has(o.id) ? selectedIds.size : selectedIds.size + 1})` : '(1)'}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => setPlanningOrder(o)}>
                    <ListPlus className="w-4 h-4 mr-2" />
                    Étape suivante
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              );
            })}
            {displayOrders.length === 0 && (
              <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">Aucune commande.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
              <Select value={form.clientId} onValueChange={val => updateForm('clientId', val)}>
                <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">Observation</label>
              <Input value={form.observation || ''} onChange={e => updateForm('observation', e.target.value)} placeholder="Note d'information..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.orderNumber || !form.designation}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Paste Dialog */}
      <ExcelPasteDialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen} onImport={handleExcelImport} clients={clients} nextDisplayOrder={baseSorted.length + 1} />

      {planningOrder && (
        <OrderPlanningDialog order={planningOrder} open={!!planningOrder} onOpenChange={(open) => { if (!open) setPlanningOrder(null); }} />
      )}
      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />

      {/* Move selection by Cn dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">Déplacer la sélection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedIds.size} commande(s) sélectionnée(s). Saisissez la nouvelle position (C<sub>n</sub>) à laquelle placer la première commande de la sélection. Les suivantes prendront C<sub>n</sub>+1, C<sub>n</sub>+2, … et le reste sera décalé automatiquement.
            </p>
            <div>
              <label className="text-xs font-medium mb-1 block">Position cible (Cn)</label>
              <Input
                type="number"
                min={1}
                max={baseSorted.length}
                value={moveTargetCn}
                onChange={e => setMoveTargetCn(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') applyMoveSelection(); }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Plage valide : 1 – {baseSorted.length}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Annuler</Button>
            <Button onClick={applyMoveSelection} disabled={!moveTargetCn || parseInt(moveTargetCn, 10) < 1}>Déplacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
