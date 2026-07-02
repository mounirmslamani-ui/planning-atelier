import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SearchableSelect from '@/components/ui/searchable-select';
import { Plus, X } from 'lucide-react';
import type { AddressDetail, AddressNature } from '@/types/planning';

const NATURES: AddressNature[] = ['مصنع', 'ملحقة', 'ورشة', 'إدارة', 'مخزن'];

interface Props {
  addresses: string[];
  details: AddressDetail[];
  onChange: (addresses: string[], details: AddressDetail[]) => void;
}

const AddressesEditor: React.FC<Props> = ({ addresses, details, onChange }) => {
  const list = addresses || [];
  const meta = details || [];

  const getMeta = (i: number): AddressDetail => meta[i] || {};

  const add = () => onChange([...list, ''], [...meta, {}]);
  const setAddr = (i: number, v: string) => {
    const arr = [...list]; arr[i] = v;
    onChange(arr, meta);
  };
  const setMeta = (i: number, patch: Partial<AddressDetail>) => {
    const arr = [...meta];
    while (arr.length < list.length) arr.push({});
    arr[i] = { ...arr[i], ...patch };
    onChange(list, arr);
  };
  const remove = (i: number) => {
    onChange(list.filter((_, idx) => idx !== i), meta.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">العناوين</label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={add}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {list.length === 0 && <p className="text-xs italic text-muted-foreground">—</p>}
      {list.map((v, i) => {
        const m = getMeta(i);
        return (
          <div key={i} className="space-y-1 rounded-md border bg-background/40 p-1.5">
            <div className="flex gap-1">
              <Input
                value={v}
                placeholder="العنوان الفيزيائي"
                onChange={e => setAddr(i, e.target.value)}
                className="h-8 text-xs"
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)}>
                <X className="w-3 h-3 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <SearchableSelect
                value={m.nature || ''}
                onValueChange={(val) => setMeta(i, { nature: (val || undefined) as AddressNature | undefined })}
                placeholder="طبيعة العنوان"
                className="h-8 text-xs"
                dir="rtl"
                options={NATURES.map(n => ({ value: n, label: n }))}
              />
              <Input
                value={m.gps || ''}
                placeholder="موقع GPS (رابط أو إحداثيات)"
                onChange={e => setMeta(i, { gps: e.target.value })}
                className="h-8 text-xs"
                dir="ltr"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AddressesEditor;
