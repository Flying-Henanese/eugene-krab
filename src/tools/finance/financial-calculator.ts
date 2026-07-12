import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

const MonetaryUnitSchema = z.enum(['cny', 'cny_10k', 'cny_100m']);

const ConvertSchema = z.object({
  id: z.string().min(1),
  operation: z.literal('convert'),
  value: z.number().finite(),
  from_unit: MonetaryUnitSchema,
  to_unit: MonetaryUnitSchema,
  precision: z.number().int().min(0).max(8).default(4),
});

const CompareSchema = z.object({
  id: z.string().min(1),
  operation: z.literal('compare'),
  left: z.number().finite(),
  right: z.number().finite(),
  unit: z.string().min(1),
  precision: z.number().int().min(0).max(8).default(4),
});

const PercentageChangeSchema = z.object({
  id: z.string().min(1),
  operation: z.literal('percentage_change'),
  previous: z.number().finite(),
  current: z.number().finite(),
  precision: z.number().int().min(0).max(8).default(2),
});

export const FINANCIAL_CALCULATOR_SCHEMA = z.object({
  calculations: z.array(z.discriminatedUnion('operation', [
    ConvertSchema,
    CompareSchema,
    PercentageChangeSchema,
  ])).min(1).max(30),
});

export const FINANCIAL_CALCULATOR_DESCRIPTION = `
Deterministic financial unit conversion and arithmetic checks. Use before publishing material derived claims that convert CNY, 万元, or 亿元; compare values such as price versus cost; or calculate a percentage change. Tushare daily_basic total_mv and circ_mv use cny_10k, while financial-statement monetary fields use cny. Submit all independent calculations in one call.

This tool does not fetch data, value a company, annualize reported-period ratios, determine whether unlike scopes are comparable, or provide investment conclusions. Preserve the source period and scope in the final prose and use the returned numeric result exactly.
`.trim();

type FinancialCalculation = z.infer<typeof FINANCIAL_CALCULATOR_SCHEMA>['calculations'][number];

const UNIT_IN_CNY: Record<z.infer<typeof MonetaryUnitSchema>, number> = {
  cny: 1,
  cny_10k: 10_000,
  cny_100m: 100_000_000,
};

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
export function runFinancialCalculations(calculations: FinancialCalculation[]): unknown[] {
  return calculations.map((calculation) => {
    if (calculation.operation === 'convert') {
      const converted = calculation.value
        * UNIT_IN_CNY[calculation.from_unit]
        / UNIT_IN_CNY[calculation.to_unit];
      return {
        id: calculation.id,
        operation: calculation.operation,
        input: { value: calculation.value, unit: calculation.from_unit },
        output: { value: round(converted, calculation.precision), unit: calculation.to_unit },
      };
    }

    if (calculation.operation === 'compare') {
      const difference = calculation.left - calculation.right;
      return {
        id: calculation.id,
        operation: calculation.operation,
        left: calculation.left,
        right: calculation.right,
        unit: calculation.unit,
        relation: difference > 0 ? 'above' : difference < 0 ? 'below' : 'equal',
        difference: round(difference, calculation.precision),
      };
    }

    if (calculation.previous === 0) {
      return {
        id: calculation.id,
        operation: calculation.operation,
        status: 'unavailable',
        reason: 'percentage change is undefined when previous is zero',
      };
    }

    return {
      id: calculation.id,
      operation: calculation.operation,
      previous: calculation.previous,
      current: calculation.current,
      percentage_change: round(
        ((calculation.current - calculation.previous) / calculation.previous) * 100,
        calculation.precision,
      ),
      unit: 'percent',
    };
  });
}

export function createFinancialCalculator(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'financial_calculator',
    description: FINANCIAL_CALCULATOR_DESCRIPTION,
    schema: FINANCIAL_CALCULATOR_SCHEMA,
    func: async ({ calculations }) => formatToolResult({
      status: 'ok',
      results: runFinancialCalculations(calculations),
    }),
  });
}
