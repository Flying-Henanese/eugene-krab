import { createHash } from 'node:crypto';
import fs from 'node:fs';

export type RubricOperator = 'correctness' | 'contradiction';

export interface RubricCriterion {
  id: string;
  operator: RubricOperator;
  criteria: string;
}

export interface BehaviorRoute {
  tools?: string[];
  skills?: string[];
  subagentTypes?: string[];
}

export interface BehaviorExpectation {
  requiredTools?: string[];
  forbiddenTools?: string[];
  requiredSkills?: string[];
  forbiddenSkills?: string[];
  requiredSubagentTypes?: string[];
  forbiddenSubagentTypes?: string[];
  minimumSubagentCalls?: Record<string, number>;
  anyOfRoutes?: BehaviorRoute[];
  maxTopLevelToolCalls?: number;
  maxSubagentToolCalls?: number;
  forbiddenAnswerPhrases?: string[];
}

export interface EvalSourceReference {
  provider: string;
  endpoint: string;
  tsCode?: string;
  period?: string;
  fields: string[];
  unit?: string;
  fetchedAt: string;
  updateFlag?: string;
}

export interface EvalExample {
  id: string;
  inputs: { question: string };
  outputs: { answer: string };
  questionType: string;
  expertTimeMinutes: number;
  rubric: RubricCriterion[];
  behavior?: BehaviorExpectation;
  sources: EvalSourceReference[];
}

export interface EvalDataset {
  examples: EvalExample[];
  hash: string;
}

function parseRow(lines: string[], startIndex: number): { row: string[]; nextIndex: number } | null {
  if (startIndex >= lines.length || !lines[startIndex].trim()) {
    return null;
  }

  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let lineIndex = startIndex;
  let charIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    while (charIndex < line.length) {
      const char = line[charIndex];
      const nextChar = line[charIndex + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          charIndex += 2;
        } else if (char === '"') {
          inQuotes = false;
          charIndex++;
        } else {
          currentField += char;
          charIndex++;
        }
      } else if (char === '"') {
        inQuotes = true;
        charIndex++;
      } else if (char === ',') {
        fields.push(currentField);
        currentField = '';
        charIndex++;
      } else {
        currentField += char;
        charIndex++;
      }
    }

    if (inQuotes) {
      currentField += '\n';
      lineIndex++;
      charIndex = 0;
    } else {
      fields.push(currentField);
      return { row: fields, nextIndex: lineIndex + 1 };
    }
  }

  if (currentField) {
    fields.push(currentField);
  }
  return { row: fields, nextIndex: lineIndex };
}

export function parseCSVRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  const lines = csvContent.split('\n');
  let index = 0;

  while (index < lines.length) {
    const result = parseRow(lines, index);
    if (result) {
      rows.push(result.row);
      index = result.nextIndex;
    } else {
      index++;
    }
  }

  return rows;
}

function normalizeLegacyJson(value: string): string {
  return value
    .replace(/([{,]\s*)'([A-Za-z_][A-Za-z0-9_]*)'\s*:/g, '$1"$2":')
    .replace(/:\s*'((?:\\'|[^'])*)'/g, (_, text: string) => {
      return `:${JSON.stringify(text.replace(/\\'/g, "'"))}`;
    });
}

function parseJsonColumn(raw: string, label: string, rowNumber: number): unknown {
  try {
    return JSON.parse(normalizeLegacyJson(raw));
  } catch (error) {
    throw new Error(
      `Invalid ${label} JSON on row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseStringArray(value: unknown, label: string, rowNumber: number): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Invalid ${label} on row ${rowNumber}: expected non-empty string array`);
  }
  return value.map((item) => item.trim());
}

function parseRubric(rawRubric: string, rowNumber: number): RubricCriterion[] {
  const parsed = parseJsonColumn(rawRubric, 'rubric', rowNumber);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid rubric on row ${rowNumber}: expected an array`);
  }

  const criteria = parsed.map((entry, index): RubricCriterion => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Invalid rubric entry ${index + 1} on row ${rowNumber}: expected object`);
    }

    const record = entry as Record<string, unknown>;
    if (record.operator !== 'correctness' && record.operator !== 'contradiction') {
      throw new Error(`Invalid rubric operator on row ${rowNumber}: ${String(record.operator)}`);
    }
    if (typeof record.criteria !== 'string' || !record.criteria.trim()) {
      throw new Error(`Invalid rubric criteria on row ${rowNumber}: expected non-empty string`);
    }

    return {
      id: `c${index + 1}`,
      operator: record.operator,
      criteria: record.criteria.trim(),
    };
  });

  if (!criteria.some((criterion) => criterion.operator === 'correctness')) {
    throw new Error(`Invalid rubric on row ${rowNumber}: missing correctness criteria`);
  }
  return criteria;
}

