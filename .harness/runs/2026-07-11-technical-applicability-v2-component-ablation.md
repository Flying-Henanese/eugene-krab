# Technical Applicability V2 Component Ablation

## Scope

- Development universe: the two previously tested, non-overlapping 22-stock groups combined into one 44-stock same-date cross-section
- Warm-up: 2022
- Evaluation: 2023-01-01 through 2026-07-10
- Raw V1 entry candidates: 661 across 346 distinct signal dates
- Benchmark: CSI 300
- Execution and costs: next trading-day open, 0.1% per side
- No additional Tushare requests were made; cached MCP data from the two prior runs was reused.

## Top-Decile Component Ablation

| Configuration | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| unfiltered V1 | 525 | 32.38% | 0.49% | -1.63% |
| full V2 score | 54 | 38.89% | 2.53% | -0.92% |
| no volume | 55 | 38.18% | 1.09% | -1.02% |
| no BOLL expansion | 79 | 39.24% | 2.08% | -1.06% |
| no relative strength | 48 | 39.58% | 1.55% | -0.92% |
| no stability | 76 | 42.11% | 2.59% | -0.68% |
| no trend strength | 46 | 45.65% | 3.13% | -0.13% |
| trend + stability + relative only | 74 | 33.78% | 0.73% | -1.39% |
| trend only | 92 | 33.70% | 1.20% | -1.49% |
| stability only | 53 | 33.96% | 0.37% | -0.78% |
| relative strength only | 77 | 38.96% | 2.48% | -0.78% |
| volume only | 100 | 49.00% | 3.21% | -0.13% |
| BOLL only | 6 | 50.00% | 1.86% | 1.17% |

The BOLL-only cohort is too small to interpret. Volume confirmation was the strongest isolated component. Removing trend strength or stability improved the full score, while the three-component trend/stability/relative core was weak. The likely explanation is that frozen V1 already requires an MA20 recovery inside `MA20 > MA60` with positive KDJ confirmation, so scoring similar trend information again penalizes early recoveries without adding independent evidence.

## Predeclared Targeted Variants

After the component ablation, three logically motivated rules were compared: volume only, equal-weight volume plus relative strength, and a 70th-percentile consensus between volume and relative strength. Each was also tested with a market gate requiring CSI 300 close above MA60 and positive 10-day MA20 slope.

| Rule | Trades | Win rate | Average trade | Median trade | Fixed 20d positive |
| --- | ---: | ---: | ---: | ---: | ---: |
| volume top 10% | 99 | 48.48% | 3.05% | -0.22% | 52.43% |
| volume top 10% + market gate | 44 | 47.73% | 2.35% | -1.07% | 47.73% |
| equal-weight volume + relative top 10% | 115 | 50.43% | 3.10% | 0.01% | 56.80% |
| equal-weight volume + relative top 10% + market gate | 38 | 57.89% | 3.56% | 1.59% | 57.89% |
| volume and relative both at least 70th percentile | 77 | 53.25% | 3.49% | 1.12% | 65.00% |
| 70th-percentile consensus + market gate | 25 | 64.00% | 4.99% | 3.02% | 72.00% |

The strict consensus plus market gate best matches the low-coverage, high-precision objective, but 25 trades are far below the 100-trade validation target. It is a development-sample result and must not be presented as calibrated confidence.

## V2.1 Decision

- Keep Trend Recovery V1 unchanged.
- Score relative strength and volume confirmation at equal weight.
- Retain trend, stability, and BOLL features only as diagnostics.
- Require both scored components to reach the same-date 70th percentile.
- Require CSI 300 close above MA60 and positive 10-day MA20 slope for `execute`.
- Downgrade component consensus to `watch` when the market gate fails.
- Require complete scored features, a known market regime, and a same-date cohort of at least 10.
- Keep the policy offline until a new, untouched universe and walk-forward periods confirm it.
