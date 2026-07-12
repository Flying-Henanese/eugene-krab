import { describe, expect, test } from 'bun:test';
import { buildTechnicalAssessment, toPublicTechnicalAnalysisResult } from './assessment.js';
import type { TechnicalAnalysisResult, TechnicalSignal } from './types.js';

function result(overrides: Partial<TechnicalAnalysisResult> = {}): TechnicalAnalysisResult {
  return {
    status: 'ok',
    warnings: [],
    unavailable_data: [],
    interpretation: {
      trend: 'bullish',
      volatility: 'normal',
      momentum: 'K is above D.',
      evidence: ['Price is above MA20.'],
    },
    signals: {
      latest_daily: [],
      latest_weekly: [],
      recent: [],
      position_events: [],
      baseline_v0_position_events: [],
    },
    ...overrides,
  };
}

function formulaSignal(
  name: TechnicalSignal['name'],
  date: string,
  timeframe: TechnicalSignal['timeframe'] = 'daily',
): TechnicalSignal {
  return {
    name,
    side: name === 'BUY_NEW' || name === 'WEEKLY_BUY_LOWER' ? 'buy' : 'sell',
    timeframe,
    date,
    evidence: name === 'SELL_POST_BUY_TURN'
      ? { j: 50, previous_j: 60, buy_within_10_bars: true }
      : { j: 50 },
  };
}

