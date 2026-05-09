import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

interface Props {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  type?: string;
}

const StringListEditor: React.FC<Props> = ({ label, value, onChange, placeholder, type = 'text' }) => {
  const add = () => onChange([...(value || []), '']);
  const set = (i: number, v: string) => {
    const arr = [...value];
    arr[i] = v;
    onChange(arr);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={add}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {(value || []).length === 0 && <p className="text-xs italic text-muted-foreground">—</p>}
      {(value || []).map((v, i) => (
        <div key={i} className="flex gap-1">
          <Input
            type={type}
            value={v}
            placeholder={placeholder}
            onChange={e => set(i, e.target.value)}
            className="h-8 text-xs"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)}>
            <X className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
};

export default StringListEditor;
