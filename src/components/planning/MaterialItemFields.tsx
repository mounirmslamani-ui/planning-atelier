import React from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import ReferenceCombobox from '@/components/ui/reference-combobox';
import { useAuth } from '@/context/AuthContext';
import { useCreateMaterialReference, useMaterialReference } from '@/hooks/useMaterialReferences';
import type { MaterialRefOption } from '@/hooks/useMaterialReferences';
import type { ResourceItem } from '@/types/planning';

/** Droit d'écriture sur les tables de référence matière première (rights_catalog n° 29). */
const REFERENCE_RIGHT = { tableau: 'مرجعيات المادة الأولية' };

/** Libellé de synthèse conservé dans item.label (lu par les achats, le coût, le suivi, etc.). */
const buildMaterialLabel = (p: {
  grade?: string; format?: string; dimension?: string; quantity?: number; unit?: string;
}) => {
  const head = [p.grade, p.format, p.dimension].filter(Boolean).join(' ');
  const hasQty = p.quantity != null && !Number.isNaN(p.quantity);
  const tail = [hasQty ? String(p.quantity) : '', p.unit].filter(Boolean).join(' ');
  return [head, tail].filter(Boolean).join(' - ');
};

type StructuredPatch = Partial<Pick<ResourceItem, 'gradeId' | 'formatId' | 'dimensionId' | 'quantity' | 'unitId' | 'label'>>;

interface Props {
  item: ResourceItem;
  disabled?: boolean;
  onChange: (patch: StructuredPatch) => void;
}

const MaterialItemFields: React.FC<Props> = ({ item, disabled, onChange }) => {
  const { hasAccess } = useAuth();
  const canCreate = hasAccess(REFERENCE_RIGHT) === 'RW';

  const grades = useMaterialReference('grades');
  const formats = useMaterialReference('formats');
  const dimensions = useMaterialReference('dimensions');
  const units = useMaterialReference('units');

  const createGrade = useCreateMaterialReference('grades');
  const createFormat = useCreateMaterialReference('formats');
  const createDimension = useCreateMaterialReference('dimensions');
  const createUnit = useCreateMaterialReference('units');

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

  const creator = (mutate: (label: string) => Promise<MaterialRefOption>) => {
    if (!canCreate) return undefined;
    return async (label: string) => {
      try {
        return await mutate(label);
      } catch (err) {
        toast.error('تعذّرت إضافة القيمة');
        throw err;
      }
    };
  };

  const isLegacy =
    !item.gradeId && !item.formatId && !item.dimensionId && !item.unitId && item.quantity == null &&
    !!item.label && !!item.label.trim();

  return (
    <div className="flex-1 min-w-0 space-y-1">
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
          options={grades.data || []}
          onSelect={o => commit({ gradeId: o?.id }, { grade: o?.label ?? '' })}
          onCreate={creator(l => createGrade.mutateAsync(l))}
        />
        <ReferenceCombobox
          title="Format"
          placeholder="Format"
          disabled={disabled}
          value={item.formatId}
          options={formats.data || []}
          onSelect={o => commit({ formatId: o?.id }, { format: o?.label ?? '' })}
          onCreate={creator(l => createFormat.mutateAsync(l))}
        />
        <ReferenceCombobox
          title="Dimension"
          placeholder="Dimension"
          disabled={disabled}
          value={item.dimensionId}
          options={dimensions.data || []}
          onSelect={o => commit({ dimensionId: o?.id }, { dimension: o?.label ?? '' })}
          onCreate={creator(l => createDimension.mutateAsync(l))}
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
    </div>
  );
};

export default MaterialItemFields;
