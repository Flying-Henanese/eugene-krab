import type { TushareRow } from './client.js';

const MARKET_SNAPSHOT_FIELDS = [
  'ts_code',
  'trade_date',
  'close',
  'turnover_rate',
  'turnover_rate_f',
  'volume_ratio',
  'pe',
  'pe_ttm',
  'pb',
  'ps',
  'ps_ttm',
  'dv_ratio',
  'total_mv',
  'circ_mv',
];

export function pickMarketSnapshot(rows: TushareRow[]): TushareRow | null {
  const row = rows[0];
  return row ? pickFields(row, MARKET_SNAPSHOT_FIELDS) : null;
}

export function pickLatestFinancialRows(
  rows: TushareRow[],
  fields: string[],
  limit = 8,
): TushareRow[] {
  const rowsByPeriod = new Map<string, TushareRow>();
  for (const row of rows) {
    const key = [row.ts_code, row.end_date, row.report_type, row.comp_type].join('|');
    const current = rowsByPeriod.get(key);
    if (!current || isPreferredFinancialRow(row, current)) {
      rowsByPeriod.set(key, row);
    }
  }

  return Array.from(rowsByPeriod.values())
    .sort(compareLatestFirst)
    .slice(0, limit)
    .map((row) => pickFields(row, fields));
}

export function pickRows(rows: TushareRow[], fields: string[], limit: number): TushareRow[] {
  return rows.slice(0, limit).map((row) => pickFields(row, fields));
}

export function pickLatestPeriodRows(
  rows: TushareRow[],
  fields: string[],
  maxPeriods: number,
  limit: number,
): TushareRow[] {
  const periods = Array.from(new Set(
    rows.map((row) => String(row.end_date ?? '')).filter(Boolean),
  )).sort((left, right) => right.localeCompare(left)).slice(0, maxPeriods);
  return rows
    .filter((row) => periods.includes(String(row.end_date ?? '')))
    .slice(0, limit)
    .map((row) => pickFields(row, fields));
}

function isPreferredFinancialRow(candidate: TushareRow, current: TushareRow): boolean {
  if (candidate.update_flag === '1' && current.update_flag !== '1') return true;
  if (candidate.update_flag !== '1' && current.update_flag === '1') return false;
  return financialRowDate(candidate) > financialRowDate(current);
}

function financialRowDate(row: TushareRow): string {
  return String(row.f_ann_date ?? row.ann_date ?? '');
}

function compareLatestFirst(left: TushareRow, right: TushareRow): number {
  const periodComparison = String(right.end_date ?? '').localeCompare(String(left.end_date ?? ''));
  if (periodComparison !== 0) return periodComparison;
  return financialRowDate(right).localeCompare(financialRowDate(left));
}

function pickFields(row: TushareRow, fields: string[]): TushareRow {
  const result: TushareRow = {};
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
      result[field] = row[field];
    }
  }
  return result;
}
