import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { formatDateFR, formatDateTimeFR } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, MoveVertical, ListPlus, Download } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import type { Order, OrderPriority, ResourceStatus } from '@/types/planning';


import PrintTrackingSheetDialog from '@/components/PrintTrackingSheetDialog';
import OrderTrackingSheet from '@/components/OrderTrackingSheet';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import { isOrderBlocked, BLOCKED_TABLE_ROW_CLASS } from '@/lib/blockedSteps';
import { getOrderGlobalStatus, getOrderStepStatusDetails, type OrderGlobalStatus } from '@/lib/stepProgress';
import { computeLastSeriesNumbers } from '@/lib/lastSeriesNumbers';
import { buildOutOfActiveProductionSet } from '@/lib/orderFlow';
import { computeOrderStatusFromSteps } from '@/lib/resourceSynthesis';
import { getExportFilename } from '@/lib/excelExport';
import * as XLSX from 'xlsx';

const priorityRank: Record<OrderPriority | 'undetermined', number> = { P1: 0, P2: 1, P3: 2, P4: 3, undetermined: 4 };

type ColumnKey = 'displayOrder' | 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'deliveryDeadline' | 'clientRepresentative' | 'instructions' | 'drawingModel' | 'globalStatus' | 'remainingSteps' | 'atelierTime' | 'study' | 'material' | 'tooling' | 'observation';

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

const STATUS_EMOJI: Record<ResourceStatus, string> = {
  'disponible': '🟢',
  'partiel': '🟠',
  'non-disponible': '🔴',
  'non-applicable': '⚪',
};
const STATUS_LABEL: Record<ResourceStatus, string> = {
  'disponible': 'Disponible',
  'partiel': 'Disponible partiellement',
  'non-disponible': 'Non disponible',
  'non-applicable': 'Non applicable',
};

