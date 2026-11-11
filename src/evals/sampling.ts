import type { EvalExample } from './dataset.js';

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 2 ** 32;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const random = createSeededRandom(seed);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function groupByQuestionType(examples: EvalExample[]): Map<string, EvalExample[]> {
  const groups = new Map<string, EvalExample[]>();
  for (const example of examples) {
    const group = groups.get(example.questionType) ?? [];
    group.push(example);
    groups.set(example.questionType, group);
  }
  return groups;
}

function sortByDatasetOrder(examples: EvalExample[], allExamples: EvalExample[]): EvalExample[] {
  const indexById = new Map(allExamples.map((example, index) => [example.id, index]));
  return [...examples].sort(
    (left, right) => (indexById.get(left.id) ?? 0) - (indexById.get(right.id) ?? 0),
  );
}

export function selectQuickExamples(examples: EvalExample[]): EvalExample[] {
  const groups = groupByQuestionType(examples);
  const selected: EvalExample[] = [];
  for (const questionType of [...groups.keys()].sort()) {
    const example = groups.get(questionType)?.[0];
    if (example) {
      selected.push(example);
    }
  }
  return sortByDatasetOrder(selected, examples);
}

export function selectStratifiedSample(
  examples: EvalExample[],
  sampleSize: number,
  seed: string,
): EvalExample[] {
  if (sampleSize >= examples.length) {
    return examples;
  }

  const groups = [...groupByQuestionType(examples).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([questionType, group]) => ({
      questionType,
      examples: shuffleWithSeed(group, `${seed}:${questionType}`),
    }));
  const selected = new Map<string, EvalExample>();

  for (const group of groups) {
    if (selected.size >= sampleSize) {
      break;
    }
    const example = group.examples.shift();
    if (example) {
      selected.set(example.id, example);
    }
  }

  const remaining = shuffleWithSeed(
    groups.flatMap((group) => group.examples),
    `${seed}:remaining`,
  );
  for (const example of remaining) {
    if (selected.size >= sampleSize) {
      break;
    }
    selected.set(example.id, example);
  }
  return sortByDatasetOrder([...selected.values()], examples);
}

export function selectEvalExamples(
  examples: EvalExample[],
  options: { quick: boolean; sampleSize?: number; seed: string; caseIds?: string[] },
): EvalExample[] {
  const scoped = options.caseIds?.length
    ? examples.filter((example) => options.caseIds?.includes(example.id))
    : examples;

  if (options.quick) {
    return selectQuickExamples(scoped);
  }
  if (options.sampleSize !== undefined) {
    return selectStratifiedSample(scoped, options.sampleSize, options.seed);
  }
  return scoped;
}
