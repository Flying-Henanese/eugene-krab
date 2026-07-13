---
name: stock-analysis
description: Produces a source-disciplined, neutral combined analysis of one China A-share using structured fundamentals and valuation, recent company or industry information, and deterministic technical state. Use for broad single-stock requests such as “分析一下某只股票”, “深入分析某公司”, “这只股票最近怎么样”, “有哪些风险”, or “有什么值得注意的变化” when the user has not limited the request to one research lane. Do not use when the request is explicitly technical-analysis only, fundamentals or valuation only, news only, broad-market sentiment, a multi-company comparison, a DCF, or an investment memo.
---

# China A-Share Combined Analysis

Analyze one China A-share as decision support, not as a transaction recommendation. Connect evidence across fundamentals, recent public information, and technical state without turning the report into a directional forecast.

## Non-Negotiable Rules

Apply these rules before all style or completeness preferences:

1. Use `n_income_attr_p` for 归母净利润. `n_income` is group net profit including minority interests and must never be labeled 归母净利润. If `n_income_attr_p` is unavailable, obtain 归母净利润 from a primary financial disclosure or omit it.
2. Copy the `technical_analysis` period, state label, adjustment mode, and `latest_week_partial` value exactly. Do not reinterpret `false` as an unfinished week or change a 20-day metric into a 60-day metric.
3. Use `technical_analysis.decision_context` as the source of technical structure meaning, cross-horizon relationship, confirmation/invalidation conditions, and review cadence. Translate it concisely but do not replace it with model-invented thresholds or causal claims.
4. Use one of the six Chinese Combined Interpretation labels verbatim. Do not decorate or replace it with a custom headline. Valuation multiples, dividends, repurchases, or brokerage forecasts are not evidence that fundamentals are improving.
5. Never use transaction or promotional conclusions, including “价值洼地”, “黎明信号”, “反转”, “硬底”, “回报下限”, “价值信号”, “安全边际”, “追高”, “性价比”, or claims that management believes intrinsic value exceeds the price unless a primary source states that exact claim.
6. Omit a claim rather than filling a missing source, period, unit, scope, or field meaning with an inference.
7. The main agent retains the `stock-analysis` skill, structured fundamentals, material arithmetic verification, evidence reconciliation, pre-publication review, and final synthesis. Never delegate the complete ordinary single-company analysis to `analysis` or `general-purpose`. In a broad multi-lane report, `research` may handle a clearly isolated multi-step current-information lane and `technical-analysis` may handle a clearly isolated deterministic technical lane.
8. Treat Tushare `free_cashflow` as a separate upstream field. Never define it as operating cash flow minus capital expenditure; use `operating_cashflow_less_capex` for the deterministic `n_cashflow_act - c_pay_acq_const_fiolta` value and label both explicitly if both are shown.
9. Reject or repair an auxiliary result that lacks material dates, periods, units, scope, attribution, URLs, technical metadata, conflicting evidence, or limitations. An auxiliary worker never owns the Combined Interpretation or final company-level conclusion.

## Workflow

1. Resolve one company and ticker. State ambiguity or unsupported scope instead of guessing.
2. In the main agent, call `a_share_analysis` for the latest structured market snapshot, multi-period financial statements, valuation, profitability, cash flow, balance-sheet evidence, business composition, audit result, dividends, forecasts, and express reports. Preserve the distinction between group net profit (`n_income`) and attributable net profit (`n_income_attr_p`). Prefer this structured evidence over annual-report PDF parsing for ordinary financial analysis. Use updated statement versions and retain like-for-like comparison periods.
3. Obtain the technical lane for the same ticker. A direct main-agent `technical_analysis` call remains valid and is required for a narrow technical-only request. In a broad multi-lane report, the main agent may instead delegate a clearly isolated lane to `technical-analysis` only when the task supplies the ticker, non-default adjustment if any, requested horizons, role in the parent report, excluded scope, and required output metadata. Treat the public structured result as the only source of technical indicators, periods, state labels, observations, and structural changes; never recalculate or relabel them in prose.
4. Obtain recent company announcements, financial disclosures, operating data, and material industry context. A direct main-agent `web_search` call remains valid for a simple lane. For an independent multi-step lane in a broad report, the main agent may delegate to `research` only when the task supplies the object or ticker, period, topics, source priority, required URLs, excluded scope, and evidence-packet shape. Prefer primary sources in this order:
   - exchange or regulator disclosure;
   - company announcement, investor-relations page, or official statement;
   - authoritative industry data;
   - reputable financial media;
   - brokerage research;
   - forums, social posts, aggregators, and commentary sites.
5. Use low-priority sources only to discover leads. Do not let promotional headlines, forum opinions, target prices, or brokerage forecasts become the assistant's own conclusion. Omit a material claim that is available only from a forum, social post, aggregator, or commentary site. A brokerage forecast may appear only in a separate, explicitly attributed third-party-view subsection and never as supporting evidence for the combined state.
6. Use `web_fetch` when a search snippet is insufficient to establish the period, unit, scope, attribution, or exact wording of a material claim.
7. Inspect every direct or delegated lane before synthesis. Reject or repair missing dates, periods, units, scope, attribution, URLs, technical metadata, conflicting evidence, or limitations. Synthesize only after all three lanes are available or their limitations have been stated.
8. Call `financial_calculator` before drafting whenever a material number requires unit conversion, comparison, or percentage-change arithmetic. At minimum, convert Tushare `total_mv` and `circ_mv` from `cny_10k` to `cny_100m`; use the returned result exactly. Do not annualize a reported-period ROE with this tool.

## Evidence Discipline

Classify material evidence before drafting:

