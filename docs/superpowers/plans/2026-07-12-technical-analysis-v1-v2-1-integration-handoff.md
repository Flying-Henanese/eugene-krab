# Technical Analysis V1 + V2.1 Integration Handoff

## Purpose

This document hands off the next development phase for China A-share technical analysis. The central question is how frozen Trend Recovery V1 and experimental Applicability V2.1 should cooperate in user-facing analysis without overstating the evidence as buy/sell advice.

## Executive Decision

- **V1 is the primary technical-state and event detector.** It explains what changed in one stock: MA20 recovery inside `MA20 > MA60`, KDJ confirmation, trend invalidation, stop-risk, and trailing-drawdown conditions.
- **V2.1 is an experimental applicability and attention-priority filter.** It asks whether a V1 recovery candidate also has strong same-date volume confirmation, strength relative to CSI 300, and a favorable CSI 300 regime.
- **Neither V1 nor V2.1 should produce direct buy/sell recommendations, calibrated probability, or “high-confidence” claims.** Current evidence supports analysis and alerts, not trade instructions.
- **The recommended composition is `V1 event -> V2.1 qualification -> analysis/alert language`.** V2.1 must not replace V1 because it does not independently define entries or exits.
- **Keep V2.1 out of the public `technical_analysis` response until its cross-sectional data contract is implemented explicitly.** The current public tool fetches one stock; V2.1 requires a benchmark and a same-date stock cohort.

## Repository State At Handoff

- Branch: `codex/technical-analysis-strategy-v2-exploration`
- Frozen V1 commit: `3a8e97e feat: freeze trend recovery v1 baseline`
- No branch changes have been pushed for V2.1.
- The worktree intentionally contains uncommitted V2.1 code, tests, harness context, and validation notes. Do not discard or overwrite them.
- Last full verification after V2.1 code changes: `190 pass, 0 fail`; `bun run typecheck` and `git diff --check` passed.
- Later changes were documentation/run notes only; `git diff --check` continued to pass.
- Tushare raw backtest rows were held in temporary MCP/session storage and were not committed. The `.harness/runs/` files preserve methodology and aggregate results, not raw data.

Current uncommitted implementation files:

- `src/tools/finance/technical-analysis/applicability.ts`
- `src/tools/finance/technical-analysis/applicability.test.ts`
- `src/tools/finance/technical-analysis/index.ts`
- `.harness/context/market-data-sources.md`
- `.harness/runs/2026-07-11-technical-applicability-v2-22-stock-backtest.md`
- `.harness/runs/2026-07-11-technical-applicability-v2-second-22-stock-backtest.md`
- `.harness/runs/2026-07-11-technical-applicability-v2-component-ablation.md`
- `.harness/runs/2026-07-11-technical-applicability-v2-1-third-universe-validation.md`
- `.harness/runs/2026-07-12-current-industry-leader-backtest.md`
- `.harness/runs/2026-07-12-point-in-time-market-cap-leader-validation.md`

Before continuing, run `git status --short --branch` and inspect the complete untracked files as well as `git diff`.

## Existing V1 Behavior

Implementation: `src/tools/finance/technical-analysis/strategy.ts`

### Entry Event

V1 emits `STRATEGY_TREND_RECOVERY_ENTRY` when:

1. Close crosses from at/below MA20 to above MA20.
2. MA20 is above MA60.
3. K is above D.

### Exit And Risk Events

V1 emits:

- `STRATEGY_STOP_LOSS` when close falls at least 8% from entry close.
- `STRATEGY_TRAILING_EXIT` when close falls at least 15% from the peak close since entry.
- `STRATEGY_MA20_BREAK_EXIT` after at least five bars and two consecutive closes below MA20.

These events are deterministic historical-state transitions. They are not validated instructions to transact. The public tool currently returns V1 events in `signals.position_events` and preserves original TongdaXin-style Baseline V0 events separately in `signals.baseline_v0_position_events`.

## Existing V2.1 Behavior

Implementation: `src/tools/finance/technical-analysis/applicability.ts`

V2.1 calculates diagnostic features for trend strength, trend stability, relative strength, volume, drawdown, and BOLL expansion. After component ablation, only these components affect the decision score:

