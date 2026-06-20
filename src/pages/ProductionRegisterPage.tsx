import React, { useState, useMemo, useCallback } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Download } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { exportSheetsToExcel, type ExcelRow } from '@/lib/excelExport';
import { OrderNumberLink } from '@/context/OrderSheetContext';
import { getOperationLabel } from '@/lib/operationLinks';
import DesignationCell from '@/components/DesignationCell';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';

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

const ProductionRegisterPage: React.FC = () => {
  const { productionRecords, operators, operations, orders, clients } = usePlanning();
  const { selectedClientName } = useGlobalClientFilter();

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

  const filteredRecords = useMemo(() => {
    return tabRecords.filter(r => {
      if (filterMonths.size > 0) {
        const d = recordDisplayDate(r);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!filterMonths.has(key)) return false;
      }
      if (filterClients.size > 0) {
        const order = getOrder(r.orderId);
        const clientKey = order ? order.clientId : `__snap__${r.clientNameSnapshot ?? ''}`;
        if (!filterClients.has(clientKey)) return false;
      }
      if (filterOrders.size > 0) {
        if (!filterOrders.has(r.orderId)) return false;
      }
      if (filterOperations.size > 0) {
        if (!filterOperations.has(r.operationId)) return false;
      }
      return true;
    });
  }, [tabRecords, filterMonths, filterClients, filterOrders, filterOperations, orders]);

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
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          </div>
        </>
      )}

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
