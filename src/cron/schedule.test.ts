import { describe, expect, test } from 'bun:test';
import { computeNextRunAtMs, normalizeTaskSchedule, validateCronSchedule } from './schedule.js';

const NOW = Date.parse('2026-09-14T00:00:00.000Z');

describe('cron schedules', () => {
  test('rejects intervals below one minute', () => {
    expect(validateCronSchedule({ kind: 'every', everyMs: 59_999 }, NOW)).toContain('once per minute');
    expect(computeNextRunAtMs({ kind: 'every', everyMs: 59_999 }, NOW)).toBeUndefined();
  });

  test('rejects cron expressions that can fire faster than once per minute', () => {
    expect(validateCronSchedule({ kind: 'cron', expr: '*/30 * * * * *' }, NOW)).toContain('once per minute');
  });

  test('checks repeated cron occurrences instead of only the first interval', () => {
    expect(validateCronSchedule({ kind: 'cron', expr: '0,59 * * * * *' }, Date.parse('2026-09-14T00:00:01.000Z'))).toContain('once per minute');
  });

  test('normalizes an omitted task timezone to Asia/Shanghai', () => {
    expect(normalizeTaskSchedule({ kind: 'cron', expr: '0 15 * * 1-5' })).toEqual({
      kind: 'cron',
      expr: '0 15 * * 1-5',
      tz: 'Asia/Shanghai',
    });
  });
});
