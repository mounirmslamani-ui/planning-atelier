import React, { useMemo } from 'react';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import ReferenceCombobox from '@/components/ui/reference-combobox';
import { useAuth } from '@/context/AuthContext';
import {
  useCreateMaterialReference,
  useEnsureMaterialCombination,
  useMaterialCombinations,
  useMaterialReference,
  useMaterialWeightData,
} from '@/hooks/useMaterialReferences';
import type { MaterialRefOption } from '@/hooks/useMaterialReferences';
import type { ResourceItem } from '@/types/planning';
import { estimateWeightKg } from '@/lib/materialWeight';
import { cn } from '@/lib/utils';

/** Droit d'écriture sur les tables de référence matière première (rights_catalog n° 29). */
const REFERENCE_RIGHT = { tableau: 'مرجعيات المادة الأولية' };

type ItemKind = NonNullable<ResourceItem['kind']>;

/** Ordre de rotation du bouton commutateur. */
const KIND_ORDER: ItemKind[] = ['raw', 'fasteners', 'bearings', 'other'];
const KIND_LABEL: Record<ItemKind, string> = {
  raw: 'Matière première',
  fasteners: 'Visserie',
  bearings: 'Roulements',
  other: 'Autre',
};

/** Libellé de synthèse conservé dans item.label (lu par les achats, le coût, le suivi, etc.). */
const buildMaterialLabel = (p: {
  grade?: string; format?: string; dimension?: string; quantity?: number; unit?: string;
}) => {
  const head = [p.grade, p.format, p.dimension].filter(Boolean).join(' ');
  const hasQty = p.quantity != null && !Number.isNaN(p.quantity);
  const tail = [hasQty ? String(p.quantity) : '', p.unit].filter(Boolean).join(' ');
  return [head, tail].filter(Boolean).join(' - ');
};

/** Libellé de synthèse d'un composant : « Roulement 6206 2RS × 4 ». */
const buildComponentLabel = (designation?: string, quantity?: number) => {
  const d = (designation ?? '').trim();
  if (!d) return '';
  return quantity != null && !Number.isNaN(quantity) ? `${d} × ${quantity}` : d;
};

type StructuredPatch = Partial<Pick<
  ResourceItem,
  'gradeId' | 'formatId' | 'dimensionId' | 'quantity' | 'unitId' | 'label' | 'kind' | 'designation' | 'componentQuantity' | 'observation'
>>;

interface Props {
  item: ResourceItem;
  disabled?: boolean;
  onChange: (patch: StructuredPatch) => void;
}

/** Garde uniquement les valeurs dont l'id est dans `ids` (+ la valeur déjà choisie, pour qu'elle reste affichée). */
const restrictTo = (all: MaterialRefOption[] | undefined, ids: Set<string>, selectedId?: string) =>
  (all || []).filter(o => (o.active && ids.has(o.id)) || o.id === selectedId);