describe('buildTechnicalAssessment', () => {
  test('maps a current V1 recovery to one neutral observation', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        position_events: [
          {
            date: '20250101',
            action: 'open',
            signal: 'STRATEGY_TREND_RECOVERY_ENTRY',
            evidence: {
              close: 10,
              ma20: 9.8,
              ma60: 9,
              k: 55,
              d: 50,
              entry_price: 10,
              stop_loss_threshold: 0.08,
            },
          },
        ],
      },
    }));

    expect(assessment.observations).toHaveLength(1);
    expect(assessment.observations[0]).toMatchObject({
      type: 'trend_recovery_observation',
      basis: 'trend_state_event',
      evidence: { closing_price: 10, ma20: 9.8, ma60: 9, k: 55, d: 50 },
    });
    expect(assessment.observations[0].evidence).not.toHaveProperty('entry_price');
    expect(assessment.observations[0].evidence).not.toHaveProperty('stop_loss_threshold');
    expect(assessment.observations[0].follow_up_condition.length).toBeGreaterThan(0);
    expect(assessment.structural_changes).toEqual([]);
  });

  test('maps the latest V1 MA20 invalidation branch to a structural change', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        position_events: [{
          date: '20250102',
          action: 'close',
          signal: 'STRATEGY_MA20_BREAK_EXIT',
          evidence: { close: 9.6, ma20: 9.8, bars_held: 6, return_from_entry: -0.04 },
        }],
      },
    }));

    expect(assessment.observations).toEqual([]);
    expect(assessment.structural_changes).toEqual([expect.objectContaining({
      type: 'trend_recovery_condition_ended',
      significance: 'material_change',
      evidence: expect.objectContaining({
        closing_price: 9.6,
        bars_since_reference: 6,
        return_from_reference: -0.04,
      }),
    })]);
  });

  test('maps the latest V1 reference-drawdown branch as a factual reminder', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        position_events: [{
          date: '20250103',
          action: 'close',
          signal: 'STRATEGY_STOP_LOSS',
          evidence: { close: 9.1, bars_held: 3, return_from_entry: -0.09 },
        }],
      },
    }));

    expect(assessment.observations).toEqual([]);
    expect(assessment.structural_changes).toHaveLength(1);
    expect(assessment.structural_changes[0]).toMatchObject({
      type: 'reference_drawdown_observation',
      evidence: {
        closing_price: 9.1,
        bars_since_reference: 3,
        return_from_reference: -0.09,
      },
    });
    expect(assessment.structural_changes[0].interpretation).toContain('observed drawdown');
    expect(assessment.structural_changes[0].interpretation).toContain('not a forecast');
    expect(assessment.structural_changes[0].interpretation).not.toMatch(/configured|boundary|8%|0\.08/);
  });

  test('maps the latest V1 peak-drawdown branch as a factual reminder', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        position_events: [{
          date: '20250104',
          action: 'close',
          signal: 'STRATEGY_TRAILING_EXIT',
          evidence: { close: 10.1, drawdown_from_peak: -0.16 },
        }],
      },
    }));

    expect(assessment.observations).toEqual([]);
    expect(assessment.structural_changes).toHaveLength(1);
    expect(assessment.structural_changes[0]).toMatchObject({
      type: 'peak_drawdown_observation',
      evidence: { closing_price: 10.1, drawdown_from_peak: -0.16 },
    });
    expect(assessment.structural_changes[0].interpretation).toContain('observed drawdown');
    expect(assessment.structural_changes[0].interpretation).toContain('not a forecast');
    expect(assessment.structural_changes[0].interpretation).not.toMatch(/configured|boundary|15%|0\.15/);
  });

  test('removes an earlier recovery observation after a later V1 structural change', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        // Input order is intentionally reversed to verify chronological selection.
        position_events: [
          {
            date: '20250108',
            action: 'close',
            signal: 'STRATEGY_MA20_BREAK_EXIT',
            evidence: { close: 9.6, ma20: 9.8 },
          },
          {
            date: '20250101',
            action: 'open',
            signal: 'STRATEGY_TREND_RECOVERY_ENTRY',
            evidence: { close: 10, ma20: 9.8, ma60: 9, k: 55, d: 50 },
          },
        ],
      },
    }));

    expect(assessment.observations).toEqual([]);
    expect(assessment.structural_changes).toEqual([expect.objectContaining({
      type: 'trend_recovery_condition_ended',
      date: '20250108',
    })]);
  });

  test('drops a V1 structural change older than the recent assessment window', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        recent_start_date: '20250201',
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        position_events: [{
          date: '20250108',
          action: 'close',
          signal: 'STRATEGY_MA20_BREAK_EXIT',
          evidence: { close: 9.6, ma20: 9.8 },
        }],
      },
    }));

    expect(assessment.observations).toEqual([]);
    expect(assessment.structural_changes).toEqual([]);
  });

  test('keeps an older V1 recovery observation when it remains active', () => {
    const assessment = buildTechnicalAssessment(result({
      signals: {
        recent_start_date: '20250201',
        latest_daily: [],
        latest_weekly: [],
        recent: [],
        baseline_v0_position_events: [],
        position_events: [{
          date: '20250108',
          action: 'open',
          signal: 'STRATEGY_TREND_RECOVERY_ENTRY',
          evidence: { close: 10, ma20: 9.8, ma60: 9, k: 55, d: 50 },
        }],
      },
    }));

    expect(assessment.observations).toEqual([expect.objectContaining({
      type: 'trend_recovery_observation',
      date: '20250108',
    })]);
    expect(assessment.structural_changes).toEqual([]);
  });

  test('maps and de-duplicates every recent Baseline V0 formula condition', () => {
    const recent = [
      {
        ...formulaSignal('BUY_NEW', '20250101'),
        evidence: { j: 50, k: 45, d: 40, action_hint: true },
      },
      formulaSignal('SELL_J_TURN_ABOVE_80', '20250102'),
      formulaSignal('SELL_TOUCH_UPPER', '20250103'),
      formulaSignal('SELL_J_CROSS_100', '20250104'),
      formulaSignal('SELL_POST_BUY_TURN', '20250105'),
      { ...formulaSignal('WEEKLY_BUY_LOWER', '20250106', 'weekly'), partial: true },
      formulaSignal('WEEKLY_SELL_UPPER', '20250107', 'weekly'),
    ];
    const assessment = buildTechnicalAssessment(result({
      signals: {
        recent,
        latest_daily: [recent[0]],
        latest_weekly: [recent[5], recent[6]],
        position_events: [],
        baseline_v0_position_events: [],
      },
    }));

    expect(assessment.observations.map(({ type }) => type).sort()).toEqual([
      'daily_upper_band_contact_observation',
      'low_zone_momentum_recovery_observation',
      'weekly_lower_band_contact_observation',
      'weekly_upper_band_contact_observation',
    ]);
    expect(assessment.observations.find(({ type }) => type === 'weekly_lower_band_contact_observation')).toMatchObject({
      partial: true,
      timeframe: 'weekly',
      basis: 'formula_condition',
    });
    expect(assessment.observations.every(({ follow_up_condition }) => follow_up_condition.length > 0)).toBe(true);
    expect(assessment.observations.find(({ date }) => date === '20250101')?.evidence)
      .not.toHaveProperty('action_hint');
    expect(assessment.structural_changes.map(({ type }) => type).sort()).toEqual([
      'elevated_momentum_turn_observation',
      'extreme_momentum_state_observation',
      'momentum_direction_change_observation',
    ]);
    expect(assessment.structural_changes.some(({ date }) => date === '20250103' || date === '20250107')).toBe(false);
    expect(assessment.structural_changes.find(
      ({ type }) => type === 'momentum_direction_change_observation',
    )?.evidence)
      .toHaveProperty('momentum_recovery_within_10_bars', true);
  });

  test('reports limited evidence quality and no directional probability when calculations are unavailable', () => {
    const assessment = buildTechnicalAssessment(result({
      status: 'insufficient_data',
      interpretation: undefined,
      signals: undefined,
      unavailable_data: [{ api: 'daily', reason: 'missing_rows', message: 'Not enough rows.' }],
    }));

    expect(assessment.state).toEqual({
      trend: 'insufficient_data',
      volatility: 'insufficient_data',
      momentum: 'Insufficient data for a momentum interpretation.',
      evidence: [],
    });
    expect(assessment.evidence_quality).toEqual({
      analysis_scope: 'descriptive_state_and_structure',
      data_completeness: 'low',
      indicator_coverage: 'low',
      predictive_validation: 'not_established',
      directional_probability: null,
    });
    expect(assessment.observations).toEqual([]);
    expect(assessment.structural_changes).toEqual([]);
  });
});

