# Technical Applicability V2.1: Third-Universe Validation

## Scope

- Validation universe: 44 stocks not used in either development batch
- Warm-up: 2022
- Evaluation: 2023-01-01 through 2026-07-10
- Benchmark: CSI 300
- Tushare rows: 48,071 daily, 48,092 adjustment-factor, 1,093 index daily
- Raw V1 candidates: 558 across 326 distinct signal dates
- Execution: next trading-day open with 0.1% cost per side
- V1 and V2.1 parameters were frozen before seeing this universe. No parameter was changed after the result.

The validation universe covered real estate, communications, consumer goods, healthcare, semiconductors, batteries, industrials, chemicals, transportation, and financials. It included 万科A、中兴通讯、泸州老窖、长安汽车、宁波银行、北方华创、赣锋锂业、亿纬锂能、阳光电源、汇川技术、温氏股份、上海机场 and other previously unseen stocks.

## Results

| Rule | Trades | Win rate | Average trade | Median trade | Average hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| unfiltered V1 | 446 | 28.48% | 0.41% | -2.35% | 13.35 days |
| volume/relative consensus without market gate | 87 | 25.29% | -1.14% | -3.42% | 14.11 days |
| frozen V2.1 consensus with market gate | 30 | 36.67% | 0.45% | -2.89% | 16.90 days |

The market gate prevented the consensus rule from being outright negative, but V2.1 did not reproduce the development sample's 64% win rate, 4.99% average trade, or positive median. The average-trade improvement over unfiltered V1 was economically small, and the median became worse.

### V2.1 By Entry Year

| Year | Trades | Win rate | Average trade | Median trade |
| --- | ---: | ---: | ---: | ---: |
| 2023 | 2 | 100.00% | 11.60% | 11.60% |
| 2024 | 8 | 37.50% | 3.71% | -1.73% |
| 2025 | 15 | 33.33% | -1.69% | -5.24% |
| 2026 through July 10 | 5 | 20.00% | -2.79% | -1.49% |

The two 2023 trades are too few to interpret. Performance was negative in 2025 and 2026.

## Fixed 20-Day Candidate Outcome

The frozen V2.1 execute condition produced 31 candidates with a complete 20-trading-day label:

- Positive rate: 54.84%
- Average net 20-day return: 1.11%
- Median net 20-day return: 1.12%

This is directionally better than the V2.1 full-trade win rate, but it does not establish calibration or prove that V1's variable-horizon exit captures the filtered opportunities effectively.

## Concentration

- 歌尔股份 supplied about 56.83% of all positive stock-level contribution.
- 歌尔股份 plus 中兴通讯 supplied about 73.69% of positive contribution.
- Removing the largest contributor would make the aggregate V2.1 trade-return sum negative.

The validation fails the intended diversification check.

## Decision

- Do not promote V2.1 to the public technical-analysis response.
- Do not describe V2.1 as high-confidence or calibrated.
- Preserve the frozen parameters and this negative result; do not retune against this validation universe.
- The CSI 300 market gate showed incremental value because ungated consensus was negative, but the volume/relative-strength consensus did not generalize as a profitable V1 trade filter.
- Additional validation should use a broad mechanically selected universe or walk-forward design rather than another hand-picked small group.
