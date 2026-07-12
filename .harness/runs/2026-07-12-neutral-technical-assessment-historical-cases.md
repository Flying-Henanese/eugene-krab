# A股技术面历史案例审阅

> 案例与日期在获取数据前预注册。Part A 仅使用截止日及之前的数据；全部 Part A 冻结后才获取 Part B。报告不判断匹配度，也不构成买卖建议。
>
> 本地公式按文档语义计算；在建立 golden fixture 前，不保证与外部图表平台逐点一致。

## Part A：截止日技术面中性评估

### 平安银行（000001.SZ）

- 行业：银行
- 预注册日期：20230331
- 分析状态：ok
- 实际数据截止日：20230331
- 状态：趋势=bearish，波动=contracting，动量=neutral KDJ zone
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20220105–20230331，日线=300，周线=62，最新周线=已完成
- 截止日价格与均线：收盘=12.5300，MA5=12.5960，MA10=12.6760，MA20=12.9355，MA60=13.8487
- BOLL与KDJ：下轨=12.1721，中轨=12.9355，上轨=13.6989；K=31.2340，D=29.9866，J=33.7289
- 历史窗口：20日收益=-12.32%，距MA20=-3.13%，距MA60=-9.52%，20日年化波动率=19.74%，20日最大回撤=-9.53%
- 中性观察（最新3条/共0条）：
  - 无
- 风险提醒（最新3条/共2条）：
  - 20230308 trend_invalidation_warning [risk]：Repeated closes below MA20 weakened the earlier trend-recovery structure. 证据={"closing_price":13.53,"ma20":13.9005,"bars_since_reference":5,"return_from_reference":-0.04516584333098095,"drawdown_from_peak":-0.05318404478656402}
  - 20230306 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":51.32623414212679,"previous_j":90.25517701965393}

### 美的集团（000333.SZ）

- 行业：家电
- 预注册日期：20230630
- 分析状态：ok
- 实际数据截止日：20230630
- 状态：趋势=bullish，波动=normal，动量=neutral KDJ zone
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20220406–20230630，日线=301，周线=63，最新周线=已完成
- 截止日价格与均线：收盘=58.9200，MA5=59.1180，MA10=58.4610，MA20=56.6370，MA60=53.9805
- BOLL与KDJ：下轨=51.2003，中轨=56.6370，上轨=62.0737；K=66.9662，D=70.8743，J=59.1498
- 历史窗口：20日收益=20.53%，距MA20=4.03%，距MA60=9.15%，20日年化波动率=31.58%，20日最大回撤=-2.64%
- 中性观察（最新3条/共5条）：
  - 20230612 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":57.82,"boll_upper":57.6204174077685} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
  - 20230609 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":57.76,"boll_upper":56.98723232470216} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
  - 20230608 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":57.11,"boll_upper":56.533209041438475} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
- 风险提醒（最新3条/共3条）：
  - 20230613 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":102.3118309509855,"previous_j":109.11343558843356}
  - 20230609 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":106.93416613527117,"previous_j":118.25839686506446}
  - 20230606 extreme_momentum_warning [risk]：J crossed above 100, indicating unusually extended short-term momentum. 证据={"j":100.41174917612308,"previous_j":86.59733923069366}

### 海康威视（002415.SZ）

- 行业：安防科技
- 预注册日期：20230928
- 分析状态：ok
- 实际数据截止日：20230928
- 状态：趋势=mixed，波动=expanding，动量=J above 100
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20220705–20230928，日线=305，周线=63，最新周线=未完成
- 截止日价格与均线：收盘=33.8000，MA5=33.3980，MA10=32.7810，MA20=33.6195，MA60=34.3817
- BOLL与KDJ：下轨=31.2246，中轨=33.6195，上轨=36.0144；K=68.5736，D=50.7987，J=104.1236
- 历史窗口：20日收益=-4.20%，距MA20=0.54%，距MA60=-1.69%，20日年化波动率=22.83%，20日最大回撤=-11.06%
- 中性观察（最新3条/共1条）：
  - 20230922 weekly_lower_band_contact_observation：The weekly price range contacted the lower Bollinger band; this is a location observation rather than a directional forecast. 证据={"low":31.66,"boll_lower":31.978063001877075} 后续关注：Watch whether price returns inside the band or weakness and downside volatility continue to expand.
- 风险提醒（最新3条/共3条）：
  - 20230928 extreme_momentum_warning [risk]：J crossed above 100, indicating unusually extended short-term momentum. 证据={"j":104.12357975125597,"previous_j":92.6602413678942}
  - 20230908 trend_invalidation_warning [risk]：Repeated closes below MA20 weakened the earlier trend-recovery structure. 证据={"closing_price":33.98,"ma20":34.675,"bars_since_reference":8,"return_from_reference":-0.03902714932126705,"drawdown_from_peak":-0.051103043842502194}
  - 20230904 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":106.6354014822476,"previous_j":109.41407192482019}
