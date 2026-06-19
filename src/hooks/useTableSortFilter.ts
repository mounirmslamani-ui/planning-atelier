import { useState, useMemo } from 'react';
import type { SortDirection } from '@/components/orders/ColumnHeader';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';

export type Accessors<T> = Record<string, (row: T) => string | number | null | undefined>;

export function useTableSortFilter<T>(rows: T[], accessors: Accessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [localFilters, setFilters] = useState<Record<string, string>>({});
  const { selectedClientName } = useGlobalClientFilter();

  // Overlay the global client filter onto the local filters when a client is
  // selected globally and this table exposes a `clientName` accessor. The local
  // value is preserved; the global filter simply takes precedence when active.
  const filters = useMemo(() => {
    if (!selectedClientName || !accessors.clientName) return localFilters;
    return { ...localFilters, clientName: selectedClientName };
  }, [localFilters, selectedClientName, accessors]);

  const handleSort = (key: string, dir: SortDirection) => {
    if (dir === null) { setSortKey(null); setSortDir(null); }
    else { setSortKey(key); setSortDir(dir); }
  };

  const handleFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const processed = useMemo(() => {
    let out = rows;
    // filter
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      const acc = accessors[key];
      if (!acc) return;
      if (val.includes('|')) {
        const vals = val.split('|').filter(Boolean).map(s => s.toLowerCase());
        out = out.filter(r => {
          const v = acc(r);
          return v != null && vals.includes(String(v).toLowerCase());
        });
        return;
      }
      const needle = val.toLowerCase();
      out = out.filter(r => {
        const v = acc(r);
        return v != null && String(v).toLowerCase().includes(needle);
      });
    });
    // sort
    if (sortKey && sortDir) {
      const acc = accessors[sortKey];
      if (acc) {
        out = [...out].sort((a, b) => {
          const va = acc(a); const vb = acc(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
          const sa = String(va).toLowerCase(); const sb = String(vb).toLowerCase();
          return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
      }
    }
    return out;
  }, [rows, filters, sortKey, sortDir, accessors]);

  return { processed, sortKey, sortDir, filters, handleSort, handleFilter };
}
