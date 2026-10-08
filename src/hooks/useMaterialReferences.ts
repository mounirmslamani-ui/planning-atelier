import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MaterialRefKind = 'grades' | 'formats' | 'dimensions' | 'units' | 'densities' | 'suppliers';

export interface MaterialRefOption {
  id: string;
  label: string;
  active: boolean;
}

const CONFIG: Record<MaterialRefKind, { table: string; column: string }> = {
  grades: { table: 'material_grades', column: 'libelle_fr' },
  formats: { table: 'material_formats', column: 'libelle_fr' },
  dimensions: { table: 'material_dimensions', column: 'libelle' },
  units: { table: 'material_units', column: 'libelle_fr' },
  densities: { table: 'material_densities', column: 'libelle' },
  suppliers: { table: 'suppliers', column: 'name' },
};

const sb: any = supabase;

const queryKeyFor = (kind: MaterialRefKind) => ['material-ref', kind];

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

async function fetchRefs(kind: MaterialRefKind): Promise<MaterialRefOption[]> {
  const { table, column } = CONFIG[kind];
  const { data, error } = await sb
    .from(table)
    .select(`id, ${column}, is_active`)
    .order(column, { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: r.id, label: r[column], active: r.is_active !== false }));
}

/** Liste complète (actives + désactivées) d'une table de référence matière première. */
export function useMaterialReference(kind: MaterialRefKind) {
  return useQuery({
    queryKey: queryKeyFor(kind),
    queryFn: () => fetchRefs(kind),
    staleTime: 5 * 60 * 1000,
  });
}

/** Ajoute une valeur à une table de référence (ou renvoie l'existante si elle y est déjà). */
export function useCreateMaterialReference(kind: MaterialRefKind) {
  const qc = useQueryClient();
  const { table, column } = CONFIG[kind];
  return useMutation({
    mutationFn: async (rawLabel: string): Promise<MaterialRefOption> => {
      const label = rawLabel.trim().replace(/\s+/g, ' ');
      const { data, error } = await sb.from(table).insert({ [column]: label }).select(`id, ${column}, is_active`).single();
      if (error) {
        // 23505 = doublon (index unique insensible à la casse) → on récupère la valeur existante
        if ((error as any).code === '23505') {
          const list = await fetchRefs(kind);
          const existing = list.find(o => normalize(o.label) === normalize(label));
          if (existing) return existing;
        }
        throw error;
      }
      return { id: data.id, label: data[column], active: data.is_active !== false };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeyFor(kind) }),
  });
}

export interface MaterialCombination {
  id: string;
  gradeId: string;
  formatId: string;
  dimensionId: string;
  active: boolean;
}

const COMBOS_KEY = ['material-combos'];

/** Catalogue des matières : combinaisons nuance + format + dimension réellement existantes. */
export function useMaterialCombinations() {
  return useQuery({
    queryKey: COMBOS_KEY,
    queryFn: async (): Promise<MaterialCombination[]> => {
      const { data, error } = await sb.from('materials').select('id, grade_id, format_id, dimension_id, is_active');
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        gradeId: r.grade_id,
        formatId: r.format_id,
        dimensionId: r.dimension_id,
        active: r.is_active !== false,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Enregistre une combinaison dans le catalogue (la réactive si elle existait désactivée). */
export function useEnsureMaterialCombination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { gradeId: string; formatId: string; dimensionId: string }) => {
      const keys = { grade_id: c.gradeId, format_id: c.formatId, dimension_id: c.dimensionId };
      const { error } = await sb.from('materials').insert(keys);
      if (error) {
        if ((error as any).code !== '23505') throw error;
        const { error: upErr } = await sb.from('materials').update({ is_active: true }).match(keys);
        if (upErr) throw upErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COMBOS_KEY });
      qc.invalidateQueries({ queryKey: SHEETS_KEY });
    },
  });
}

export interface MaterialWeightData {
  /** id nuance → masse volumique en g/cm3 */
  gradeDensity: Map<string, number>;
  /** id format → forme (round, hexagon, square, flat, sheet) */
  formatShape: Map<string, string>;
  /** id unité → longueur en mm d'une unité */
  unitMm: Map<string, number>;
}

const toGcm3 = (value: number, unit: string): number | null => {
  const u = unit.toLowerCase().replace(/\s/g, '').replace('³', '3');
  if (u === 'g/cm3' || u === 'kg/dm3') return value;
  if (u === 'kg/m3') return value / 1000;
  return null;
};

