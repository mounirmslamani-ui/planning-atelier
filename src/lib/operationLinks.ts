import type { Operation, OperationCategory } from '@/types/planning';

const LEGACY_OPERATION_NAME_ALIASES: Record<string, string> = {
  'tournage cnc': 'خراطة رقمية',
  'fraisage conventionnel': 'تفريز تقليدي',
  'tournage conventionnel': 'خراطة تقليدية',
  'réctification cylindrique': 'التجليخ الأسطواني',
  'rectification cylindrique': 'التجليخ الأسطواني',
  'réctification plane': 'التجليخ السطحي',
  'rectification plane': 'التجليخ السطحي',
  'perçage-taraudage': 'تثقيب-قلوظة',
  'perçage taraudage': 'تثقيب-قلوظة',
  'ajustage': 'أعمال ضبط',
  'débavurage, finition': 'إزالة الزوائد والتشطيب',
  'debavurage, finition': 'إزالة الزوائد والتشطيب',
  'travaux mécaniques (montage-démontage)': 'أعمال ميكانيكية (تفكيك وتركيب)',
  'travaux mecaniques (montage-demontage)': 'أعمال ميكانيكية (تفكيك وتركيب)',
  'traitement thermique': 'معالجة حرارية',
  'mortaisage': 'تشغيل النقر',
  'taillage de pignons': 'تسنين المسننات',
  "soudage à l'arc": 'التلحيم بالقوس الكهربائي',
  "soudage a l'arc": 'التلحيم بالقوس الكهربائي',
  'travaux de chaudronnerie': 'أعمال حدادة',
  'travaux de chauderonnerie': 'أعمال حدادة',
  'lustrage': 'صقل وتلميع',
  "découpe jet d'eau": 'التقطيع بنفث الماء',
  "decoupe jet d'eau": 'التقطيع بنفث الماء',
  'découpe laser': 'التقطيع بالليزر',
  'decoupe laser': 'التقطيع بالليزر',
  'garniture': 'حشوة ميكانيكية',
  'fraisage cnc': 'تفريز رقمي',
  'découpe robofil': 'التقطيع بالتآكل الكهربائي',
  'decoupe robofil': 'التقطيع بالتآكل الكهربائي',
  'découpe plasma': 'التقطيع بالبلازما',
  'decoupe plasma': 'التقطيع بالبلازما',
  'eléctro-érosion': 'التشغيل بالتآكل الكهربائي',
  'electro-erosion': 'التشغيل بالتآكل الكهربائي',
  'bobinage moteurs électriques': 'تلفيف محركات كهربائية',
  'bobinage moteurs electriques': 'تلفيف محركات كهربائية',
  'soudage tig': 'TIG تلحيم',
  'soudage mig': 'MIG تلحيم',
  'soudage aluminium': 'تلحيم أليمنيوم',
  'brasure': 'اللحام بالنحاس الأصفر',
  'soudage fonte': 'تلحيم الزهر',
  'oxy-coupage': 'التقطيع بالأوكسيجين',
  'fonderie': 'سباكة',
  'affûtage': 'شحذ',
  'affutage': 'شحذ',
  'travaux usinage automobile (alésage, glaçage, rabotage ...)': 'أعمال التشغيل الميكانيكي لمحركات السيارات (التجويف، صقل الأسطوانات، التسوية …)',
};

export const normalizeOperationText = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr-FR');

export function resolveOperationId(value: string | undefined, operations: Operation[], category?: OperationCategory): string {
  if (!value) return '';
  const direct = operations.find(op => op.id === value && (!category || op.category === category));
  if (direct) return direct.id;

  const normalized = normalizeOperationText(value);
  const byName = operations.find(op => normalizeOperationText(op.name) === normalized && (!category || op.category === category));
  if (byName) return byName.id;

  const aliasName = LEGACY_OPERATION_NAME_ALIASES[normalized];
  if (!aliasName) return '';
  return operations.find(op => normalizeOperationText(op.name) === normalizeOperationText(aliasName) && (!category || op.category === category))?.id || '';
}

export function getOperationLabel(value: string | undefined, operations: Operation[], category?: OperationCategory): string {
  if (!value) return '—';
  const id = resolveOperationId(value, operations, category);
  return operations.find(op => op.id === id)?.name || value;
}

export function isLinkedToOperation(value: string | undefined, operation: Operation, operations: Operation[]): boolean {
  return resolveOperationId(value, operations, operation.category) === operation.id;
}