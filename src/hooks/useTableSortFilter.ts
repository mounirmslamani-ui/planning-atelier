import { useState, useMemo } from 'react';
import type { SortDirection } from '@/components/orders/ColumnHeader';
import { useGlobalClientFilter } from '@/context/GlobalClientFilterContext';

export type Accessors<T> = Record<string, (row: T) => string | number | null | undefined>;

/**
 * Apply a filters map to a list using the SAME semantics as useTableSortFilter's
 * `processed` output: pipe-separated values ⇒ exact multi-select match, otherwise
 * ⇒ lowercase substring match. Optionally skip one key (used to compute the
 * contextual value list for the excluded column itself).
 */
export function applyFilters<T>(
  rows: T[],
  accessors: Accessors<T>,
  filters: Record<string, string>,
  excludeKey?: string,
): T[] {
  let out = rows;
  Object.entries(filters).forEach(([key, val]) => {
    if (!val) return;
    if (excludeKey && key === excludeKey) return;
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
  return out;
}

/**
 * For every column key, return the sorted list of unique values available
 * given ALL other active filters (but not the filter of the column itself).
 * This is what powers the "Excel-style" contextual filter popovers.
 */
export function computeAllValuesByKey<T>(
  baseList: T[],
  accessors: Accessors<T>,
  filters: Record<string, string>,
  keys?: string[],
): Record<string, string[]> {
  const allKeys = keys ?? Object.keys(accessors);
  const map: Record<string, string[]> = {};
  allKeys.forEach(k => {
    const acc = accessors[k];
    if (!acc) { map[k] = []; return; }
    const filtered = applyFilters(baseList, accessors, filters, k);
    const set = new Set<string>();
    filtered.forEach(r => {
      const v = acc(r);
      if (v == null || v === '') return;
      set.add(String(v));
    });
    map[k] = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
  });
  return map;
}

export function useTableSortFilter<T>(rows: T[], accessors: Accessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [localFilters, setFilters] = useState<Record<string, string>>({});
  const { selectedClientName } = useGlobalClientFilter();

  // Overlay the global client filter onto the local filters when a client is
  // selected globally. We support both `clientName` and `client` accessor keys
  // (different tables use different names). Exact match via pipe form.
  const filters = useMemo(() => {
    if (!selectedClientName) return localFilters;
    const exact = `${selectedClientName}|`;
    const overlay: Record<string, string> = { ...localFilters };
    if (accessors.clientName) overlay.clientName = exact;
    if (accessors.client) overlay.client = exact;
    return overlay;
  }, [localFilters, selectedClientName, accessors]);

  const handleSort = (key: string, dir: SortDirection) => {
    if (dir === null) { setSortKey(null); setSortDir(null); }
    else { setSortKey(key); setSortDir(dir); }
  };

  const handleFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const processed = useMemo(() => {
    let out = applyFilters(rows, accessors, filters);
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

  // Contextual per-column value lists: each column sees all OTHER active filters.
  const allValuesByKey = useMemo(
    () => computeAllValuesByKey(rows, accessors, filters),
    [rows, accessors, filters],
  );

  return { processed, sortKey, sortDir, filters, handleSort, handleFilter, allValuesByKey };
}