const MaterialItemFields: React.FC<Props> = ({ item, disabled, onChange }) => {
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(REFERENCE_RIGHT) === 'RW';

  const grades = useMaterialReference('grades');
  const formats = useMaterialReference('formats');
  const dimensions = useMaterialReference('dimensions');
  const units = useMaterialReference('units');
  const combos = useMaterialCombinations();
  const weight = useMaterialWeightData();

  const createGrade = useCreateMaterialReference('grades');
  const createFormat = useCreateMaterialReference('formats');
  const createDimension = useCreateMaterialReference('dimensions');
  const createUnit = useCreateMaterialReference('units');
  const ensureCombo = useEnsureMaterialCombination();

  const kind: ItemKind = item.kind ?? 'raw';
  const isRaw = kind === 'raw';

  // Les combinaisons sont uniques : un format n'est proposé que s'il existe pour la nuance choisie,
  // une dimension que si elle existe pour la nuance ET le format choisis.
  const activeCombos = useMemo(() => (combos.data || []).filter(c => c.active), [combos.data]);

  const formatOptions = useMemo(() => {
    const ids = new Set(activeCombos.filter(c => c.gradeId === item.gradeId).map(c => c.formatId));
    return restrictTo(formats.data, ids, item.formatId);
  }, [activeCombos, formats.data, item.gradeId, item.formatId]);

  const dimensionOptions = useMemo(() => {
    const ids = new Set(
      activeCombos.filter(c => c.gradeId === item.gradeId && c.formatId === item.formatId).map(c => c.dimensionId),
    );
    return restrictTo(dimensions.data, ids, item.dimensionId);
  }, [activeCombos, dimensions.data, item.gradeId, item.formatId, item.dimensionId]);

  const gradeOptions = useMemo(
    () => (grades.data || []).filter(o => o.active || o.id === item.gradeId),
    [grades.data, item.gradeId],
  );

  const nameOf = (list: MaterialRefOption[] | undefined, id?: string) =>
    id ? (list?.find(o => o.id === id)?.label ?? '') : '';

  const commit = (
    patch: StructuredPatch,
    names: { grade?: string; format?: string; dimension?: string; unit?: string } = {},
  ) => {
    const next = { ...item, ...patch };
    const label = buildMaterialLabel({
      grade: names.grade ?? nameOf(grades.data, next.gradeId),
      format: names.format ?? nameOf(formats.data, next.formatId),
      dimension: names.dimension ?? nameOf(dimensions.data, next.dimensionId),
      quantity: next.quantity,
      unit: names.unit ?? nameOf(units.data, next.unitId),
    });
    onChange({ ...patch, label });
  };

  /** Ajout d'une valeur (ou réutilisation de l'existante) ; `after` enregistre la combinaison si besoin. */
  const creator = (
    mutate: (label: string) => Promise<MaterialRefOption>,
    after?: (created: MaterialRefOption) => Promise<void>,
  ) => {
    if (!canCreate) return undefined;
    return async (label: string) => {
      try {
        const created = await mutate(label);
        if (after) await after(created);
        return created;
      } catch (err) {
        toast.error('تعذّرت إضافة القيمة');
        throw err;
      }
    };
  };

  const weightEstimate = (() => {
    if (!item.gradeId || !item.formatId || !item.dimensionId || !item.unitId) return null;
    const est = estimateWeightKg({
      shape: weight.data?.formatShape.get(item.formatId),
      dimensionLabel: nameOf(dimensions.data, item.dimensionId),
      quantity: item.quantity,
      mmPerUnit: weight.data?.unitMm.get(item.unitId),
      densityGcm3: weight.data?.gradeDensity.get(item.gradeId),
    });
    if (!est) return null;
    return { detail: est.detail, kgText: est.kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) };
  })();

  const isLegacy =
    !item.gradeId && !item.formatId && !item.dimensionId && !item.unitId && item.quantity == null &&
    !!item.label && !!item.label.trim();

  /**
   * Bouton commutateur : matière première → visserie → roulements → autre → matière première.
   * Les saisies de l'autre type ne sont pas effacées (on peut revenir en arrière sans rien perdre) ;
   * seul le libellé de synthèse est recalculé selon le type affiché.
   */
  const cycleKind = () => {
    const next = KIND_ORDER[(KIND_ORDER.indexOf(kind) + 1) % KIND_ORDER.length];
    if (next === 'raw') {
      const rawLabel = buildMaterialLabel({
        grade: nameOf(grades.data, item.gradeId),
        format: nameOf(formats.data, item.formatId),
        dimension: nameOf(dimensions.data, item.dimensionId),
        quantity: item.quantity,
        unit: nameOf(units.data, item.unitId),
      });
      onChange({ kind: next, label: rawLabel || item.label });
      return;
    }
    // Une ancienne ligne en texte libre sert de désignation de départ.
    const designation = item.designation || (isLegacy ? item.label.trim() : '');
    onChange({ kind: next, designation, label: buildComponentLabel(designation, item.componentQuantity) });
  };

  return (
    <div className="flex-1 min-w-0 space-y-1">
      <button
        type="button"
        onClick={cycleKind}
        disabled={disabled}
        title="Cliquer pour changer le type : matière première → visserie → roulements → autre"
        className={cn(
          'inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] disabled:opacity-50',
          isRaw ? 'bg-background text-muted-foreground' : 'bg-accent text-accent-foreground font-medium',
        )}
      >
        <Repeat className="w-3 h-3" />
        {KIND_LABEL[kind]}
      </button>

      {isRaw ? (
        <>
          {isLegacy && (
            <div className="text-[11px] text-muted-foreground truncate" title={item.label}>
              {item.label}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1">
            <ReferenceCombobox
              title="Nuance"
              placeholder="Nuance"
              disabled={disabled}
              value={item.gradeId}
              options={gradeOptions}
              onSelect={o => {
                if (o?.id === item.gradeId) return;
                // Changer de nuance invalide le format et la dimension déjà choisis.
                commit({ gradeId: o?.id, formatId: undefined, dimensionId: undefined }, { grade: o?.label ?? '', format: '', dimension: '' });
              }}
              onCreate={creator(l => createGrade.mutateAsync(l))}
            />
            <ReferenceCombobox
              title={item.gradeId ? 'Format' : 'Choisir d’abord la nuance'}
              placeholder="Format"
              disabled={disabled || !item.gradeId}
              value={item.formatId}
              options={formatOptions}
              onSelect={o => {
                if (o?.id === item.formatId) return;
                commit({ formatId: o?.id, dimensionId: undefined }, { format: o?.label ?? '', dimension: '' });
              }}
              onCreate={creator(l => createFormat.mutateAsync(l))}
            />
            <ReferenceCombobox
              title={item.formatId ? 'Dimension' : 'Choisir d’abord le format'}
              placeholder="Dimension"
              disabled={disabled || !item.gradeId || !item.formatId}
              value={item.dimensionId}
              options={dimensionOptions}
              onSelect={o => commit({ dimensionId: o?.id }, { dimension: o?.label ?? '' })}
              onCreate={creator(
                l => createDimension.mutateAsync(l),
                async created => {
                  await ensureCombo.mutateAsync({ gradeId: item.gradeId!, formatId: item.formatId!, dimensionId: created.id });
                },
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Input
              type="number"
              min={0}
              step="any"
              title="Quantité (longueur)"
              placeholder="Longueur"
              className="h-7 text-xs px-1"
              disabled={disabled}
              value={item.quantity ?? ''}
              onChange={ev => {
                const v = ev.target.value;
                commit({ quantity: v === '' ? undefined : Number(v) });
              }}
            />
            <ReferenceCombobox
              title="Unité"
              placeholder="Unité"
              disabled={disabled}
              value={item.unitId}
              options={units.data || []}
              onSelect={o => commit({ unitId: o?.id }, { unit: o?.label ?? '' })}
              onCreate={creator(l => createUnit.mutateAsync(l))}
            />
          </div>
          {weightEstimate && (
            <div className="text-[11px] text-muted-foreground" title={weightEstimate.detail}>
              ≈ {weightEstimate.kgText} kg
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-[1fr_5rem] gap-1">
          <Input
            title="Désignation"
            placeholder="Désignation (ex. Roulement 6206 2RS)"
            className="h-7 text-xs px-1"
            disabled={disabled}
            value={item.designation ?? ''}
            onChange={ev => {
              const v = ev.target.value;
              onChange({ designation: v, label: buildComponentLabel(v, item.componentQuantity) });
            }}
          />
          <Input
            type="number"
            min={0}
            step="any"
            title="Quantité (nombre de pièces)"
            placeholder="Quantité"
            className="h-7 text-xs px-1"
            disabled={disabled}
            value={item.componentQuantity ?? ''}
            onChange={ev => {
              const v = ev.target.value;
              const q = v === '' ? undefined : Number(v);
              onChange({ componentQuantity: q, label: buildComponentLabel(item.designation, q) });
            }}
          />
        </div>
      )}

      <Input
        title="Observation"
        placeholder={isRaw ? 'Observation (ex. débitage)' : 'Observation'}
        className="h-7 text-xs px-1"
        disabled={disabled}
        value={item.observation ?? ''}
        onChange={ev => onChange({ observation: ev.target.value })}
      />
    </div>
  );
};

export default MaterialItemFields;