/** Données nécessaires à l'estimation du poids : masse volumique par nuance, forme par format, mm par unité. */
export function useMaterialWeightData() {
  return useQuery({
    queryKey: ['material-weight-data'],
    queryFn: async (): Promise<MaterialWeightData> => {
      const [d, g, f, u] = await Promise.all([
        sb.from('material_densities').select('id, value, unit'),
        sb.from('material_grades').select('id, density_id'),
        sb.from('material_formats').select('id, shape'),
        sb.from('material_units').select('id, mm_per_unit'),
      ]);
      for (const r of [d, g, f, u]) if (r.error) throw r.error;

      const densityById = new Map<string, number>();
      for (const r of d.data || []) {
        const v = toGcm3(Number(r.value), String(r.unit ?? ''));
        if (v != null && v > 0) densityById.set(r.id, v);
      }
      const gradeDensity = new Map<string, number>();
      for (const r of g.data || []) {
        const v = r.density_id ? densityById.get(r.density_id) : undefined;
        if (v != null) gradeDensity.set(r.id, v);
      }
      const formatShape = new Map<string, string>();
      for (const r of f.data || []) if (r.shape) formatShape.set(r.id, r.shape);
      const unitMm = new Map<string, number>();
      for (const r of u.data || []) if (r.mm_per_unit != null && Number(r.mm_per_unit) > 0) unitMm.set(r.id, Number(r.mm_per_unit));
      return { gradeDensity, formatShape, unitMm };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface MaterialSheet {
  id: string;
  code: string;
  gradeId: string;
  formatId: string;
  dimensionId: string;
  orderUnitId: string | null;
  purchaseUnitId: string | null;
  active: boolean;
}

const SHEETS_KEY = ['material-sheets'];
const SUPPLIER_PRICES_KEY = ['material-supplier-prices'];

/** Fiches matière : une ligne par identifiant (Id0001…), avec nuance, format, dimension et unités. */
export function useMaterialSheets() {
  return useQuery({
    queryKey: SHEETS_KEY,
    queryFn: async (): Promise<MaterialSheet[]> => {
      const { data, error } = await sb
        .from('materials')
        .select('id, code, grade_id, format_id, dimension_id, order_unit_id, purchase_unit_id, is_active');
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        code: r.code,
        gradeId: r.grade_id,
        formatId: r.format_id,
        dimensionId: r.dimension_id,
        orderUnitId: r.order_unit_id,
        purchaseUnitId: r.purchase_unit_id,
        active: r.is_active !== false,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Masse volumique de chaque nuance : id nuance → id de la masse volumique. */
export function useGradeDensityIds() {
  return useQuery({
    queryKey: ['material-grade-density'],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await sb.from('material_grades').select('id, density_id');
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of data || []) if (r.density_id) map.set(r.id, r.density_id);
      return map;
    },
  });
}

export interface MaterialSheetInput {
  /** Absent = création d'une nouvelle fiche. */
  id?: string;
  gradeId: string;
  formatId: string;
  dimensionId: string;
  orderUnitId: string | null;
  purchaseUnitId: string | null;
  /** Masse volumique à appliquer à la nuance (undefined = ne pas toucher à la nuance). */
  densityId?: string | null;
}

/** Crée ou modifie une fiche matière ; renvoie son id. La masse volumique est portée par la nuance. */
export function useSaveMaterialSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: MaterialSheetInput): Promise<string> => {
      const payload = {
        grade_id: s.gradeId,
        format_id: s.formatId,
        dimension_id: s.dimensionId,
        order_unit_id: s.orderUnitId,
        purchase_unit_id: s.purchaseUnitId,
      };
      let id = s.id;
      if (id) {
        const { data, error } = await sb.from('materials').update(payload).eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Modification refusée : droit d’écriture manquant.');
      } else {
        const { data, error } = await sb.from('materials').insert(payload).select('id').single();
        if (error) throw error;
        id = data.id as string;
      }
      if (s.densityId !== undefined) {
        const { data, error } = await sb
          .from('material_grades')
          .update({ density_id: s.densityId })
          .eq('id', s.gradeId)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Masse volumique refusée : droit d’écriture manquant.');
      }
      return id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHEETS_KEY });
      qc.invalidateQueries({ queryKey: COMBOS_KEY });
      qc.invalidateQueries({ queryKey: ['material-grade-density'] });
      qc.invalidateQueries({ queryKey: ['material-weight-data'] });
    },
  });
}

export interface MaterialSupplierPrice {
  /** id du lien matière ↔ fournisseur */
  id: string;
  materialId: string;
  supplierId: string;
  supplierName: string;
  active: boolean;
  lastPriceDate: string | null;
  lastUnitPrice: number | null;
  lastPriceUnitId: string | null;
  lastPriceUnitLabel: string | null;
  lastFeeDate: string | null;
  lastFeeAmount: number | null;
  lastFeeLabel: string | null;
}

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

