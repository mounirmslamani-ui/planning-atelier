// Helpers for the technicalComplexity Order field
export const TC_SHORT: Record<string, string> = {
  level1: 'م1',
  level2: 'م2',
  level3: 'م3',
  level4: 'م4',
};

export const TC_LONG: Record<string, string> = {
  level1: 'المستوى 1: طلبية بسيطة',
  level2: 'المستوى 2: طلبية متوسطة التعقيد',
  level3: 'المستوى 3: طلبية معقدة',
  level4: 'المستوى 4: طلبية معقدة جداً',
};

export const TC_LEVELS = ['level1', 'level2', 'level3', 'level4'] as const;

export const tcShort = (v?: string | null) => (v && TC_SHORT[v]) || '—';
export const tcLong  = (v?: string | null) => (v && TC_LONG[v])  || '';
