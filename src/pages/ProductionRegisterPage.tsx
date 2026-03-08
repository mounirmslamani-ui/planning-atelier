import React, { useState, useMemo } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

type SortField = 'date' | 'orderNumber' | 'client' | 'operation' | 'duration';
type SortDir = 'asc' | 'desc';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const ProductionRegisterPage: React.FC = () => {
  const { productionRecords, deleteProductionRecord, operators, operations, orders, clients } = usePlanning();

  const getOperationName = (id: string) => operations.find(o => o.id === id)?.name || '—';
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || '—';

  const operatorsWithRecords = operators.filter(op =>
    productionRecords.some(r => r.operatorId === op.id)
  );

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const validTab = activeTab && operatorsWithRecords.some(o => o.id === activeTab) ? activeTab : operatorsWithRecords[0]?.id || null;

  // Filters
  const [filterMonths, setFilterMonths] = useState<Set<string>>(new Set());
  const [filterClients, setFilterClients] = useState<Set<string>>(new Set());
  const [filterOrders, setFilterOrders] = useState<Set<string>>(new Set());

  // Sort
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const tabRecords = useMemo(() =>
    validTab
      ? productionRecords.filter(r => r.operatorId === validTab)
      : [],
    [productionRecords, validTab]
  );

  // Available filter values for current tab
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
      return true;
    });
  }, [tabRecords, filterMonths, filterClients, filterOrders, orders]);

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

  const hasActiveFilters = filterMonths.size > 0 || filterClients.size > 0 || filterOrders.size > 0;

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

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Registre de Production" description="Travaux validés classés par opérateur" />

      {operatorsWithRecords.length === 0 ? (
        <p className="text-muted-foreground text-sm px-4 py-8 text-center">
          Aucun travail validé. Glissez un bloc du planning vers l'icône ⚙✓ pour enregistrer une production.
        </p>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-end gap-0 px-4 pt-4 border-b border-border">
            {operatorsWithRecords.map(op => {
              const isActive = op.id === validTab;
              const opRecords = productionRecords.filter(r => r.operatorId === op.id);
              const opTotal = opRecords.reduce((s, r) => s + r.actualDuration, 0) / 60;
              return (
                <button
                  key={op.id}
                  onClick={() => {
                    setActiveTab(op.id);
                    setFilterMonths(new Set());
                    setFilterClients(new Set());
                    setFilterOrders(new Set());
                  }}
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

          {/* Sheet content */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {/* Header + filter summary */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-heading font-bold">{activeOperator?.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">({activeOperator?.mainFunction})</span>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    onClick={() => { setFilterMonths(new Set()); setFilterClients(new Set()); setFilterOrders(new Set()); }}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <X className="w-3 h-3" /> Effacer filtres
                  </button>
                )}
                <span className="text-xs text-muted-foreground">{sortedRecords.length} entrée(s)</span>
                <span className="text-xs font-medium text-primary">Total : {totalHours.toFixed(2)}h</span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  {/* Date */}
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        Date <SortIcon field="date" />
                      </button>
                      <FilterPopover
                        items={availableMonths.map(k => ({ value: k, label: formatMonthLabel(k) }))}
                        selected={filterMonths}
                        onToggle={(v) => setFilterMonths(toggleSetItem(filterMonths, v))}
                        onClear={() => setFilterMonths(new Set())}
                      />
                    </div>
                  </TableHead>
                  {/* Commande */}
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
                  {/* Client */}
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSort('client')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        Client <SortIcon field="client" />
                      </button>
                      <FilterPopover
                        items={availableClients.map(id => ({ value: id, label: getClientName(id) }))}
                        selected={filterClients}
                        onToggle={(v) => setFilterClients(toggleSetItem(filterClients, v))}
                        onClear={() => setFilterClients(new Set())}
                      />
                    </div>
                  </TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Quantité</TableHead>
                  {/* Opération */}
                  <TableHead>
                    <button onClick={() => toggleSort('operation')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Opération <SortIcon field="operation" />
                    </button>
                  </TableHead>
                  {/* Durée */}
                  <TableHead className="text-right">
                    <button onClick={() => toggleSort('duration')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      Durée (h) <SortIcon field="duration" />
                    </button>
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
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
                        <Button variant="ghost" size="icon" onClick={() => deleteProductionRecord(rec.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

// Reusable filter popover (Excel-style checkbox list)
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