- 数据提示：The latest weekly candle is partial and may change before week close.

### 宁德时代（300750.SZ）

- 行业：新能源电池
- 预注册日期：20231229
- 分析状态：ok
- 实际数据截止日：20231229
- 状态：趋势=mixed，波动=contracting，动量=J above 100
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20221010–20231229，日线=302，周线=62，最新周线=已完成
- 截止日价格与均线：收盘=163.2600，MA5=158.8500，MA10=154.9350，MA20=158.0365，MA60=174.8365
- BOLL与KDJ：下轨=146.8999，中轨=158.0365，上轨=169.1731；K=76.7695，D=60.0201，J=110.2684
- 历史窗口：20日收益=-1.35%，距MA20=3.31%，距MA60=-6.62%，20日年化波动率=38.09%，20日最大回撤=-11.12%
- 中性观察（最新3条/共1条）：
  - 20231206 low_zone_momentum_recovery_observation：KDJ momentum turned upward from a low zone with K above D. 证据={"j":15.835654340766201,"k":10.64894135308262,"d":8.05558485924083} 后续关注：Watch whether K remains above D or the momentum recovery quickly reverses.
- 风险提醒（最新3条/共2条）：
  - 20231228 extreme_momentum_warning [risk]：J crossed above 100, indicating unusually extended short-term momentum. 证据={"j":106.10702876871444,"previous_j":80.46954204877007}
  - 20231213 momentum_reversal_warning [watch]：KDJ momentum turned down soon after a low-zone recovery observation. 证据={"j":34.34148951127198,"previous_j":64.94330861936007,"momentum_recovery_within_10_bars":true}

### 恒瑞医药（600276.SH）

- 行业：医药
- 预注册日期：20240329
- 分析状态：ok
- 实际数据截止日：20240329
- 状态：趋势=bullish，波动=contracting，动量=neutral KDJ zone
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20230104–20240329，日线=299，周线=62，最新周线=已完成
- 截止日价格与均线：收盘=45.9700，MA5=46.1040，MA10=46.0960，MA20=45.2295，MA60=42.6190
- BOLL与KDJ：下轨=42.1474，中轨=45.2295，上轨=48.3116；K=39.5027，D=43.2092，J=32.0898
- 历史窗口：20日收益=8.11%，距MA20=1.64%，距MA60=7.86%，20日年化波动率=35.57%，20日最大回撤=-5.99%
- 中性观察（最新3条/共5条）：
  - 20240318 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":47.68,"boll_upper":47.227745125150385} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
  - 20240315 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":47.95,"boll_upper":46.59496710809095} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
  - 20240314 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":49.15,"boll_upper":45.84831999050513} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
- 风险提醒（最新3条/共3条）：
  - 20240319 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":66.55252775862252,"previous_j":80.52348754602119}
  - 20240314 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":81.42318386295419,"previous_j":83.95785130541826}
  - 20240306 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":79.66022278080871,"previous_j":92.22875944771624}

### 万华化学（600309.SH）

- 行业：化工材料
- 预注册日期：20240628
- 分析状态：ok
- 实际数据截止日：20240628
- 状态：趋势=bearish，波动=expanding，动量=oversold zone
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20230406–20240628，日线=298，周线=63，最新周线=已完成
- 截止日价格与均线：收盘=80.8600，MA5=83.8821，MA10=84.1832，MA20=85.8407，MA60=86.9587
- BOLL与KDJ：下轨=81.6463，中轨=85.8407，上轨=90.0351；K=24.5565，D=30.2056，J=13.2585
- 历史窗口：20日收益=-9.01%，距MA20=-5.80%，距MA60=-7.01%，20日年化波动率=19.46%，20日最大回撤=-8.94%
- 中性观察（最新3条/共0条）：
  - 无
- 风险提醒（最新3条/共1条）：
  - 20240603 trend_invalidation_warning [risk]：Repeated closes below MA20 weakened the earlier trend-recovery structure. 证据={"closing_price":87.22021172472387,"ma20":89.67021767204758,"bars_since_reference":5,"return_from_reference":-0.03666887563507837,"drawdown_from_peak":-0.03666887563507837}

### 贵州茅台（600519.SH）

- 行业：消费
- 预注册日期：20240930
- 分析状态：ok
- 实际数据截止日：20240930
- 状态：趋势=mixed，波动=expanding，动量=J above 100
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20230710–20240930，日线=300，周线=63，最新周线=未完成
- 截止日价格与均线：收盘=1748.0000，MA5=1535.5600，MA10=1403.5290，MA20=1397.7210，MA60=1421.2388
- BOLL与KDJ：下轨=1153.8114，中轨=1397.7210，上轨=1641.6306；K=84.8179，D=64.4390，J=125.5756
- 历史窗口：20日收益=23.68%，距MA20=25.06%，距MA60=22.99%，20日年化波动率=59.50%，20日最大回撤=-12.62%
- 中性观察（最新3条/共6条）：
  - 20240930 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":1759.88,"boll_upper":1641.6306131896317} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
  - 20240930 weekly_upper_band_contact_observation（未完成周期）：The weekly price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":1759.88,"boll_upper":1716.7181639542418} 后续关注：Watch whether the weekly range remains extended, returns inside the band, or volatility expands.
  - 20240927 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":1629.2,"boll_upper":1561.3555884507548} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
