import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

/** Droit n° 29 du catalogue : lecture = RO, ajout / modification / désactivation = RW. */
const PAGE_RIGHT = { tableau: 'مرجعيات المادة الأولية' };

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  kind?: 'text' | 'number' | 'textarea';
  defaultValue?: string;
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
      { key: 'libelle_ar', label: 'الاسم بالعربية' },
    ],
    columns: ['libelle_fr', 'libelle_ar'],
  },
  {
    id: 'formats', tab: 'Formats', singular: 'un format', table: 'material_formats', primary: 'libelle_fr',
    fields: [
      { key: 'libelle_fr', label: 'Libellé (français)', required: true },
      { key: 'libelle_ar', label: 'الاسم بالعربية' },
    ],
    columns: ['libelle_fr', 'libelle_ar'],
  },
  {
    id: 'dimensions', tab: 'Dimensions', singular: 'une dimension', table: 'material_dimensions', primary: 'libelle',
    fields: [{ key: 'libelle', label: 'Dimension (ex. D40, 30x40)', required: true }],
    columns: ['libelle'],
  },
  {
    id: 'units', tab: 'Unités', singular: 'une unité', table: 'material_units', primary: 'libelle_fr',
    fields: [
      { key: 'libelle_fr', label: 'Libellé (français)', required: true },
      { key: 'libelle_ar', label: 'الاسم بالعربية' },
    ],
    columns: ['libelle_fr', 'libelle_ar'],
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
  };

  const fieldByKey = (key: string) => def.fields.find(f => f.key === key)!;

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
          const n = Number(text.replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) throw new Error(`${f.label} : saisis un nombre supérieur à 0.`);
          payload[f.key] = n;
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
    return v == null || v === '' ? '—' : String(v);
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
                ) : (
                  <Input
                    value={form[f.key] ?? ''}
                    inputMode={f.kind === 'number' ? 'decimal' : undefined}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
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

const MaterialReferencesPage: React.FC = () => {
  const { hasAccess } = useAuth();
  const level = hasAccess(PAGE_RIGHT);
  const [activeId, setActiveId] = useState(LISTS[0].id);
  const def = LISTS.find(l => l.id === activeId) ?? LISTS[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex-none bg-background pb-3">
        <PageHeader
          title="مرجعيات المادة الأولية"
          description="Nuances, formats, dimensions, unités, masses volumiques et fournisseurs utilisés pour la matière première"
        />
      </div>

      {level === 'denied' ? (
        <div className="text-sm text-muted-foreground">Accès non autorisé.</div>
      ) : (
        <>
          <div className="flex-none pb-3">
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
      )}
    </div>
  );
};

export default MaterialReferencesPage;
