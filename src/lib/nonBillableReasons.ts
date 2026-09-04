// Causes prédéfinies pour "عدد الساعات المستقطعة من الفوترة"
export const NON_BILLABLE_PRESETS: string[] = [
  'وقت ضائع لتصحيح غلطة/لإعادة عمل خاطئ',
  'وقت قضي في تشغيل قطع غير مطابقة',
  'وقت ضائع بسبب عدة غير ملائمة للشغل أو مشكل في العدة',
  'وقت ضائع بسبب مشكل في الآلة',
  'وقت ضائع بسبب مشكل في المادة الأولية',
  'وقت ضائع بسبب بطء العامل',
];

const CUSTOM_TOKEN = '...';

export const NON_BILLABLE_SELECT_OPTIONS = [
  ...NON_BILLABLE_PRESETS.map(p => ({ value: p, label: p })),
  { value: CUSTOM_TOKEN, label: 'آخر' },
];

export const isNonBillableCustomToken = (v: string) => v === CUSTOM_TOKEN;