- 风险提醒（最新3条/共2条）：
  - 20240930 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":125.5756461165158,"previous_j":126.64792738814305}
  - 20240926 extreme_momentum_warning [risk]：J crossed above 100, indicating unusually extended short-term momentum. 证据={"j":118.35422474017355,"previous_j":95.56427992926456}
- 数据提示：The latest weekly candle is partial and may change before week close.

### 中国神华（601088.SH）

- 行业：能源
- 预注册日期：20241231
- 分析状态：ok
- 实际数据截止日：20241231
- 状态：趋势=bullish，波动=contracting，动量=overbought zone
- 数据质量：high；指标覆盖：high；方向概率：不提供
- 数据方法：provider=Tushare，adjustment=qfq
- 数据范围：20231009–20241231，日线=302，周线=64，最新周线=未完成
- 截止日价格与均线：收盘=43.4800，MA5=42.6960，MA10=42.4010，MA20=42.5375，MA60=41.3493
- BOLL与KDJ：下轨=41.3372，中轨=42.5375，上轨=43.7378；K=59.0727，D=48.5041，J=80.2097
- 历史窗口：20日收益=8.08%，距MA20=2.22%，距MA60=5.15%，20日年化波动率=27.71%，20日最大回撤=-4.86%
- 中性观察（最新3条/共9条）：
  - 20241231 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":43.97,"boll_upper":43.73781355552578} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
  - 20241230 trend_recovery_observation：Price recovered above MA20 while MA20 remained above MA60 and KDJ momentum confirmed the recovery. 证据={"closing_price":42.78,"ma20":42.375,"ma60":41.33200000000001,"k":46.80295738001282,"d":43.21987085074906} 后续关注：The observation weakens if price cannot hold MA20, especially after repeated closes below it.
  - 20241217 daily_upper_band_contact_observation：The daily price range contacted the upper Bollinger band; this is a location observation rather than a directional forecast. 证据={"high":44.2,"boll_upper":44.14413476854997} 后续关注：Watch whether price remains near the upper band, returns inside it, or volatility expands.
- 风险提醒（最新3条/共4条）：
  - 20241217 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":62.07392104177413,"previous_j":94.4146953171743}
  - 20241212 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":97.83683287452939,"previous_j":99.73149346134042}
  - 20241210 elevated_momentum_turn_warning [watch]：J turned down after reaching an elevated zone, indicating cooling short-term momentum. 证据={"j":92.1646765917686,"previous_j":103.19466071536013}
- 数据提示：The latest weekly candle is partial and may change before week close.

## Part B：未来20个市场交易日的实际走势

> 所有收益和回撤均使用同一 t0–t20 前复权收盘序列。停牌或数据缺口不向后补日。

股票 | 分析日 | 固定窗口 | T+2 | T+5 | T+10 | T+15 | T+20/期末 | 最大收盘涨幅 | 最大收盘回撤 | 完整度
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
平安银行 | 20230331 | 20230403–20230504 | 0.96% | 1.20% | 3.19% | -3.43% | 1.60% | 3.75% | -6.92% | 20/20
美的集团 | 20230630 | 20230703–20230728 | -0.03% | -1.99% | -2.48% | -3.04% | 1.39% | 1.39% | -4.21% | 20/20
海康威视 | 20230928 | 20231009–20231103 | 0.03% | 1.80% | -3.28% | 6.21% | 5.95% | 8.17% | -5.52% | 20/20
宁德时代 | 20231229 | 20240102–20240129 | -4.57% | -8.12% | -7.08% | -4.66% | -9.95% | -3.87% | -9.95% | 20/20
恒瑞医药 | 20240329 | 20240401–20240430 | -1.11% | -0.94% | -3.72% | -4.13% | 0.41% | 0.76% | -10.02% | 20/20
万华化学 | 20240628 | 20240701–20240726 | -0.69% | 0.30% | 3.04% | 2.08% | -1.92% | 3.04% | -5.78% | 20/20
贵州茅台 | 20240930 | 20241008–20241104 | -8.74% | -8.35% | -12.54% | -10.47% | -11.43% | -1.43% | -14.50% | 20/20
中国神华 | 20241231 | 20250102–20250206 | -3.24% | -5.98% | -9.82% | -12.40% | -10.42% | -2.05% | -12.40% | 20/20

> 这是小样本历史案例审阅，不是统计验证；不应根据这些结果更换案例、调整阈值或宣称预测能力。
