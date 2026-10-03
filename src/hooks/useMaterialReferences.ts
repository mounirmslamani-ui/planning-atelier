import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MaterialRefKind = 'grades' | 'formats' | 'dimensions' | 'units' | 'densities';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: COMBOS_KEY }),
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
