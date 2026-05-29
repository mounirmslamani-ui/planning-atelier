import React, { useMemo, useState, useCallback } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { usePlanning } from '@/context/PlanningContext';
import PageHeader from '@/components/PageHeader';
import ColumnHeader, { type SortDirection } from '@/components/orders/ColumnHeader';
import PriorityBadge from '@/components/orders/PriorityBadge';
import DesignationCell from '@/components/DesignationCell';
import { formatDateFR } from '@/lib/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePromptDialog from '@/components/DatePromptDialog';
import { dbUpdateStep } from '@/lib/supabase-data';
import { Download } from 'lucide-react';
import { exportTableToExcel } from '@/lib/excelExport';
import { OrderNumberLink } from '@/context/OrderSheetContext';

type ColumnKey = 'displayOrder' | 'orderNumber' | 'orderDate' | 'client' | 'designation' | 'quantity' | 'priority' | 'plannedDeadline' | 'subcontractingDeadline' | 'subcontractor';

const SubcontractingPage: React.FC = () => {
  const { orders, clients, steps, operations, subcontractors, updateStep, absenceOrderId } = usePlanning();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeSubTab, setActiveSubTab] = useState<string>('__all__');
  const [pendingDone, setPendingDone] = useState<{ stepIds: string[] } | null>(null);
  const [datePromptOpen, setDatePromptOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '—', [clients]);
  const getSubcontractorName = useCallback((id: string | undefined) => {
    if (!id) return '—';
    return subcontractors.find(s => s.id === id)?.companyName || '—';
  }, [subcontractors]);

  // Find all subcontractor steps (operations with category 'subcontractor')
  const subcontractorOpIds = useMemo(() => {
    return new Set(operations.filter(op => op.category === 'subcontractor').map(op => op.id));
  }, [operations]);

  const subcontractingRows = useMemo(() => {
    const subSteps = steps.filter(s => subcontractorOpIds.has(s.operationId));

    const orderMap = new Map<string, { deadline: string; done: boolean; stepIds: string[]; subcontractorId: string | undefined }>();
    subSteps.forEach(s => {
      const existing = orderMap.get(s.orderId);
      if (!existing) {
        orderMap.set(s.orderId, {
          deadline: s.subcontractingDeadline || s.endDate || '',
          done: s.subcontractingDone ?? false,
          stepIds: [s.id],
          subcontractorId: s.subcontractorId,
        });
      } else {
        if ((s.subcontractingDeadline || s.endDate || '') > existing.deadline) {
          existing.deadline = s.subcontractingDeadline || s.endDate || '';
        }
        if (!(s.subcontractingDone ?? false)) existing.done = false;
        existing.stepIds.push(s.id);
        // Use first non-empty subcontractorId
        if (!existing.subcontractorId && s.subcontractorId) {
          existing.subcontractorId = s.subcontractorId;
        }
      }
    });

    const rows = Array.from(orderMap.entries()).map(([orderId, info]) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || order.id === absenceOrderId) return null;
      return { order, ...info };
    }).filter(Boolean) as { order: typeof orders[0]; deadline: string; done: boolean; stepIds: string[]; subcontractorId: string | undefined }[];

    // Sort by displayOrder (Cn) from "الطلبيات الجارية"
    rows.sort((a, b) => (a.order.displayOrder ?? 9999) - (b.order.displayOrder ?? 9999));
    return rows;
  }, [steps, orders, subcontractorOpIds, absenceOrderId]);

  const filteredRows = useMemo(() => {
    let result = subcontractingRows.filter(r => !r.done);

    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const lv = val.toLowerCase();
      result = result.filter(r => {
        switch (key as ColumnKey) {
          case 'displayOrder': return String(r.order.displayOrder ?? '').includes(lv);
          case 'orderNumber': return r.order.orderNumber.toLowerCase().includes(lv);
          case 'orderDate': return r.order.orderDate.includes(lv);
          case 'client': return getClientName(r.order.clientId).toLowerCase().includes(lv);
          case 'designation': return r.order.designation.toLowerCase().includes(lv);
          case 'quantity': return String(r.order.quantity).includes(lv);
          case 'priority': return (r.order.priority || '').toLowerCase().includes(lv);
          case 'plannedDeadline': return r.order.plannedDeadline.includes(lv);
          case 'subcontractingDeadline': return r.deadline.includes(lv);
          case 'subcontractor': return getSubcontractorName(r.subcontractorId).toLowerCase().includes(lv);
          default: return true;
        }
      });
    });

    if (sortKey && sortDir) {
      const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      result.sort((a, b) => {
        let cmp = 0;
        switch (sortKey as ColumnKey) {
          case 'orderNumber': cmp = a.order.orderNumber.localeCompare(b.order.orderNumber); break;
          case 'orderDate': cmp = a.order.orderDate.localeCompare(b.order.orderDate); break;
          case 'client': cmp = getClientName(a.order.clientId).localeCompare(getClientName(b.order.clientId)); break;
          case 'designation': cmp = a.order.designation.localeCompare(b.order.designation); break;
          case 'quantity': cmp = a.order.quantity - b.order.quantity; break;
          case 'priority': cmp = (priorityRank[a.order.priority || 'P4'] ?? 3) - (priorityRank[b.order.priority || 'P4'] ?? 3); break;
          case 'plannedDeadline': cmp = a.order.plannedDeadline.localeCompare(b.order.plannedDeadline); break;
          case 'subcontractingDeadline': cmp = a.deadline.localeCompare(b.deadline); break;
          case 'subcontractor': cmp = getSubcontractorName(a.subcontractorId).localeCompare(getSubcontractorName(b.subcontractorId)); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    if (activeSubTab !== '__all__') {
      result = result.filter(r => (r.subcontractorId || '__none__') === activeSubTab);
    }

    return result;
  }, [subcontractingRows, filters, sortKey, sortDir, getClientName, getSubcontractorName, activeSubTab]);

  // Tabs: derived from all non-done rows (before tab filter), distinct subcontractors with counts
  const subTabs = useMemo(() => {
    const counts = new Map<string, number>();
    subcontractingRows.filter(r => !r.done).forEach(r => {
      const key = r.subcontractorId || '__none__';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const entries = Array.from(counts.entries()).map(([id, count]) => ({
      id,
      name: id === '__none__' ? 'بدون مناول' : getSubcontractorName(id),
      count,
    }));
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return entries;
  }, [subcontractingRows, getSubcontractorName]);

  const totalActive = useMemo(() => subcontractingRows.filter(r => !r.done).length, [subcontractingRows]);

  const allValuesByKey = useMemo(() => {
    const get = (r: any, k: string) => {
      switch (k) {
        case 'displayOrder': return String(r.order.displayOrder ?? '');
        case 'orderNumber': return r.order.orderNumber;
        case 'orderDate': return r.order.orderDate;
        case 'client': return getClientName(r.order.clientId);
        case 'designation': return r.order.designation;
        case 'quantity': return String(r.order.quantity);
        case 'priority': return r.order.priority || '';
        case 'subcontractor': return getSubcontractorName(r.subcontractorId);
        case 'plannedDeadline': return r.order.plannedDeadline;
        case 'subcontractingDeadline': return r.deadline;
        default: return '';
      }
    };
    const keys = ['displayOrder','orderNumber','orderDate','client','designation','quantity','priority','subcontractor','plannedDeadline','subcontractingDeadline'];
    const map: Record<string, string[]> = {};
    keys.forEach(k => { map[k] = [...new Set(subcontractingRows.filter(r => !r.done).map((r: any) => get(r, k)).filter(Boolean))].sort(); });
    return map;
  }, [subcontractingRows, getClientName, getSubcontractorName]);

  const handleSort = (key: string, dir: SortDirection) => { setSortKey(key); setSortDir(dir); };
  const handleFilter = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleExportExcel = () => {
    exportTableToExcel('مناولة', filteredRows.map(row => ({
      الترتيب: row.order.displayOrder ?? '—',
      'رقم الطلبية': row.order.orderNumber,
      Date: formatDateFR(row.order.orderDate) || '—',
      Client: getClientName(row.order.clientId),
      Désignation: row.order.designation,
      'الكمية': row.order.quantity,
      Priorité: row.order.priority || '—',
      'مناول': getSubcontractorName(row.subcontractorId),
      'أجل التسليم الموعود': formatDateFR(row.order.plannedDeadline) || '—',
      'أجل انتهاء المناولة': formatDateFR(row.deadline) || '—',
      Fait: row.done ? 'Oui' : 'Non',
    })), [8, 20, 14, 24, 45, 10, 12, 24, 16, 22, 10]);
  };

  const applyDone = async (stepIds: string[], done: boolean, receivedDate?: string) => {
    const updatedSteps = stepIds.map(id => {
      const step = steps.find(s => s.id === id);
      return step ? { ...step, subcontractingDone: done, subcontractingReceivedDate: done ? receivedDate : undefined } : null;
    }).filter(Boolean) as typeof steps;

    const saved = await Promise.all(updatedSteps.map(dbUpdateStep));
    if (saved.some(ok => !ok)) return;
    updatedSteps.forEach(updateStep);
  };

  const toggleDone = (stepIds: string[], currentDone: boolean) => {
    if (currentDone) {
      applyDone(stepIds, false);
      return;
    }
    setPendingDone({ stepIds });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader title="مناولة" description="Suivi des opérations sous-traitées planifiées" actions={
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        } />
      </div>
      <div className="flex-none mb-3 flex flex-wrap gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveSubTab('__all__')}
          className={`px-3 py-1.5 text-xs font-heading rounded-t-md transition-colors ${activeSubTab === '__all__' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
        >
          الكل ({totalActive})
        </button>
        {subTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-heading rounded-t-md transition-colors ${activeSubTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
          >
            {tab.name} ({tab.count})
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center"><ColumnHeader label="الترتيب" columnKey="displayOrder" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.displayOrder || ''} onFilter={handleFilter} allValues={allValuesByKey.displayOrder} /></TableHead>
              <TableHead><ColumnHeader label="رقم الطلبية" columnKey="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderNumber || ''} onFilter={handleFilter} allValues={allValuesByKey.orderNumber} /></TableHead>
              <TableHead><ColumnHeader label="التاريخ" columnKey="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.orderDate || ''} onFilter={handleFilter} allValues={allValuesByKey.orderDate} /></TableHead>
              <TableHead><ColumnHeader label="الزبون" columnKey="client" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.client || ''} onFilter={handleFilter} allValues={allValuesByKey.client} /></TableHead>
              <TableHead><ColumnHeader label="التعيين" columnKey="designation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.designation || ''} onFilter={handleFilter} allValues={allValuesByKey.designation} /></TableHead>
              <TableHead className="text-center"><ColumnHeader label="الكمية" columnKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.quantity || ''} onFilter={handleFilter} allValues={allValuesByKey.quantity} /></TableHead>
              <TableHead><ColumnHeader label="الأولوية" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.priority || ''} onFilter={handleFilter} allValues={allValuesByKey.priority} /></TableHead>
              <TableHead><ColumnHeader label="أجل التسليم الموعود" columnKey="plannedDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.plannedDeadline || ''} onFilter={handleFilter} allValues={allValuesByKey.plannedDeadline} /></TableHead>
              <TableHead><ColumnHeader label="مناول" columnKey="subcontractor" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.subcontractor || ''} onFilter={handleFilter} allValues={allValuesByKey.subcontractor} /></TableHead>
              <TableHead><ColumnHeader label="أجل انتهاء المناولة" columnKey="subcontractingDeadline" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.subcontractingDeadline || ''} onFilter={handleFilter} allValues={allValuesByKey.subcontractingDeadline} /></TableHead>
              <TableHead className="text-center w-16">تم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  Aucune sous-traitance planifiée ✓
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row, idx) => (
                <TableRow key={row.order.id} className={row.done ? 'opacity-60' : ''}>
                  <TableCell className="text-center text-muted-foreground font-mono text-xs">{row.order.displayOrder ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium"><OrderNumberLink orderId={row.order.id} orderNumber={row.order.orderNumber} /></TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.order.orderDate) || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{getClientName(row.order.clientId)}</TableCell>
                  <TableCell className="text-sm"><DesignationCell orderId={row.order.id} designation={row.order.designation} /></TableCell>
                  <TableCell className="text-center text-sm">{row.order.quantity}</TableCell>
                  <TableCell>
                    <PriorityBadge priority={row.order.priority} />
                  </TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.order.plannedDeadline) || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{getSubcontractorName(row.subcontractorId)}</TableCell>
                  <TableCell className="text-sm">{formatDateFR(row.deadline) || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={row.done}
                      onCheckedChange={() => toggleDone(row.stepIds, row.done)}
                      title={row.done ? `Reçu le ${formatDateFR(steps.find(s => row.stepIds.includes(s.id))?.subcontractingReceivedDate) || '—'}` : 'Sous-traitance effectuée'}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pendingDone && !datePromptOpen}
        title="هل تؤكد هذه العملية؟"
        onConfirm={() => setDatePromptOpen(true)}
        onCancel={() => setPendingDone(null)}
      />

      {pendingDone && datePromptOpen && (
        <DatePromptDialog
          open={datePromptOpen}
          label="تاريخ استلام المناولة"
          defaultDate={today}
          onConfirm={(date) => {
            applyDone(pendingDone.stepIds, true, date);
            setDatePromptOpen(false);
            setPendingDone(null);
          }}
          onCancel={() => {
            setDatePromptOpen(false);
            setPendingDone(null);
          }}
        />
      )}
    </div>
  );
};

export default SubcontractingPage;