describe('toPublicTechnicalAnalysisResult', () => {
  test('keeps objective indicators while removing internal event and model action semantics', () => {
    const publicResult = toPublicTechnicalAnalysisResult(result({
      asset: { type: 'stock', ts_code: '000001.SZ', name: 'Ping An Bank' },
      as_of_date: '20250110',
      methodology: {
        provider: 'Tushare',
        apis: ['daily', 'adj_factor'],
        adjustment: 'qfq',
        boll: { period: 20, multiplier: 2, stddev: 'sample' },
        kdj: { period: 9, smooth_k: 3, smooth_d: 3, initial: 50 },
        strategy: {
          name: 'trend_recovery_v1',
          minimum_hold_bars: 5,
          stop_loss: 0.08,
          trailing_drawdown: 0.15,
          ma_break_bars: 2,
        },
      },
      latest: {
        candle: {
          symbol: '000001.SZ',
          date: '20250110',
          open: 10,
          high: 10.5,
          low: 9.8,
          close: 10.2,
          volume: 100,
          amount: 200,
          adjustment: 'qfq',
        },
        ma: { ma5: 10, ma10: 9.9, ma20: 9.8, ma30: 9.7, ma60: 9.5 },
        boll: { middle: 9.8, upper: 10.6, lower: 9, stddev: 0.4 },
        kdj: { rsv: 60, k: 55, d: 50, j: 65 },
      },
      signals: {
        latest_daily: [formulaSignal('BUY_NEW', '20250110')],
        latest_weekly: [],
        recent: [formulaSignal('BUY_NEW', '20250110')],
        baseline_v0_position_events: [],
        position_events: [{
          date: '20250110',
          action: 'open',
          signal: 'STRATEGY_TREND_RECOVERY_ENTRY',
          evidence: {
            close: 10.2,
            ma20: 9.8,
            ma60: 9.5,
            k: 55,
            d: 50,
            entry_price: 10.2,
            stop_loss_threshold: 0.08,
          },
        }],
      },
      warnings: [
        'The latest weekly candle is partial and may change before week close.',
        'Technical signals are based on historical prices and are not investment advice.',
        'Trend Recovery V1 position events are experimental and are reported separately.',
      ],
    }));

    expect(publicResult.latest).toMatchObject({
      price: { opening_price: 10, closing_price: 10.2 },
      moving_averages: { ma20: 9.8, ma60: 9.5 },
      price_position: {
        ma20: { relation: 'above' },
        ma60: { relation: 'above' },
        boll_middle: { relation: 'above' },
      },
    });
    expect(publicResult.methodology).not.toHaveProperty('strategy');
    expect(publicResult).not.toHaveProperty('signals');
    expect(publicResult).not.toHaveProperty('interpretation');
    expect(publicResult.data_warnings).toEqual([
      'The latest weekly candle is partial and may change before week close.',
    ]);
    expect(publicResult.assessment.state.trend).toBe('upward_alignment');
    expect(publicResult.assessment).toHaveProperty('structural_changes');
    expect(publicResult.assessment).not.toHaveProperty('risk_alerts');
    expect(publicResult.assessment.evidence_quality).toMatchObject({
      analysis_scope: 'descriptive_state_and_structure',
      predictive_validation: 'not_established',
      directional_probability: null,
    });
    expect(publicResult.decision_context).toMatchObject({
      current_structure: 'Daily moving averages are upward-aligned.',
      cross_horizon_relationship: expect.stringContaining('currently agrees'),
      review_cadence: {
        short_term_trading_sessions: 5,
        predictive_horizon: 'not_established',
      },
    });
    expect(publicResult.decision_context?.confirmation_conditions[0]).toContain('Repeated closes remaining above MA20');
    expect(publicResult.decision_context?.invalidation_conditions[0]).toContain('Repeated closes below MA20');

    const serialized = JSON.stringify(publicResult);
    expect(serialized).not.toMatch(/STRATEGY_|BUY_|SELL_/);
    expect(serialized).not.toMatch(/trend_recovery_v1|formula_baseline_v0/);
    expect(serialized).not.toMatch(/entry_price|stop_loss_threshold|action_hint/);
    expect(serialized).not.toMatch(/8%|15%|0\.08|0\.15/);
    expect(serialized).not.toMatch(/"(?:risk_alerts|severity)"\s*:/i);
    expect(serialized).not.toMatch(/"(?:action|side|signal|buy|sell|open|close|entry|exit|execute)"\s*:/i);
    expect(publicResult.assessment.limitations).toContain(
      'Local formula conditions follow the documented semantics; exact parity with external charting platforms is not guaranteed until a golden fixture is available.',
    );
    expect(publicResult.assessment.limitations).toContain(
      'Use the next five trading sessions only as a review cadence for short-term daily momentum, Bollinger-band contact, and recent structural-change conditions; T+5 is not a validated predictive horizon.',
    );
  });
});