- **Company-disclosed fact**: reported financials, guidance, operating disclosure, or board-approved action.
- **Market or industry data**: price, volume, freight rate, commodity price, policy, or industry statistic with a date and scope.
- **Deterministic calculation**: ratio, return, moving average, indicator, or arithmetic derived from identified inputs.
- **Third-party view**: brokerage estimate, media interpretation, target price, or market commentary.
- **Assistant synthesis**: a bounded interpretation supported by the preceding categories.

Keep these categories distinct. Never present a derived quarterly estimate as reported data, a brokerage forecast as company guidance, or a media narrative as fact.

For each material number, preserve its period or date, unit, currency, and scope. Do not compare values with incompatible scopes such as national spot prices, regional quotations, and a company's realized selling price. Before making a comparative claim such as “above cost”, “improved”, or “covered by cash”, verify the arithmetic and that the two inputs are comparable. If either check fails, state that the relationship is not established.

## Combined Interpretation

Describe the relationship between evidence using exactly one of these neutral labels:

- **基本面与技术面同向改善**
- **基本面与技术面同向承压**
- **基本面改善、技术面尚未确认**
- **基本面承压、价格结构改善**
- **证据混合或相互冲突**
- **证据不足**

Explain which facts support the state, which facts conflict with it, and what observable evidence could confirm or invalidate it. Do not convert agreement between evidence lanes into a higher probability of a future price move.

## Valuation And Forecast Boundaries

- Treat PE, PB, PS, dividend yield, and market capitalization as current valuation descriptors, not proof of cheapness, intrinsic value, or a price floor.
- Do not call book value liquidation value or a hard floor. A repurchase below book value may mechanically affect per-share metrics if completed, but it does not guarantee value realization or price convergence.
- Attribute management guidance and third-party forecasts explicitly. Do not write that the market has already priced in an event unless the claim is clearly identified as an inference that cannot be directly verified.
- Do not infer causality from news followed by a price move.
- Avoid promotional or transaction-oriented language. Replace it with the observed state and the evidence still needed.

## Technical Boundaries

- State the technical data date, adjustment mode, and partial-week status.
- Preserve the exact horizon of every return, volatility, and drawdown metric. Never relabel a 20-day metric as a 60-day metric.
- Copy `latest.price_position.ma20`, `ma60`, and `boll_middle` relations exactly for above/below claims. Never infer these relationships from rounded display values. Use `financial_calculator` with unrounded inputs for any other material above/below comparison.
- Describe current MA ordering as “above”, “below”, or “mixed”. Use “crossed”, “recovered”, “reversed”, or “broke through” only when the public tool result contains that exact dated structural change.
- Describe MA, BOLL, KDJ, volatility, drawdown, price location, and structural changes only as historical state.
- Convert the technical data into decision-relevant context: explain the current structure, separate short-term momentum from medium-term MA20/MA60 and 20/60-day background, identify cross-horizon agreement or tension, and state observable conditions that would confirm or invalidate the current state.
- Copy confirmation/invalidation conditions and review cadence from `decision_context`. Do not invent an arbitrary intraday price threshold, claim an MA slope that the tool did not calculate, or say volatility contraction predicts an expansion.
- Use the next five trading sessions only as a suggested review cadence for short-term daily momentum, Bollinger-band contact, and recent structural changes. State explicitly that this is not a validated T+5 prediction horizon. Medium-term context remains relevant until the observed state changes and has no fixed T+N validity period.
- Do not turn an overbought, oversold, band-contact, or trend-change observation into a reversal claim, opportunity, future-risk forecast, or buy/sell action.
- Applicability V2.1 remains offline and must not appear in an ordinary report.

## Output For Feishu Or CLI

Lead with a compact report using these sections:

1. **综合状态**: use exactly one Combined Interpretation label plus a short explanation.
2. **基本面事实**: latest period, key changes, and relevant balance-sheet or cash-flow evidence.
3. **近期公开信息**: material facts with source type, date, and URL; keep third-party views separate and omit unsupported low-priority commentary.
4. **技术面状态与参考含义**: exact data date, adjustment, trend, position, momentum, volatility, recent structural changes, plain-language structure meaning, cross-horizon tension, and confirmation/invalidation conditions.
5. **证据关系**: supporting evidence, conflicting evidence, and what remains unconfirmed.
6. **后续观察与复查节奏**: observable operating, financial, industry, and technical conditions; suggest a five-trading-session review for short-term technical state without calling it a prediction horizon; no action instruction.
7. **来源与限制**: primary links, unavailable data, and a concise statement that the analysis does not predict subsequent direction or constitute investment advice.

Keep the first response scannable. Expand tables, historical series, or source detail only when useful or requested.

## Pre-Publication Check

Before answering, revise the draft if any check fails:

- Every material number retains the correct date or period, unit, currency, and scope.
- Every comparative or derived statement passes basic arithmetic and uses comparable inputs.
- Technical horizons, state labels, adjustment mode, and partial-week status match the `technical_analysis` result exactly.
- `n_income_attr_p` is the only structured income field labeled 归母净利润; `n_income` is labeled group net profit or omitted.
- Company facts, deterministic calculations, third-party views, and assistant synthesis remain distinguishable.
- Core claims use primary sources where available; low-priority commentary does not drive the conclusion.
- Every material web claim has a displayed URL; otherwise it is omitted.
- Both supporting and conflicting evidence are present when the evidence is mixed.
- Any auxiliary `research` or `technical-analysis` packet has been checked and repaired as needed; the main agent still owns evidence reconciliation and final synthesis.
- No sentence implies a validated future direction, personalized action, price floor, or guaranteed valuation convergence.
