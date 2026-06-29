import React, { useState } from 'react';
import type { Representative } from '@/types/planning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X, ChevronDown, ChevronRight, User } from 'lucide-react';

interface Props {
  value: Representative[];
  onChange: (next: Representative[]) => void;
}

const newRep = (): Representative => ({
  id: crypto.randomUUID(),
  name: '',
  phones: [],
  emails: [],
});

const RepresentativesEditor: React.FC<Props> = ({ value, onChange }) => {
  const [openId, setOpenId] = useState<string | null>(value[0]?.id || null);

  const update = (id: string, patch: Partial<Representative>) =>
    onChange(value.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(value.filter(r => r.id !== id));
  const add = () => {
    const r = newRep();
    onChange([...value, r]);
    setOpenId(r.id);
  };

  const addItem = (id: string, field: 'phones' | 'emails') => {
    const rep = value.find(r => r.id === id);
    if (!rep) return;
    update(id, { [field]: [...(rep[field] || []), ''] } as any);
  };
  const setItem = (id: string, field: 'phones' | 'emails', idx: number, v: string) => {
    const rep = value.find(r => r.id === id);
    if (!rep) return;
    const arr = [...(rep[field] || [])];
    arr[idx] = v;
    update(id, { [field]: arr } as any);
  };
  const removeItem = (id: string, field: 'phones' | 'emails', idx: number) => {
    const rep = value.find(r => r.id === id);
    if (!rep) return;
    update(id, { [field]: (rep[field] || []).filter((_, i) => i !== idx) } as any);
  };

  const renderList = (rep: Representative, field: 'phones' | 'emails', label: string, type: string = 'text', placeholder?: string) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={() => addItem(rep.id, field)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {(rep[field] || []).length === 0 && <p className="text-xs italic text-muted-foreground">—</p>}
      {(rep[field] || []).map((v, i) => (
        <div key={i} className="flex gap-1">
          <Input
            type={type}
            value={v}
            placeholder={placeholder}
            onChange={e => setItem(rep.id, field, i, e.target.value)}
            className="h-8 text-xs"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(rep.id, field, i)}>
            <X className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">ممثلو الزبون / المناول</label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="w-3 h-3 ml-1" /> ممثل جديد
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs italic text-muted-foreground border rounded p-3">لا يوجد ممثل مسجل</p>
      )}
      <div className="space-y-2">
        {value.map(rep => {
          const isOpen = openId === rep.id;
          return (
            <div key={rep.id} className="border rounded-md">
              <div className="flex items-center gap-2 p-2 bg-muted/40">
                <button type="button" onClick={() => setOpenId(isOpen ? null : rep.id)}>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <User className="w-4 h-4 text-muted-foreground" />
                <Input
                  value={rep.name}
                  placeholder="اسم الممثل"
                  onChange={e => update(rep.id, { name: e.target.value })}
                  className="h-7 text-sm flex-1"
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(rep.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
              {isOpen && (
                <div className="p-3 space-y-3">
                  {renderList(rep, 'phones', 'أرقام الهاتف', 'tel', '+213 ...')}
                  {renderList(rep, 'emails', 'البريد الإلكتروني', 'email', 'name@example.com')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RepresentativesEditor;
