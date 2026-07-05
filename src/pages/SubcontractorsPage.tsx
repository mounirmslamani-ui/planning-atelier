import React, { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useConfirm } from '@/hooks/use-confirm';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, X, Download } from 'lucide-react';
import SearchableSelect from '@/components/ui/searchable-select';
import type { Subcontractor, Representative, AddressDetail } from '@/types/planning';
import RepresentativesEditor from '@/components/RepresentativesEditor';
import StringListEditor from '@/components/StringListEditor';
import AddressesEditor from '@/components/AddressesEditor';
import ContactDetailsPopover from '@/components/ContactDetailsPopover';
import ColumnHeader from '@/components/orders/ColumnHeader';
import { useTableSortFilter } from '@/hooks/useTableSortFilter';
import { exportTableToExcel } from '@/lib/excelExport';
import { getOperationLabel, resolveOperationId } from '@/lib/operationLinks';

const SubcontractorsPage: React.FC = () => {
  const { subcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor, operations } = usePlanning();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [mainActivity, setMainActivity] = useState('');
  const [secondaryActivities, setSecondaryActivities] = useState<string[]>([]);
  const [newSecondary, setNewSecondary] = useState('');
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [phones, setPhones] = useState<string[]>([]);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [addressDetails, setAddressDetails] = useState<AddressDetail[]>([]);
  const [emails, setEmails] = useState<string[]>([]);

  const openNew = () => {
    setEditing(null);
    setCompanyName('');
    setMainActivity(operations.find(o => o.category === 'subcontractor')?.id || '');
    setSecondaryActivities([]);
    setRepresentatives([]);
    setPhones([]); setAddresses([]); setAddressDetails([]); setEmails([]);
    setDialogOpen(true);
  };

  const openEdit = (s: Subcontractor) => {
    setEditing(s);
    setCompanyName(s.companyName);
    setMainActivity(resolveOperationId(s.mainActivity, operations, 'subcontractor') || operations.find(o => o.category === 'subcontractor')?.id || '');
    setSecondaryActivities(s.secondaryActivities.map(act => resolveOperationId(act, operations, 'subcontractor')).filter(Boolean));
    setRepresentatives(s.representatives || []);
    setPhones(s.phones || []); setAddresses(s.addresses || []); setAddressDetails(s.addressDetails || []); setEmails(s.emails || []);
    setDialogOpen(true);
  };

  const cleanArr = (a: string[]) => a.map(s => s.trim()).filter(Boolean);

  const handleSave = () => {
    const keptIdx: number[] = [];
    const cleanedAddresses: string[] = [];
    (addresses || []).forEach((a, i) => {
      const t = a.trim();
      if (t) { cleanedAddresses.push(t); keptIdx.push(i); }
    });
    const cleanedDetails: AddressDetail[] = keptIdx.map(i => {
      const d = addressDetails[i] || {};
      return {
        nature: d.nature || undefined,
        gps: d.gps?.trim() || undefined,
      };
    });
    const data: Subcontractor = {
      id: editing?.id || crypto.randomUUID(),
      companyName,
      mainActivity,
      secondaryActivities,
      representatives,
      phones: cleanArr(phones),
      addresses: cleanedAddresses,
      addressDetails: cleanedDetails,
      emails: cleanArr(emails),
    };
    if (editing) updateSubcontractor(data);
    else addSubcontractor(data);
    setDialogOpen(false);
  };

  const addSecondary = () => {
    if (newSecondary && !secondaryActivities.includes(newSecondary)) {
      setSecondaryActivities(prev => [...prev, newSecondary]);
      setNewSecondary('');
    }
  };

  const removeSecondary = (fn: string) => {
    setSecondaryActivities(prev => prev.filter(f => f !== fn));
  };

  const accessors = {
    companyName: (s: Subcontractor) => s.companyName,
    mainActivity: (s: Subcontractor) => getOperationLabel(s.mainActivity, operations, 'subcontractor'),
    secondaryActivities: (s: Subcontractor) => s.secondaryActivities.map(act => getOperationLabel(act, operations, 'subcontractor')).join(', '),
    phones: (s: Subcontractor) => (s.phones || []).join(' '),
    emails: (s: Subcontractor) => (s.emails || []).join(' '),
    addresses: (s: Subcontractor) => (s.addresses || []).join(' '),
    representatives: (s: Subcontractor) => (s.representatives || []).map(r => r.name).join(' '),
  };
  const { processed, sortKey, sortDir, filters, handleSort, handleFilter, allValuesByKey } = useTableSortFilter(subcontractors, accessors);

  const handleExportExcel = () => {
    exportTableToExcel('المناولون', processed.map(s => ({
      'اسم المناول': s.companyName,
      'المناولة الأساسية': getOperationLabel(s.mainActivity, operations, 'subcontractor'),
      'مناولات أخرى': s.secondaryActivities.map(act => getOperationLabel(act, operations, 'subcontractor')).join(', '),
      'الهاتف': (s.phones || []).join(' / '),
      'العنوان الإلكتروني': (s.emails || []).join(' / '),
      'العنوان': (s.addresses || []).join(' / '),
      'الممثلون': (s.representatives || []).map(r => r.name).join(' / '),
    })), [32, 28, 45, 24, 30, 35, 30]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="المناولون"
          description={`${subcontractors.length} sous-traitant(s)`}
          actions={
            <Button onClick={openNew} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          }
        />
        <div className="flex items-center gap-2 mb-2 justify-end" dir="ltr">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> تصدير Excel
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead><ColumnHeader label="اسم المناول" columnKey="companyName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.companyName || ''} onFilter={handleFilter} allValues={allValuesByKey.companyName} /></TableHead>
              <TableHead><ColumnHeader label="المناولة الأساسية" columnKey="mainActivity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.mainActivity || ''} onFilter={handleFilter} allValues={allValuesByKey.mainActivity} /></TableHead>
              <TableHead><ColumnHeader label="مناولات أخرى" columnKey="secondaryActivities" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.secondaryActivities || ''} onFilter={handleFilter} allValues={allValuesByKey.secondaryActivities} /></TableHead>
              <TableHead><ColumnHeader label="الهاتف" columnKey="phones" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.phones || ''} onFilter={handleFilter} allValues={allValuesByKey.phones} /></TableHead>
              <TableHead><ColumnHeader label="العنوان الإلكتروني" columnKey="emails" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.emails || ''} onFilter={handleFilter} allValues={allValuesByKey.emails} /></TableHead>
              <TableHead><ColumnHeader label="العنوان" columnKey="addresses" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.addresses || ''} onFilter={handleFilter} allValues={allValuesByKey.addresses} /></TableHead>
              <TableHead><ColumnHeader label="الممثلون" columnKey="representatives" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} filterValue={filters.representatives || ''} onFilter={handleFilter} allValues={allValuesByKey.representatives} /></TableHead>
              <TableHead className="w-32">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.companyName}</TableCell>
                <TableCell>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                    {getOperationLabel(s.mainActivity, operations, 'subcontractor')}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.secondaryActivities.map(act => (
                      <span key={act} className="inline-block px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                        {getOperationLabel(act, operations, 'subcontractor')}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{(s.phones || []).join(' / ') || '—'}</TableCell>
                <TableCell className="text-xs">{(s.emails || []).join(' / ') || '—'}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate" title={(s.addresses || []).join(' / ')}>{(s.addresses || []).join(' / ') || '—'}</TableCell>
                <TableCell className="text-xs">
                  {(s.representatives || []).length === 0 ? '—' : (s.representatives || []).map(r => r.name).filter(Boolean).join(' / ')}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <ContactDetailsPopover
                      companyName={s.companyName}
                      phones={s.phones}
                      emails={s.emails}
                      addresses={s.addresses}
                      addressDetails={s.addressDetails}
                      representatives={s.representatives}
                    />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm(`هل تؤكد حذف المناول "${s.companyName}" ؟`, () => deleteSubcontractor(s.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {subcontractors.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Aucun sous-traitant. Cliquez sur "Ajouter" pour commencer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} un sous-traitant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم المناول</label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nom de l'entreprise" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">المناولة الأساسية</label>
              <SearchableSelect
                value={mainActivity}
                onValueChange={setMainActivity}
                dir="rtl"
                options={operations.filter(o => o.category === 'subcontractor').map(o => ({ value: o.id, label: o.name }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">مناولات أخرى</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {secondaryActivities.map(act => (
                  <span key={act} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {getOperationLabel(act, operations, 'subcontractor')}
                    <button onClick={() => removeSecondary(act)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <SearchableSelect
                  className="flex-1"
                  value={newSecondary}
                  onValueChange={setNewSecondary}
                  placeholder="Sélectionner..."
                  options={[
                    { value: '', label: 'Sélectionner...' },
                    ...operations.filter(o => o.category === 'subcontractor' && o.id !== mainActivity && !secondaryActivities.includes(o.id)).map(o => ({ value: o.id, label: o.name })),
                  ]}
                />
                <Button variant="outline" size="sm" onClick={addSecondary} disabled={!newSecondary}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="text-sm font-semibold">بيانات الاتصال</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StringListEditor label="أرقام الهاتف" value={phones} onChange={setPhones} type="tel" placeholder="+213 ..." />
                <StringListEditor label="البريد الإلكتروني" value={emails} onChange={setEmails} type="email" placeholder="contact@..." />
              </div>
              <AddressesEditor
                addresses={addresses}
                details={addressDetails}
                onChange={(a, d) => { setAddresses(a); setAddressDetails(d); }}
              />
            </div>
            <RepresentativesEditor value={representatives} onChange={setRepresentatives} label="ممثلو المناول" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!companyName || !mainActivity}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} onConfirm={handleConfirm} onCancel={handleCancel} variant={confirmState.variant} />
    </div>
  );
};

export default SubcontractorsPage;
