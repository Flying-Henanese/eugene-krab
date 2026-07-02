import type { TushareRow } from './client.js';

const FINANCIAL_FIELDS = [
  'ts_code',
  'ann_date',
  'f_ann_date',
  'end_date',
  'report_type',
  'comp_type',
  'basic_eps',
  'diluted_eps',
  'total_revenue',
  'revenue',
  'n_income',
  'total_profit',
  'total_assets',
  'total_liab',
  'total_hldr_eqy_exc_min_int',
  'net_cash_flows_oper_act',
  'roe',
  'roe_dt',
  'grossprofit_margin',
  'netprofit_margin',
  'debt_to_assets',
];

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

export function pickFinancialRows(rows: TushareRow[], limit = 4): TushareRow[] {
  return rows.slice(0, limit).map((row) => pickFields(row, FINANCIAL_FIELDS));
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
