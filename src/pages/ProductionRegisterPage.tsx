import React, { useState, useMemo, useCallback } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import { useAuth } from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import SearchableSelect from '@/components/ui/searchable-select';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Download, Pencil, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { exportSheetsToExcel, type ExcelRow } from '@/lib/excelExport';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { getOperationLabel } from '@/lib/operationLinks';
import DesignationCell from '@/components/DesignationCell';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';

type SortField = 'date' | 'orderNumber' | 'client' | 'designation' | 'quantity' | 'operation' | 'duration';
type SortDir = 'asc' | 'desc';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// Date affichée = workDate (saisi) si présent, sinon date de validatedAt (rétrocompat).
const recordDisplayDate = (rec: { workDate?: string; validatedAt: string }): Date => {
  if (rec.workDate) return new Date(rec.workDate + 'T12:00:00');
  return new Date(rec.validatedAt);
};

const fmtHM = (minutes?: number | null) => {
  if (minutes == null || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Formate une saisie de date en JJ/MM/AAAA (insertion automatique des "/")
const formatDateTyping = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  let out = day;
  if (month) out += '/' + month;
  if (year) out += '/' + year;
  return out;
};

// Convertit JJ/MM/AAAA -> AAAA-MM-JJ (ISO), retourne '' si incomplet/invalide
const ddmmyyyyToISO = (s: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// Formate une saisie d'heure en HH:MM (insertion automatique du ":")
const formatTimeTyping = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  const hh = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  let out = hh;
  if (mm) out += ':' + mm;
  return out;
};

const ProductionRegisterPage: React.FC = () => {
  const { productionRecords, operators, operations, orders, clients, steps, deliveredOrders, cancelledOrders, qcEntries, updateProductionRecord, deleteProductionRecord } = usePlanning();
  const { selectedClientName } = useGlobalClientFilter();
  const { isAdmin, hasAccess } = useAuth();
  const canEditRecord = isAdmin || hasAccess({ tableau: 'سجل الأعمال المنجزة', formulaire: '', sous_formulaire: '', champ_bouton: 'تعديل التسجيل' }) === 'RW';
  const canDeleteRecord = isAdmin || hasAccess({ tableau: 'سجل الأعمال المنجزة', formulaire: '', sous_formulaire: '', champ_bouton: 'حذف التسجيل' }) === 'RW';
  const showActionsCol = canEditRecord || canDeleteRecord;
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const [editRecord, setEditRecord] = useState<{
    id: string;
    orderId: string;
    operationId: string;
    stepId: string;
    workDate: string;
    startTime: string;
    endTime: string;
    pauseHHMM: string;
    actualDuration: string;
  } | null>(null);

  const parseHHMM = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };

  const openEditDialog = useCallback((rec: typeof productionRecords[0]) => {
    const dt = recordDisplayDate(rec);
    const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    const hh = Math.floor(rec.actualDuration / 60);
    const mm = rec.actualDuration % 60;
    const pH = Math.floor((rec.pauseMinutes ?? 0) / 60);
    const pM = (rec.pauseMinutes ?? 0) % 60;
    setEditRecord({
      id: rec.id,
      orderId: rec.orderId,
      operationId: rec.operationId,
      stepId: rec.stepId,
      workDate: dateStr,
      startTime: rec.startTime ?? '',
      endTime: rec.endTime ?? '',
      pauseHHMM: `${String(pH).padStart(2, '0')}:${String(pM).padStart(2, '0')}`,
      actualDuration: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    });
  }, []);

  // Recalcule actual_duration côté UI dès que start/end/pause changent (fin − début − pause).
  const editComputedDuration = useMemo(() => {
    if (!editRecord) return null;
    const s = editRecord.startTime ? parseHHMM(editRecord.startTime) : null;
    const e = editRecord.endTime ? parseHHMM(editRecord.endTime) : null;
    const p = parseHHMM(editRecord.pauseHHMM) ?? 0;
    if (s !== null && e !== null && e > s) {
      const dur = Math.max(0, e - s - p);
      return `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    }
    return null;
  }, [editRecord]);

  // Enregistrement source (non modifié) — sert à retrouver l'opérateur concerné.
  const editingRecord = useMemo(
    () => editRecord ? productionRecords.find(r => r.id === editRecord.id) ?? null : null,
    [editRecord, productionRecords]
  );

  // Retrouve, pour un opérateur donné, l'étape à utiliser sur une autre commande :
  // priorité à la même opération ; sinon l'unique étape de l'opérateur sur cette commande ;
  // sinon la première par ordre chronologique du planning.
  const resolveTargetStep = useCallback((operatorId: string, targetOrderId: string, currentOperationId: string) => {
    const candidates = steps.filter(s => s.orderId === targetOrderId && s.operatorId === operatorId);
    if (candidates.length === 0) return null;
    const sameOperation = candidates.find(s => s.operationId === currentOperationId);
    if (sameOperation) return sameOperation;
    if (candidates.length === 1) return candidates[0];
    return [...candidates].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  }, [steps]);

  // Commandes sorties de la production active (livrées, annulées, ou décision QC conforme),
  // sauf si réintégrées après cet événement — même critère que سجل الطلبيات الجارية (OrdersPage).
  const inactiveOrderIds = useMemo(() => {
    const ids = new Set<string>();
    orders.forEach(o => {
      const reintegratedAt = o.reintegratedAt ? new Date(o.reintegratedAt).getTime() : null;
      const afterReintegration = (iso?: string | null) =>
        !reintegratedAt || (!!iso && new Date(iso).getTime() >= reintegratedAt);
      if (deliveredOrders.some(d => d.orderId === o.id && afterReintegration(d.createdAt ?? d.deliveryDate))) {
        ids.add(o.id); return;
      }
      if (cancelledOrders.some(c => c.orderId === o.id && afterReintegration((c as any).createdAt ?? (c as any).cancelledAt))) {
        ids.add(o.id); return;
      }
      if (qcEntries.some(q =>
        q.orderId === o.id
        && (q.decision === 'conforme' || q.decision === 'conforme-derogation')
        && afterReintegration(q.createdAt ?? q.controlDate)
      )) {
        ids.add(o.id);
      }
    });
    return ids;
  }, [orders, deliveredOrders, cancelledOrders, qcEntries]);

  // Commandes déjà attribuées à l'opérateur de l'enregistrement (y compris la commande actuelle,
  // pour que le sélecteur affiche correctement la valeur en cours), limitées à la production active.
  const assignableOrders = useMemo(() => {
    if (!editingRecord) return [];
    const orderIds = new Set(steps.filter(s => s.operatorId === editingRecord.operatorId).map(s => s.orderId));
    orderIds.add(editingRecord.orderId);
    return orders
      .filter(o => orderIds.has(o.id) && (o.id === editingRecord.orderId || !inactiveOrderIds.has(o.id)))
      .map(o => ({
        value: o.id,
        label: o.id === editingRecord.orderId ? `${o.orderNumber} — (الحالية)` : o.orderNumber,
        searchText: o.orderNumber,
      }))
      .sort((a, b) => a.searchText.localeCompare(b.searchText));
  }, [editingRecord, orders, steps, inactiveOrderIds]);

  const handleOrderChange = useCallback((newOrderId: string) => {
    if (!editRecord || !editingRecord) return;
    const step = resolveTargetStep(editingRecord.operatorId, newOrderId, editingRecord.operationId);
    if (!step) return; // ne devrait pas arriver : la liste ne propose que des commandes résolubles
    setEditRecord({ ...editRecord, orderId: newOrderId, operationId: step.operationId, stepId: step.id });
  }, [editRecord, editingRecord, resolveTargetStep]);

  const saveEdit = useCallback(() => {
    if (!editRecord) return;
    const rec = productionRecords.find(r => r.id === editRecord.id);
    if (!rec) return;
    if (!editRecord.stepId) return;
    const isoWorkDate = ddmmyyyyToISO(editRecord.workDate);
    if (!isoWorkDate) return;
    let dur = parseHHMM(editRecord.actualDuration) ?? 0;
    const startMin = editRecord.startTime ? parseHHMM(editRecord.startTime) : null;
    const endMin = editRecord.endTime ? parseHHMM(editRecord.endTime) : null;
    const pauseMin = parseHHMM(editRecord.pauseHHMM) ?? 0;
    if (startMin !== null && endMin !== null && endMin > startMin) {
      dur = Math.max(0, endMin - startMin - pauseMin);
    }
    if (dur <= 0) return;
    // Si la commande a été changée, la durée et l'état (Terminée/En cours) ne comptent plus
    // pour l'ancienne étape (stepId a changé) et sont désormais comptés pour la nouvelle —
    // aucun calcul séparé n'est stocké par commande, tout est dérivé de stepId à la volée.
    const targetOrder = orders.find(o => o.id === editRecord.orderId);
    const targetOperationName = getOperationName(editRecord.operationId);
    updateProductionRecord({
      ...rec,
      orderId: editRecord.orderId,
      operationId: editRecord.operationId,
      stepId: editRecord.stepId,
      workDate: isoWorkDate,
      startTime: editRecord.startTime || undefined,
      endTime: editRecord.endTime || undefined,
      pauseMinutes: pauseMin || undefined,
      actualDuration: dur,
      orderNumberSnapshot: targetOrder?.orderNumber ?? rec.orderNumberSnapshot,
      clientNameSnapshot: targetOrder ? getClientName(targetOrder.clientId) : rec.clientNameSnapshot,
      designationSnapshot: targetOrder?.designation ?? rec.designationSnapshot,
      quantitySnapshot: targetOrder?.quantity ?? rec.quantitySnapshot,
      operationNameSnapshot: targetOperationName !== '—' ? targetOperationName : rec.operationNameSnapshot,
    });
    setEditRecord(null);
  }, [editRecord, productionRecords, updateProductionRecord, orders]);

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const getRecordInfo = (rec: typeof productionRecords[0]) => {
    const order = getOrder(rec.orderId);
    return {
      orderNumber: order?.orderNumber ?? rec.orderNumberSnapshot ?? '—',
      clientName: order ? getClientName(order.clientId) : (rec.clientNameSnapshot ?? '—'),
      designation: order?.designation ?? rec.designationSnapshot ?? '—',
      quantity: order?.quantity ?? rec.quantitySnapshot ?? null,
      operationName: getOperationName(rec.operationId) !== '—'
        ? getOperationName(rec.operationId)
        : (rec.operationNameSnapshot ?? '—'),
    };
  };

const OPERATOR_NAME_ORDER = ['عادل', 'محمود العيشي', 'بلال', 'محمود بن قيطون', 'عبد الرزاق', 'حمزة', 'عمر', 'صالح', 'ياسين', 'معاذ', 'يوسف', 'عبدالنور', 'معالجة حرارية'];

  const operatorsWithRecords = operators.filter(op =>
    productionRecords.some(r => r.operatorId === op.id)
  );

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const validTab = activeTab && operatorsWithRecords.some(o => o.id === activeTab) ? activeTab : operatorsWithRecords[0]?.id || null;

  const [filterMonths, setFilterMonths] = useState<Set<string>>(new Set());
  const [filterClients, setFilterClients] = useState<Set<string>>(new Set());
  const [filterOrders, setFilterOrders] = useState<Set<string>>(new Set());
  const [filterOperations, setFilterOperations] = useState<Set<string>>(new Set());

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');


  const tabRecords = useMemo(() =>
    validTab
      ? productionRecords.filter(r => r.operatorId === validTab && !!r.endTime && r.endTime.trim() !== '' && (r.actualDuration ?? 0) >= 1)
      : [],
    [productionRecords, validTab]
  );

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    tabRecords.forEach(r => {
      const d = recordDisplayDate(r);
      set.add(`${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [tabRecords]);

  const availableClients = useMemo(() => {
    const map = new Map<string, string>();
    tabRecords.forEach(r => {
      const order = getOrder(r.orderId);
      if (order) {
        map.set(order.clientId, getClientName(order.clientId));
      } else if (r.clientNameSnapshot) {
        map.set(`__snap__${r.clientNameSnapshot}`, r.clientNameSnapshot);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [tabRecords, orders, clients]);

  const availableOrders = useMemo(() => {
    const map = new Map<string, string>();
    tabRecords.forEach(r => {
      const info = getRecordInfo(r);
      map.set(r.orderId, info.orderNumber);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [tabRecords, orders]);

  const availableOperations = useMemo(() => {
    const set = new Set<string>();
    tabRecords.forEach(r => set.add(r.operationId));
    return Array.from(set);
  }, [tabRecords]);

  const globalClientKeys = useMemo(() => {
    if (!selectedClientName) return null;
    const set = new Set<string>();
    clients.filter(c => c.name === selectedClientName).forEach(c => set.add(c.id));
    set.add(`__snap__${selectedClientName}`);
    return set;
  }, [selectedClientName, clients]);

  const filteredRecords = useMemo(() => {
    return tabRecords.filter(r => {
      if (filterMonths.size > 0) {
        const d = recordDisplayDate(r);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!filterMonths.has(key)) return false;
      }
      const activeClientFilter = globalClientKeys ?? (filterClients.size > 0 ? filterClients : null);
      if (activeClientFilter) {
        const order = getOrder(r.orderId);
        const clientKey = order ? order.clientId : `__snap__${r.clientNameSnapshot ?? ''}`;
        if (!activeClientFilter.has(clientKey)) return false;
      }
      if (filterOrders.size > 0) {
        if (!filterOrders.has(r.orderId)) return false;
      }
      if (filterOperations.size > 0) {
        if (!filterOperations.has(r.operationId)) return false;
      }
      return true;
    });
  }, [tabRecords, filterMonths, filterClients, filterOrders, filterOperations, orders, globalClientKeys]);

  const sortedRecords = useMemo(() => {
    const arr = [...filteredRecords];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const ia = getRecordInfo(a);
      const ib = getRecordInfo(b);
      switch (sortField) {
        case 'date':
          return dir * (recordDisplayDate(a).getTime() - recordDisplayDate(b).getTime());
        case 'orderNumber':
          return dir * ia.orderNumber.localeCompare(ib.orderNumber);
        case 'client':
          return dir * ia.clientName.localeCompare(ib.clientName);
        case 'designation':
          return dir * ia.designation.localeCompare(ib.designation);
        case 'quantity':
          return dir * ((ia.quantity ?? 0) - (ib.quantity ?? 0));
        case 'operation':
          return dir * ia.operationName.localeCompare(ib.operationName);
        case 'duration':
          return dir * (a.actualDuration - b.actualDuration);
        default:
          return 0;
      }
    });
    return arr;
  }, [filteredRecords, sortField, sortDir, orders, clients, operations]);

  const totalHours = sortedRecords.reduce((sum, r) => sum + r.actualDuration, 0) / 60;
  const activeOperator = operators.find(o => o.id === validTab);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'asc');
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const hasActiveFilters = filterMonths.size > 0 || filterClients.size > 0 || filterOrders.size > 0 || filterOperations.size > 0;

  const formatMonthLabel = (key: string) => {
    const [year, month] = key.split('-');
    return `${MONTHS[parseInt(month)]} ${year}`;
  };

  const toggleSetItem = (set: Set<string>, item: string): Set<string> => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  const clearAllFilters = () => {
    setFilterMonths(new Set());
    setFilterClients(new Set());
    setFilterOrders(new Set());
    setFilterOperations(new Set());
  };

  const buildExportRows = useCallback((records: typeof productionRecords): ExcelRow[] => {
    return records.map(rec => {
      const info = getRecordInfo(rec);
      return {
        'تاريخ الأشغال': recordDisplayDate(rec).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        'ساعة البداية': rec.startTime ?? '—',
        'ساعة النهاية': rec.endTime ?? '—',
        'الوقت المستقطع': fmtHM(rec.pauseMinutes ?? 0),
        'رقم الطلبية': info.orderNumber,
        Client: info.clientName,
        Désignation: info.designation,
        Quantité: info.quantity ?? '—',
        Opération: info.operationName,
        'المدة الفعلية (سا)': Number((rec.actualDuration / 60).toFixed(2)),
      };
    });
  }, [orders, clients, operations]);

  const handleExportExcel = () => {
    exportSheetsToExcel('سجل الأعمال المنجزة', operatorsWithRecords.map(op => ({
      name: op.name,
      rows: buildExportRows(
        productionRecords
          .filter(r => r.operatorId === op.id)
          .sort((a, b) => recordDisplayDate(b).getTime() - recordDisplayDate(a).getTime())
      ),
      columnWidths: [12, 8, 8, 10, 14, 22, 38, 8, 22, 12],
    })));
  };




  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="سجل الأعمال المنجزة" description="الأعمال المنجزة مصنفة حسب العامل" />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>
      </div>

      {operatorsWithRecords.length === 0 ? (
        <p className="text-muted-foreground text-sm px-4 py-8 text-center">
          Aucun travail effectué. Glissez un bloc du planning vers l'icône ⚙✓ pour l'ajouter au registre des travaux effectués.
        </p>
      ) : (
        <>

          {/* Tabs */}
          <div dir="rtl" className="flex-none flex items-end gap-0 pt-4 border-b border-border">
            {[...operatorsWithRecords].sort((a, b) => {
  const ai = OPERATOR_NAME_ORDER.indexOf(a.name);
  const bi = OPERATOR_NAME_ORDER.indexOf(b.name);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}).map(op => {
              const isActive = op.id === validTab;
              const opRecords = productionRecords.filter(r => r.operatorId === op.id);
              const opTotal = opRecords.reduce((s, r) => s + r.actualDuration, 0) / 60;
              return (
                <button
                  key={op.id}
                  onClick={() => { setActiveTab(op.id); clearAllFilters(); }}
                  className={`relative px-4 py-2 text-xs font-medium border border-b-0 rounded-t-md transition-colors ${
                    isActive
                      ? 'bg-background text-foreground border-border -mb-px z-10'
                      : 'bg-muted/60 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className="font-heading">{op.name}</span>
                  <span className="ml-1.5 text-[10px] opacity-60">({opTotal.toFixed(1)}h)</span>
                </button>
              );
            })}
          </div>

          <div className="flex-none py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-heading font-bold">{activeOperator?.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">({getOperationLabel(activeOperator?.mainFunction, operations, 'operator')})</span>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <X className="w-3 h-3" /> Effacer filtres
                  </button>
                )}
                <span className="text-xs text-muted-foreground">{sortedRecords.length} entrée(s)</span>
                <span className="text-xs font-medium text-primary">Total : {totalHours.toFixed(2)}h</span>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
            <table className="w-full caption-bottom text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('orderNumber')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        رقم الطلبية <SortIcon field="orderNumber" />
                      </button>
                      <FilterPopover
                        items={availableOrders}
                        selected={filterOrders}
                        onToggle={(v) => setFilterOrders(toggleSetItem(filterOrders, v))}
                        onClear={() => setFilterOrders(new Set())}
                      />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('client')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        الزبون <SortIcon field="client" />
                      </button>
                      <FilterPopover
                        items={availableClients}
                        selected={filterClients}
                        onToggle={(v) => setFilterClients(toggleSetItem(filterClients, v))}
                        onClear={() => setFilterClients(new Set())}
                      />
                    </div>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('designation')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      التعيين <SortIcon field="designation" />
                    </button>
                  </TableHead>
                  <TableHead className="w-14 text-center">
                    <button onClick={() => toggleSort('quantity')} className="flex items-center gap-1 mx-auto hover:text-foreground transition-colors">
                      الكمية <SortIcon field="quantity" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('operation')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        العملية <SortIcon field="operation" />
                      </button>
                      <FilterPopover
                        items={availableOperations.map(id => ({ value: id, label: getOperationName(id) }))}
                        selected={filterOperations}
                        onToggle={(v) => setFilterOperations(toggleSetItem(filterOperations, v))}
                        onClear={() => setFilterOperations(new Set())}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="w-24">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        تاريخ الأشغال <SortIcon field="date" />
                      </button>
                      <FilterPopover
                        items={availableMonths.map(k => ({ value: k, label: formatMonthLabel(k) }))}
                        selected={filterMonths}
                        onToggle={(v) => setFilterMonths(toggleSetItem(filterMonths, v))}
                        onClear={() => setFilterMonths(new Set())}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="w-16 text-center">ساعة البداية</TableHead>
                  <TableHead className="w-16 text-center">ساعة النهاية</TableHead>
                  <TableHead className="w-16 text-center">الوقت المستقطع</TableHead>
                  <TableHead className="w-20 text-right">
                    <button onClick={() => toggleSort('duration')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      المدة الفعلية <SortIcon field="duration" />
                    </button>
                  </TableHead>
                  {showActionsCol && <TableHead className="w-20 text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecords.map(rec => {
                  const info = getRecordInfo(rec);
                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium"><OrderNumberLink orderId={rec.orderId} orderNumber={info.orderNumber} /></TableCell>
                      <TableCell>{info.clientName}</TableCell>
                      <TableCell><DesignationCell orderId={rec.orderId} designation={info.designation} /></TableCell>
                      <TableCell className="text-center">{info.quantity ?? '—'}</TableCell>
                      <TableCell>{info.operationName}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {recordDisplayDate(rec).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-center font-mono">{rec.startTime ?? '—'}</TableCell>
                      <TableCell className="text-center font-mono">{rec.endTime ?? '—'}</TableCell>
                      <TableCell className="text-center font-mono">{rec.pauseMinutes ? fmtHM(rec.pauseMinutes) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">{(rec.actualDuration / 60).toFixed(2)}</TableCell>
                      {showActionsCol && (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {canEditRecord && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(rec)} title="Modifier">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDeleteRecord && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => confirm(
                                  `هل تؤكد حذف هذا الإنجاز (الطلبية ${info.orderNumber} — المرحلة ${info.operationName}) ؟`,
                                  () => deleteProductionRecord(rec.id),
                                  {
                                    description: 'قد يؤدي حذف هذا الإنجاز إلى عدم تطابق بين سجل الإنتاج والتخطيط. تأكد قبل المتابعة.',
                                    variant: 'destructive',
                                  }
                                )}
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          </div>
        </>
      )}

      {/* Edit Dialog (admin only) */}
      <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) setEditRecord(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">تعديل التسجيل</DialogTitle>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">رقم الطلبية</label>
                {assignableOrders.length > 1 ? (
                  <SearchableSelect
                    className="h-8 text-xs px-2"
                    value={editRecord.orderId}
                    onValueChange={handleOrderChange}
                    options={assignableOrders}
                    searchPlaceholder="بحث برقم الطلبية..."
                  />
                ) : (
                  <p className="text-xs text-muted-foreground py-1.5">
                    {assignableOrders[0]?.searchText ?? '—'} (لا توجد طلبية أخرى مسندة لهذا العامل)
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">تاريخ الأشغال</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="JJ/MM/AAAA"
                  maxLength={10}
                  value={editRecord.workDate}
                  onChange={e => setEditRecord({ ...editRecord, workDate: formatDateTyping(e.target.value) })}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ساعة البداية</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{2}:[0-9]{2}"
                    maxLength={5}
                    placeholder="HH:MM"
                    value={editRecord.startTime}
                    onChange={e => setEditRecord({ ...editRecord, startTime: formatTimeTyping(e.target.value) })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ساعة النهاية</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{2}:[0-9]{2}"
                    maxLength={5}
                    placeholder="HH:MM"
                    value={editRecord.endTime}
                    onChange={e => setEditRecord({ ...editRecord, endTime: formatTimeTyping(e.target.value) })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">الوقت المستقطع (HH:mm)</label>
                  <Input
                    value={editRecord.pauseHHMM}
                    onChange={e => setEditRecord({ ...editRecord, pauseHHMM: formatTimeTyping(e.target.value) })}
                    placeholder="00:30"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">المدة الفعلية (hh:mm)</label>
                  <Input
                    value={editComputedDuration ?? editRecord.actualDuration}
                    onChange={e => setEditRecord({ ...editRecord, actualDuration: formatTimeTyping(e.target.value) })}
                    placeholder="1:30"
                    className="h-8 text-xs font-mono"
                    readOnly={editComputedDuration !== null}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                إذا تم تحديد وقت البداية، ساعة النهاية والوقت المستقطع، يتم إعادة حساب المدة الفعلية تلقائيًا (ساعة النهاية - ساعة البداية - الوقت المستقطع)
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditRecord(null)}>إلغاء</Button>
            <Button size="sm" onClick={saveEdit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

const FilterPopover: React.FC<{
  items: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}> = ({ items, selected, onToggle, onClear }) => {
  const hasFilter = selected.size > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`p-0.5 rounded transition-colors ${hasFilter ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}>
          <Filter className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">Filtrer</span>
          {hasFilter && (
            <button onClick={onClear} className="text-[10px] text-destructive hover:underline">Tout effacer</button>
          )}
        </div>
        <div className="max-h-48 overflow-auto space-y-1">
          {items.map(item => (
            <label key={item.value} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
              <Checkbox
                checked={selected.has(item.value)}
                onCheckedChange={() => onToggle(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ProductionRegisterPage;
