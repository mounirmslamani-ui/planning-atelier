import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  /** The stored value. Empty string is allowed to represent "no value". */
  value: string;
  /** What is displayed in the trigger + list. */
  label: React.ReactNode;
  /** Optional plain-text used for the search filter. Defaults to `label` when it is a string. */
  searchText?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes applied to the trigger. */
  className?: string;
  /** Extra classes applied to the popover content. */
  contentClassName?: string;
  dir?: 'ltr' | 'rtl';
  align?: 'start' | 'center' | 'end';
  searchPlaceholder?: string;
  /** Fired when the search field changes (rarely needed). */
  onSearchChange?: (q: string) => void;
  /** Optional aria-label for the trigger. */
  ariaLabel?: string;
  /** Default popover width class, override via contentClassName. */
  contentWidthClass?: string;
}

/**
 * Reusable single-select with search field on top and clickable value list,
 * following the same UX pattern as `ColumnHeader` filters. RTL-friendly.
 * Behaves as a strict drop-in replacement for shadcn `Select` and native
 * `<select>` (supports empty values, disabled state, controlled value,
 * placeholder, per-item disabled).
 */
const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  contentClassName,
  dir,
  align = 'start',
  searchPlaceholder = 'Rechercher...',
  onSearchChange,
  ariaLabel,
  contentWidthClass,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);

  useEffect(() => {
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  const currentOption = useMemo(
    () => options.find(o => o.value === value),
    [options, value],
  );

  const getSearchText = (o: SearchableSelectOption) => {
    if (o.searchText !== undefined) return o.searchText;
    if (typeof o.label === 'string') return o.label;
    if (typeof o.label === 'number') return String(o.label);
    return '';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => getSearchText(o).toLowerCase().includes(q));
  }, [options, search]);

  const handleSelect = (o: SearchableSelectOption) => {
    if (o.disabled) return;
    onValueChange(o.value);
    setOpen(false);
    setSearch('');
  };

  const displayLabel: React.ReactNode = currentOption
    ? currentOption.label
    : (
      <span className="text-muted-foreground">{placeholder ?? ''}</span>
    );

  return (
    <Popover open={open} onOpenChange={(o) => { if (disabled && o) return; setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          dir={dir}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            '[&>span]:line-clamp-1',
            className,
          )}
        >
          <span className="truncate text-start flex-1">{displayLabel}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        dir={dir}
        className={cn('p-2', contentWidthClass ?? 'w-[--sw-trigger-w]', contentClassName)}
        style={triggerWidth ? ({ ['--sw-trigger-w' as any]: `${triggerWidth}px` }) : undefined}
        onOpenAutoFocus={(e) => {
          // keep focus in our search input
          e.preventDefault();
        }}
      >
        <div className="space-y-2">
          <div className="relative">
            <Search className={cn(
              'w-3 h-3 absolute top-1/2 -translate-y-1/2 text-muted-foreground',
              dir === 'rtl' ? 'right-2' : 'left-2',
            )} />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={e => { setSearch(e.target.value); onSearchChange?.(e.target.value); }}
              className={cn('h-7 text-xs', dir === 'rtl' ? 'pr-7' : 'pl-7')}
              autoFocus
              dir={dir}
            />
          </div>
          <div className="space-y-0.5 max-h-60 overflow-y-auto border rounded p-1" role="listbox">
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-2">
                Aucune valeur
              </div>
            ) : (
              filtered.map((o, idx) => {
                const selected = o.value === value;
                return (
                  <button
                    type="button"
                    key={`${o.value}::${idx}`}
                    role="option"
                    aria-selected={selected}
                    disabled={o.disabled}
                    onClick={() => handleSelect(o)}
                    className={cn(
                      'w-full flex items-center gap-2 text-xs cursor-pointer px-2 py-1 rounded text-start',
                      'hover:bg-accent hover:text-accent-foreground',
                      selected && 'bg-accent/60 font-medium',
                      o.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                    dir={dir}
                  >
                    <Check className={cn('w-3 h-3 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate flex-1">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableSelect;
export { SearchableSelect };
