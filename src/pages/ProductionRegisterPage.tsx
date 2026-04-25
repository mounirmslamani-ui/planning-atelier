import React, { useState, useMemo, useCallback } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Trash2, Pencil, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Download } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import { exportSheetsToExcel, type ExcelRow } from '@/lib/excelExport';

type SortField = 'date' | 'orderNumber' | 'client' | 'designation' | 'quantity' | 'operation' | 'duration';
type SortDir = 'asc' | 'desc';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const ProductionRegisterPage: React.FC = () => {
  const { productionRecords, deleteProductionRecord, updateProductionRecord, operators, operations, orders, clients } = usePlanning();

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const operatorsWithRecords = operators.filter(op =>
    productionRecords.some(r => r.operatorId === op.id)
  );

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const validTab = activeTab && operatorsWithRecords.some(o => o.id === activeTab) ? activeTab : operatorsWithRecords[0]?.id || null;

  // Filters (checkbox sets)
  const [filterMonths, setFilterMonths] = useState<Set<string>>(new Set());
  const [filterClients, setFilterClients] = useState<Set<string>>(new Set());
  const [filterOrders, setFilterOrders] = useState<Set<string>>(new Set());
  const [filterOperations, setFilterOperations] = useState<Set<string>>(new Set());

  // Sort
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Edit dialog
  const [editRecord, setEditRecord] = useState<{
    id: string; validatedAt: string; actualDuration: string;
  } | null>(null);

  // Confirm dialog
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  const tabRecords = useMemo(() =>
    validTab ? productionRecords.filter(r => r.operatorId === validTab) : [],
    [productionRecords, validTab]
  );

  // Available filter values
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    tabRecords.forEach(r => {
      const d = new Date(r.validatedAt);
      set.add(`${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [tabRecords]);

  const availableClients = useMemo(() => {
    const set = new Set<string>();
    tabRecords.forEach(r => {
      const order = getOrder(r.orderId);
      if (order) set.add(order.clientId);
    });
    return Array.from(set);
  }, [tabRecords, orders]);

  const availableOrders = useMemo(() => {
    const set = new Set<string>();
    tabRecords.forEach(r => set.add(r.orderId));
    return Array.from(set);
  }, [tabRecords]);

  const availableOperations = useMemo(() => {
    const set = new Set<string>();
    tabRecords.forEach(r => set.add(r.operationId));
    return Array.from(set);
  }, [tabRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return tabRecords.filter(r => {
      if (filterMonths.size > 0) {
        const d = new Date(r.validatedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!filterMonths.has(key)) return false;
      }
      if (filterClients.size > 0) {
        const order = getOrder(r.orderId);
        if (!order || !filterClients.has(order.clientId)) return false;
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

  // Sorted records
  const sortedRecords = useMemo(() => {
    const arr = [...filteredRecords];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortField) {
        case 'date':
          return dir * (new Date(a.validatedAt).getTime() - new Date(b.validatedAt).getTime());
        case 'orderNumber': {
          const oA = getOrder(a.orderId)?.orderNumber || '';
          const oB = getOrder(b.orderId)?.orderNumber || '';
          return dir * oA.localeCompare(oB);
        }
        case 'client': {
          const cA = getClientName(getOrder(a.orderId)?.clientId || '');
          const cB = getClientName(getOrder(b.orderId)?.clientId || '');
          return dir * cA.localeCompare(cB);
        }
        case 'designation': {
          const dA = getOrder(a.orderId)?.designation || '';
          const dB = getOrder(b.orderId)?.designation || '';
          return dir * dA.localeCompare(dB);
        }
        case 'quantity': {
          const qA = getOrder(a.orderId)?.quantity ?? 0;
          const qB = getOrder(b.orderId)?.quantity ?? 0;
          return dir * (qA - qB);
        }
        case 'operation':
          return dir * getOperationName(a.operationId).localeCompare(getOperationName(b.operationId));
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
      const order = getOrder(rec.orderId);
      return {
        Date: new Date(rec.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        Heure: new Date(rec.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        'رقم الطلبية': order?.orderNumber || '—',
        Client: order ? getClientName(order.clientId) : '—',
        Désignation: order?.designation || '—',
        Quantité: order?.quantity ?? '—',
        Opération: getOperationName(rec.operationId),
        'المدة (سا)': Number((rec.actualDuration / 60).toFixed(2)),
      };
    });
  }, [orders, clients, operations]);

  const handleExportExcel = () => {
    exportSheetsToExcel('سجل الأعمال المنجزة', operatorsWithRecords.map(op => ({
      name: op.name,
      rows: buildExportRows(
        productionRecords
          .filter(r => r.operatorId === op.id)
          .sort((a, b) => new Date(b.validatedAt).getTime() - new Date(a.validatedAt).getTime())
      ),
      columnWidths: [12, 10, 18, 24, 45, 10, 24, 12],
    })));
  };

  const openEditDialog = useCallback((rec: typeof productionRecords[0]) => {
    const dt = new Date(rec.validatedAt);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const hh = Math.floor(rec.actualDuration / 60);
    const mm = rec.actualDuration % 60;
    setEditRecord({
      id: rec.id,
      validatedAt: dateStr,
      actualDuration: `${hh}:${String(mm).padStart(2, '0')}`,
    });
  }, []);

  const saveEdit = useCallback(() => {
    if (!editRecord) return;
    const rec = productionRecords.find(r => r.id === editRecord.id);
    if (!rec) return;
    const [hh, mm] = (editRecord.actualDuration || '0:0').split(':').map(Number);
    const dur = (hh || 0) * 60 + (mm || 0);
    if (dur <= 0) return;
    const newDate = new Date(editRecord.validatedAt + 'T12:00:00');
    updateProductionRecord({ ...rec, validatedAt: newDate.toISOString(), actualDuration: dur });
    setEditRecord(null);
  }, [editRecord, productionRecords, updateProductionRecord]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="سجل الأعمال المنجزة" description="الأعمال المنجزة مصنفة حسب العامل" />
      </div>

      {operatorsWithRecords.length === 0 ? (
        <p className="text-muted-foreground text-sm px-4 py-8 text-center">
          Aucun travail effectué. Glissez un bloc du planning vers l'icône ⚙✓ pour l'ajouter au registre des travaux effectués.
        </p>
      ) : (
        <>
          <div className="flex-none flex justify-end pt-2 pb-3">
            <Button onClick={handleExportExcel} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" /> تصدير Excel
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex-none flex items-end gap-0 pt-4 border-b border-border">
            {operatorsWithRecords.map(op => {
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

          {/* Content */}
          <div className="flex-none py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-heading font-bold">{activeOperator?.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">({activeOperator?.mainFunction})</span>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        التاريخ <SortIcon field="date" />
                      </button>
                      <FilterPopover
                        items={availableMonths.map(k => ({ value: k, label: formatMonthLabel(k) }))}
                        selected={filterMonths}
                        onToggle={(v) => setFilterMonths(toggleSetItem(filterMonths, v))}
                        onClear={() => setFilterMonths(new Set())}
                      />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('orderNumber')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        Commande <SortIcon field="orderNumber" />
                      </button>
                      <FilterPopover
                        items={availableOrders.map(id => {
                          const o = getOrder(id);
                          return { value: id, label: o?.orderNumber || id };
                        })}
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
                        items={availableClients.map(id => ({ value: id, label: getClientName(id) }))}
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
                  <TableHead>
                    <button onClick={() => toggleSort('quantity')} className="flex items-center gap-1 hover:text-foreground transition-colors">
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
                  <TableHead className="text-right">
                    <button onClick={() => toggleSort('duration')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      Durée (h) <SortIcon field="duration" />
                    </button>
                  </TableHead>
                  <TableHead className="w-20 text-center">عمليات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecords.map(rec => {
                  const order = getOrder(rec.orderId);
                  const clientName = order ? getClientName(order.clientId) : '—';
                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="text-xs">
                        {new Date(rec.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {' '}
                        {new Date(rec.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="font-medium">{order?.orderNumber || '—'}</TableCell>
                      <TableCell className="text-xs">{clientName}</TableCell>
                      <TableCell className="text-xs">{order?.designation || '—'}</TableCell>
                      <TableCell className="text-xs">{order?.quantity ?? '—'}</TableCell>
                      <TableCell>{getOperationName(rec.operationId)}</TableCell>
                      <TableCell className="text-right font-medium">{(rec.actualDuration / 60).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(rec)} title="Modifier">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => confirm('Supprimer cet enregistrement ?', () => deleteProductionRecord(rec.id), { variant: 'destructive' })}
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) setEditRecord(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Modifier l'enregistrement</DialogTitle>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">التاريخ</label>
                <Input
                  type="date"
                  value={editRecord.validatedAt}
                  onChange={e => setEditRecord({ ...editRecord, validatedAt: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Durée (hh:mm)</label>
                <Input
                  value={editRecord.actualDuration}
                  onChange={e => setEditRecord({ ...editRecord, actualDuration: e.target.value })}
                  placeholder="1:30"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditRecord(null)}>إلغاء</Button>
            <Button size="sm" onClick={saveEdit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
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

// Reusable filter popover
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