- 50% CSI-300-relative strength: 20-day and 60-day stock return minus benchmark return.
- 50% volume confirmation: current volume versus prior 20-day median and recent 5-day average versus prior 20-day average.

V2.1 uses same-date cross-sectional percentile ranks:

- Both relative-strength and volume components must be at or above the 70th percentile.
- CSI 300 close must be above its MA60.
- CSI 300 MA20 must have a positive 10-day slope.
- Complete scored features and known benchmark regime are required.
- At least 10 same-date cohort members are required.

Current decisions:

- `execute`: both components reach consensus and the benchmark regime is favorable.
- `watch`: component consensus exists but the benchmark regime is unfavorable, or the combined score is high without full consensus.
- `reject`: sufficient data exists but conditions are weak.
- `insufficient_data` / `insufficient_cohort`: the system refuses to score.

The identifier `execute` is a research/backtest term. It should not be exposed to users as “buy.” If V2.1 becomes user-visible, map it to language such as `strong_observation`, `watch`, or `not_confirmed`.

## What The Evidence Actually Shows

### Development Evidence

On the combined 44-stock development sample, component ablation found that repeated trend/stability scoring weakened V1, while volume and relative strength added more independent information. The strict V2.1 development rule produced only 25 trades but showed 64% win rate, 4.99% average trade, and 3.02% median trade.

This was a development result, not validation.

### Untouched Third Universe

On a new 44-stock universe:

| Rule | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| unfiltered V1 | 446 | 28.48% | 0.41% | -2.35% |
| V2.1 | 30 | 36.67% | 0.45% | -2.89% |

V2.1 did not reproduce development performance. Results were concentrated in one stock and negative in 2025 and 2026. This invalidates any high-confidence claim.

### Current-Leader Backtest

Selecting companies by 2026 market capitalization and backtesting from 2023 produced stronger numbers, but this has survivorship and look-ahead bias. It only shows that today’s leaders often had favorable historical trends.

### Point-In-Time Market-Cap Test

Using market capitalization visible on 2022-12-30 before evaluating 2023 onward removed the main future-leader bias.

The cleaner 30-stock sample excluded the original 44 development stocks:

| Rule | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| unfiltered V1 | 345 | 28.41% | 0.40% | -1.85% |
| volume/relative consensus without market gate | 54 | 40.74% | 1.56% | -1.00% |
| V2.1 with market gate | 24 | 37.50% | 1.98% | -1.01% |

Point-in-time large-cap selection may improve payoff distribution, but did not make V2.1 high precision. The market gate raised average trade but reduced win rate in this clean sample.

## Product Positioning

The current capability should be positioned as a **technical-state analysis and alert system**, not an automated trading recommendation system.

### Safe Production Claims

- Data date, adjustment method, and data completeness.
- Daily/weekly trend state and MA alignment.
- Price position versus MA20/MA60 and BOLL.
- KDJ momentum state.
- Realized volatility and drawdown.
- A deterministic V1 trend-recovery or trend-invalidation event occurred.
- Volume or benchmark-relative-strength confirmation is present when the required cohort exists.
- Market environment is favorable, unfavorable, or unavailable under the experimental filter.
- Historical signals can fail and are not investment advice.

### Claims To Avoid

- “建议买入” / “建议卖出.”
- “上涨概率为 X%.”
- “高置信度交易机会.”
- “V2.1 已经验证有效.”
- “龙头股适用该策略” without a point-in-time selection qualifier.
- Any conclusion calculated from a cross-sectional percentile when the cohort definition is missing or too small.

## Recommended User-Facing Composition

### Layer 1: Objective State

Always show the deterministic evidence:

- Latest data date and adjustment mode.
- Close, MA20, MA60, MA20 slope, and MA alignment.
- BOLL position and bandwidth.
- K, D, and J.
- 20-day volatility and drawdown.
- Relative-strength and volume evidence only when available.

### Layer 2: V1 Event Or Risk Alert

Map V1 events into analysis language:

