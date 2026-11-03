import { describe, expect, it } from 'vitest';
import { countsMatch, manifestCsv, REFERENCE_COUNTS } from './backupExport';
describe('backup integrity', () => {
  it('detects 1000-row truncation against 1581 orders', () => {
    expect(REFERENCE_COUNTS.orders).toBe(1581);
    expect(countsMatch(1000, 1581, 1581)).toBe(false);
    expect(countsMatch(1581, 1581, 1581)).toBe(true);
  });
  it('detects changes while exporting', () => {
    expect(countsMatch(1582, 1582, 1581)).toBe(false);
    expect(countsMatch(0, null, 0)).toBe(false);
  });
  it('preserves Arabic paths and null metadata in manifests', () => {
    const csv = manifestCsv('order-attachments', [{ path: 'طلبية/رسم,"نسخة".pdf', size: 76677, mime: null, created_at: '2026-10-01T11:59:20.994925+00:00' }]);
    expect(csv).toContain('"طلبية/رسم,""نسخة"".pdf"');
    expect(csv).toContain('"76677","","2026-10-01T11:59:20.994925+00:00"');
  });
});