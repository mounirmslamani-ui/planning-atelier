import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  filterMode?: 'text' | 'select' | 'date';
  filterOptions?: string[];
  className?: string;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  label, columnKey, sortKey, sortDir, onSort, filterValue, onFilter, filterMode = 'text', filterOptions = [], className
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
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded transition-colors",
      (isActive || hasFilter) && "bg-destructive",
      className
    )}>
      <button
        onClick={cycleSort}
        className={cn(
          "flex items-center gap-1 hover:text-foreground transition-colors text-left",
          (isActive || hasFilter) && "text-destructive-foreground"
        )}
      >
        <span className="text-xs font-medium">{label}</span>
        {isActive && sortDir === 'asc' && <ArrowUp className={cn("w-3 h-3", (isActive || hasFilter) && "text-destructive-foreground")} />}
        {isActive && sortDir === 'desc' && <ArrowDown className={cn("w-3 h-3", (isActive || hasFilter) && "text-destructive-foreground")} />}
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
            {filterMode === 'select' ? (
              <Select value={filterValue || '__all__'} onValueChange={value => onFilter(columnKey, value === '__all__' ? '' : value)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Toutes</SelectItem>
                  {filterOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={filterMode === 'date' ? 'date' : 'text'}
                placeholder={filterMode === 'date' ? undefined : 'Rechercher...'}
                value={filterValue}
                onChange={e => onFilter(columnKey, e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
            )}
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
