# Current Industry Leaders: Frozen V1/V2.1 Backtest

## Selection

- Selection date: 2026-07-10, the latest trading day before the run
- Source: Tushare `stock_basic + daily_basic`
- Rule: exclude all 88 stocks used in the previous development and validation samples; require active Shanghai/Shenzhen listing, listing date no later than 2021-12-31, and non-ST name; within each Tushare industry choose the remaining stock with the largest total market capitalization; take the 30 largest industry winners by total market capitalization.
- This produces previously unseen current industry-head companies, not necessarily the absolute industry leader when the absolute leader appeared in an earlier sample.

Selected stocks:

中国银行、中芯国际、工业富联、中国人寿、中国石化、中国电信、东山精密、百济神州、洛阳钼业、国泰海通、中国船舶、京沪高铁、中国巨石、陕西煤业、中远海控、中国广核、宏桥控股、华能水电、国电南瑞、同花顺、华工科技、中国中车、中科曙光、杰瑞股份、中航成飞、宝丰能源、恒立液压、江西铜业、山西汾酒、盐湖股份。

## Data And Method

- Warm-up: 2022
- Evaluation: 2023-01-01 through 2026-07-10
- Data: 32,721 stock daily rows, 32,790 adjustment-factor rows, and the existing 1,093 CSI 300 index rows
- Raw V1 candidates: 469 across 317 dates
- Local qfq calculation, frozen Trend Recovery V1, next-open execution, and 0.1% cost per side
- Frozen V2.1: volume and CSI-300-relative-strength components must both reach the same-date 70th percentile, with CSI 300 close above MA60 and positive 10-day MA20 slope
- No parameter was changed after selection or backtest results.

## Results

| Rule | Trades | Win rate | Average trade | Median trade | Average hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| unfiltered V1 | 390 | 32.56% | 2.84% | -1.88% | 15.08 days |
| volume/relative consensus without market gate | 42 | 50.00% | 7.91% | -0.09% | 20.10 days |
| frozen V2.1 with market gate | 12 | 58.33% | 7.30% | 1.05% | 18.33 days |

The current-leader universe was much more favorable to V1 than the third general unseen universe, where unfiltered V1 averaged 0.41% and V2.1 averaged 0.45%. This supports a conditional relationship between established leadership and trend-strategy payoff, but does not establish advance predictability.

### V2.1 By Entry Year

| Year | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| 2023 | 1 | 100.00% | 14.27% | 14.27% |
| 2024 | 4 | 75.00% | -0.27% | 1.05% |
| 2025 | 3 | 66.67% | 29.75% | 16.17% |
| 2026 through July 10 | 4 | 25.00% | -3.72% | -5.58% |

The 2023 and 2025 figures are driven by very small counts, while 2026 remained negative.

## Fixed 20-Day Candidate Outcome

Ten execute candidates had a complete 20-trading-day label:

- Positive rate: 70.00%
- Average net 20-day return: 6.61%
- Median net 20-day return: 4.37%

The labeled count is too small for probability calibration.

## Concentration

- 华工科技 contributed about 60.10% of all positive stock-level contribution.
- 华工科技 plus 洛阳钼业 contributed about 74.30%.
- The aggregate result is therefore not diversified despite the cross-industry selection rule.

## Critical Bias

This is not a clean historical validation. The universe was selected using market capitalization observed on 2026-07-10 and then backtested from 2023. This introduces survivorship and look-ahead bias: companies that became or remained large by 2026 are more likely to have experienced favorable historical trends. The run can answer "how the frozen strategy behaved historically on today's industry leaders," but it cannot answer "whether the system could have identified the leaders before their strong performance."

## Decision

- Do not adjust V1 or V2.1 from this run.
- Treat the result as evidence that leadership state may be a useful conditioning variable, not as strategy validation.
- The next unbiased test should reconstruct industry leadership point-in-time, for example at each month-end, using only market-cap information available at that date before evaluating subsequent signals.
