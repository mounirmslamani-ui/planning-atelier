import React, { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, Filter, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

interface ColumnHeaderProps {
  label: string;
  columnKey: string;
  sortKey: string | null;
  sortDir: SortDirection;
  onSort: (key: string, dir: SortDirection) => void;
  filterValue: string;
  onFilter: (key: string, value: string) => void;
  /** New Excel-style source of unique values for this column. */
  allValues?: string[];
  /** Legacy props kept for backward compatibility while pages are migrated. */
  filterMode?: 'text' | 'select' | 'date';
  filterOptions?: string[];
  className?: string;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  label, columnKey, sortKey, sortDir, onSort, filterValue, onFilter,
  allValues, filterOptions, className,
}) => {
  const [popOpen, setPopOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isActive = sortKey === columnKey && sortDir !== null;
  const hasFilter = !!filterValue;

  // Source of truth for checkbox list. Prefer new prop, fall back to legacy.
  const source = allValues ?? filterOptions ?? null;

  const uniqueSorted = useMemo(() => {
    if (!source) return [];
    return Array.from(new Set(source.filter(v => v != null && v !== ''))).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [source]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uniqueSorted;
    return uniqueSorted.filter(v => String(v).toLowerCase().includes(q));
  }, [uniqueSorted, search]);

  const selected = useMemo(() => filterValue.split('|').filter(Boolean), [filterValue]);
  const allVisibleChecked = visible.length > 0 && visible.every(v => selected.includes(v));

  const cycleSort = () => {
    if (sortKey !== columnKey || sortDir === null) onSort(columnKey, 'asc');
    else if (sortDir === 'asc') onSort(columnKey, 'desc');
    else onSort(columnKey, null);
  };

  const toggleAllVisible = (check: boolean) => {
    const set = new Set(selected);
    if (check) visible.forEach(v => set.add(v));
    else visible.forEach(v => set.delete(v));
    onFilter(columnKey, Array.from(set).join('|'));
  };

  const toggleOne = (val: string) => {
    const set = new Set(selected);
    if (set.has(val)) set.delete(val); else set.add(val);
    onFilter(columnKey, Array.from(set).join('|'));
  };

  const clearAll = () => {
    onFilter(columnKey, '');
    setSearch('');
  };

  // Legacy text-input fallback: only when no value source was provided at all
  // (page hasn't been migrated to pass allValues yet). Keeps existing pages
  // working as a free-text substring filter.
  const useLegacyText = source === null;

  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded transition-colors",
      (isActive || hasFilter) && "bg-destructive",
      className
    )}>
      <button
        onClick={cycleSort}
        className={cn(
          "flex items-center gap-1 text-foreground hover:text-foreground transition-colors text-left",
          (isActive || hasFilter) && "text-destructive-foreground"
        )}
      >
        <span className="text-sm font-semibold">{label}</span>
        {isActive && sortDir === 'asc' && <ArrowUp className={cn("w-3 h-3", (isActive || hasFilter) && "text-destructive-foreground")} />}
        {isActive && sortDir === 'desc' && <ArrowDown className={cn("w-3 h-3", (isActive || hasFilter) && "text-destructive-foreground")} />}
      </button>
      <Popover open={popOpen} onOpenChange={(o) => { setPopOpen(o); if (!o) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button className={cn(
            "p-0.5 rounded hover:bg-muted transition-colors",
            hasFilter ? "text-primary" : "text-muted-foreground/50"
          )}>
            <Filter className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Filtrer « {label} »</p>

            {useLegacyText ? (
              <Input
                type="text"
                placeholder="Rechercher..."
                value={filterValue}
                onChange={e => onFilter(columnKey, e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Rechercher..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-7 text-xs pl-7"
                    autoFocus
                  />
                </div>
                <div className="space-y-0.5 max-h-56 overflow-y-auto border rounded p-1">
                  {visible.length > 0 && (
                    <>
                      <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted px-1 py-0.5 rounded">
                        <input
                          type="checkbox"
                          checked={allVisibleChecked}
                          onChange={e => toggleAllVisible(e.target.checked)}
                        />
                        <span className="font-medium">(Tout sélectionner)</span>
                      </label>
                      <hr className="my-1" />
                    </>
                  )}
                  {visible.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-2">Aucune valeur</div>
                  ) : visible.map(option => (
                    <label key={option} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted px-1 py-0.5 rounded">
                      <input
                        type="checkbox"
                        checked={selected.includes(option)}
                        onChange={() => toggleOne(option)}
                      />
                      <span className="truncate">{option}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {hasFilter && (
              <Button variant="ghost" size="sm" className="w-full h-6 text-xs" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Effacer le filtre
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ColumnHeader;
