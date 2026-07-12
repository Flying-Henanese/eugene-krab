# Technical Applicability V2: Second 22-Stock Backtest

## Scope

- Evaluation: 2023-01-01 through 2026-07-10, with 2022 warm-up
- Benchmark: CSI 300 (`000300.SH`)
- New universe: 浦发银行、工商银行、建设银行、农业银行、中国石油、中国建筑、中国联通、恒瑞医药、片仔癀、药明康德、海尔智家、海天味业、牧原股份、迈瑞医疗、科大讯飞、三一重工、福耀玻璃、保利发展、顺丰控股、京东方A、潍柴动力、宝钢股份
- The universe does not overlap the first 22-stock test.
- Tushare rows: 24,046 daily and 24,046 adjustment-factor rows. The previously fetched 1,093 CSI 300 rows were reused.
- Annual batch requests did not hit a rate limit. Raw MCP rows were not committed.
- Methodology, qfq calculation, next-open execution, and 0.1% per-side costs match the first run.

## Candidate Results

| Decision | Candidates | 20d labeled | 20d positive | Average net 20d | Median net 20d |
| --- | ---: | ---: | ---: | ---: | ---: |
| execute | 39 | 39 | 48.72% | 0.52% | -0.43% |
| watch | 108 | 105 | 52.38% | 2.11% | 0.16% |
| reject | 201 | 201 | 54.23% | 0.63% | 0.78% |

The score again failed to sort fixed 20-day directional accuracy monotonically. The watch group had the strongest average 20-day return, while reject had the highest positive rate.

## Strategy Results

| Filter | Trades | Win rate | Average trade | Median trade | Average hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| all V1 candidates | 272 | 34.93% | 0.62% | -1.50% | 15.34 days |
| execute only | 35 | 37.14% | 1.15% | -0.78% | 17.14 days |
| execute + watch | 122 | 40.16% | 1.40% | -0.90% | 16.18 days |

Both filters improved average trade expectancy and win rate. Unlike the first universe, the broader top-30% filter outperformed the top-decile-only filter.

### Execute-Only By Entry Year

| Year | Trades | Win rate | Average trade |
| --- | ---: | ---: | ---: |
| 2023 | 15 | 33.33% | 0.46% |
| 2024 | 11 | 45.45% | 3.56% |
| 2025 | 6 | 50.00% | 1.02% |
| 2026 through July 10 | 3 | 0.00% | -3.96% |

## Concentration

- Execute-only net-return sum was about 40.36 percentage points across 35 trades.
- 中国石油 contributed about +37.24 points across four trades, nearly all of the net result after losses elsewhere.
- For execute + watch, 潍柴动力 and 中国石油 contributed about +96.22 and +64.84 points respectively, against a total net-return sum of about +170.77 points.

The result remains highly dependent on a few commodity, industrial, and banking trends.

## Combined Descriptive View Across Both 22-Stock Runs

| Filter | Trades | Win rate | Average trade |
| --- | ---: | ---: | ---: |
| all V1 candidates | 525 | 32.38% | 0.49% |
| execute only | 78 | 35.90% | 1.54% |
| execute + watch | 237 | 36.29% | 1.21% |

This combined view is descriptive, not an independent validation set, because the score design existed before both runs and both universes are small manually selected samples.

## Decision

- Preserve the evidence that applicability filtering improves V1 variable-horizon expectancy in two different universes.
- Reject the interpretation that the score predicts a positive fixed 20-day return.
- Do not tune the execute threshold from 10% to 30% based only on these two runs.
- Next run should perform component ablation and stock-contribution caps before expanding the universe or exposing the score publicly.