function ReadOnlyStatusPill({ value, receivedDate }: { value: ResourceStatus | undefined; receivedDate?: string }) {
  const current = value ?? 'non-disponible';
  const title = STATUS_LABEL[current] + (receivedDate ? ` — Reçu : ${formatDateFR(receivedDate)}` : '');
  return <span className="text-sm select-none" title={title}>{STATUS_EMOJI[current]}</span>;
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
  const { orders, clients, setOrders, steps, absenceOperationId, absenceOrderId, deliveryEntries, deliveredOrders, qcEntries, productionRecords, cancelledOrders } = usePlanning();
  const [unifiedOrderId, setUnifiedOrderId] = useState<string | null>(null);
  const [unifiedInitialTab, setUnifiedInitialTab] = useState<'info' | 'resources' | 'steps' | 'qc'>('info');
  const openUnified = (orderId: string, tab: 'info' | 'resources' | 'steps' | 'qc' = 'info') => {
    setUnifiedInitialTab(tab);
    setUnifiedOrderId(orderId);
  };

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dragIndices, setDragIndices] = useState<number[] | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
      const synth = computeOrderStatusFromSteps(o, steps, absenceOperationId);
      map.set(o.id, synth ?? {
        study: o.studyStatus ?? 'non-disponible',
        material: o.materialStatus ?? 'non-disponible',
        tooling: o.toolingStatus ?? 'non-disponible',
      });
    });
    return map;
  }, [orders, steps, absenceOperationId, absenceOrderId]);

  const remainingStepsMap = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      const details = getOrderStepStatusDetails(o.id, steps, productionRecords, absenceOperationId);
      const remaining = details.filter(d => d.status === 'En cours' || d.status === 'Non entamée').length;
      map.set(o.id, remaining);
    });
    return map;
  }, [orders, steps, productionRecords, absenceOperationId, absenceOrderId]);

  const hasStepsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    orders.filter(o => o.id !== absenceOrderId).forEach(o => {
      map.set(o.id, steps.some(s => s.orderId === o.id && s.operationId !== absenceOperationId));
    });
    return map;
  }, [orders, steps, absenceOperationId, absenceOrderId]);

  // Sort by displayOrder ascending (playlist style).
  const outOfActiveProductionIds = useMemo(() => buildOutOfActiveProductionSet(orders, {
    qcEntries,
    deliveryEntries,
    deliveredOrders,
    cancelledOrders,
  }), [orders, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders]);

  const pendingQcOrderIds = useMemo(() => {
    const ids = new Set<string>();
    qcEntries.forEach(entry => {
      if (!entry.decision || (entry.decision !== 'conforme' && entry.decision !== 'conforme-derogation')) {
        ids.add(entry.orderId);
      }
    });
    return ids;
  }, [qcEntries]);

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
    const real = orders.filter(o => o.id !== absenceOrderId && !outOfActiveProductionIds.has(o.id));
    return [...real].sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
  }, [orders, absenceOrderId, outOfActiveProductionIds]);

  // Auto-reindex visible orders (1..N).
  useEffect(() => {
    const visible = orders
      .filter(o => o.id !== absenceOrderId && !outOfActiveProductionIds.has(o.id))
      .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));
    if (visible.length === 0) return;

    const outOfFlow = orders.filter(o =>
      o.id !== absenceOrderId && outOfActiveProductionIds.has(o.id)
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
  }, [orders, absenceOrderId, outOfActiveProductionIds, setOrders]);

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
      case 'remainingSteps': return String(remainingStepsMap.get(o.id) ?? 0);
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
  }, [getClientName, atelierTimeMap, orderStatusMap, steps, productionRecords, absenceOperationId, remainingStepsMap]);

  const displayOrders = useMemo(() => {
    let list = [...baseSorted];
    for (const [key, val] of Object.entries(filters)) {
      if (!val) continue;
      if (key === 'planning') {
        const vals = val.split('|').filter(Boolean);
        list = list.filter(o => {
          const status = hasStepsMap.get(o.id) ? 'محددة' : 'غير محددة';
          return vals.includes(status);
        });
        continue;
      }
      if (key === 'globalStatus') {
        const vals = val.split('|').filter(Boolean);
        list = list.filter(o => vals.includes(getColValue(o, key as ColumnKey)));
        continue;
      }
      if (val.includes('|')) {
        const vals = val.split('|').filter(Boolean);
        list = list.filter(o => vals.includes(getColValue(o, key as ColumnKey)));
        continue;
      }
      const lower = val.toLowerCase();
      list = list.filter(o => getColValue(o, key as ColumnKey).toLowerCase().includes(lower));
    }
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        const va = getColValue(a, sortKey as ColumnKey);
        const vb = getColValue(b, sortKey as ColumnKey);
        if (sortKey === 'quantity' || sortKey === 'atelierTime' || sortKey === 'remainingSteps') {
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
  }, [baseSorted, filters, sortKey, sortDir, getColValue, hasStepsMap]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(dir ? key : null); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === displayOrders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayOrders.map(o => o.id)));
  };

  // ---- Bulk move by Cn ----
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
    const reindexed = newList.map((o, i) => ({
      ...o,
      displayOrder: i + 1,
    }));

    const absence = orders.find(o => o.id === absenceOrderId);
    setOrders([...(absence ? [absence] : []), ...reindexed]);
    setMoveDialogOpen(false);
    setSelectedIds(new Set());
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
    const absence = orders.find(o => o.id === absenceOrderId);
    const reindexed = remaining.map((o, i) => ({
      ...o,
      displayOrder: i + 1,
    }));

    setOrders([...(absence ? [absence] : []), ...reindexed]);
    setDragIndices(null); setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndices(null); setDragOverIndex(null); };
  const isDragging = (index: number) => dragIndices?.includes(index) ?? false;
  const hasActiveFilters = sortKey !== null || Object.values(filters).some(v => v);

  // Excel-style unique values per column for ColumnHeader checkbox lists.
  const allValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    const keys: ColumnKey[] = ['displayOrder','orderNumber','orderDate','client','designation','quantity','priority','globalStatus','remainingSteps','deliveryDeadline','clientRepresentative','instructions','drawingModel','atelierTime','study','material','tooling','observation'];
    keys.forEach(k => {
      const set = new Set<string>();
      baseSorted.forEach(o => { const v = getColValue(o, k); if (v) set.add(v); });
      map[k] = Array.from(set);
    });
    const planSet = new Set<string>();
    baseSorted.forEach(o => planSet.add(hasStepsMap.get(o.id) ? 'محددة' : 'غير محددة'));
    map['planning'] = Array.from(planSet);
    return map;
  }, [baseSorted, getColValue, hasStepsMap]);

  const columns: { key: ColumnKey; label: string; className?: string }[] = [
    { key: 'orderNumber', label: 'رقم الطلبية', className: 'w-[90px]' },
    { key: 'orderDate', label: 'التاريخ', className: 'w-[80px]' },
    { key: 'client', label: 'الزبون', className: 'w-[100px]' },
    { key: 'designation', label: 'التعيين', className: 'w-[180px] min-w-[180px] max-w-[180px]' },
    { key: 'quantity', label: 'الكمية', className: 'w-[50px]' },
    { key: 'priority', label: 'الأولوية', className: 'w-[70px]' },
    { key: 'deliveryDeadline', label: 'أجل التسليم', className: 'w-[85px]' },
    { key: 'clientRepresentative', label: 'ممثل الزبون', className: 'w-[120px]' },
    { key: 'drawingModel', label: 'مخطط/نموذج', className: 'w-[120px]' },
    { key: 'instructions', label: 'ملاحظات/تعليمات تقنية', className: 'w-[180px]' },
    { key: 'observation', label: 'ملاحظات', className: 'w-[340px]' },
    { key: 'globalStatus', label: 'متابعة تقدم إنجاز الطلبية', className: 'w-[105px] min-w-[105px]' },
    { key: 'remainingSteps', label: 'عدد المراحل المتبقية', className: 'w-[110px] min-w-[110px] text-center' },
    { key: 'atelierTime', label: 'وقت في الورشة', className: 'w-[70px]' },
    { key: 'study', label: 'دراسة', className: 'w-[35px]' },
    { key: 'material', label: 'مواد أولية', className: 'w-[35px]' },
    { key: 'tooling', label: 'عدة', className: 'w-[35px]' },
  ];

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
        'ملاحظات/تعليمات تقنية': o.instructions || '',
        'مخطط/نموذج': o.drawingModel || '',
        'متابعة تقدم إنجاز الطلبية': getOrderGlobalStatus(o.id, steps, productionRecords, absenceOperationId),
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

  const renderCell = (o: Order, col: ColumnKey) => {
    switch (col) {
      case 'orderNumber': return (
        <button
          type="button"
          className="font-heading text-sm underline-offset-2 hover:underline text-primary"
          title="فتح بطاقة متابعة الطلبية"
          onClick={(e) => { e.stopPropagation(); setUnifiedOrderId(o.id); }}
        >
          {o.orderNumber}
        </button>
      );
      case 'orderDate': return <span className="text-xs">{formatDateFR(o.orderDate)}</span>;
      case 'client': return <span className="text-sm">{getClientName(o.clientId)}</span>;
      case 'designation': return <DesignationCell orderId={o.id} designation={o.designation} className="text-sm whitespace-normal break-words block" />;
      case 'quantity': return <span className="text-sm">{o.quantity}</span>;
      case 'priority': return <PriorityBadge priority={o.priority} />;
      case 'globalStatus': {
        const isRework = reworkOrderIds.has(o.id);
        const pendingQc = pendingQcOrderIds.has(o.id);
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
      case 'remainingSteps': {
        const n = remainingStepsMap.get(o.id) ?? 0;
        const hasSteps = hasStepsMap.get(o.id);
        if (!hasSteps) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${n === 0 ? 'border-primary/30 bg-primary/10 text-primary' : 'border-accent/30 bg-accent/10 text-accent'}`}>
            {n}
          </span>
        );
      }
      case 'deliveryDeadline': return <span className="text-xs">{formatDateFR(o.deliveryDeadline || o.plannedDeadline)}</span>;
      case 'atelierTime': {
        const mins = atelierTimeMap.get(o.id) || 0;
        return <span className="text-xs font-medium">{formatMinutesToHM(mins)}</span>;
      }
      case 'study': {
        const s = orderStatusMap.get(o.id);
        return <ReadOnlyStatusPill value={s?.study} />;
      }
      case 'material': {
        const s = orderStatusMap.get(o.id);
        return <ReadOnlyStatusPill value={s?.material} receivedDate={o.materialReceivedDate} />;
      }
      case 'tooling': {
        const s = orderStatusMap.get(o.id);
        return <ReadOnlyStatusPill value={s?.tooling} />;
      }
      case 'observation': {
        const content = <span className="text-xs text-muted-foreground whitespace-normal break-words block cursor-help">{o.observation || '—'}</span>;
        if (!o.notesUpdatedAt) return content;
        return (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent side="top" className="text-xs !bg-white !text-black border border-border" style={{color: '#000000', backgroundColor: '#ffffff'}}>
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

  const lastSeriesNumbers = useMemo(() => computeLastSeriesNumbers(orders), [orders]);

  const categoryCounts = useMemo(() => {
    const real = displayOrders.filter(o => o.id !== absenceOrderId);
    return {
      F: real.filter(o => /^\d+\s*\/\s*F\d+/i.test(o.orderNumber || '')).length,
      P: real.filter(o => /^\d+\s*\/\s*P\d+/i.test(o.orderNumber || '')).length,
      S: real.filter(o => /^\d+\s*\/\s*S\d+/i.test(o.orderNumber || '')).length,
      N: real.filter(o => /^\d+\s*\/\s*\d+\b/.test(o.orderNumber || '') && !/^\d+\s*\/\s*[FPS]\d+/i.test(o.orderNumber || '')).length,
    };
  }, [displayOrders, absenceOrderId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="تسيير الطلبيات الجارية" description={
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="font-medium">العدد الإجمالي للطلبيات: {displayOrders.length} طلبية</span>
          {categoryCounts.F > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 font-medium ring-1 ring-inset ring-border">
              تصنيع: {categoryCounts.F} طلبية
              {lastSeriesNumbers.lastF && <span className="text-muted-foreground">({lastSeriesNumbers.lastF})</span>}
            </span>
          )}
          {categoryCounts.P > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 font-medium ring-1 ring-inset ring-border">
              تعديل وتصليح: {categoryCounts.P} طلبية
              {lastSeriesNumbers.lastP && <span className="text-muted-foreground">({lastSeriesNumbers.lastP})</span>}
            </span>
          )}
          {categoryCounts.N > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 font-medium ring-1 ring-inset ring-border">
              متنوع: {categoryCounts.N} طلبية
              {lastSeriesNumbers.lastNum && <span className="text-muted-foreground">({lastSeriesNumbers.lastNum})</span>}
            </span>
          )}
          {categoryCounts.S > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 font-medium ring-1 ring-inset ring-border">
              سلاماني: {categoryCounts.S} طلبية
              {lastSeriesNumbers.lastS && <span className="text-muted-foreground">({lastSeriesNumbers.lastS})</span>}
            </span>
          )}
        </div>
     } actions={
        <div className="flex gap-2 items-center">
          {selectedIds.size > 0 && (
            <Button onClick={() => openMoveDialog()} variant="outline" size="sm" title="Déplacer la sélection à une position Cn">
              <MoveVertical className="w-4 h-4 mr-1" /> Déplacer ({selectedIds.size})
            </Button>
          )}
        </div>
      } />

      <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
        <Button onClick={handleExportExcel} variant="outline" size="sm">
          <Download className="w-4 h-4 ml-1" /> تصدير Excel
        </Button>
      </div>

      {hasActiveFilters && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Tri/filtre actif — le glisser-déposer est désactivé.</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSortKey(null); setSortDir(null); setFilters({}); }}>
              Réinitialiser
            </Button>
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
                <ColumnHeader label="الترتيب" columnKey="displayOrder" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.displayOrder || ''} onFilter={handleFilter} allValues={allValuesByKey.displayOrder} />
              </TableHead>
              {columns.map(col => (
                <TableHead key={col.key} className={col.className}>
                  <ColumnHeader
                    label={col.label}
                    columnKey={col.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    filterValue={filters[col.key] || ''}
                    onFilter={handleFilter}
                    allValues={allValuesByKey[col.key] || []}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayOrders.map((o, index) => {
              const blocked = isOrderBlocked(o.id, steps, orders);
              return (
              <ContextMenu key={o.id}>
                <ContextMenuTrigger asChild>
                  <TableRow
                    draggable={!hasActiveFilters}
                    onDragStart={e => handleDragStart(e, index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={e => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`transition-colors ${
                      !hasActiveFilters ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${blocked ? `${BLOCKED_TABLE_ROW_CLASS} [&_td:not(.preserve-status-color)_*]:!text-blocked-table-foreground` : ''
                    } ${!blocked && reworkOrderIds.has(o.id) ? 'bg-destructive/10 hover:bg-destructive/15 border-l-4 border-l-destructive' : ''
                    } ${!blocked && dragOverIndex === index ? 'bg-accent/50 border-t-2 border-accent' : ''
                    } ${isDragging(index) ? 'opacity-40' : ''
                    } ${!blocked && selectedIds.has(o.id) ? 'bg-primary/5' : ''}`}
                  >
                    <TableCell className="px-1" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelect(o.id)} />
                    </TableCell>
                    <TableCell className="text-center px-1">
                      <div className="flex items-center justify-center gap-0.5">
                        {!hasActiveFilters && <GripVertical className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-xs font-medium text-muted-foreground">{o.displayOrder ?? index + 1}</span>
                      </div>
                    </TableCell>
                    {columns.map(col => (
                      <TableCell key={col.key} className={`py-1.5 px-2 ${col.key === 'priority' || col.key === 'globalStatus' ? 'preserve-status-color' : ''}`}>
                        {renderCell(o, col.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => openMoveDialog(o.id)}>
                    <MoveVertical className="w-4 h-4 mr-2" />
                    Déplacer la sélection {selectedIds.size > 0 ? `(${selectedIds.has(o.id) ? selectedIds.size : selectedIds.size + 1})` : '(1)'}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openUnified(o.id, "steps")}>
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
      <OrderUnifiedSheet
        orderId={unifiedOrderId}
        open={!!unifiedOrderId}
        onOpenChange={(open) => { if (!open) setUnifiedOrderId(null); }}
        initialTab={unifiedInitialTab}
      />

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
