import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import ReferenceCombobox from '@/components/ui/reference-combobox';
import {
  useAddMaterialSupplier, useCreateMaterialReference, useDeleteMaterialSheet, useGradeDensityIds,
  useMaterialReference, useMaterialSheets, useMaterialSupplierPrices, useMaterialUsage,
  useRecordMaterialPurchase, useSaveMaterialSheet, useToggleMaterialSupplier,
} from '@/hooks/useMaterialReferences';
import type { MaterialRefOption, MaterialSheet } from '@/hooks/useMaterialReferences';
import { SHAPE_OPTIONS } from '@/lib/materialWeight';
import { useAuth } from '@/context/AuthContext';
import type { AccessLevel } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

/** Droit n° 29 du catalogue : lecture = RO, ajout / modification / désactivation = RW. */
const PAGE_RIGHT = { tableau: 'مرجعيات المادة الأولية' };

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  kind?: 'text' | 'number' | 'textarea' | 'select';
  defaultValue?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  optionsFrom?: 'densities';
}

interface ListDef {
  id: string;
  tab: string;
  singular: string;
  table: string;
  primary: string;
  fields: FieldDef[];
  columns: string[];
}

const LISTS: ListDef[] = [
  {
    id: 'grades', tab: 'Nuances', singular: 'une nuance', table: 'material_grades', primary: 'libelle_fr',
    fields: [
      { key: 'libelle_fr', label: 'Libellé (français)', required: true },
      { key: 'density_id', label: 'Masse volumique', kind: 'select', optionsFrom: 'densities', hint: 'Choisie dans l’onglet Masses volumiques.' },
    ],
    columns: ['libelle_fr', 'density_id'],
  },
  {
    id: 'formats', tab: 'Formats', singular: 'un format', table: 'material_formats', primary: 'libelle_fr',
    fields: [
      { key: 'libelle_fr', label: 'Libellé (français)', required: true },
      { key: 'shape', label: 'Forme (pour le calcul du poids)', kind: 'select', options: SHAPE_OPTIONS },
    ],
    columns: ['libelle_fr', 'shape'],
  },
  {
    id: 'dimensions', tab: 'Dimensions', singular: 'une dimension', table: 'material_dimensions', primary: 'libelle',
    fields: [{ key: 'libelle', label: 'Dimension (ex. D40, 30x40)', required: true, hint: 'Les nombres du libellé servent au calcul du poids : D40 → diamètre 40 ; 30x40 → 30 × 40 ; 2x1000x2000 → épaisseur × largeur × longueur.' }],
    columns: ['libelle'],
  },
  {
    id: 'units', tab: 'Unités', singular: 'une unité', table: 'material_units', primary: 'libelle_fr',
    fields: [
      { key: 'libelle_fr', label: 'Libellé (français)', required: true },
      { key: 'mm_per_unit', label: 'Longueur d’une unité (mm)', kind: 'number', hint: 'Pour le calcul du poids : mm = 1, m = 1000, barre de 6 m = 6000. Laisser vide pour une feuille.' },
    ],
    columns: ['libelle_fr', 'mm_per_unit'],
  },
  {
    id: 'densities', tab: 'Masses volumiques', singular: 'une masse volumique', table: 'material_densities', primary: 'libelle',
    fields: [
      { key: 'libelle', label: 'Libellé (ex. Acier)', required: true },
      { key: 'value', label: 'Valeur', required: true, kind: 'number' },
      { key: 'unit', label: 'Unité', required: true, defaultValue: 'g/cm3' },
    ],
    columns: ['libelle', 'value', 'unit'],
  },
  {
    id: 'suppliers', tab: 'Fournisseurs', singular: 'un fournisseur', table: 'suppliers', primary: 'name',
    fields: [
      { key: 'name', label: 'Nom', required: true },
      { key: 'phone', label: 'Téléphone' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Adresse' },
      { key: 'notes', label: 'Notes', kind: 'textarea' },
    ],
    columns: ['name', 'phone', 'email', 'address'],
  },
];

type Row = Record<string, any> & { id: string; is_active: boolean };

const sb: any = supabase;

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const errorMessage = (err: any): string => {
  if (err?.code === '23505') return 'Cette valeur existe déjà (majuscules et espaces ignorés).';
  if (err?.code === '23514') return 'Valeur refusée par la base (vérifie les nombres).';
  return err?.message || 'Échec de l’enregistrement.';
};

const ReferenceList: React.FC<{ def: ListDef; canEdit: boolean }> = ({ def, canEdit }) => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const densities = useMaterialReference('densities');

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['material-ref-admin', def.id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await sb.from(def.table).select('*').order(def.primary, { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['material-ref-admin', def.id] });
    // listes déroulantes de la sous-fenêtre تحضير الطلبية والموارد
    qc.invalidateQueries({ queryKey: ['material-ref'] });
    qc.invalidateQueries({ queryKey: ['material-weight-data'] });
  };

  const fieldByKey = (key: string) => def.fields.find(f => f.key === key)!;

  const selectOptions = (f: FieldDef, includeInactive = false): { value: string; label: string }[] =>
    f.optionsFrom === 'densities'
      ? (densities.data || []).filter(o => includeInactive || o.active).map(o => ({ value: o.id, label: o.label }))
      : f.options || [];

  const filtered = useMemo(() => {
    const q = norm(search).trim();
    if (!q) return rows;
    return rows.filter(r => def.columns.some(c => norm(r[c]).includes(q)));
  }, [rows, search, def]);

  const openNew = () => {
    setEditing(null);
    setForm(Object.fromEntries(def.fields.map(f => [f.key, f.defaultValue ?? ''])));
    setDialogOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setForm(Object.fromEntries(def.fields.map(f => [f.key, row[f.key] == null ? '' : String(row[f.key])])));
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      for (const f of def.fields) {
        const raw = form[f.key] ?? '';
        const text = f.kind === 'textarea' ? raw.trim() : raw.trim().replace(/\s+/g, ' ');
        if (f.required && !text) throw new Error(`${f.label} : champ obligatoire.`);
        if (f.kind === 'number') {
          if (text === '') {
            payload[f.key] = null;
          } else {
            const n = Number(text.replace(',', '.'));
            if (!Number.isFinite(n) || n <= 0) throw new Error(`${f.label} : saisis un nombre supérieur à 0.`);
            payload[f.key] = n;
          }
        } else {
          payload[f.key] = text === '' ? null : text;
        }
      }
      const query = editing
        ? sb.from(def.table).update(payload).eq('id', editing.id).select('id')
        : sb.from(def.table).insert(payload).select('id');
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Modification refusée : droit d’écriture manquant.');
    },
    onSuccess: () => {
      toast.success(editing ? 'Modifié' : 'Ajouté');
      setDialogOpen(false);
      refresh();
    },
    onError: (err: any) => toast.error(errorMessage(err)),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: Row) => {
      const { data, error } = await sb.from(def.table).update({ is_active: !row.is_active }).eq('id', row.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Modification refusée : droit d’écriture manquant.');
      return !row.is_active;
    },
    onSuccess: (nowActive: boolean) => {
      toast.success(nowActive ? 'Valeur réactivée' : 'Valeur désactivée (plus proposée dans les listes)');
      refresh();
    },
    onError: (err: any) => toast.error(errorMessage(err)),
  });

  const cell = (row: Row, key: string) => {
    const v = row[key];
    if (v == null || v === '') return '—';
    const f = def.fields.find(x => x.key === key);
    if (f?.kind === 'select') return selectOptions(f, true).find(o => o.value === v)?.label ?? '—';
    return String(v);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex-none flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-8 h-9" />
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter {def.singular}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {def.columns.map(c => <TableHead key={c}>{fieldByKey(c).label}</TableHead>)}
              <TableHead className="w-24">Actif</TableHead>
              {canEdit && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(row => (
              <TableRow key={row.id} className={cn(!row.is_active && 'opacity-50')}>
                {def.columns.map((c, i) => (
                  <TableCell key={c} className={i === 0 ? 'font-medium' : undefined}>{cell(row, c)}</TableCell>
                ))}
                <TableCell>
                  {canEdit ? (
                    <Switch
                      checked={row.is_active}
                      disabled={toggleActive.isPending}
                      onCheckedChange={() => toggleActive.mutate(row)}
                      aria-label="Actif"
                    />
                  ) : (
                    <Badge variant={row.is_active ? 'secondary' : 'outline'}>{row.is_active ? 'Actif' : 'Désactivé'}</Badge>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Modifier">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {isLoading && (
              <TableRow><TableCell colSpan={def.columns.length + 2} className="text-center text-muted-foreground py-6">Chargement…</TableCell></TableRow>
            )}
            {!isLoading && error && (
              <TableRow><TableCell colSpan={def.columns.length + 2} className="text-center text-destructive py-6">Lecture impossible.</TableCell></TableRow>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={def.columns.length + 2} className="text-center text-muted-foreground py-6">
                  {rows.length === 0 ? 'Aucune valeur pour le moment.' : 'Aucun résultat.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'Modifier' : 'Ajouter'} {def.singular}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {def.fields.map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium mb-1 block">{f.label}{f.required ? ' *' : ''}</label>
                {f.kind === 'textarea' ? (
                  <Textarea value={form[f.key] ?? ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={3} />
                ) : f.kind === 'select' ? (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={form[f.key] ?? ''}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {selectOptions(f).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input
                    value={form[f.key] ?? ''}
                    inputMode={f.kind === 'number' ? 'decimal' : undefined}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
                {f.hint && <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PRICE_RIGHT = { tableau: 'أسعار شراء المواد الأولية' };

const todayLocal = () => new Date().toLocaleDateString('en-CA');

const parseNum = (s: string) => Number(s.trim().replace(',', '.'));

const fmtMoney = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR') : '');

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

const labelOf = (list: { id: string; label: string }[] | undefined, id: string | null | undefined) =>
  (id && list?.find(o => o.id === id)?.label) || '—';

interface PurchaseTarget {
  materialId: string;
  supplierId: string;
  supplierName: string;
  materialLabel: string;
  defaultUnitId: string;
}

/** Saisie d'un achat : crée la facture, la ligne matière et les frais de découpe éventuels en une seule opération. */
const PurchaseDialog: React.FC<{ target: PurchaseTarget; units: MaterialRefOption[]; onClose: () => void }> = ({
  target, units, onClose,
}) => {
  const record = useRecordMaterialPurchase();
  const [date, setDate] = useState(todayLocal());
  const [quantity, setQuantity] = useState('');
  const [unitId, setUnitId] = useState(target.defaultUnitId);
  const [unitPrice, setUnitPrice] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeLabel, setFeeLabel] = useState('');
  const [documentRef, setDocumentRef] = useState('');

  const submit = async () => {
    const q = parseNum(quantity);
    const p = parseNum(unitPrice);
    const fee = feeAmount.trim() === '' ? null : parseNum(feeAmount);
    if (!date) { toast.error('Choisis la date de l’achat.'); return; }
    if (!Number.isFinite(q) || q <= 0) { toast.error('Quantité : saisis un nombre supérieur à 0.'); return; }
    if (!unitId) { toast.error('Choisis l’unité.'); return; }
    if (unitPrice.trim() === '' || !Number.isFinite(p) || p < 0) { toast.error('Prix unitaire : saisis un nombre valide.'); return; }
    if (fee != null && (!Number.isFinite(fee) || fee < 0)) { toast.error('Frais de découpe : saisis un nombre valide.'); return; }
    try {
      await record.mutateAsync({
        materialId: target.materialId,
        supplierId: target.supplierId,
        date,
        quantity: q,
        unitId,
        unitPrice: p,
        feeAmount: fee,
        feeLabel: feeLabel.trim() || null,
        documentRef: documentRef.trim() || null,
      });
      toast.success('Achat enregistré');
      onClose();
    } catch (err: any) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Enregistrer un achat</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{target.materialLabel} — {target.supplierName}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Date *</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">N° de facture / BL</label>
            <Input value={documentRef} onChange={e => setDocumentRef(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Quantité *</label>
            <Input value={quantity} inputMode="decimal" onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Unité *</label>
            <select className={selectClass} value={unitId} onChange={e => setUnitId(e.target.value)}>
              <option value="">—</option>
              {units.filter(u => u.active || u.id === unitId).map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Prix unitaire (DZD) *</label>
            <Input value={unitPrice} inputMode="decimal" onChange={e => setUnitPrice(e.target.value)} />
          </div>
          <div />
          <div>
            <label className="text-xs font-medium mb-1 block">Frais de découpe (DZD)</label>
            <Input value={feeAmount} inputMode="decimal" onChange={e => setFeeAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Libellé des frais</label>
            <Input value={feeLabel} placeholder="Frais de découpe" onChange={e => setFeeLabel(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => void submit()} disabled={record.isPending}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Fiche d'une matière : identifiant, nuance, format, dimension, unités, masse volumique et fournisseurs habituels. */
const MaterialSheetDialog: React.FC<{
  sheet: MaterialSheet | null;
  canEdit: boolean;
  priceLevel: AccessLevel;
  onClose: () => void;
}> = ({ sheet, canEdit, priceLevel, onClose }) => {
  const sheets = useMaterialSheets();
  const gradeDensity = useGradeDensityIds();
  const prices = useMaterialSupplierPrices();
  const grades = useMaterialReference('grades');
  const formats = useMaterialReference('formats');
  const dimensions = useMaterialReference('dimensions');
  const units = useMaterialReference('units');
  const densities = useMaterialReference('densities');
  const suppliers = useMaterialReference('suppliers');
  const createGrade = useCreateMaterialReference('grades');
  const createFormat = useCreateMaterialReference('formats');
  const createDimension = useCreateMaterialReference('dimensions');
  const createSupplier = useCreateMaterialReference('suppliers');
  const save = useSaveMaterialSheet();
  const addSupplier = useAddMaterialSupplier();
  const toggleSupplier = useToggleMaterialSupplier();
  const deleteSheet = useDeleteMaterialSheet();

  const [currentId, setCurrentId] = useState<string | null>(sheet?.id ?? null);
  const [gradeId, setGradeId] = useState(sheet?.gradeId ?? '');
  const [formatId, setFormatId] = useState(sheet?.formatId ?? '');
  const [dimensionId, setDimensionId] = useState(sheet?.dimensionId ?? '');
  const [orderUnitId, setOrderUnitId] = useState(sheet?.orderUnitId ?? '');
  const [purchaseUnitId, setPurchaseUnitId] = useState(sheet?.purchaseUnitId ?? '');
  const [densityId, setDensityId] = useState('');
  const [densityTouched, setDensityTouched] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const current = currentId ? (sheets.data || []).find(s => s.id === currentId) ?? null : null;
  const usage = useMaterialUsage(currentId);
  const usageItems = usage.data ?? [];
  const used = usageItems.length > 0;
  // Verrouillé tant que l'usage n'est pas connu (ou en erreur), par prudence
  const locked = currentId != null && (usage.isPending || usage.isError || used);
  const usageText = (() => {
    const list = (kind: string) => {
      const labels = usageItems.filter(u => u.kind === kind).map(u => u.label);
      return labels.length === 0 ? '' : labels.slice(0, 10).join(', ') + (labels.length > 10 ? '…' : '');
    };
    const parts = [
      ['commande(s)', list('order')],
      ['achat(s)', list('purchase')],
      ['bon(s) de commande fournisseur', list('purchase_order')],
      ['réception(s)', list('goods_receipt')],
    ].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
    return parts.length === 0 ? '' : `Cette matière est déjà utilisée par : ${parts.join(' ; ')}.`;
  })();
  const effectiveDensityId = densityTouched ? densityId : (gradeDensity.data?.get(gradeId) ?? '');
  const sameGradeCount = (sheets.data || []).filter(s => s.gradeId === gradeId).length;
  const materialLabel = `${labelOf(grades.data, gradeId)} ${labelOf(formats.data, formatId)} ${labelOf(dimensions.data, dimensionId)}`;

  const supplierRows = useMemo(
    () => (prices.data || [])
      .filter(r => r.materialId === currentId)
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
    [prices.data, currentId],
  );

  // Pastille « moins cher » : seulement si au moins 2 fournisseurs ont un prix dans la même unité.
  const bestSupplierId = useMemo(() => {
    const priced = supplierRows.filter(r => r.active && r.lastUnitPrice != null);
    if (priced.length < 2) return null;
    if (new Set(priced.map(r => r.lastPriceUnitId)).size !== 1) return null;
    return priced.reduce((m, r) => (r.lastUnitPrice! < m.lastUnitPrice! ? r : m)).supplierId;
  }, [supplierRows]);

  const makeCreator = (mutate: (label: string) => Promise<MaterialRefOption>) => async (label: string) => {
    try {
      return await mutate(label);
    } catch (err: any) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  const onSave = async () => {
    if (!gradeId || !formatId || !dimensionId) { toast.error('Choisis la nuance, le format et la dimension.'); return; }
    try {
      const id = await save.mutateAsync({
        id: currentId ?? undefined,
        gradeId,
        formatId,
        dimensionId,
        orderUnitId: orderUnitId || null,
        purchaseUnitId: purchaseUnitId || null,
        densityId: densityTouched ? (densityId || null) : undefined,
      });
      toast.success(currentId ? 'Fiche enregistrée' : 'Matière créée : tu peux maintenant ajouter ses fournisseurs');
      setCurrentId(id);
    } catch (err: any) {
      toast.error(err?.code === '23505' ? 'Cette matière existe déjà (même nuance, format et dimension).' : errorMessage(err));
    }
  };

  const onDelete = async () => {
    if (!currentId) return;
    try {
      await deleteSheet.mutateAsync(currentId);
      toast.success('Matière supprimée');
      onClose();
    } catch (err: any) {
      setConfirmDelete(false);
      toast.error(errorMessage(err));
    }
  };

  const fieldClass = 'h-9 text-sm px-2';

  return (
    <>
      <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {current ? `${current.code} — ${materialLabel}` : 'Nouvelle matière'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Nuance *</label>
              {locked ? (
                <div className="h-9 flex items-center text-sm font-medium">{labelOf(grades.data, gradeId)}</div>
              ) : (
                <ReferenceCombobox
                  value={gradeId}
                  options={grades.data || []}
                  placeholder="— Nuance —"
                  className={fieldClass}
                  disabled={!canEdit}
                  onSelect={o => { setGradeId(o?.id ?? ''); setDensityTouched(false); }}
                  onCreate={canEdit ? makeCreator(createGrade.mutateAsync) : undefined}
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Format *</label>
              {locked ? (
                <div className="h-9 flex items-center text-sm font-medium">{labelOf(formats.data, formatId)}</div>
              ) : (
                <ReferenceCombobox
                  value={formatId}
                  options={formats.data || []}
                  placeholder="— Format —"
                  className={fieldClass}
                  disabled={!canEdit}
                  onSelect={o => setFormatId(o?.id ?? '')}
                  onCreate={canEdit ? makeCreator(createFormat.mutateAsync) : undefined}
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Dimension *</label>
              {locked ? (
                <div className="h-9 flex items-center text-sm font-medium">{labelOf(dimensions.data, dimensionId)}</div>
              ) : (
                <ReferenceCombobox
                  value={dimensionId}
                  options={dimensions.data || []}
                  placeholder="— Dimension —"
                  className={fieldClass}
                  disabled={!canEdit}
                  onSelect={o => setDimensionId(o?.id ?? '')}
                  onCreate={canEdit ? makeCreator(createDimension.mutateAsync) : undefined}
                />
              )}
            </div>
            {used && (
              <p className="col-span-3 text-[11px] text-amber-600 -mt-1">
                {usageText} Nuance, format et dimension ne peuvent plus être modifiés et la matière ne peut plus être supprimée.
                Pour une autre combinaison, crée une nouvelle matière et désactive celle-ci.
              </p>
            )}

            <div>
              <label className="text-xs font-medium mb-1 block">Unité de commande</label>
              <ReferenceCombobox
                value={orderUnitId}
                options={units.data || []}
                placeholder="— Unité —"
                className={fieldClass}
                disabled={!canEdit}
                onSelect={o => setOrderUnitId(o?.id ?? '')}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Unité d’achat</label>
              <ReferenceCombobox
                value={purchaseUnitId}
                options={units.data || []}
                placeholder="— Unité —"
                className={fieldClass}
                disabled={!canEdit}
                onSelect={o => setPurchaseUnitId(o?.id ?? '')}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Masse volumique</label>
              <select
                className={selectClass}
                disabled={!canEdit || !gradeId}
                value={effectiveDensityId}
                onChange={e => { setDensityId(e.target.value); setDensityTouched(true); }}
              >
                <option value="">—</option>
                {(densities.data || [])
                  .filter(o => o.active || o.id === effectiveDensityId)
                  .map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            {gradeId && (
              <p className="col-span-3 text-[11px] text-muted-foreground -mt-1">
                La masse volumique est portée par la nuance : la modifier s’applique aux {Math.max(sameGradeCount, 1)} matière(s) de cette nuance.
                Les unités et les masses volumiques se créent dans « Listes de référence ».
              </p>
            )}
          </div>

          {current && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Fournisseurs habituels</h3>
                {canEdit && (
                  <div className="w-64">
                    <ReferenceCombobox
                      value=""
                      options={suppliers.data || []}
                      placeholder="＋ Ajouter un fournisseur…"
                      className={fieldClass}
                      onSelect={o => {
                        if (!o) return;
                        addSupplier.mutate(
                          { materialId: current.id, supplierId: o.id },
                          { onError: (err: any) => toast.error(errorMessage(err)) },
                        );
                      }}
                      onCreate={makeCreator(createSupplier.mutateAsync)}
                    />
                  </div>
                )}
              </div>

              <div className="overflow-auto rounded-lg border bg-card">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead>Dernier prix d’achat</TableHead>
                      <TableHead>Derniers frais de découpe</TableHead>
                      <TableHead className="w-20">Actif</TableHead>
                      <TableHead className="w-44" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierRows.map(r => (
                      <TableRow key={r.id} className={cn(!r.active && 'opacity-50')}>
                        <TableCell className="font-medium">{r.supplierName}</TableCell>
                        <TableCell>
                          {priceLevel === 'denied' ? (
                            <span className="text-xs text-muted-foreground">Confidentiel</span>
                          ) : r.lastUnitPrice == null ? '—' : (
                            <div className="flex items-center gap-2">
                              <div>
                                <div>{fmtMoney(r.lastUnitPrice)} DZD{r.lastPriceUnitLabel ? ` / ${r.lastPriceUnitLabel}` : ''}</div>
                                <div className="text-[11px] text-muted-foreground">{fmtDate(r.lastPriceDate)}</div>
                              </div>
                              {r.supplierId === bestSupplierId && <Badge variant="secondary">Moins cher</Badge>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {priceLevel === 'denied' ? (
                            <span className="text-xs text-muted-foreground">Confidentiel</span>
                          ) : r.lastFeeAmount == null ? '—' : (
                            <div>
                              <div>{fmtMoney(r.lastFeeAmount)} DZD</div>
                              <div className="text-[11px] text-muted-foreground">{fmtDate(r.lastFeeDate)}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {canEdit ? (
                            <Switch
                              checked={r.active}
                              disabled={toggleSupplier.isPending}
                              onCheckedChange={v => toggleSupplier.mutate(
                                { id: r.id, active: v },
                                { onError: (err: any) => toast.error(errorMessage(err)) },
                              )}
                              aria-label="Actif"
                            />
                          ) : (
                            <Badge variant={r.active ? 'secondary' : 'outline'}>{r.active ? 'Actif' : 'Désactivé'}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {priceLevel === 'RW' && r.active && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPurchase({
                                materialId: current.id,
                                supplierId: r.supplierId,
                                supplierName: r.supplierName,
                                materialLabel: `${current.code} — ${materialLabel}`,
                                defaultUnitId: purchaseUnitId || '',
                              })}
                            >
                              Enregistrer un achat
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {prices.isLoading && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Chargement…</TableCell></TableRow>
                    )}
                    {!prices.isLoading && supplierRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-4">Aucun fournisseur habituel pour cette matière.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            {current && canEdit && (
              <Button variant="outline" className="text-destructive sm:mr-auto" onClick={() => setConfirmDelete(true)}>
                Supprimer
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
            {canEdit && <Button onClick={() => void onSave()} disabled={save.isPending}>حفظ</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{used ? 'Suppression impossible' : 'Supprimer cette matière ?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {used
                ? `${usageText} Elle ne peut plus être supprimée : désactive-la à la place.`
                : `${current?.code ?? ''} — ${materialLabel} sera supprimée définitivement, avec ses fournisseurs habituels.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{used ? 'Fermer' : 'Annuler'}</AlertDialogCancel>
            {!used && <AlertDialogAction onClick={() => void onDelete()}>Supprimer</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {purchase && <PurchaseDialog target={purchase} units={units.data || []} onClose={() => setPurchase(null)} />}
    </>
  );
};

/** Liste des matières : une ligne par identifiant (Id0001…). Un clic ouvre la fiche. */
const MaterialSheetsList: React.FC<{ canEdit: boolean; priceLevel: AccessLevel }> = ({ canEdit, priceLevel }) => {
  const qc = useQueryClient();
  const sheets = useMaterialSheets();
  const grades = useMaterialReference('grades');
  const formats = useMaterialReference('formats');
  const dimensions = useMaterialReference('dimensions');
  const units = useMaterialReference('units');
  const prices = useMaterialSupplierPrices();
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [dialog, setDialog] = useState<{ sheet: MaterialSheet | null } | null>(null);

  const supplierCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prices.data || []) if (r.active) m.set(r.materialId, (m.get(r.materialId) ?? 0) + 1);
    return m;
  }, [prices.data]);

  const rows = useMemo(() => {
    const list = (sheets.data || []).map(s => ({
      ...s,
      grade: labelOf(grades.data, s.gradeId),
      format: labelOf(formats.data, s.formatId),
      dimension: labelOf(dimensions.data, s.dimensionId),
      orderUnit: labelOf(units.data, s.orderUnitId),
      purchaseUnit: labelOf(units.data, s.purchaseUnitId),
    }));
    list.sort((a, b) =>
      a.grade.localeCompare(b.grade) || a.format.localeCompare(b.format) || a.dimension.localeCompare(b.dimension, undefined, { numeric: true }));
    const q = norm(search).trim();
    return list.filter(r =>
      (!gradeFilter || r.gradeId === gradeFilter) &&
      (!formatFilter || r.formatId === formatFilter) &&
      (!q || norm(`${r.code} ${r.grade} ${r.format} ${r.dimension}`).includes(q)));
  }, [sheets.data, grades.data, formats.data, dimensions.data, units.data, search, gradeFilter, formatFilter]);

  const toggle = useMutation({
    mutationFn: async (row: { id: string; active: boolean }) => {
      const { data, error } = await sb.from('materials').update({ is_active: !row.active }).eq('id', row.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Modification refusée : droit d’écriture manquant.');
      return !row.active;
    },
    onSuccess: (nowActive: boolean) => {
      toast.success(nowActive ? 'Matière réactivée' : 'Matière désactivée (plus proposée dans les listes)');
      qc.invalidateQueries({ queryKey: ['material-sheets'] });
      qc.invalidateQueries({ queryKey: ['material-combos'] });
    },
    onError: (err: any) => toast.error(errorMessage(err)),
  });

  const filterOptions = (list: { id: string; label: string }[] | undefined) =>
    [...(list || [])].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex-none flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (Id, nuance, dimension…)" className="pl-8 h-9" />
          </div>
          <select className={cn(selectClass, 'w-44')} value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} aria-label="Filtrer par nuance">
            <option value="">Toutes les nuances</option>
            {filterOptions(grades.data).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select className={cn(selectClass, 'w-44')} value={formatFilter} onChange={e => setFormatFilter(e.target.value)} aria-label="Filtrer par format">
            <option value="">Tous les formats</option>
            {filterOptions(formats.data).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setDialog({ sheet: null })}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter une matière
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Id</TableHead>
              <TableHead>Nuance</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Dimension</TableHead>
              <TableHead>Unité de commande</TableHead>
              <TableHead>Unité d’achat</TableHead>
              <TableHead className="w-28">Fournisseurs</TableHead>
              <TableHead className="w-24">Actif</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow
                key={row.id}
                className={cn('cursor-pointer', !row.active && 'opacity-50')}
                onClick={() => setDialog({ sheet: row })}
              >
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell className="font-medium">{row.grade}</TableCell>
                <TableCell>{row.format}</TableCell>
                <TableCell>{row.dimension}</TableCell>
                <TableCell>{row.orderUnit}</TableCell>
                <TableCell>{row.purchaseUnit}</TableCell>
                <TableCell>{supplierCount.get(row.id) ?? 0}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  {canEdit ? (
                    <Switch checked={row.active} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(row)} aria-label="Actif" />
                  ) : (
                    <Badge variant={row.active ? 'secondary' : 'outline'}>{row.active ? 'Actif' : 'Désactivé'}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" aria-label="Ouvrir la fiche">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {sheets.isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Chargement…</TableCell></TableRow>
            )}
            {!sheets.isLoading && sheets.error && (
              <TableRow><TableCell colSpan={9} className="text-center text-destructive py-6">Lecture impossible.</TableCell></TableRow>
            )}
            {!sheets.isLoading && !sheets.error && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                  {(sheets.data || []).length === 0 ? 'Aucune matière pour le moment.' : 'Aucun résultat.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      {dialog && (
        <MaterialSheetDialog
          key={dialog.sheet?.id ?? 'new'}
          sheet={dialog.sheet}
          canEdit={canEdit}
          priceLevel={priceLevel}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
};

const MaterialReferencesPage: React.FC = () => {
  const { hasAccess } = useAuth();
  const level = hasAccess(PAGE_RIGHT);
  const priceLevel = hasAccess(PRICE_RIGHT);
  const [showLists, setShowLists] = useState(false);
  const [activeId, setActiveId] = useState(LISTS[0].id);
  const def = LISTS.find(l => l.id === activeId) ?? LISTS[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="مرجعيات المادة الأولية"
          description="Une fiche par matière (nuance + format + dimension) : unités, masse volumique, fournisseurs habituels et derniers prix"
        />
      </div>

      {level === 'denied' ? (
        <div className="text-sm text-muted-foreground">Accès non autorisé.</div>
      ) : showLists ? (
        <>
          <div className="flex-none flex items-center gap-3 pb-3">
            <Button size="sm" variant="outline" onClick={() => setShowLists(false)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Retour aux matières
            </Button>
            <Tabs value={activeId} onValueChange={setActiveId}>
              <TabsList>
                {LISTS.map(l => <TabsTrigger key={l.id} value={l.id}>{l.tab}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ReferenceList key={def.id} def={def} canEdit={level === 'RW'} />
          </div>
        </>
      ) : (
        <>
          <div className="flex-none flex justify-end pb-2">
            <Button size="sm" variant="outline" onClick={() => setShowLists(true)}>
              Listes de référence (unités, masses volumiques, fournisseurs…)
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MaterialSheetsList canEdit={level === 'RW'} priceLevel={priceLevel} />
          </div>
        </>
      )}
    </div>
  );
};

export default MaterialReferencesPage;
