import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Filter, X } from 'lucide-react';
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
  className?: string;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  label, columnKey, sortKey, sortDir, onSort, filterValue, onFilter, className
}) => {
  const [popOpen, setPopOpen] = useState(false);
  const isActive = sortKey === columnKey && sortDir !== null;
  const hasFilter = !!filterValue;

  const cycleSort = () => {
    if (sortKey !== columnKey || sortDir === null) onSort(columnKey, 'asc');
    else if (sortDir === 'asc') onSort(columnKey, 'desc');
    else onSort(columnKey, null);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        onClick={cycleSort}
        className="flex items-center gap-1 hover:text-foreground transition-colors text-left"
      >
        <span className="text-xs font-medium">{label}</span>
        {isActive && sortDir === 'asc' && <ArrowUp className="w-3 h-3" />}
        {isActive && sortDir === 'desc' && <ArrowDown className="w-3 h-3" />}
      </button>
      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverTrigger asChild>
          <button className={cn(
            "p-0.5 rounded hover:bg-muted transition-colors",
            hasFilter ? "text-primary" : "text-muted-foreground/50"
          )}>
            <Filter className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Filtrer « {label} »</p>
            <Input
              placeholder="Rechercher..."
              value={filterValue}
              onChange={e => onFilter(columnKey, e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
            {hasFilter && (
              <Button variant="ghost" size="sm" className="w-full h-6 text-xs" onClick={() => { onFilter(columnKey, ''); setPopOpen(false); }}>
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