/** Fournisseurs habituels de chaque matière, avec dernier prix d'achat et derniers frais de découpe (vide sans le droit n° 30). */
export function useMaterialSupplierPrices() {
  return useQuery({
    queryKey: SUPPLIER_PRICES_KEY,
    queryFn: async (): Promise<MaterialSupplierPrice[]> => {
      const { data, error } = await sb.from('material_supplier_last_prices').select('*');
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.material_supplier_id,
        materialId: r.material_id,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name ?? '',
        active: r.is_active !== false,
        lastPriceDate: r.last_price_date,
        lastUnitPrice: toNum(r.last_unit_price),
        lastPriceUnitId: r.last_price_unit_id,
        lastPriceUnitLabel: r.last_price_unit_label,
        lastFeeDate: r.last_fee_date,
        lastFeeAmount: toNum(r.last_fee_amount),
        lastFeeLabel: r.last_fee_label,
      }));
    },
    staleTime: 60 * 1000,
  });
}

export interface MaterialUsageItem {
  kind: 'order' | 'purchase' | 'purchase_order' | 'goods_receipt';
  label: string;
}

const USAGE_KEY = ['material-usage'];

/** Où une matière est utilisée (commandes et achats). Vide = modifiable et supprimable. */
async function fetchMaterialUsage(materialId: string): Promise<MaterialUsageItem[]> {
  const { data: mat, error: matErr } = await sb
    .from('materials')
    .select('grade_id, format_id, dimension_id')
    .eq('id', materialId)
    .single();
  if (matErr) throw matErr;
  const key = [{ gradeId: mat.grade_id, formatId: mat.format_id, dimensionId: mat.dimension_id }];
  const [steps, purchases] = await Promise.all([
    sb.from('production_steps').select('orders(order_number)').contains('raw_material_items', key),
    sb.from('material_purchase_lines').select('material_purchases(document_ref, purchase_date)').eq('material_id', materialId),
  ]);
  if (steps.error) throw steps.error;
  if (purchases.error) throw purchases.error;
  const orders = Array.from(new Set<string>((steps.data || []).map((r: any) => r.orders?.order_number).filter(Boolean))).sort();
  const items: MaterialUsageItem[] = orders.map(label => ({ kind: 'order', label }));
  for (const r of purchases.data || []) {
    const p = (r as any).material_purchases;
    const date = p?.purchase_date ? new Date(`${p.purchase_date}T00:00:00`).toLocaleDateString('fr-FR') : '';
    items.push({ kind: 'purchase', label: p?.document_ref || date || 'sans référence' });
  }
  return items;
}

export function useMaterialUsage(materialId: string | null) {
  return useQuery({
    queryKey: [...USAGE_KEY, materialId],
    enabled: !!materialId,
    staleTime: 0,
    queryFn: () => fetchMaterialUsage(materialId as string),
  });
}

/** Supprime une matière jamais utilisée (vérification refaite au moment de la suppression). */
export function useDeleteMaterialSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const used = await fetchMaterialUsage(id);
      if (used.length > 0) throw new Error('Suppression impossible : cette matière est déjà utilisée.');
      const { error: linkErr } = await sb.from('material_suppliers').delete().eq('material_id', id);
      if (linkErr) throw linkErr;
      const { data, error } = await sb.from('materials').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Suppression refusée : droit d’écriture manquant.');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: SHEETS_KEY });
      qc.invalidateQueries({ queryKey: COMBOS_KEY });
      qc.invalidateQueries({ queryKey: SUPPLIER_PRICES_KEY });
      qc.invalidateQueries({ queryKey: USAGE_KEY });
    },
  });
}
/** Rattache un fournisseur à une matière (le réactive s'il était désactivé). */
export function useAddMaterialSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { materialId: string; supplierId: string }) => {
      const keys = { material_id: v.materialId, supplier_id: v.supplierId };
      const { error } = await sb.from('material_suppliers').insert(keys);
      if (error) {
        if ((error as any).code !== '23505') throw error;
        const { data, error: upErr } = await sb.from('material_suppliers').update({ is_active: true }).match(keys).select('id');
        if (upErr) throw upErr;
        if (!data || data.length === 0) throw new Error('Modification refusée : droit d’écriture manquant.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPPLIER_PRICES_KEY }),
  });
}

