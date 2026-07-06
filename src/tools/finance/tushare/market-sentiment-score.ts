import type { TushareRow } from './client.js';
import type { SentimentComponentName, SentimentLabel, SentimentScoreComponent } from './market-sentiment-types.js';

export const BASE_WEIGHTS = {
  market: 0.25,
  breadth: 0.25,
  limit: 0.15,
  sector: 0.15,
  money_flow: 0.10,
  news: 0.10,
} as const satisfies Record<SentimentComponentName, number>;

export function labelFromScore(score: number): SentimentLabel {
  if (score >= 30) return 'optimistic';
  if (score <= -30) return 'pessimistic';
  return 'neutral';
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, value));
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function calculateMarketScore(rows: TushareRow[]): SentimentScoreComponent {
  const changes = rows
    .map((row) => asNumber(row.pct_chg) ?? asNumber(row.pct_change))
    .filter((value): value is number => value !== null);

  if (changes.length === 0) {
    return unavailableComponent('market', BASE_WEIGHTS.market, 'No index percentage changes available.');
  }

  const avgPctChange = average(changes);
  return {
    name: 'market',
    score: clampScore(avgPctChange * 20),
    weight: BASE_WEIGHTS.market,
    available: true,
    rationale: `Average selected index change was ${avgPctChange.toFixed(2)}%.`,
  };
}

export function calculateBreadthScore(rows: TushareRow[]): SentimentScoreComponent {
  let up = 0;
  let down = 0;
  let traded = 0;

  for (const row of rows) {
    const pct = asNumber(row.pct_chg);
    if (pct === null) continue;
    traded += 1;
    if (pct > 0) up += 1;
    if (pct < 0) down += 1;
  }

  if (traded === 0) {
    return unavailableComponent('breadth', BASE_WEIGHTS.breadth, 'No stock advance/decline data available.');
  }

  return {
    name: 'breadth',
    score: clampScore(((up - down) / traded) * 100),
    weight: BASE_WEIGHTS.breadth,
    available: true,
    rationale: `${up} stocks rose and ${down} stocks fell among ${traded} traded rows.`,
  };
}

export function calculateLimitScore(limitRows: TushareRow[], dailyRows: TushareRow[]): SentimentScoreComponent {
  const explicit = countLimitRows(limitRows);
  if (explicit.up + explicit.down > 0) {
    return buildLimitComponent(explicit.up, explicit.down, 'Explicit limit-up/limit-down rows.');
  }

  let up = 0;
  let down = 0;
  for (const row of dailyRows) {
    const pct = asNumber(row.pct_chg);
    if (pct === null) continue;
    if (pct >= 9.8) up += 1;
    if (pct <= -9.8) down += 1;
  }

  if (up + down === 0) {
    return unavailableComponent('limit', BASE_WEIGHTS.limit, 'No limit-up/limit-down data or proxy rows available.');
  }

  return buildLimitComponent(up, down, 'Daily pct_chg proxy for limit-up/limit-down pressure.');
}

export function calculateSectorScore(rows: TushareRow[]): SentimentScoreComponent {
  const changes = rows
    .map((row) => asNumber(row.pct_chg) ?? asNumber(row.pct_change) ?? asNumber(row.change_pct))
    .filter((value): value is number => value !== null);

  if (changes.length === 0) {
    return unavailableComponent('sector', BASE_WEIGHTS.sector, 'No sector index percentage changes available.');
  }

  const positive = changes.filter((value) => value > 0).length;
  const topAverage = average([...changes].sort((a, b) => b - a).slice(0, Math.min(5, changes.length)));
  const breadth = ((positive / changes.length) * 2 - 1) * 100;
  const heat = clampScore(topAverage * 15);

  return {
    name: 'sector',
    score: clampScore((heat + breadth) / 2),
    weight: BASE_WEIGHTS.sector,
    available: true,
    rationale: `${positive} of ${changes.length} sector rows were positive; top-sector average change was ${topAverage.toFixed(2)}%.`,
  };
}

export function calculateMoneyFlowScore(rows: TushareRow[]): SentimentScoreComponent {
  const flows = rows
    .map((row) => asNumber(row.net_mf_amount) ?? asNumber(row.net_amount) ?? asNumber(row.net_mf_vol))
    .filter((value): value is number => value !== null);

  if (flows.length === 0) {
    return unavailableComponent('money_flow', BASE_WEIGHTS.money_flow, 'No net money-flow rows available.');
  }

  const positive = flows.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const negative = Math.abs(flows.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const total = positive + negative;

  if (total === 0) {
    return unavailableComponent('money_flow', BASE_WEIGHTS.money_flow, 'Net money-flow rows were all zero.');
  }

  return {
    name: 'money_flow',
    score: clampScore(((positive - negative) / total) * 100),
    weight: BASE_WEIGHTS.money_flow,
    available: true,
    rationale: `Positive net flow was ${positive.toFixed(2)} versus negative net flow ${negative.toFixed(2)}.`,
  };
}

export function unavailableComponent(
  name: SentimentComponentName,
  weight: number,
  rationale: string,
): SentimentScoreComponent {
  return { name, score: 0, weight, available: false, rationale };
}

export function combineSentimentScores(components: SentimentScoreComponent[]): {
  overallScore: number;
  label: SentimentLabel;
  components: SentimentScoreComponent[];
} {
  const available = components.filter((component) => component.available);
  if (available.length === 0) {
    return { overallScore: 0, label: 'neutral', components };
  }

  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const weighted = available.reduce((sum, component) => sum + component.score * (component.weight / totalWeight), 0);
  const overallScore = Math.round(clampScore(weighted));

  return {
    overallScore,
    label: labelFromScore(overallScore),
    components,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countLimitRows(rows: TushareRow[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const row of rows) {
    const limit = String(row.limit ?? row.limit_type ?? row.status ?? row.limit_status ?? '').toUpperCase();
    if (limit === 'U' || limit.includes('涨停')) up += 1;
    if (limit === 'D' || limit.includes('跌停')) down += 1;
  }
  return { up, down };
}

function buildLimitComponent(up: number, down: number, prefix: string): SentimentScoreComponent {
  return {
    name: 'limit',
    score: clampScore(((up - down) / Math.max(up + down, 1)) * 100),
    weight: BASE_WEIGHTS.limit,
    available: true,
    rationale: `${prefix} ${up} up-limit signals and ${down} down-limit signals.`,
  };
}
