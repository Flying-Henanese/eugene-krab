import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvalDataset, parseEvalDataset } from './dataset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('eval dataset loader', () => {
  test('loads the upstream finance dataset with rubric metadata', () => {
    const dataset = loadEvalDataset(path.join(__dirname, 'dataset', 'finance_agent.csv'));

    expect(dataset.examples.length).toBeGreaterThan(40);
    expect(dataset.hash).toHaveLength(12);
    expect(dataset.examples[0]).toMatchObject({
      id: 'q1',
      questionType: 'Market Analysis',
      expertTimeMinutes: 30,
      sources: [],
    });
    expect(dataset.examples[0].rubric.some(
      (criterion) => criterion.operator === 'correctness',
    )).toBe(true);
  });

  test('loads A-share behavior and Tushare source metadata', () => {
    const dataset = loadEvalDataset(path.join(__dirname, 'dataset', 'a_share_agent.csv'));
    const fixedFact = dataset.examples.find((example) => example.questionType === 'A股结构化数据');

    expect(dataset.examples.length).toBeGreaterThanOrEqual(5);
    expect(fixedFact?.behavior?.requiredTools).toContain('a_share_analysis');
    expect(fixedFact?.sources[0]).toMatchObject({
      provider: 'Tushare MCP',
      endpoint: 'income',
      tsCode: '600519.SH',
      period: '20231231',
      unit: 'CNY',
      updateFlag: '1',
    });
  });

  test('normalizes legacy single-quoted rubric syntax', () => {
    const dataset = parseEvalDataset(`Question,Answer,Question Type,Expert time (mins),Rubric
Question?,Answer,Type,3,"[{'operator': 'correctness', 'criteria': 'Expected fact'}, {'operator': 'contradiction', 'criteria': 'Bad fact'}]"
`);

    expect(dataset.examples[0].rubric).toEqual([
      { id: 'c1', operator: 'correctness', criteria: 'Expected fact' },
      { id: 'c2', operator: 'contradiction', criteria: 'Bad fact' },
    ]);
  });

  test('rejects malformed behavior before an eval starts', () => {
    expect(() => parseEvalDataset(`Question,Answer,Question Type,Expert time (mins),Rubric,Behavior
Question?,Answer,Type,3,"[{""operator"":""correctness"",""criteria"":""Expected""}]","{""maxSubagentToolCalls"":-1}"
`)).toThrow('Invalid behavior maxSubagentToolCalls');
  });
});
