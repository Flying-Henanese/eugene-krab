export function buildMarketNewsQueries(date: string): string[] {
  return [
    `A股 ${date} 市场情绪 大盘 上涨 下跌 原因`,
    `A股 ${date} 政策 证监会 央行 财政部 发改委 市场影响`,
    `A股 ${date} 热门板块 题材 行业 涨幅`,
    `上证指数 沪深300 创业板指 ${date} 成交额 情绪`,
  ];
}
