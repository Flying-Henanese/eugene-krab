import { describe, expect, test } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { AgentToolExecutor } from './tool-executor.js';
import { createRunContext } from './run-context.js';
import type { AgentEvent } from './types.js';

function toolCallResponse(count: number): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: Array.from({ length: count }, (_, index) => ({
      id: `call-${index}`,
      name: 'web_search',
      args: { query: `query-${index}` },
      type: 'tool_call' as const,
    })),
  });
}

async function collectEvents(
  executor: AgentToolExecutor,
  response: AIMessage,
  ctx: ReturnType<typeof createRunContext>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of executor.executeAll(response, ctx)) {
    events.push(event);
  }
  return events;
}

describe('AgentToolExecutor hard execution budget', () => {
  test('reserves concurrent calls before execution and rejects excess calls audibly', async () => {
    const invoked: string[] = [];
    const searchTool = {
      name: 'web_search',
      invoke: async (args: Record<string, unknown>) => {
        invoked.push(String(args.query));
        return `result:${args.query}`;
      },
    } as unknown as StructuredToolInterface;
    const executor = new AgentToolExecutor(
      new Map([['web_search', searchTool]]),
      new Map([['web_search', true]]),
    );
    const ctx = createRunContext('concurrent budget', {
      toolExecutionBudget: {
        maxTotalExecutions: 6,
        perTool: { web_search: 3 },
      },
    });

    const events = await collectEvents(executor, toolCallResponse(5), ctx);
    const blocked = events.filter(
      (event): event is Extract<AgentEvent, { type: 'tool_limit' }> =>
        event.type === 'tool_limit' && event.blocked,
    );
    const errors = events.filter(
      (event): event is Extract<AgentEvent, { type: 'tool_error' }> =>
        event.type === 'tool_error',
    );

    expect(invoked).toEqual(['query-0', 'query-1', 'query-2']);
    expect(blocked).toHaveLength(2);
    expect(blocked.map(event => event.toolCallId)).toEqual(['call-3', 'call-4']);
    expect(errors.map(event => event.toolCallId)).toEqual(['call-3', 'call-4']);
    expect(errors.every(event => event.error.includes('Research tool budget exhausted'))).toBe(true);

    const records = ctx.scratchpad.getToolCallRecords();
    expect(records).toHaveLength(5);
    expect(records.filter(record => record.result.includes('Research tool budget exhausted'))).toHaveLength(2);
    expect(ctx.scratchpad.getToolUsageStatus()).toEqual([
      expect.objectContaining({ toolName: 'web_search', callCount: 3 }),
    ]);
  });

  test('keeps allowed calls concurrent', async () => {
    let active = 0;
    let maxActive = 0;
    const waiting: Array<() => void> = [];
    const searchTool = {
      name: 'web_search',
      invoke: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>(resolve => {
          waiting.push(resolve);
          if (waiting.length === 3) waiting.forEach(release => release());
        });
        active--;
        return 'ok';
      },
    } as unknown as StructuredToolInterface;
    const executor = new AgentToolExecutor(
      new Map([['web_search', searchTool]]),
      new Map([['web_search', true]]),
    );
    const ctx = createRunContext('concurrent allowed', {
      toolExecutionBudget: { maxTotalExecutions: 3 },
    });

    await collectEvents(executor, toolCallResponse(3), ctx);

    expect(maxActive).toBe(3);
  });

  test('keeps scratchpad soft limits as non-blocking warnings without a hard budget', async () => {
    let invocationCount = 0;
    const searchTool = {
      name: 'web_search',
      invoke: async () => {
        invocationCount++;
        return 'ok';
      },
    } as unknown as StructuredToolInterface;
    const executor = new AgentToolExecutor(
      new Map([['web_search', searchTool]]),
      new Map([['web_search', false]]),
    );
    const ctx = createRunContext('soft warning only');

    await collectEvents(executor, toolCallResponse(3), ctx);
    const fourth = new AIMessage({
      content: '',
      tool_calls: [{
        id: 'call-3',
        name: 'web_search',
        args: { query: 'query-3' },
        type: 'tool_call' as const,
      }],
    });
    const events = await collectEvents(executor, fourth, ctx);

    expect(invocationCount).toBe(4);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_limit',
      tool: 'web_search',
      blocked: false,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool_end',
      toolCallId: 'call-3',
    }));
  });
});
