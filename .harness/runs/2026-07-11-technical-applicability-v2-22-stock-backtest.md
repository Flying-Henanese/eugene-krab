# Technical Applicability V2: 22-Stock Backtest

## Scope

- Research branch: `codex/technical-analysis-strategy-v2-exploration`
- Warm-up data: 2022-01-04 onward
- Evaluation: 2023-01-01 through 2026-07-10
- Universe: the 22 previously discussed A-shares
- Benchmark: CSI 300 (`000300.SH`)
- Tushare rows: 24,029 daily, 24,046 adjustment-factor, 1,093 index daily
- Tushare requests were batched by natural year and did not hit a rate limit. Raw MCP rows were not committed.

## Method

- Calculate qfq OHLC locally using each stock's latest factor in the complete requested window as the anchor.
- Keep the frozen Trend Recovery V1 entry and exit rules unchanged.
- Build applicability features from information available at each close.
- Rank all available stocks from the 22-stock universe on the same date, then attach `execute`, `watch`, or `reject` to V1 entry candidates.
- Execute strategy entries and exits at the next trading-day open.
- Charge 0.1% on each side.
- Evaluate raw candidate direction separately with net 20-trading-day close-to-close return. This fixed-horizon label is not the same as the V1 exit policy.

## Candidate Results

| Decision | Candidates | 20d labeled | 20d positive | Average net 20d | Median net 20d |
| --- | ---: | ---: | ---: | ---: | ---: |
| execute | 48 | 46 | 39.13% | -0.47% | -1.95% |
| watch | 88 | 86 | 37.21% | -0.96% | -2.07% |
| reject | 177 | 177 | 44.63% | -0.46% | -1.11% |

The score did not sort fixed 20-day directional accuracy. It must not be described as a calibrated probability that price will rise over the next 20 trading days.

## Strategy Results

| Filter | Trades | Win rate | Average trade | Median trade | Average hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| all V1 candidates | 253 | 29.64% | 0.35% | -1.70% | 14.17 days |
| execute only | 43 | 34.88% | 1.85% | -1.34% | 15.14 days |
| execute + watch | 115 | 32.17% | 1.02% | -1.52% | 14.23 days |

`execute only` improved average trade expectancy and win rate in this sample, but it produced only 43 trades and remained negatively skewed at the median.

### Execute-Only By Entry Year

| Year | Trades | Win rate | Average trade |
| --- | ---: | ---: | ---: |
| 2023 | 20 | 25.00% | -0.04% |
| 2024 | 7 | 42.86% | 1.43% |
| 2025 | 11 | 45.45% | 7.06% |
| 2026 through July 10 | 5 | 40.00% | -1.48% |

The improvement is not stable across years and is dominated by 2025.

## Concentration

The largest execute-only net-return sums by stock were approximately:

- 紫金矿业: +34.78 percentage points across five trades
- 立讯精密: +34.75 points across four trades
- 中国神华: +17.70 points across two trades
- 美的集团: +15.14 points across three trades

The two largest contributors account for more than half of gross positive contribution, so the result fails the intended diversification check.

## Example High-Ranked Candidate Points

| Signal date | Stock | Score | Net 20d |
| --- | --- | ---: | ---: |
| 2025-04-30 | 伊利股份 | 82.26 | +2.52% |
| 2023-12-22 | 中国神华 | 81.67 | +4.83% |
| 2023-03-17 | 海康威视 | 80.36 | +8.70% |
| 2026-02-24 | 万华化学 | 80.24 | -14.06% |
| 2025-10-21 | 立讯精密 | 79.35 | -7.61% |
| 2026-04-10 | 宁德时代 | 78.69 | +5.76% |
| 2024-09-18 | 格力电器 | 77.68 | +18.05% |
| 2025-12-05 | 中国平安 | 76.85 | +19.65% |
| 2023-08-28 | 中信证券 | 76.49 | -8.13% |
| 2023-03-13 | 紫金矿业 | 76.07 | +10.22% |

## Decision

- Keep Trend Recovery V1 frozen.
- Keep Applicability V2 offline and experimental.
- Do not expose its score as confidence or probability.
- Next test should diagnose which components improve V1's variable-horizon expectancy, expand the universe, and use walk-forward evaluation. Do not tune thresholds against these same 22 stocks and then report the tuned result as validation.
