import type { Order } from '@/types/planning';

export interface LastSeriesNumbers {
  lastF: string;
  lastP: string;
  lastS: string;
  lastNum: string;
}

/**
 * Compute the highest order number for each category prefix (F, P, S, divers).
 * Priority: year first (before /), then numeric part (after /).
 * Used for the "last series" info banner on the Active Orders & Registry pages.
 */
export function computeLastSeriesNumbers(orders: Order[]): LastSeriesNumbers {
  const parse = (on: string, prefix: 'F' | 'P' | 'S' | '') => {
    const re = prefix
      ? new RegExp(`^(\\d+)\\s*/\\s*${prefix}(\\d+)\\b`, 'i')
      : /^(\d+)\s*\/\s*(\d+)\b/;
    const m = on.match(re);
    if (!m) return null;
    return { year: parseInt(m[1], 10), num: parseInt(m[2], 10) };
  };
  const isBetter = (a: { num: number; year: number }, b: { num: number; year: number } | null) =>
    !b || (a.year !== b.year ? a.year > b.year : a.num > b.num);

  let lastF = '', lastP = '', lastS = '', lastNum = '';
  let bestF: { num: number; year: number } | null = null;
  let bestP: { num: number; year: number } | null = null;
  let bestS: { num: number; year: number } | null = null;
  let bestN: { num: number; year: number } | null = null;

  for (const o of orders) {
    const on = (o.orderNumber || '').trim();
    if (!on || on === 'ABS') continue;
    if (/^\d+\s*\/\s*F\d+/i.test(on)) {
      const p = parse(on, 'F');
      if (p && isBetter(p, bestF)) { bestF = p; lastF = on; }
    } else if (/^\d+\s*\/\s*P\d+/i.test(on)) {
      const p = parse(on, 'P');
      if (p && isBetter(p, bestP)) { bestP = p; lastP = on; }
    } else if (/^\d+\s*\/\s*S\d+/i.test(on)) {
      const p = parse(on, 'S');
      if (p && isBetter(p, bestS)) { bestS = p; lastS = on; }
    } else if (/^\d+\s*\/\s*\d+\b/.test(on)) {
      const p = parse(on, '');
      if (p && isBetter(p, bestN)) { bestN = p; lastNum = on; }
    }
  }
  return { lastF, lastP, lastS, lastNum };
}