| Internal event | User-facing label | Meaning |
| --- | --- | --- |
| `STRATEGY_TREND_RECOVERY_ENTRY` | `trend_recovery_candidate` | Price recovered MA20 inside an existing MA20-over-MA60 structure with KDJ confirmation. |
| `STRATEGY_MA20_BREAK_EXIT` | `trend_invalidation_warning` | The recovery structure weakened after repeated closes below MA20. |
| `STRATEGY_STOP_LOSS` | `entry_reference_drawdown_warning` | Close moved at least 8% below the event reference close. |
| `STRATEGY_TRAILING_EXIT` | `peak_drawdown_warning` | Close fell at least 15% from the post-event peak close. |

Do not display the internal word `ENTRY` as a transaction instruction.

### Layer 3: V2.1 Qualification

Only add V2.1 when benchmark and cohort data are valid:

| V1 state | V2.1 state | Recommended wording |
| --- | --- | --- |
| recovery candidate | favorable | “趋势恢复候选同时获得量价、相对强度和市场环境确认，关注优先级较高；模型尚未校准。” |
| recovery candidate | watch | “价格结构出现恢复，但量价、相对强度或大盘环境确认不足，暂列观察。” |
| recovery candidate | reject | “出现单股技术触发，但横截面确认较弱，不宜将其解释为强信号。” |
| recovery candidate | insufficient | “缺少可靠基准或同日股票池，无法评估信号质量。” |
| no recovery candidate | favorable features | “股票相对强势且量能活跃，但尚未出现V1趋势恢复事件。” |
| any risk event | any | Report the risk event independently; V2.1 must not suppress a deterministic V1 risk warning. |

### Layer 4: Evidence Boundary

End with a compact statement:

> 以上为历史价格与成交量的确定性技术状态分析。V1/V2.1尚未形成稳定的样本外交易优势，不构成买卖建议或收益概率预测。

## Proposed Output Contract

Do not immediately implement this exact shape without inspecting existing `TechnicalAnalysisResult`, but preserve these semantic boundaries:

```ts
interface TechnicalAssessment {
  state: {
    trend: 'bullish' | 'bearish' | 'mixed' | 'insufficient_data';
    momentum: string;
    volatility: 'expanding' | 'contracting' | 'normal' | 'insufficient_data';
  };
  alerts: Array<{
    date: string;
    type:
      | 'trend_recovery_candidate'
      | 'trend_invalidation_warning'
      | 'entry_reference_drawdown_warning'
      | 'peak_drawdown_warning'
      | 'overheat_warning';
    severity: 'info' | 'watch' | 'risk';
    evidence: Record<string, number | boolean | null>;
  }>;
  applicability?: {
    model: 'trend_applicability_v2_1';
    status: 'strong_observation' | 'watch' | 'not_confirmed' | 'insufficient_data';
    relative_strength_percentile: number | null;
    volume_confirmation_percentile: number | null;
    benchmark_regime: 'favorable' | 'unfavorable' | 'unknown';
    cohort_size: number;
    experimental: true;
  };
  confidence: {
    data: 'high' | 'medium' | 'low';
    indicator_calculation: 'high' | 'medium' | 'low';
    strategy_applicability: 'experimental' | 'unavailable';
    directional_probability: null;
  };
}
```

## Data And Runtime Constraints

### V1

V1 works with the existing single-stock path:

- `stock_basic` for name/code resolution.
- `daily` for OHLC and volume.
- `adj_factor` for local qfq prices.
- All indicators and events calculated locally.

### V2.1

V2.1 needs more than one-stock data:

- `index_daily` for CSI 300 relative strength and benchmark regime.
- A defined same-date stock cohort for percentile ranks.
- Historical daily/volume data for every cohort member.

Do not make a user’s single-stock request issue one Tushare call per cohort member. That would increase latency and rate-limit risk. Prefer one of these designs:

1. **Cached batch snapshot:** periodically fetch a fixed cohort in multi-code `daily` batches and persist calculated feature snapshots.
2. **Scheduled universe job:** calculate same-date percentiles once per trading day, then serve single-stock lookups.
3. **Explicit batch-analysis workflow:** only calculate V2.1 when the caller requests screening/ranking across a supplied universe.

The cohort definition is part of the model. A score calculated against 30 hand-picked stocks is not directly comparable with a score calculated against CSI 300 constituents. Store and return a cohort identifier and size.

Point-in-time membership is required for historical validation. Do not use current CSI 300 constituents or current industry leaders to backtest earlier years without marking look-ahead bias.

