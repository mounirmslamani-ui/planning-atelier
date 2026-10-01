import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MaterialRefKind = 'grades' | 'formats' | 'dimensions' | 'units';

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
