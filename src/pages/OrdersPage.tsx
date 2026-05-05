import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { formatDateFR, formatDateTimeFR } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, GripVertical, ClipboardPaste, Lock, Unlock, CalendarCheck, Undo2, Redo2, MoveVertical, ListPlus, Download, Printer, Ban } from 'lucide-react';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import { useCancelOrder } from '@/hooks/useCancelOrder';
import { WarningTriangleIcon } from '@/components/icons/StatusIcons';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import type { Order, OrderPriority } from '@/types/planning';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import ExcelPasteDialog from '@/components/orders/ExcelPasteDialog';
import PrintTrackingSheetDialog from '@/components/PrintTrackingSheetDialog';
import OrderTrackingSheet from '@/components/OrderTrackingSheet';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import ResourceStatusPill from '@/components/ResourceStatusPill';
import DatePromptDialog from '@/components/DatePromptDialog';
import type { ResourceStatus } from '@/types/planning';
import { isOrderBlocked, BLOCKED_TABLE_ROW_CLASS } from '@/lib/blockedSteps';
import { getOrderGlobalStatus, getOrderStepStatusDetails, type OrderGlobalStatus } from '@/lib/stepProgress';
import { dbUpdateOrder, dbUpdateStep } from '@/lib/supabase-data';
import { getExportFilename } from '@/lib/excelExport';
import * as XLSX from 'xlsx';

const priorityConfig: Record<OrderPriority | 'undetermined', { label: string; description: string; color: string; border: string }> = {
  'P1': { label: 'P1 - مستعجل-أولوية قصوى', description: 'Commandes urgentes, très important pour facturation.', color: 'text-urgent', border: 'border-urgent/30' },
  'P2': { label: 'P2 - مستعجل نسبيا - أولوية متوسطة', description: 'Urgence modérée, livraison 1-3 semaines.', color: 'text-urgent-moderate', border: 'border-urgent-moderate/30' },
  'P3': { label: 'P3 - غير مستعجل - أقل أولوية', description: 'Commandes pas urgentes, délai ouvert.', color: 'text-priority-p3', border: 'border-priority-p3/30' },
  'P4': { label: 'P4 - قيد التعليق', description: 'Attente validation technique ou autre.', color: 'text-priority-p4', border: 'border-priority-p4/30' },
  'undetermined': { label: 'À déterminer plus tard', description: 'Priorité non définie, sera déterminée ultérieurement.', color: 'text-yellow-600', border: 'border-yellow-400/30' },
};
const priorityRank: Record<OrderPriority | 'undetermined', number> = { P1: 0, P2: 1, P3: 2, P4: 3, undetermined: 4 };

type ColumnKey = 'displayOrder' | 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'deliveryDeadline' | 'clientRepresentative' | 'instructions' | 'drawingModel' | 'globalStatus' | 'atelierTime' | 'remainingSteps' | 'study' | 'material' | 'tooling' | 'observation';

const globalStatusClass: Record<OrderGlobalStatus, string> = {
  'En attente': 'border-muted-foreground/30 bg-muted text-muted-foreground',
  'En cours': 'border-accent/30 bg-accent/10 text-accent',
  'Terminée': 'border-primary/30 bg-primary/10 text-primary',
};

const globalStatusLabel: Record<OrderGlobalStatus, string> = {
  'En attente': 'قيد الانتظار',
  'En cours': 'قيد الإنجاز',
  'Terminée': 'جاهزة',
};

