import { config as loadDotenv } from 'dotenv';
import { HttpTushareClient } from '../src/tools/finance/tushare/client.js';
import {
  formatHistoricalCaseReport,
  redactSecret,
  runHistoricalCaseEvaluation,
  type HistoricalCaseDefinition,
} from './technical-analysis-historical-cases.js';

export const SIX_STOCK_2025Q4_CASES: readonly HistoricalCaseDefinition[] = Object.freeze([
  { tsCode: '600276.SH', name: '恒瑞医药', industry: '医药', asOfDate: '20251231' },
  { tsCode: '600690.SH', name: '海尔智家', industry: '家电', asOfDate: '20251231' },
  { tsCode: '002714.SZ', name: '牧原股份', industry: '养殖', asOfDate: '20251231' },
  { tsCode: '002230.SZ', name: '科大讯飞', industry: '软件', asOfDate: '20251231' },
  { tsCode: '600048.SH', name: '保利发展', industry: '房地产', asOfDate: '20251231' },
  { tsCode: '000725.SZ', name: '京东方A', industry: '面板', asOfDate: '20251231' },
].map((item) => Object.freeze(item)));

export async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    process.stdout.write('# 六股2025年末技术面历史案例\n\n执行失败：未配置 TUSHARE_TOKEN。\n');
    process.exitCode = 1;
    return;
  }
  try {
    const evaluation = await runHistoricalCaseEvaluation(
      new HttpTushareClient(token),
      SIX_STOCK_2025Q4_CASES,
    );
    process.stdout.write(`${redactSecret(formatHistoricalCaseReport(evaluation), token)}\n`);
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), token);
    process.stdout.write(`# 六股2025年末技术面历史案例\n\n执行失败：${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