function parseRoute(value: unknown, rowNumber: number): BehaviorRoute {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid behavior route on row ${rowNumber}: expected object`);
  }
  const record = value as Record<string, unknown>;
  return {
    tools: parseStringArray(record.tools, 'behavior route tools', rowNumber),
    skills: parseStringArray(record.skills, 'behavior route skills', rowNumber),
    subagentTypes: parseStringArray(
      record.subagentTypes,
      'behavior route subagentTypes',
      rowNumber,
    ),
  };
}

function parseBehavior(rawBehavior: string, rowNumber: number): BehaviorExpectation | undefined {
  if (!rawBehavior.trim()) {
    return undefined;
  }

  const parsed = parseJsonColumn(rawBehavior, 'behavior', rowNumber);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid behavior on row ${rowNumber}: expected object`);
  }
  const record = parsed as Record<string, unknown>;
  const minimumSubagentCalls = record.minimumSubagentCalls;
  if (
    minimumSubagentCalls !== undefined
    && (
      !minimumSubagentCalls
      || typeof minimumSubagentCalls !== 'object'
      || Array.isArray(minimumSubagentCalls)
      || Object.values(minimumSubagentCalls).some(
        (value) => !Number.isInteger(value) || (value as number) <= 0,
      )
    )
  ) {
    throw new Error(
      `Invalid behavior minimumSubagentCalls on row ${rowNumber}: expected positive integers`,
    );
  }

  const numberField = (key: 'maxTopLevelToolCalls' | 'maxSubagentToolCalls') => {
    const value = record[key];
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw new Error(`Invalid behavior ${key} on row ${rowNumber}: expected non-negative integer`);
    }
    return value as number;
  };

  const anyOfRoutes = record.anyOfRoutes;
  if (anyOfRoutes !== undefined && !Array.isArray(anyOfRoutes)) {
    throw new Error(`Invalid behavior anyOfRoutes on row ${rowNumber}: expected array`);
  }

  return {
    requiredTools: parseStringArray(record.requiredTools, 'behavior requiredTools', rowNumber),
    forbiddenTools: parseStringArray(record.forbiddenTools, 'behavior forbiddenTools', rowNumber),
    requiredSkills: parseStringArray(record.requiredSkills, 'behavior requiredSkills', rowNumber),
    forbiddenSkills: parseStringArray(record.forbiddenSkills, 'behavior forbiddenSkills', rowNumber),
    requiredSubagentTypes: parseStringArray(
      record.requiredSubagentTypes,
      'behavior requiredSubagentTypes',
      rowNumber,
    ),
    forbiddenSubagentTypes: parseStringArray(
      record.forbiddenSubagentTypes,
      'behavior forbiddenSubagentTypes',
      rowNumber,
    ),
    minimumSubagentCalls: minimumSubagentCalls as Record<string, number> | undefined,
    anyOfRoutes: anyOfRoutes?.map((route) => parseRoute(route, rowNumber)),
    maxTopLevelToolCalls: numberField('maxTopLevelToolCalls'),
    maxSubagentToolCalls: numberField('maxSubagentToolCalls'),
    forbiddenAnswerPhrases: parseStringArray(
      record.forbiddenAnswerPhrases,
      'behavior forbiddenAnswerPhrases',
      rowNumber,
    ),
  };
}

function parseSources(rawSources: string, rowNumber: number): EvalSourceReference[] {
  if (!rawSources.trim()) {
    return [];
  }

  const parsed = parseJsonColumn(rawSources, 'sources', rowNumber);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid sources on row ${rowNumber}: expected array`);
  }

  return parsed.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error(`Invalid source ${index + 1} on row ${rowNumber}: expected object`);
    }
    const record = source as Record<string, unknown>;
    const fields = parseStringArray(record.fields, 'source fields', rowNumber);
    if (
      typeof record.provider !== 'string'
      || typeof record.endpoint !== 'string'
      || typeof record.fetchedAt !== 'string'
      || !fields
    ) {
      throw new Error(
        `Invalid source ${index + 1} on row ${rowNumber}: provider, endpoint, fields, and fetchedAt are required`,
      );
    }
    return {
      provider: record.provider,
      endpoint: record.endpoint,
      tsCode: typeof record.tsCode === 'string' ? record.tsCode : undefined,
      period: typeof record.period === 'string' ? record.period : undefined,
      fields,
      unit: typeof record.unit === 'string' ? record.unit : undefined,
      fetchedAt: record.fetchedAt,
      updateFlag: typeof record.updateFlag === 'string' ? record.updateFlag : undefined,
    };
  });
}

export function parseEvalDataset(csvContent: string): EvalDataset {
  const rows = parseCSVRows(csvContent);
  const examples: EvalExample[] = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (!row?.[0]?.trim()) {
      continue;
    }
    if (row.length < 5) {
      throw new Error(`Invalid eval dataset row ${index + 1}: expected at least 5 columns`);
    }

    const expertTimeMinutes = Number(row[3]);
    if (!Number.isFinite(expertTimeMinutes) || expertTimeMinutes < 0) {
      throw new Error(`Invalid expert time on row ${index + 1}: ${row[3]}`);
    }

    examples.push({
      id: `q${examples.length + 1}`,
      inputs: { question: row[0].trim() },
      outputs: { answer: row[1].trim() },
      questionType: row[2].trim(),
      expertTimeMinutes,
      rubric: parseRubric(row[4], index + 1),
      behavior: parseBehavior(row[5] ?? '', index + 1),
      sources: parseSources(row[6] ?? '', index + 1),
    });
  }

  const normalized = examples.map(({ id: _id, ...example }) => example);
  return {
    examples,
    hash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 12),
  };
}

export function loadEvalDataset(csvPath: string): EvalDataset {
  return parseEvalDataset(fs.readFileSync(csvPath, 'utf-8'));
}