function GlobalStatusBadge({ status }: { status: OrderGlobalStatus }) {
  return <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${globalStatusClass[status]}`}>{globalStatusLabel[status]}</span>;
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
  const { orders, addOrder, updateOrder, deleteOrder, clients, setOrders, steps, updateStep, absenceOperationId, absenceOrderId, deliveryEntries, deliveredOrders, qcEntries, productionRecords, cancelledOrders } = usePlanning();
  const cancelOrder = useCancelOrder();
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [orderNumberError, setOrderNumberError] = useState('');
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

  const atelierTimeMap = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      map.set(o.id, computeAtelierTime(o.id, steps, absenceOperationId));
    });
    return map;
  }, [orders, steps, absenceOperationId, absenceOrderId]);

  const orderStatusMap = useMemo(() => {
    const map = new Map<string, { study: ResourceStatus; material: ResourceStatus; tooling: ResourceStatus }>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      map.set(o.id, {
        study: o.studyStatus ?? 'non-disponible',
        material: o.materialStatus ?? 'non-disponible',
        tooling: o.toolingStatus ?? 'non-disponible',
      });
    });
    return map;
  }, [orders, absenceOrderId]);

  // Date prompt for red/orange transitions
  const [statusDatePrompt, setStatusDatePrompt] = useState<{ orderId: string; field: 'study' | 'material' | 'tooling'; status: ResourceStatus; label: string } | null>(null);
  const [pendingMaterialStatus, setPendingMaterialStatus] = useState<{ orderId: string; status: ResourceStatus } | null>(null);
  const [materialConfirmOpen, setMaterialConfirmOpen] = useState(false);
  const [materialDatePromptOpen, setMaterialDatePromptOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const applyStatusToOrderAndSteps = useCallback(async (orderId: string, field: 'study' | 'material' | 'tooling', status: ResourceStatus, deadline?: string, receivedDate?: string) => {
    const statusKey = `${field}Status` as 'studyStatus' | 'materialStatus' | 'toolingStatus';
    const boolKey = field === 'study' ? 'studyReady' : field === 'material' ? 'materialAvailable' : 'toolingAvailable';
    const deadlineKey = `${field}Deadline` as 'studyDeadline' | 'materialDeadline' | 'toolingDeadline';
    const isAvail = status === 'disponible';

    const orderSteps = steps.filter(s => s.orderId === orderId && s.operationId !== absenceOperationId);
    const updatedSteps = orderSteps.map(s => ({
        ...s,
        [statusKey]: status,
        [boolKey]: isAvail,
        [deadlineKey]: deadline || undefined,
      } as any));

    const order = orders.find(o => o.id === orderId);
    if (!order) return false;
    const updatedOrder = {
      ...order,
      [statusKey]: status,
      [boolKey]: isAvail,
      ...(field === 'material' ? { materialReceivedDate: isAvail ? receivedDate : undefined } : {}),
    } as any;

    const saved = await Promise.all([...updatedSteps.map(dbUpdateStep), dbUpdateOrder(updatedOrder)]);
    if (saved.some(ok => !ok)) return false;

    updatedSteps.forEach(updateStep);
    updateOrder(updatedOrder);
    return true;
  }, [steps, orders, absenceOperationId, updateStep, updateOrder]);

  const handleStatusChange = useCallback((orderId: string, field: 'study' | 'material' | 'tooling', status: ResourceStatus) => {
    if (status === 'non-disponible' || status === 'partiel') {
      const labels = {
        study: 'Date prévue pour fin Étude',
        material: 'Date prévue pour disponibilité Matière',
        tooling: 'Date prévue pour disponibilité Outillage',
      };
      setStatusDatePrompt({ orderId, field, status, label: labels[field] });
    } else if (field === 'material' && status === 'disponible') {
      setPendingMaterialStatus({ orderId, status });
      setMaterialDatePromptOpen(false);
      setMaterialConfirmOpen(true);
    } else {
      applyStatusToOrderAndSteps(orderId, field, status);
    }
  }, [applyStatusToOrderAndSteps]);

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
  // IDs of orders that have left the active workshop list:
  // - in delivery_entries (ready for delivery), OR
  // - in delivered_orders (already delivered)
  // Both must be excluded — otherwise an order delivered to the client
  // (which removes its delivery_entries row) would resurface in الطلبيات الحالية.
  const deliveredOrderIds = useMemo(() => {
    const ids = new Set<string>();
    deliveryEntries.forEach(de => ids.add(de.orderId));
    deliveredOrders.forEach(d => ids.add(d.orderId));
    cancelledOrders.forEach(c => ids.add(c.orderId));
    return ids;
  }, [deliveryEntries, deliveredOrders, cancelledOrders]);
  // QC orders awaiting validation: still visible in الطلبيات الحالية with a "pending QC" indicator.
  // They only leave this list once QC decision moves them to delivery (deliveredOrderIds).
  const pendingQcOrderIds = useMemo(() => {
    const ids = new Set<string>();
    qcEntries.forEach(entry => {
      if (!entry.decision || (entry.decision !== 'conforme' && entry.decision !== 'conforme-derogation')) {
        ids.add(entry.orderId);
      }
    });
    return ids;
  }, [qcEntries]);
  // Reintegrated orders coming back from delivery (rework / non-conforme).
  // Highlighted as urgent retouches.
  const reworkOrderIds = useMemo(() => {
    const ids = new Set<string>();
    qcEntries.forEach(entry => {
      if (entry.decision === 'reprise-retouche' || entry.decision === 'non-conforme') {
        ids.add(entry.orderId);
      }
    });
    return ids;
  }, [qcEntries]);

  const baseSorted = useMemo(() => {
    const real = orders.filter(o => o.id !== absenceOrderId && !deliveredOrderIds.has(o.id));
    return [...real].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
  }, [orders, absenceOrderId, deliveredOrderIds]);

  // Track if order has been validated (saved to DB)
  const [orderValidated, setOrderValidated] = useState(true);

  // ──────────────── Sanitization & Auto-reindex ────────────────
  // Keeps displayOrder strictly continuous (1..N) over the VISIBLE active list
  // (excludes absence + delivered orders only). QC-pending orders STAY in the
  // active list so the workshop dashboard reflects everything physically present.
  // Locked orders (frozenOrder) keep their relative position but slide up to
  // close gaps — the lock pins the slot, not the absolute number.
  useEffect(() => {
    const visible = orders
      .filter(o => o.id !== absenceOrderId && !deliveredOrderIds.has(o.id))
      .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
    if (visible.length === 0) return;

    // Out-of-flow = delivered only. They get displayOrder = undefined so they
    // no longer occupy a slot in the active sequence.
    const outOfFlow = orders.filter(o =>
      o.id !== absenceOrderId && deliveredOrderIds.has(o.id)
    );

    const needsReindex =
      visible.some((o, i) => o.displayOrder !== i + 1) ||
      outOfFlow.some(o => o.displayOrder != null);

    if (!needsReindex) return;

    const absence = orders.find(o => o.id === absenceOrderId);
    const reindexedVisible = visible.map((o, i) => ({ ...o, displayOrder: i + 1 }));
    const clearedOutOfFlow = outOfFlow.map(o => ({ ...o, displayOrder: undefined }));
    setOrders([
      ...(absence ? [absence] : []),
      ...reindexedVisible,
      ...clearedOutOfFlow,
    ]);
  }, [orders, absenceOrderId, deliveredOrderIds, setOrders]);

  // Auto-sort and apply when clicking "Trier auto"
  const handleAutoSort = useCallback(() => {
    const visible = orders.filter(o =>
      o.id !== absenceOrderId && !deliveredOrderIds.has(o.id)
    );
    const outOfFlow = orders.filter(o =>
      o.id !== absenceOrderId && deliveredOrderIds.has(o.id)
    ).map(o => ({ ...o, displayOrder: undefined }));
    const sorted = autoSortOrders(visible).map((o, i) => ({ ...o, displayOrder: i + 1 }));
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...sorted, ...outOfFlow]);
    setOrderValidated(false);
  }, [orders, absenceOrderId, deliveredOrderIds, autoSortOrders, setOrders]);

  // Validate: persist order to DB
  const handleValidateOrder = useCallback(() => {
    const visible = orders
      .filter(o => o.id !== absenceOrderId && !deliveredOrderIds.has(o.id))
      .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999))
      .map((o, i) => ({ ...o, displayOrder: i + 1 }));
    const outOfFlow = orders.filter(o =>
      o.id !== absenceOrderId && deliveredOrderIds.has(o.id)
    ).map(o => ({ ...o, displayOrder: undefined }));
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...visible, ...outOfFlow]);
    setOrderValidated(true);
  }, [orders, absenceOrderId, deliveredOrderIds, setOrders]);

  const getColValue = useCallback((o: Order, key: ColumnKey): string => {
    switch (key) {
      case 'displayOrder': return String(o.displayOrder ?? '');
      case 'orderNumber': return o.orderNumber;
      case 'orderDate': return o.orderDate;
      case 'client': return getClientName(o.clientId);
      case 'designation': return o.designation;
      case 'quantity': return String(o.quantity);
      case 'priority': return o.priority || '';
      case 'globalStatus': return globalStatusLabel[getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId)];
      case 'deliveryDeadline': return o.deliveryDeadline || o.plannedDeadline;
      case 'clientRepresentative': return o.clientRepresentative || '';
      case 'instructions': return o.instructions || '';
      case 'drawingModel': return o.drawingModel || '';
      case 'atelierTime': return String(atelierTimeMap.get(o.id) || 0);
      case 'study': { const n = orderStatusMap.get(o.id); return n?.study === 'disponible' ? '3' : n?.study === 'partiel' ? '2' : n?.study === 'non-applicable' ? '0' : '1'; }
      case 'material': { const n = orderStatusMap.get(o.id); return n?.material === 'disponible' ? '3' : n?.material === 'partiel' ? '2' : n?.material === 'non-applicable' ? '0' : '1'; }
      case 'tooling': { const n = orderStatusMap.get(o.id); return n?.tooling === 'disponible' ? '3' : n?.tooling === 'partiel' ? '2' : n?.tooling === 'non-applicable' ? '0' : '1'; }
      case 'observation': return o.observation || '';
      default: return '';
    }
  }, [getClientName, atelierTimeMap, orderStatusMap, steps, productionRecords, absenceOperationId]);

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
        if (sortKey === 'quantity' || sortKey === 'atelierTime') {
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
    const selectedIdSet = new Set(selectedItems.map(s => s.id));
    const reindexed = newList.map((o, i) => ({
      ...o,
      displayOrder: i + 1,
      frozenOrder: selectedIdSet.has(o.id) ? true : o.frozenOrder,
    }));
    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...reindexed]);
    setOrderValidated(false);
    setMoveDialogOpen(false);
    setSelectedIds(new Set());
  };

  const emptyOrder = (): Omit<Order, 'id'> => ({
    orderNumber: '', orderDate: new Date().toISOString().split('T')[0], clientId: clients[0]?.id || '',
    designation: '', quantity: 1, priority: 'undetermined', plannedDeadline: '',
    materialAvailable: false, toolingAvailable: false, studyReady: false,
    materialStatus: 'non-disponible', toolingStatus: 'non-disponible', studyStatus: 'non-disponible',
    displayOrder: baseSorted.length + 1,
  });
  const [form, setForm] = useState<Omit<Order, 'id'>>(emptyOrder());

  const normalizeOrderNumber = (value: string) => value.trim().toLowerCase();
  const duplicateOrderError = 'Erreur : Ce numéro de commande existe déjà. Veuillez utiliser un identifiant unique.';
  const isDuplicateOrderNumber = useCallback((value: string, currentId?: string) => {
    const normalized = normalizeOrderNumber(value);
    if (!normalized) return false;
    return orders.some(o => o.id !== absenceOrderId && o.id !== currentId && normalizeOrderNumber(o.orderNumber) === normalized);
  }, [orders, absenceOrderId]);

  const openNew = () => { setOrderNumberError(''); setEditing(null); setForm(emptyOrder()); setDialogOpen(true); };
  const openEdit = (o: Order) => { setOrderNumberError(''); setEditing(o); const { id, ...rest } = o; setForm(rest); setDialogOpen(true); };
  const handleSave = () => {
    if (isDuplicateOrderNumber(form.orderNumber, editing?.id)) {
      setOrderNumberError(duplicateOrderError);
      return;
    }
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
      const nextOrderNumber = typeof changes.orderNumber === 'string' ? changes.orderNumber : order.orderNumber;
      if (isDuplicateOrderNumber(nextOrderNumber, id)) {
        setOrderNumberError(duplicateOrderError);
        return;
      }
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
    { key: 'orderNumber', label: 'رقم الطلبية', className: 'w-[90px]' },
    { key: 'orderDate', label: 'التاريخ', className: 'w-[80px]' },
    { key: 'client', label: 'الزبون', className: 'w-[100px]' },
    { key: 'designation', label: 'التعيين', className: 'w-[180px] min-w-[180px] max-w-[180px]' },
    { key: 'quantity', label: 'الكمية', className: 'w-[50px]' },
    { key: 'priority', label: 'الأولوية', className: 'w-[70px]' },
    { key: 'instructions', label: 'ملاحظات تعليمات', className: 'w-[180px]' },
    { key: 'observation', label: 'ملاحظات', className: 'w-[340px]' },
    { key: 'globalStatus', label: 'الحالة', className: 'w-[105px] min-w-[105px]' },
    { key: 'study', label: 'دراسة', className: 'w-[35px]' },
    { key: 'material', label: 'مواد أولية', className: 'w-[35px]' },
    { key: 'tooling', label: 'عدة', className: 'w-[35px]' },
    { key: 'atelierTime', label: 'وقت في الورشة', className: 'w-[70px]' },
    { key: 'remainingSteps', label: 'عدد المراحل المتبقية', className: 'w-[80px]' },
    { key: 'drawingModel', label: 'مخطط/نموذج', className: 'w-[120px]' },
    { key: 'deliveryDeadline', label: 'أجل التسليم', className: 'w-[85px]' },
    { key: 'clientRepresentative', label: 'ممثل الزبون', className: 'w-[120px]' },
  ];
  // Index after which to insert the "عمليات" (actions) column header/cells
  const operationsInsertAfter = columns.findIndex(c => c.key === 'observation');

  const handleExportExcel = useCallback(() => {
    const rows = displayOrders.map((o, index) => {
      const status = orderStatusMap.get(o.id);
      const atelierMinutes = atelierTimeMap.get(o.id) || 0;
      return {
        'الترتيب': o.displayOrder ?? index + 1,
        'رقم الطلبية': o.orderNumber,
        'التاريخ': formatDateFR(o.orderDate),
        'الزبون': getClientName(o.clientId),
        'التعيين': o.designation,
        'الكمية': o.quantity,
        'الأولوية': o.priority || '',
        'أجل التسليم': formatDateFR(o.deliveryDeadline || o.plannedDeadline),
        'ممثل الزبون': o.clientRepresentative || '',
        'ملاحظات تعليمات': o.instructions || '',
        'مخطط/نموذج': o.drawingModel || '',
        'الحالة': getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId),
        'وقت في الورشة': formatMinutesToHM(atelierMinutes),
        'دراسة': status?.study || '',
        'مواد أولية': status?.material || '',
        'عدة': status?.tooling || '',
        'ملاحظات': o.observation || '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 8 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 45 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'الطلبيات الجارية');
    XLSX.writeFile(wb, getExportFilename('الطلبيات الجارية'));
  }, [displayOrders, orderStatusMap, atelierTimeMap, getClientName, steps, productionRecords, absenceOperationId]);

  const renderCell = (o: Order, col: ColumnKey, index: number) => {
    const isEditing = editingRowId === o.id;
    const editableFields: ColumnKey[] = ['orderNumber', 'designation', 'quantity', 'priority', 'observation', 'deliveryDeadline', 'client', 'clientRepresentative', 'instructions', 'drawingModel'];
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
      if (col === 'clientRepresentative' || col === 'instructions' || col === 'drawingModel') {
        const fieldKey = col as 'clientRepresentative' | 'instructions' | 'drawingModel';
        return (
          <Input className="h-7 text-xs"
            value={(getInlineValue(o, fieldKey) as string) || ''}
            onChange={e => setInlineValue(o.id, fieldKey, e.target.value)}
            onClick={e => e.stopPropagation()} />
        );
      }
    }

    // Read-only display
    switch (col) {
      case 'orderNumber': return <span className="font-heading text-xs">{o.orderNumber}</span>;
      case 'orderDate': return <span className="text-xs">{formatDateFR(o.orderDate)}</span>;
      case 'client': return <span className="text-xs">{getClientName(o.clientId)}</span>;
      case 'designation': return <span className="text-xs whitespace-normal break-words block">{o.designation}</span>;
      case 'quantity': return <span className="text-xs">{o.quantity}</span>;
      case 'priority': return <PriorityBadge priority={o.priority} />;
      case 'globalStatus': {
        const isRework = reworkOrderIds.has(o.id);
        const pendingQc = pendingQcOrderIds.has(o.id);
        // Rework takes precedence: returned from delivery for retouches/non-conforme.
        if (isRework) {
          return (
            <div className="flex flex-col items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center rounded-full border border-destructive/50 bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-bold whitespace-nowrap animate-pulse">
                    🔧 إعادة عاجلة
                  </span>
                </TooltipTrigger>
                <TooltipContent>Reprise urgente — retour de مراقبة الجودة après contrôle</TooltipContent>
              </Tooltip>
            </div>
          );
        }
        // When pending QC, the production is physically done — show ONLY the
        // QC indicator (mutually exclusive with En attente / En cours).
        if (pendingQc) {
          return (
            <div className="flex flex-col items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center rounded-full border border-urgent-moderate/40 bg-urgent-moderate/10 text-urgent-moderate px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
                    ⏳ في انتظار المراقبة
                  </span>
                </TooltipTrigger>
                <TooltipContent>En attente de contrôle qualité</TooltipContent>
              </Tooltip>
            </div>
          );
        }
        const status = getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId);
        return (
          <div className="flex flex-col items-center gap-1">
            <GlobalStatusBadge status={status} />
          </div>
        );
      }
      case 'deliveryDeadline': return <span className="text-xs">{formatDateFR(o.deliveryDeadline || o.plannedDeadline)}</span>;
      case 'atelierTime': {
        const mins = atelierTimeMap.get(o.id) || 0;
        return <span className="text-xs font-medium">{formatMinutesToHM(mins)}</span>;
      }
      case 'study': {
        const s = orderStatusMap.get(o.id);
        return <ResourceStatusPill value={s?.study} onChange={(next) => handleStatusChange(o.id, 'study', next)} />;
      }
      case 'material': {
        const s = orderStatusMap.get(o.id);
        return <ResourceStatusPill value={s?.material} onChange={(next) => handleStatusChange(o.id, 'material', next)} receivedDate={o.materialReceivedDate} />;
      }
      case 'tooling': {
        const s = orderStatusMap.get(o.id);
        return <ResourceStatusPill value={s?.tooling} onChange={(next) => handleStatusChange(o.id, 'tooling', next)} />;
      }
      case 'observation': {
        const content = <span className="text-xs text-muted-foreground whitespace-normal break-words block cursor-help">{o.observation || '—'}</span>;
        if (!o.notesUpdatedAt) return content;
        return (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent side="top" className="text-xs !bg-white !text-black border border-border">
              Modifié le {formatDateTimeFR(o.notesUpdatedAt)}
            </TooltipContent>
          </Tooltip>
        );
      }
      case 'clientRepresentative': return <span className="text-xs whitespace-normal break-words block">{o.clientRepresentative || '—'}</span>;
      case 'instructions': return <span className="text-xs whitespace-normal break-words block">{o.instructions || '—'}</span>;
      case 'drawingModel': return <span className="text-xs whitespace-normal break-words block">{o.drawingModel || '—'}</span>;
      default: return null;
    }
  };

  // Compute last order numbers for each series (F, P, numeric, S) — priorité à l'année (avant /), puis au numéro (après /)
  const lastSeriesNumbers = useMemo(() => {
    const parse = (on: string, prefix: 'F' | 'P' | 'S' | '') => {
      const re = prefix
        ? new RegExp(`^(\\d+)\\s*/\\s*${prefix}(\\d+)\\b`, 'i')
        : /^(\d+)\s*\/\s*(\d+)\b/;
      const m = on.match(re);
      if (!m) return null;
      return { year: parseInt(m[1], 10), num: parseInt(m[2], 10) };
    };
    const isBetter = (a: { num: number; year: number }, b: { num: number; year: number } | null) => {
      if (!b) return true;
      if (a.year !== b.year) return a.year > b.year;
      return a.num > b.num;
    };
    const allOrders = orders.filter(o => o.orderNumber !== 'ABS');
    let lastF = '', lastP = '', lastNum = '', lastS = '';
    let bestF: { num: number; year: number } | null = null;
    let bestP: { num: number; year: number } | null = null;
    let bestN: { num: number; year: number } | null = null;
    let bestS: { num: number; year: number } | null = null;
    for (const o of allOrders) {
      const on = o.orderNumber.trim();
      if (/^\d+\s*\/\s*F\d+/i.test(on)) {
        const p = parse(on, 'F');
        if (p && isBetter(p, bestF)) { bestF = p; lastF = on; }
      } else if (/^\d+\s*\/\s*P\d+/i.test(on)) {
        const p = parse(on, 'P');
        if (p && isBetter(p, bestP)) { bestP = p; lastP = on; }
      } else if (/^\d+\s*\/\s*S\d+/i.test(on)) {
        const p = parse(on, 'S');
        if (p && isBetter(p, bestS)) { bestS = p; lastS = on; }
      } else if (/^\d+\s*\/\s*\d+\b/.test(on)) {
        const p = parse(on, '');
        if (p && isBetter(p, bestN)) { bestN = p; lastNum = on; }
      }
    }
    return { lastF, lastP, lastNum, lastS };
  }, [orders]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="الطلبيات الحالية" description={
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
          {lastSeriesNumbers.lastS && (
            <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
              {lastSeriesNumbers.lastS}
            </span>
          )}
        </div>
      } actions={
        <div className="flex gap-2 items-center">
          <Button onClick={undo} variant="outline" size="icon" disabled={!canUndo} title="تراجع (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button onClick={redo} variant="outline" size="icon" disabled={!canRedo} title="إعادة (Ctrl+Y)">
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
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
          <Button onClick={() => setPrintDialogOpen(true)} variant="outline" size="sm" title="طباعة بطاقة متابعة انجاز طلبية">
            <Printer className="w-4 h-4 mr-1" /> طباعة بطاقة متابعة انجاز طلبية
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

        {orderNumberError && !dialogOpen && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {orderNumberError}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 px-1">
                <Checkbox checked={selectedIds.size === displayOrders.length && displayOrders.length > 0} onCheckedChange={toggleSelectAll} />
              </TableHead>
              <TableHead className="w-20 text-center text-xs px-1">
                <ColumnHeader label="الترتيب" columnKey="displayOrder" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.displayOrder || ''} onFilter={handleFilter} />
              </TableHead>
              {columns.map((col, ci) => (
                <React.Fragment key={col.key}>
                  <TableHead className={col.className}>
                    <ColumnHeader label={col.label} columnKey={col.key} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters[col.key] || ''} onFilter={handleFilter} filterMode={col.key === 'globalStatus' ? 'select' : 'text'} filterOptions={col.key === 'globalStatus' ? ['قيد الانتظار', 'قيد الإنجاز', 'جاهزة'] : []} />
                  </TableHead>
                  {ci === operationsInsertAfter && (
                    <TableHead className="w-24 text-xs px-1">عمليات</TableHead>
                  )}
                </React.Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayOrders.map((o, index) => {
              const isRowEditing = editingRowId === o.id;
              const blocked = isOrderBlocked(o.id, steps, orders);
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
                    } ${blocked ? `${BLOCKED_TABLE_ROW_CLASS} [&_td:not(.preserve-status-color)_*]:!text-blocked-table-foreground` : ''
                    } ${!blocked && reworkOrderIds.has(o.id) ? 'bg-destructive/10 hover:bg-destructive/15 border-l-4 border-l-destructive' : ''
                    } ${!blocked && dragOverIndex === index ? 'bg-accent/50 border-t-2 border-accent' : ''
                    } ${isDragging(index) ? 'opacity-40' : ''
                    } ${!blocked && selectedIds.has(o.id) ? 'bg-primary/5' : ''
                    } ${!blocked && isRowEditing ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
                  >
                    <TableCell className="px-1" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelect(o.id)} />
                    </TableCell>
                    <TableCell className="text-center px-1">
                      <div className="flex items-center justify-center gap-0.5">
                        {!hasActiveFilters && !isRowEditing && <GripVertical className="w-3 h-3 text-muted-foreground" />}
                        {o.frozenOrder ? (
                          <Lock className="w-3 h-3 text-primary" />
                        ) : (
                          <WarningTriangleIcon aria-label="طلبية غير مرتبة" />
                        )}
                        <span className="text-xs font-medium text-muted-foreground">{o.displayOrder ?? index + 1}</span>
                      </div>
                    </TableCell>
                    {(() => {
                      const actionsCell = (
                        <TableCell className="px-1">
                          <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                            {o.frozenOrder && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => unlockOrder(o)} title="فتح">
                                <Unlock className="w-3.5 h-3.5 text-primary" />
                              </Button>
                            )}
                            {(() => {
                              const hasSteps = steps.some(s => s.orderId === o.id && s.operationId !== absenceOperationId);
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-12 w-12 min-w-12"
                                  onClick={() => setPlanningOrder(o)}
                                  title={hasSteps ? 'التعيينات' : 'Aucune étape définie — cliquer pour définir'}
                                >
                                  {hasSteps ? (
                                    <CalendarCheck className="w-7 h-7" />
                                  ) : (
                                    <WarningTriangleIcon className="w-7 h-7" />
                                  )}
                                </Button>
                              );
                            })()}
                            {isRowEditing ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveInlineEdits(o.id)} title="حفظ">
                                  <span className="text-normal text-sm font-bold">✓</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cancelInlineEdits(o.id)} title="إلغاء">
                                  <span className="text-destructive text-sm font-bold">✕</span>
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRowId(o.id); setInlineEdits(prev => ({ ...prev, [o.id]: {} })); }} title="Éditer sur la ligne">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCancelTarget(o)} title="Annuler la commande">
                              <Ban className="w-3.5 h-3.5 text-orange-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirm('Êtes-vous sûr de vouloir supprimer cette commande ?', () => deleteOrder(o.id), { variant: 'destructive' })}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      );
                      return columns.map((col, ci) => (
                        <React.Fragment key={col.key}>
                          <TableCell className={`py-1.5 px-2 ${col.key === 'priority' || col.key === 'globalStatus' ? 'preserve-status-color' : ''}`}>{renderCell(o, col.key, index)}</TableCell>
                          {ci === operationsInsertAfter && actionsCell}
                        </React.Fragment>
                      ));
                    })()}
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
              <TableRow><TableCell colSpan={20} className="text-center text-muted-foreground py-8">Aucune commande.</TableCell></TableRow>
            )}
          </TableBody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} une commande</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">رقم الطلبية</label>
              <Input value={form.orderNumber} onChange={e => { setOrderNumberError(''); updateForm('orderNumber', e.target.value); }} />
            </div>
            {orderNumberError && (
              <div className="col-span-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {orderNumberError}
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Date de commande</label>
              <Input type="date" value={form.orderDate} onChange={e => updateForm('orderDate', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الزبون</label>
              <Select value={form.clientId} onValueChange={val => updateForm('clientId', val)}>
                <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">الأولوية</label>
              <Select value={form.priority || 'undetermined'} onValueChange={val => updateForm('priority', val)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {form.priority === 'undetermined' ? (
                      <span className="flex items-center gap-2">
                        <WarningTriangleIcon className="w-[30px] h-[30px]" />
                        <span>À déterminer plus tard</span>
                      </span>
                    ) : form.priority ? (
                      <span className={priorityConfig[form.priority]?.color}>{priorityConfig[form.priority]?.label}</span>
                    ) : (
                      <span className="text-muted-foreground">Choisir une priorité</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <div className="flex items-center gap-2">
                        {k === 'undetermined' && <WarningTriangleIcon className="w-[30px] h-[30px]" />}
                        <span className={v.color}>{v.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">التعيين</label>
              <Input value={form.designation} onChange={e => updateForm('designation', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الكمية</label>
              <Input type="number" min={1} value={form.quantity} onChange={e => updateForm('quantity', parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Délai livraison souhaité</label>
              <Input type="date" value={form.deliveryDeadline || ''} onChange={e => updateForm('deliveryDeadline', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
              <Input value={form.observation || ''} onChange={e => updateForm('observation', e.target.value)} placeholder="Note d'information..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!form.orderNumber || !form.designation}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Paste Dialog */}
      <ExcelPasteDialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen} onImport={handleExcelImport} clients={clients} nextDisplayOrder={baseSorted.length + 1} existingOrderNumbers={orders.filter(o => o.id !== absenceOrderId).map(o => o.orderNumber)} />

      {/* Print tracking sheet */}
      <PrintTrackingSheetDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        orders={displayOrders}
        getClientName={getClientName}
        onConfirm={(o) => setPrintingOrder(o)}
      />
      {printingOrder && (
        <OrderTrackingSheet order={printingOrder} onClose={() => setPrintingOrder(null)} />
      )}
      {planningOrder && (
        <OrderPlanningDialog order={planningOrder} open={!!planningOrder} onOpenChange={(open) => { if (!open) setPlanningOrder(null); }} />
      )}
      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />

      {cancelTarget && (
        <CancelOrderDialog
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          orderLabel={cancelTarget.orderNumber}
          onConfirm={async (data) => {
            const ok = await cancelOrder(cancelTarget.id, data);
            if (ok) setCancelTarget(null);
          }}
        />
      )}

      {statusDatePrompt && (
        <DatePromptDialog
          open={!!statusDatePrompt}
          label={statusDatePrompt.label}
          onConfirm={async (date) => {
            const saved = await applyStatusToOrderAndSteps(statusDatePrompt.orderId, statusDatePrompt.field, statusDatePrompt.status, date);
            if (saved) setStatusDatePrompt(null);
          }}
          onCancel={() => setStatusDatePrompt(null)}
        />
      )}

      <ConfirmDialog
        open={materialConfirmOpen}
        title="هل تؤكد هذه العملية؟"
        onConfirm={() => {
          setMaterialConfirmOpen(false);
          setMaterialDatePromptOpen(true);
        }}
        onCancel={() => {
          setMaterialConfirmOpen(false);
          setMaterialDatePromptOpen(false);
          setPendingMaterialStatus(null);
        }}
      />

      {pendingMaterialStatus && materialDatePromptOpen && (
        <DatePromptDialog
          open={materialDatePromptOpen}
          label="تاريخ استلام المواد الأولية"
          defaultDate={orders.find(o => o.id === pendingMaterialStatus.orderId)?.materialReceivedDate || today}
          onConfirm={async (date) => {
            const saved = await applyStatusToOrderAndSteps(pendingMaterialStatus.orderId, 'material', pendingMaterialStatus.status, undefined, date);
            if (!saved) return;
            setMaterialDatePromptOpen(false);
            setPendingMaterialStatus(null);
          }}
          onCancel={() => {
            setMaterialDatePromptOpen(false);
            setPendingMaterialStatus(null);
          }}
        />
      )}

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
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>إلغاء</Button>
            <Button onClick={applyMoveSelection} disabled={!moveTargetCn || parseInt(moveTargetCn, 10) < 1}>Déplacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
