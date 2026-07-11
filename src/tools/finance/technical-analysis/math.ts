import type { TushareRow } from '../tushare/client.js';

export function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function rowNumber(row: TushareRow, field: string): number | null {
  return finiteNumber(row[field]);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[], mode: 'sample' | 'population'): number | null {
  if (values.length === 0 || (mode === 'sample' && values.length < 2)) return null;
  const avg = mean(values);
  if (avg === null) return null;
  const denominator = mode === 'sample' ? values.length - 1 : values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / denominator);
}

export function rollingValues(values: number[], period: number): number[][] {
  return values.map((_, index) => index + 1 < period ? [] : values.slice(index + 1 - period, index + 1));
}

export function percentageReturn(current: number, previous: number): number | null {
  return previous === 0 ? null : current / previous - 1;
}

export function logReturn(current: number, previous: number): number | null {
  return current > 0 && previous > 0 ? Math.log(current / previous) : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number | null, digits = 6): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
