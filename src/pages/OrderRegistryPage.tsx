import React, { useMemo, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, ClipboardPaste, Download, Ban, RotateCcw, Trash2, Save, X, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import { useCancelOrder } from '@/hooks/useCancelOrder';
import ExcelPasteDialog from '@/components/orders/ExcelPasteDialog';
import PriorityBadge from '@/components/orders/PriorityBadge';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import ResourceStatusPill from '@/components/ResourceStatusPill';
import OrderPlanningDialog from '@/components/OrderPlanningDialog';
import type { Order, OrderCategory, OrderPriority, ResourceStatus } from '@/types/planning';
import { ORDER_CATEGORY_LABEL, ORDER_CATEGORY_PREFIX } from '@/types/planning';
import { generateOrderCode, getOrderRegistryStatus, REGISTRY_STATUS_CLASS } from '@/lib/orderRegistry';
import { dbUpdateOrder, dbUpdateStep } from '@/lib/supabase-data';
import { getExportFilename } from '@/lib/excelExport';

const CATEGORIES: OrderCategory[] = ['fabrication', 'prestation', 'divers', 'slamani'];

const PRIORITIES: OrderPriority[] = ['P1', 'P2', 'P3', 'P4', 'undetermined'];

const OrderRegistryPage: React.FC = () => {
  const {
    orders, clients, addOrder, updateOrder, deleteOrder,
    qcEntries, deliveryEntries, deliveredOrders, productionRecords, steps, updateStep,
    absenceOrderId, absenceOperationId,
    cancelledOrders, deleteCancelledOrder,
  } = usePlanning();
  const cancelOrder = useCancelOrder();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');
  const [search, setSearch] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [planningOrder, setPlanningOrder] = useState<Order | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Order>>({});
  const [history, setHistory] = useState<Order[][]>([]);
  const [redoStack, setRedoStack] = useState<Order[][]>([]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const realOrders = useMemo(
    () => orders.filter(o => o.id !== absenceOrderId),
    [orders, absenceOrderId],
  );

  const cancelledMap = useMemo(() => {
    const m = new Map<string, typeof cancelledOrders[number]>();
    cancelledOrders.forEach(c => m.set(c.orderId, c));
    return m;
  }, [cancelledOrders]);

  const deliveryMap = useMemo(() => {
    const m = new Map<string, string>();
    deliveryEntries.forEach(d => m.set(d.orderId, d.movedAt || d.controlDate));
    return m;
  }, [deliveryEntries]);

  const deliveredMap = useMemo(() => {
    const m = new Map<string, typeof deliveredOrders[number]>();
    deliveredOrders.forEach(d => m.set(d.orderId, d));
    return m;
  }, [deliveredOrders]);

  const qcMap = useMemo(() => {
    const m = new Map<string, string>();
    qcEntries.forEach(q => m.set(q.orderId, q.controlDate));
    return m;
  }, [qcEntries]);

  const inferCategoryFromNumber = useCallback((num: string): OrderCategory | null => {
    const m = (num || '').match(/^\d{2}\/([A-Za-z]?)\d+$/);
    if (!m) return null;
    const p = m[1].toUpperCase();
    if (p === 'F') return 'fabrication';
    if (p === 'P') return 'prestation';
    if (p === 'S') return 'slamani';
    if (p === '') return 'divers';
    return null;
  }, []);

  const filteredByCat = useMemo(() => {
    return realOrders.filter(o => {
      const cat = o.category || inferCategoryFromNumber(o.orderNumber) || 'fabrication';
      return cat === activeCat;
    });
  }, [realOrders, activeCat, inferCategoryFromNumber]);

  const getColValue = useCallback((o: Order, key: string): string => {
    const delivered = deliveredMap.get(o.id);
    switch (key) {
      case 'orderNumber': return o.orderNumber || '';
      case 'orderDate': return o.orderDate || '';
      case 'client': return clients.find(c => c.id === o.clientId)?.name || '';
      case 'designation': return o.designation || '';
      case 'quantity': return String(o.quantity ?? 0);
      case 'priority': return o.priority || '';
      case 'clientRepresentative': return o.clientRepresentative || '';
      case 'observation': return o.observation || o.instructions || '';
      case 'status': return cancelledMap.has(o.id) ? 'ملغاة' : getOrderRegistryStatus(o, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
      case 'deliveryDeadline': return o.deliveryDeadline || o.plannedDeadline || '';
      case 'drawingModel': return o.drawingModel || '';
      case 'qcDate': return qcMap.get(o.id) || '';
      case 'deliveryDate': return delivered?.deliveryDate || '';
      case 'invoiceDate': return delivered?.invoiceNumber ? (delivered.deliveryDate || '') : '';
      case 'invoiceNumber': return delivered?.invoiceNumber || '';
      case 'study': return o.studyStatus || 'non-disponible';
      case 'material': return o.materialStatus || 'non-disponible';
      case 'tooling': return o.toolingStatus || 'non-disponible';
      default: return '';
    }
  }, [clients, cancelledMap, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, deliveredMap, qcMap, absenceOperationId]);

  const displayed = useMemo(() => {
    const lower = search.trim().toLowerCase();
    let list = lower
      ? filteredByCat.filter(o =>
          o.orderNumber.toLowerCase().includes(lower) ||
          (o.designation || '').toLowerCase().includes(lower) ||
          (clients.find(c => c.id === o.clientId)?.name || '').toLowerCase().includes(lower))
      : filteredByCat;
    for (const [k, v] of Object.entries(filters)) {
      if (!v) continue;
      const needle = v.toLowerCase();
      list = list.filter(o => getColValue(o, k).toLowerCase().includes(needle));
    }
    if (sortKey && sortDir) {
      list = [...list].sort((a, b) => {
        const va = getColValue(a, sortKey);
        const vb = getColValue(b, sortKey);
        if (sortKey === 'quantity') {
          const diff = (Number(va) || 0) - (Number(vb) || 0);
          return sortDir === 'asc' ? diff : -diff;
        }
        const cmp = va.localeCompare(vb, 'fr', { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    } else {
      list = [...list].sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'fr', { numeric: true }));
    }
    return list;
  }, [filteredByCat, search, clients, filters, sortKey, sortDir, getColValue]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(dir ? key : null); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleResourceChange = useCallback(async (order: Order, field: 'study' | 'material' | 'tooling', status: ResourceStatus) => {
    const statusKey = `${field}Status` as 'studyStatus' | 'materialStatus' | 'toolingStatus';
    const boolKey = field === 'study' ? 'studyReady' : field === 'material' ? 'materialAvailable' : 'toolingAvailable';
    const isAvail = status === 'disponible';
    const updatedOrder = { ...order, [statusKey]: status, [boolKey]: isAvail } as Order;
    const orderSteps = steps.filter(s => s.orderId === order.id && s.operationId !== absenceOperationId);
    const updatedSteps = orderSteps.map(s => ({ ...s, [statusKey]: status, [boolKey]: isAvail } as any));
    const ok = await Promise.all([dbUpdateOrder(updatedOrder), ...updatedSteps.map(dbUpdateStep)]);
    if (ok.some(r => !r)) { toast.error('Erreur lors de la mise à jour'); return; }
    updateOrder(updatedOrder);
    updatedSteps.forEach(updateStep);
  }, [steps, absenceOperationId, updateOrder, updateStep]);

  const pushHistory = useCallback(() => {
    setHistory(h => [...h.slice(-49), realOrders]);
    setRedoStack([]);
  }, [realOrders]);

  const handleAdd = () => {
    const code = generateOrderCode(activeCat, realOrders);
    const today = new Date().toISOString().split('T')[0];
    const newOrder: Order = {
      id: crypto.randomUUID(),
      orderNumber: code,
      orderDate: today,
      clientId: clients[0]?.id || '',
      designation: '',
      quantity: 1,
      priority: 'undetermined',
      plannedDeadline: today,
      materialAvailable: false,
      toolingAvailable: false,
      studyReady: false,
      materialStatus: 'non-disponible',
      toolingStatus: 'non-disponible',
      studyStatus: 'non-disponible',
      category: activeCat,
    };
    pushHistory();
    addOrder(newOrder);
    setEditingId(newOrder.id);
    setDraft({});
    toast.success(`Commande ${code} créée`);
  };

  const startEdit = (o: Order) => {
    setEditingId(o.id);
    setDraft({});
  };

  const saveEdit = (o: Order) => {
    const next: Order = { ...o, ...draft };
    if (next.orderNumber !== o.orderNumber) {
      const dup = realOrders.some(x => x.id !== o.id && x.orderNumber.trim().toLowerCase() === next.orderNumber.trim().toLowerCase());
      if (dup) {
        toast.error('Erreur : ce numéro de commande existe déjà.');
        return;
      }
    }
    pushHistory();
    updateOrder(next);
    setEditingId(null);
    setDraft({});
  };

  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const handleExcelImport = (rows: Omit<Order, 'id'>[]) => {
    rows.forEach((r, i) => {
      const code = r.orderNumber || generateOrderCode(activeCat, realOrders, new Date().getFullYear());
      addOrder({ id: crypto.randomUUID(), ...r, orderNumber: code, category: activeCat } as Order);
    });
    toast.success(`${rows.length} commande(s) importée(s)`);
  };

  const handleExportExcel = useCallback(() => {
    const rows = displayed.map(o => {
      const status = getOrderRegistryStatus(o, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
      const delivered = deliveredMap.get(o.id);
      return {
        'رقم الطلبية': o.orderNumber,
        'التاريخ': formatDateFR(o.orderDate),
        'الزبون': clients.find(c => c.id === o.clientId)?.name || '',
        'التعيين': o.designation,
        'الكمية': o.quantity,
        'الأولوية': o.priority || '',
        'ممثل الزبون': o.clientRepresentative || '',
        'ملاحظات/تعليمات': o.instructions || o.observation || '',
        'الحالة': status,
        'أجل التسليم': formatDateFR(o.deliveryDeadline || o.plannedDeadline),
        'مخطط/نموذج': o.drawingModel || '',
        'تاريخ مراقبة الجودة': qcMap.get(o.id) ? formatDateFR(qcMap.get(o.id)!) : '',
        'تاريخ التسليم': delivered ? formatDateFR(delivered.deliveryDate) : '',
        'تاريخ الفوترة': delivered?.invoiceNumber ? formatDateFR(delivered.deliveryDate) : '',
        'رقم الفاتورة': delivered?.invoiceNumber || '',
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, ORDER_CATEGORY_LABEL[activeCat]);
    XLSX.writeFile(wb, getExportFilename(`Registre_${ORDER_CATEGORY_LABEL[activeCat]}`));
  }, [displayed, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId, deliveredMap, qcMap, clients, activeCat]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [...r, realOrders]);
    setHistory(h => h.slice(0, -1));
    // Apply diff: simplest approach — update existing orders that exist in both
    prev.forEach(o => {
      const cur = realOrders.find(x => x.id === o.id);
      if (cur && JSON.stringify(cur) !== JSON.stringify(o)) updateOrder(o);
    });
    toast.success('Annulation effectuée');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(h => [...h, realOrders]);
    setRedoStack(r => r.slice(0, -1));
    next.forEach(o => {
      const cur = realOrders.find(x => x.id === o.id);
      if (cur && JSON.stringify(cur) !== JSON.stringify(o)) updateOrder(o);
    });
    toast.success('Rétabli');
  };

  const handleRestore = (orderId: string) => {
    const cancelled = cancelledMap.get(orderId);
    if (!cancelled) return;
    confirm(
      'Réintégrer cette commande dans la liste active ?',
      () => {
        deleteCancelledOrder(cancelled.id);
        toast.success('Commande réintégrée');
      },
    );
  };

  const renderEditableCell = (o: Order, field: keyof Order, type: 'text' | 'number' | 'date' = 'text') => {
    if (editingId !== o.id) {
      const val = o[field] as any;
      if (type === 'date') return <span className="text-xs">{val ? formatDateFR(val) : '—'}</span>;
      return <span className="text-xs">{val ?? '—'}</span>;
    }
    const v = (draft[field] ?? o[field] ?? '') as any;
    return (
      <Input
        type={type}
        className="h-7 text-xs"
        value={v}
        onChange={e => setDraft(d => ({ ...d, [field]: type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value }))}
      />
    );
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <PageHeader title="سجل الطلبيات" description="Registre complet des commandes (4 catégories)" />

      <Tabs value={activeCat} onValueChange={v => { setActiveCat(v as OrderCategory); setEditingId(null); }}>
        <TabsList>
          {CATEGORIES.map(c => (
            <TabsTrigger key={c} value={c}>
              {ORDER_CATEGORY_LABEL[c]}
              <span className="mr-2 text-xs text-muted-foreground">
                ({realOrders.filter(o => (o.category || 'fabrication') === c).length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map(c => (
          <TabsContent key={c} value={c} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="بحث..."
                className="max-w-xs"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="flex-1" />
              <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 ml-1" />إضافة</Button>
              <Button size="sm" variant="outline" onClick={() => setPasteOpen(true)}><ClipboardPaste className="w-4 h-4 ml-1" />Coller Excel</Button>
              <Button size="sm" variant="outline" onClick={handleExportExcel}><Download className="w-4 h-4 ml-1" />تصدير Excel</Button>
              <Button size="sm" variant="outline" onClick={handleUndo} disabled={history.length === 0}>إلغاء</Button>
              <Button size="sm" variant="outline" onClick={handleRedo} disabled={redoStack.length === 0}>رجوع</Button>
            </div>

            <div className="border rounded-lg overflow-x-auto pb-1">
              <Table className="min-w-[2200px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs"><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} filterMode="date" /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} filterMode="select" filterOptions={['P1','P2','P3','P4','undetermined']} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="ممثل الزبون" columnKey="clientRepresentative" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.clientRepresentative || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="ملاحظات/تعليمات" columnKey="observation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.observation || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="الحالة" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.status || ''} onFilter={handleFilter} filterMode="select" filterOptions={['قيد الانتظار','قيد الإنجاز','في انتظار مراقبة الجودة','في انتظار التسليم','في انتظار الفوترة','مفوترة','ملغاة']} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="مواد أولية" columnKey="material" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.material || ''} onFilter={handleFilter} filterMode="select" filterOptions={['disponible','partiel','non-disponible','non-applicable']} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="عدة" columnKey="tooling" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.tooling || ''} onFilter={handleFilter} filterMode="select" filterOptions={['disponible','partiel','non-disponible','non-applicable']} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="دراسة" columnKey="study" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.study || ''} onFilter={handleFilter} filterMode="select" filterOptions={['disponible','partiel','non-disponible','non-applicable']} /></TableHead>
                    <TableHead className="text-xs">تحديد المهام وتوزيعها</TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="أجل التسليم" columnKey="deliveryDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDeadline || ''} onFilter={handleFilter} filterMode="date" /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="مخطط/نموذج" columnKey="drawingModel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.drawingModel || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="تاريخ مراقبة الجودة" columnKey="qcDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.qcDate || ''} onFilter={handleFilter} filterMode="date" /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="تاريخ التسليم" columnKey="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.deliveryDate || ''} onFilter={handleFilter} filterMode="date" /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="تاريخ الفوترة" columnKey="invoiceDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.invoiceDate || ''} onFilter={handleFilter} filterMode="date" /></TableHead>
                    <TableHead className="text-xs"><ColumnHeader label="رقم الفاتورة" columnKey="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.invoiceNumber || ''} onFilter={handleFilter} /></TableHead>
                    <TableHead className="text-xs">عمليات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center text-sm text-muted-foreground py-8">لا توجد طلبيات</TableCell>
                    </TableRow>
                  )}
                  {displayed.map(o => {
                    const isCancelled = cancelledMap.has(o.id);
                    const status: any = isCancelled ? 'ملغاة' : getOrderRegistryStatus(o, steps, productionRecords, qcEntries, deliveryEntries, deliveredOrders, absenceOperationId);
                    const statusClass = isCancelled
                      ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : (REGISTRY_STATUS_CLASS as any)[status] || '';
                    const delivered = deliveredMap.get(o.id);
                    const isEditing = editingId === o.id;
                    return (
                      <TableRow key={o.id} className={isCancelled ? 'opacity-60' : ''}>
                        <TableCell>{renderEditableCell(o, 'orderNumber')}</TableCell>
                        <TableCell>{renderEditableCell(o, 'orderDate', 'date')}</TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={(draft.clientId ?? o.clientId) || ''} onValueChange={v => setDraft(d => ({ ...d, clientId: v }))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {clients.map(cl => <SelectItem key={cl.id} value={cl.id}>{cl.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{clients.find(cl => cl.id === o.clientId)?.name || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>{renderEditableCell(o, 'designation')}</TableCell>
                        <TableCell>{renderEditableCell(o, 'quantity', 'number')}</TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={(draft.priority ?? o.priority) || 'undetermined'} onValueChange={v => setDraft(d => ({ ...d, priority: v as OrderPriority }))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <PriorityBadge priority={o.priority} />
                          )}
                        </TableCell>
                        <TableCell>{renderEditableCell(o, 'clientRepresentative')}</TableCell>
                        <TableCell>{renderEditableCell(o, 'observation')}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${statusClass}`}>
                            {status}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <ResourceStatusPill value={o.materialStatus} onChange={(s) => handleResourceChange(o, 'material', s)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ResourceStatusPill value={o.toolingStatus} onChange={(s) => handleResourceChange(o, 'tooling', s)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ResourceStatusPill value={o.studyStatus} onChange={(s) => handleResourceChange(o, 'study', s)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPlanningOrder(o)} title="تحديد المهام وتوزيعها">
                            <CalendarCheck className="w-4 h-4" />
                          </Button>
                        </TableCell>
                        <TableCell>{renderEditableCell(o, 'deliveryDeadline', 'date')}</TableCell>
                        <TableCell>{renderEditableCell(o, 'drawingModel')}</TableCell>
                        <TableCell><span className="text-xs">{qcMap.get(o.id) ? formatDateFR(qcMap.get(o.id)!) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{delivered ? formatDateFR(delivered.deliveryDate) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{delivered?.invoiceNumber ? formatDateFR(delivered.deliveryDate) : '—'}</span></TableCell>
                        <TableCell><span className="text-xs">{delivered?.invoiceNumber || '—'}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(o)} title="Enregistrer">
                                  <Save className="w-3.5 h-3.5 text-primary" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit} title="Annuler">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(o)} title="Éditer">
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {isCancelled ? (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRestore(o.id)} title="Réintégrer">
                                    <RotateCcw className="w-3.5 h-3.5 text-green-600" />
                                  </Button>
                                ) : (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCancelTarget(o)} title="Annuler la commande">
                                    <Ban className="w-3.5 h-3.5 text-orange-600" />
                                  </Button>
                                )}
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => confirm(
                                    'Supprimer définitivement cette commande ?',
                                    () => {
                                      if (isCancelled) deleteCancelledOrder(cancelledMap.get(o.id)!.id);
                                      deleteOrder(o.id);
                                      toast.success('Supprimé');
                                    },
                                    { variant: 'destructive' },
                                  )}
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <ExcelPasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onImport={handleExcelImport}
        clients={clients}
        nextDisplayOrder={realOrders.length + 1}
        existingOrderNumbers={realOrders.map(o => o.orderNumber)}
      />

      <CancelOrderDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (data) => {
          if (!cancelTarget) return;
          const ok = await cancelOrder(cancelTarget.id, data);
          if (ok) setCancelTarget(null);
        }}
        orderLabel={cancelTarget?.orderNumber || ''}
      />

      {planningOrder && (
        <OrderPlanningDialog
          order={planningOrder}
          open={!!planningOrder}
          onOpenChange={(o) => { if (!o) setPlanningOrder(null); }}
        />
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default OrderRegistryPage;