/** Active / désactive le lien matière ↔ fournisseur. */
export function useToggleMaterialSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { data, error } = await sb.from('material_suppliers').update({ is_active: v.active }).eq('id', v.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Modification refusée : droit d’écriture manquant.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPPLIER_PRICES_KEY }),
  });
}

export interface MaterialPurchaseInput {
  materialId: string;
  supplierId: string;
  /** AAAA-MM-JJ */
  date: string;
  quantity: number;
  unitId: string;
  unitPrice: number;
  feeAmount: number | null;
  feeLabel: string | null;
  documentRef: string | null;
}

/** Enregistre un achat (facture + ligne matière + frais de découpe éventuels) en une seule opération. */
export function useRecordMaterialPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: MaterialPurchaseInput): Promise<string> => {
      const { data, error } = await sb.rpc('record_material_purchase', {
        p_material_id: p.materialId,
        p_supplier_id: p.supplierId,
        p_purchase_date: p.date,
        p_quantity: p.quantity,
        p_unit_id: p.unitId,
        p_unit_price: p.unitPrice,
        p_fee_amount: p.feeAmount,
        p_fee_label: p.feeLabel,
        p_document_ref: p.documentRef,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPPLIER_PRICES_KEY }),
  });
}
export interface OrderMaterialPurchaseInput extends MaterialPurchaseInput {
  orderId: string;
  /** id de la ligne matière dans la commande (ResourceItem.id) */
  orderItemId: string;
}

export interface OrderItemPurchase {
  purchaseId: string;
  supplierId: string | null;
  supplierName: string;
  date: string | null;
  documentRef: string | null;
  /** matière + frais de découpe */
  total: number;
}

/** Achat déjà enregistré pour une ligne de commande (null = aucun). Évite d'enregistrer deux fois le même achat. */
export function useOrderItemPurchase(orderItemId: string | null) {
  return useQuery({
    queryKey: ['order-item-purchase', orderItemId],
    enabled: !!orderItemId,
    staleTime: 0,
    queryFn: async (): Promise<OrderItemPurchase | null> => {
      const { data, error } = await sb
        .from('material_purchase_lines')
        .select('purchase_id, amount, material_purchases(purchase_date, document_ref, supplier_id, suppliers(name))')
        .eq('order_item_id', orderItemId)
        .eq('is_active', true);
      if (error) throw error;
      const lines = (data || []) as any[];
      if (lines.length === 0) return null;
      const head = lines[0].material_purchases;
      return {
        purchaseId: lines[0].purchase_id as string,
        supplierId: head?.supplier_id ?? null,
        supplierName: head?.suppliers?.name ?? '',
        date: head?.purchase_date ?? null,
        documentRef: head?.document_ref ?? null,
        total: lines.reduce((sum, l) => sum + Number(l.amount ?? 0), 0),
      };
    },
  });
}

/**
 * Enregistre l'achat d'une ligne de commande : même opération que useRecordMaterialPurchase, puis
 * rattache les lignes de la facture à la commande et lie le fournisseur à la matière (pour que le
 * dernier prix apparaisse dans la fiche matière).
 */
export function useRecordOrderMaterialPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: OrderMaterialPurchaseInput): Promise<{ purchaseId: string; orderLinked: boolean }> => {
      const { data, error } = await sb.rpc('record_material_purchase', {
        p_material_id: p.materialId,
        p_supplier_id: p.supplierId,
        p_purchase_date: p.date,
        p_quantity: p.quantity,
        p_unit_id: p.unitId,
        p_unit_price: p.unitPrice,
        p_fee_amount: p.feeAmount,
        p_fee_label: p.feeLabel,
        p_document_ref: p.documentRef,
      });
      if (error) throw error;
      const purchaseId = data as string;

      const { data: linked, error: linkErr } = await sb
        .from('material_purchase_lines')
        .update({ order_id: p.orderId, order_item_id: p.orderItemId })
        .eq('purchase_id', purchaseId)
        .select('id');
      const orderLinked = !linkErr && !!linked && linked.length > 0;

      // Fournisseur habituel de la matière (au mieux : demande le droit n° 29, sans incidence sur l'achat).
      try {
        const keys = { material_id: p.materialId, supplier_id: p.supplierId };
        const { error: supErr } = await sb.from('material_suppliers').insert(keys);
        if (supErr && (supErr as any).code === '23505') {
          await sb.from('material_suppliers').update({ is_active: true }).match(keys);
        }
      } catch {
        /* ignoré */
      }

      return { purchaseId, orderLinked };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_PRICES_KEY });
      qc.invalidateQueries({ queryKey: USAGE_KEY });
      qc.invalidateQueries({ queryKey: ['order-item-purchase'] });
    },
  });
}
