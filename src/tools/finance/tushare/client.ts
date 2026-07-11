export type TushareApiName =
  | 'stock_basic'
  | 'daily_basic'
  | 'daily'
  | 'adj_factor'
  | 'weekly'
  | 'income'
  | 'balancesheet'
  | 'cashflow'
  | 'fina_indicator'
  | 'namechange'
  | 'trade_cal'
  | 'index_daily'
  | 'limit_list_d'
  | 'moneyflow'
  | 'index_classify'
  | 'index_member'
  | 'ths_index'
  | 'ths_daily';

export type TushareRow = Record<string, string | number | null>;

export interface TushareResponse {
  code: number;
  msg?: string;
  data?: {
    fields?: string[];
    items?: unknown[][];
  };
}

export interface TushareClient {
  call(apiName: TushareApiName, params?: Record<string, unknown>, fields?: string[]): Promise<TushareRow[]>;
}

export class TusharePermissionError extends Error {
  readonly apiName: string;

  constructor(apiName: string, message: string) {
    super(message);
    this.name = 'TusharePermissionError';
    this.apiName = apiName;
  }
}

export class TushareApiError extends Error {
  readonly apiName: string;
  readonly code: number;

  constructor(apiName: string, code: number, message: string) {
    super(message);
    this.name = 'TushareApiError';
    this.apiName = apiName;
    this.code = code;
  }
}

export function normalizeTushareResponse(apiName: string, response: TushareResponse): TushareRow[] {
  if (isPermissionError(response)) {
    throw new TusharePermissionError(apiName, response.msg || 'Tushare permission denied');
  }
  if (response.code !== 0) {
    throw new TushareApiError(apiName, response.code, response.msg || 'Tushare API error');
  }

  const fields = response.data?.fields ?? [];
  const items = response.data?.items ?? [];

  return items.map((item) => {
    const row: TushareRow = {};
    fields.forEach((field, index) => {
      const value = item[index];
      row[field] = typeof value === 'string' || typeof value === 'number' || value === null ? value : String(value);
    });
    return row;
  });
}

function isPermissionError(response: TushareResponse): boolean {
  return response.code === 2002 || response.code === 40203 || /权限|permission/i.test(response.msg ?? '');
}

export class HttpTushareClient implements TushareClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async call(apiName: TushareApiName, params: Record<string, unknown> = {}, fields: string[] = []): Promise<TushareRow[]> {
    const response = await fetch('http://api.tushare.pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: apiName,
        token: this.token,
        params,
        fields: fields.join(','),
      }),
    });

    if (!response.ok) {
      throw new Error(`[Tushare API] ${apiName} HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json() as TushareResponse;
    return normalizeTushareResponse(apiName, payload);
  }
}