## Recommended Implementation Sequence

### Phase 1: Production-Safe V1 Analysis And Alerts

1. Add a pure mapping layer from V1 `PositionEvent` values to neutral alert names and severities.
2. Preserve raw V0 formula signals and V1 events as evidence, but avoid transaction language in prompt-visible descriptions and skill output.
3. Add structured confidence fields separating data confidence, indicator confidence, and experimental strategy applicability.
4. Update `src/skills/technical-analysis/SKILL.md` so Feishu answers describe states and warnings rather than recommendations.
5. Update rich and compact tool descriptions together.
6. Keep V2.1 absent or explicitly `unavailable` in ordinary one-stock calls until cohort infrastructure exists.

### Phase 2: V2.1 Snapshot Infrastructure

1. Decide and document the production cohort: fixed liquid-stock universe, CSI 300, or another point-in-time membership source.
2. Add a provider-neutral interface for benchmark and cohort snapshots.
3. Batch Tushare requests and cache results by trade date and cohort ID.
4. Calculate feature percentiles once per date, not once per user query.
5. Attach V2.1 qualification to V1 candidates without changing V1 event generation.
6. Return `insufficient_data` rather than silently falling back to fixed thresholds when cohort data is missing.

### Phase 3: Rolling Validation

1. Reconstruct point-in-time universe membership monthly or quarterly.
2. Freeze all parameters before the evaluation period.
3. Execute at next-open prices with transaction costs, suspension handling, and limit-fill assumptions.
4. Report yearly metrics, average/median trade, win rate, payoff ratio, maximum drawdown, contribution concentration, and fixed-horizon labels separately.
5. Do not promote V2.1 until there are at least 100 genuinely out-of-sample accepted trades with acceptable cross-year and cross-stock stability.

## Likely Code Touchpoints

- `src/tools/finance/technical-analysis/types.ts`
- `src/tools/finance/technical-analysis/strategy.ts`
- `src/tools/finance/technical-analysis/applicability.ts`
- New pure mapping module such as `src/tools/finance/technical-analysis/assessment.ts`
- `src/tools/finance/technical-analysis/technical-analysis.ts`
- `src/tools/finance/technical-analysis/technical-analysis.test.ts`
- `src/tools/finance/technical-analysis/applicability.test.ts`
- `src/tools/finance/technical-analysis/index.ts`
- `src/tools/registry.ts`
- `src/tools/registry.tushare.test.ts`
- `src/skills/technical-analysis/SKILL.md`
- `.harness/context/market-data-sources.md`
- `.harness/context/tools-skills-and-subagents.md` if routing or prompt-visible behavior changes

## Verification Requirements

Minimum code validation:

```bash
bun test src/tools/finance/technical-analysis/*.test.ts
bun test src/tools/registry.tushare.test.ts
bun run typecheck
bun test
git diff --check
git status --short --branch
```

Required behavioral tests:

- V1 recovery maps to an informational observation, not “buy.”
- V1 invalidation and drawdown events remain risk alerts regardless of V2.1 state.
- Missing benchmark produces unknown/insufficient applicability.
- Missing or undersized cohort refuses a V2.1 decision.
- Unfavorable CSI 300 regime downgrades consensus to watch.
- Trend diagnostics cannot compensate for missing volume or relative-strength consensus.
- Prompt-visible tool and skill text do not present V1/V2.1 as validated trade advice.
- Ordinary single-stock analysis does not fan out into uncontrolled per-stock Tushare calls.

## Non-Goals

- Automated trade execution.
- Position sizing or portfolio allocation.
- Intraday or real-time signal generation.
- Calibrated probability of price increase.
- Guaranteed chart-platform formula parity.
- Fundamental valuation or news-causality inference.

## Recommended First Task In The Next Session

Implement **Phase 1 only**: add a pure `assessment.ts` mapping layer that turns existing V1 events into neutral technical observations and risk alerts, update the result types and skill wording, and leave V2.1 explicitly experimental/unavailable in the ordinary single-stock response. This delivers immediate product value without introducing the unresolved cross-sectional data-fetching problem.

After Phase 1 passes tests, make the cohort/data-cache design a separate decision before wiring V2.1 into runtime calls.
