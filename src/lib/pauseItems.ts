// Shared helpers for the multi-line "الوقت المستقطع" pause editor.

export interface PauseItem {
  id: string;
  /** hh:mm string */
  duration: string;
  /** Selected cause text (preset label, or free text when mode='custom'). */
  cause: string;
  mode: 'preset' | 'custom';
}

export const PAUSE_PRESETS: string[] = [
  'الصلاة',
  'غذاء',
  'انقطاع التيار الكهربائي',
  'انتظار الإنتهاء من عملية أخرى',
  'استقبال زبون',
];

const CUSTOM_TOKEN = '...';

export const PAUSE_SELECT_OPTIONS = [
  ...PAUSE_PRESETS.map(p => ({ value: p, label: p })),
  { value: CUSTOM_TOKEN, label: CUSTOM_TOKEN },
];

export const isCustomToken = (v: string) => v === CUSTOM_TOKEN;

export const newPauseItem = (): PauseItem => ({
  id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
  duration: '00:00',
  cause: '',
  mode: 'preset',
});

const parseHHMM = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
};

const fmtHHMM = (mins: number): string => {
  const total = Math.max(0, Math.floor(mins));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Sum of all valid pause durations, in minutes. */
export const pauseItemsTotalMinutes = (items: PauseItem[]): number =>
  items.reduce((sum, it) => sum + (parseHHMM(it.duration) ?? 0), 0);

/** hh:mm string of the total (00:00 when list empty). */
export const pauseItemsTotalHHMM = (items: PauseItem[]): string =>
  fmtHHMM(pauseItemsTotalMinutes(items));

/** Serialize to "cause (hh:mm) | cause (hh:mm)". Empty ⇒ '' */
export const serializePauseItems = (items: PauseItem[]): string =>
  items
    .filter(it => (it.cause ?? '').trim().length > 0 || (parseHHMM(it.duration) ?? 0) > 0)
    .map(it => `${(it.cause || '').trim()} (${it.duration || '00:00'})`)
    .join(' | ');

/** Parse "cause (hh:mm) | ..." back into items. Unknown chunks ignored. */
export const parsePauseItems = (text: string | undefined | null): PauseItem[] => {
  if (!text || typeof text !== 'string') return [];
  const parts = text.split('|').map(s => s.trim()).filter(Boolean);
  const out: PauseItem[] = [];
  for (const p of parts) {
    const m = /^(.*)\s*\((\d{1,2}:\d{2})\)$/.exec(p);
    if (!m) continue;
    const cause = m[1].trim();
    const duration = m[2];
    const isPreset = PAUSE_PRESETS.includes(cause);
    out.push({
      id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      duration,
      cause,
      mode: isPreset || cause === '' ? 'preset' : 'custom',
    });
  }
  return out;
};
