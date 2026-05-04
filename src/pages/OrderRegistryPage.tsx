import React, { useMemo, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, ClipboardPaste, Download, Ban, RotateCcw, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import CancelOrderDialog from '@/components/orders/CancelOrderDialog';
import { useCancelOrder } from '@/hooks/useCancelOrder';
import ExcelPasteDialog from '@/components/orders/ExcelPasteDialog';
import PriorityBadge from '@/components/orders/PriorityBadge';
import type { Order, OrderCategory, OrderPriority } from '@/types/planning';
import { ORDER_CATEGORY_LABEL, ORDER_CATEGORY_PREFIX } from '@/types/planning';
import { generateOrderCode, getOrderRegistryStatus, REGISTRY_STATUS_CLASS } from '@/lib/orderRegistry';
import { getExportFilename } from '@/lib/excelExport';

const CATEGORIES: OrderCategory[] = ['fabrication', 'prestation', 'divers', 'slamani'];

const PRIORITIES: OrderPriority[] = ['P1', 'P2', 'P3', 'P4', 'undetermined'];

const OrderRegistryPage: React.FC = () => {
  const {
    orders, clients, addOrder, updateOrder, deleteOrder,
    qcEntries, deliveryEntries, deliveredOrders, productionRecords, steps,
    absenceOrderId, absenceOperationId,
    cancelledOrders, deleteCancelledOrder,
  } = usePlanning();
  const cancelOrder = useCancelOrder();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const [activeCat, setActiveCat] = useState<OrderCategory>('fabrication');
  const [search, setSearch] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Order>>({});
  const [history, setHistory] = useState<Order[][]>([]);
  const [redoStack, setRedoStack] = useState<Order[][]>([]);

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

  const displayed = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const list = lower
      ? filteredByCat.filter(o =>
          o.orderNumber.toLowerCase().includes(lower) ||
          (o.designation || '').toLowerCase().includes(lower) ||
          (clients.find(c => c.id === o.clientId)?.name || '').toLowerCase().includes(lower))
      : filteredByCat;
    return [...list].sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'fr', { numeric: true }));
  }, [filteredByCat, search, clients]);

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
      <PageHeader title="سجل الطلبيات" subtitle="Registre complet des commandes (4 catégories)" />

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

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">رقم الطلبية</TableHead>
                    <TableHead className="text-xs">التاريخ</TableHead>
                    <TableHead className="text-xs">الزبون</TableHead>
                    <TableHead className="text-xs">التعيين</TableHead>
                    <TableHead className="text-xs">الكمية</TableHead>
                    <TableHead className="text-xs">الأولوية</TableHead>
                    <TableHead className="text-xs">ممثل الزبون</TableHead>
                    <TableHead className="text-xs">ملاحظات/تعليمات</TableHead>
                    <TableHead className="text-xs">الحالة</TableHead>
                    <TableHead className="text-xs">أجل التسليم</TableHead>
                    <TableHead className="text-xs">مخطط/نموذج</TableHead>
                    <TableHead className="text-xs">تاريخ مراقبة الجودة</TableHead>
                    <TableHead className="text-xs">تاريخ التسليم</TableHead>
                    <TableHead className="text-xs">تاريخ الفوترة</TableHead>
                    <TableHead className="text-xs">رقم الفاتورة</TableHead>
                    <TableHead className="text-xs">عمليات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={16} className="text-center text-sm text-muted-foreground py-8">لا توجد طلبيات</TableCell>
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

      {cancelTarget && (
        <CancelOrderDialog
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (data) => {
            const ok = await cancelOrder(cancelTarget.id, data);
            if (ok) setCancelTarget(null);
          }}
        />
      )}

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
};

export default OrderRegistryPage;
