# Point-In-Time Market-Cap Leader Validation

## Selection Protocol

- Selection date: 2022-12-30
- Selection data: Tushare `daily_basic.total_mv` visible on that date
- Evaluation starts after selection: 2023-01-01 through 2026-07-10
- Warm-up prices: 2022
- No future market capitalization, future leader membership, or subsequent performance was used in ranking.
- The selection is whole-market capitalization ranking, not industry ranking, because the available `stock_basic.industry` field is a current classification rather than a historical point-in-time taxonomy.

Two separate 30-stock universes were evaluated:

1. **Historical Top 30:** the 30 largest Shanghai/Shenzhen stocks on 2022-12-30. Eighteen stocks overlap the original 44-stock V2.1 development universe, so this result is descriptive but contaminated.
2. **Clean historical head 30:** rank all stocks by the same 2022-12-30 market-cap snapshot, remove the original 44 development stocks, then take the largest remaining 30. This is not the literal market Top 30, but is the cleaner frozen-parameter test.

V1 and V2.1 parameters remained frozen. Execution used the next trading-day open and 0.1% cost per side.

## Historical Top 30

The literal 2022-12-30 Top 30 included 贵州茅台、工商银行、中国移动、建设银行、中国人寿、农业银行、宁德时代、招商银行、中国银行、中国石油、中国平安、比亚迪、中国海油、五粮液、中国神华、中国石化、长江电力、中国中免、邮储银行、中国电信 and other large-cap stocks.

| Rule | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| unfiltered V1 | 417 | 32.85% | 0.74% | -1.44% |
| volume/relative consensus without market gate | 73 | 49.32% | 3.13% | -0.20% |
| frozen V2.1 with market gate | 30 | 53.33% | 4.16% | 1.19% |

V2.1's 31 complete fixed-20-day candidates had a 61.29% positive rate, 4.87% average return, and 3.14% median return. However, 18 of these 30 stocks appeared in the development universe, so this cannot serve as independent validation.

## Clean Historical Head 30

The clean list included 中国移动、中国人寿、中国银行、中国海油、中国石化、中国中免、邮储银行、中国电信、交通银行、山西汾酒、泸州老窖、中芯国际、长城汽车、中信银行、洋河股份、京沪高铁、金龙鱼、中国太保、中国人保、宁波银行、万科A、汇川技术、中信建投、中金公司、工业富联、陕西煤业、亿纬锂能、百济神州、通威股份 and 兖矿能源.

| Rule | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| unfiltered V1 | 345 | 28.41% | 0.40% | -1.85% |
| volume/relative consensus without market gate | 54 | 40.74% | 1.56% | -1.00% |
| frozen V2.1 with market gate | 24 | 37.50% | 1.98% | -1.01% |

V2.1's 26 complete fixed-20-day candidates had a 53.85% positive rate, 1.88% average return, and 1.19% median return.

### Clean V2.1 By Entry Year

| Year | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| 2023 | 4 | 75.00% | 3.31% | 4.54% |
| 2024 | 6 | 33.33% | -0.39% | -1.91% |
| 2025 | 7 | 14.29% | 1.63% | -3.31% |
| 2026 through July 10 | 7 | 42.86% | 3.60% | -0.37% |

The positive 2025 average came from a small number of large winners despite a 14.29% win rate and negative median.

## Concentration And Interpretation

- 中国海油 contributed about 40.81% of positive stock-level V2.1 contribution in the clean universe.
- 中国海油 plus 兖矿能源 contributed about 64.96%.
- The point-in-time selection removes the principal future-leader look-ahead bias from the earlier current-leader run.
- In the cleaner sample, historical large-cap leadership improved average payoff and reduced the loss magnitude of the median trade, but did not produce a high-precision strategy.
- The CSI 300 market gate was not consistently beneficial in the clean sample: it raised average trade from 1.56% to 1.98% but reduced win rate from 40.74% to 37.50%.

## Decision

- Do not change V1 or V2.1 from this result.
- Reject the claim that point-in-time market-cap leadership makes V2.1 high-confidence.
- Preserve the weaker but plausible claim that point-in-time large-cap selection may improve trend-strategy payoff distribution.
- The next stronger design is rolling point-in-time selection, for example reselecting the market-cap universe monthly or quarterly, because a single 2022 snapshot allows leadership to become stale over the following three and a half years.
