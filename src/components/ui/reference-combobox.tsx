tsx
import React, { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ReferenceOption {
  id: string;
  label: string;
  active?: boolean;
}

interface ReferenceComboboxProps {
  /** Id de la valeur sélectionnée ('' ou undefined = aucune). */
  value?: string;
  /** Toutes les valeurs connues (les désactivées servent à afficher une sélection ancienne, mais ne sont pas proposées). */
  options: ReferenceOption[];
  /** Appelé avec l'option choisie, ou null si la case est vidée. */
  onSelect: (option: ReferenceOption | null) => void;
  /** Si fourni, propose « ＋ ajouter » quand le texte saisi n'existe pas encore. */
  onCreate?: (label: string) => Promise<ReferenceOption>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Vrai si la requête correspond au DÉBUT du libellé ou au début de l'un de ses mots. */
const matchesWordStart = (label: string, query: string) => {
  const q = normalize(query);
  if (!q) return true;
  return new RegExp(`(^|[\\s\\-_/.,()×])${escapeRegExp(q)}`).test(normalize(label));
};

/**
 * Case de saisie avec liste déroulante : on tape le début d'un mot, la liste se filtre.
 * Peut proposer l'ajout d'une nouvelle valeur si l'utilisateur en a le droit.
 */
const ReferenceCombobox: React.FC<ReferenceComboboxProps> = ({
  value, options, onSelect, onCreate, placeholder, disabled, className, title,
}) => {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => options.find(o => o.id === value), [options, value]);
  const inputValue = typing ? query : (selected?.label ?? '');

  const filtered = useMemo(() => {
    const q = normalize(query);
    const list = options.filter(o => o.active !== false && matchesWordStart(o.label, query));
    // Les libellés qui commencent par la saisie passent en premier.
    return [...list].sort((a, b) => {
      const sa = normalize(a.label).startsWith(q) ? 0 : 1;
      const sb = normalize(b.label).startsWith(q) ? 0 : 1;
      return sa - sb;
    });
  }, [options, query]);

  const trimmed = query.trim();
  const exactExists = options.some(o => normalize(o.label) === normalize(trimmed));
  const showCreate = !!onCreate && trimmed.length > 0 && !exactExists;
  const rowCount = filtered.length + (showCreate ? 1 : 0);

  const close = () => { setOpen(false); setTyping(false); setQuery(''); setHighlight(0); };

  const choose = (o: ReferenceOption) => { onSelect(o); close(); };

  const create = async () => {
    if (!onCreate || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(trimmed);
      choose(created);
    } catch {
      /* l'erreur est signalée par l'appelant */
    } finally {
      setBusy(false);
    }
  };

  const activate = (index: number) => {
    if (index < filtered.length) choose(filtered[index]);
    else if (showCreate) void create();
  };

  return (
    <Popover open={open && !disabled} onOpenChange={o => { if (!o) close(); }}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          className={cn('h-7 text-xs px-1', className)}
          value={inputValue}
          placeholder={placeholder}
          title={title}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={ev => { setTyping(true); setQuery(ev.target.value); setHighlight(0); setOpen(true); }}
          onBlur={() => {
            // Case vidée puis quittée → on efface la sélection.
            if (typing && query.trim() === '' && selected) onSelect(null);
            close();
          }}
          onKeyDown={ev => {
            if (ev.key === 'ArrowDown') { ev.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, Math.max(rowCount - 1, 0))); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
            else if (ev.key === 'Enter') { if (open && rowCount > 0) { ev.preventDefault(); activate(highlight); } }
            else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="p-1 w-56 max-h-56 overflow-y-auto"
        onOpenAutoFocus={ev => ev.preventDefault()}
        onCloseAutoFocus={ev => ev.preventDefault()}
        onInteractOutside={ev => { if (inputRef.current?.contains(ev.target as Node)) ev.preventDefault(); }}
        onMouseDown={ev => ev.preventDefault()}
      >
        <div role="listbox" className="space-y-0.5">
          {filtered.map((o, idx) => (
            <button
              type="button"
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              onClick={() => choose(o)}
              onMouseEnter={() => setHighlight(idx)}
              className={cn(
                'w-full text-start text-xs px-2 py-1 rounded cursor-pointer truncate',
                idx === highlight && 'bg-accent text-accent-foreground',
                o.id === value && 'font-medium',
              )}
            >
              {o.label}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => void create()}
              onMouseEnter={() => setHighlight(filtered.length)}
              disabled={busy}
              className={cn(
                'w-full flex items-center gap-1 text-start text-xs px-2 py-1 rounded cursor-pointer text-primary',
                highlight === filtered.length && 'bg-accent',
              )}
            >
              <Plus className="w-3 h-3 shrink-0" />
              <span className="truncate">إضافة « {trimmed} »</span>
            </button>
          )}
          {rowCount === 0 && (
            <div className="text-xs text-muted-foreground text-center py-2">Aucune valeur</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReferenceCombobox;
