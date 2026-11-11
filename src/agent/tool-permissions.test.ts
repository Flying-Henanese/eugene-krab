import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { AgentToolExecutor } from './tool-executor.js';
import { createRunContext } from './run-context.js';
import type { AgentConfig, AgentEvent } from './types.js';
import { loadRuleSet } from '../permissions/rules.js';
import { saveConfig } from '../utils/config.js';

const originalCwd = process.cwd();
let testCwd: string;
beforeEach(() => {
  testCwd = mkdtempSync(join(tmpdir(), 'eugene-tool-permissions-'));
  process.chdir(testCwd);
});
afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testCwd, { recursive: true, force: true });
});

function setup(requestApproval?: AgentConfig['requestToolApproval'], grants = new Set<string>()) {
  const invoked: string[] = [];
  const tools = ['bash', 'write_file', 'edit_file'].map(name => new DynamicStructuredTool({
    name,
    description: 'Test permission handling without executing a real command',
    schema: z.object({ command: z.string().optional() }),
    func: async () => { invoked.push(name); return 'ok'; },
  }));
  return {
    invoked,
    executor: new AgentToolExecutor(new Map(tools.map(tool => [tool.name, tool])), new Map(), undefined, requestApproval, grants),
  };
}

async function execute(executor: AgentToolExecutor, ctx: ReturnType<typeof createRunContext>, name: string, command = '') {
  const events: AgentEvent[] = [];
  const response = new AIMessage({ content: '', tool_calls: [{ id: 'call', name, args: { command }, type: 'tool_call' }] });
  for await (const event of executor.executeAll(response, ctx)) events.push(event);
  return events;
}

describe('permission gate and execution budget', () => {
  test('denied approvals never invoke tools or consume budget', async () => {
    const { executor, invoked } = setup(async () => 'deny');
    const ctx = createRunContext('deny', { toolExecutionBudget: { maxTotalExecutions: 1 } });
    const events = await execute(executor, ctx, 'bash', 'pwd');
    expect(invoked).toEqual([]);
    expect(ctx.toolBudget?.getUsage().executedTotal).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_denied', toolCallId: 'call' }));
  });

  test('rules and cached grants cannot bypass the hard execution budget', async () => {
    expect(saveConfig({ permissions: { allow: ['Bash(pwd)'] } })).toBe(true);
    const { executor, invoked } = setup(async () => 'allow-session');
    const ctx = createRunContext('budget', { toolExecutionBudget: { maxTotalExecutions: 1 } });
    await execute(executor, ctx, 'bash', 'pwd');
    const events = await execute(executor, ctx, 'bash', 'echo hello');
    const cachedEvents = await execute(executor, ctx, 'bash', 'echo hello');
    expect(invoked).toEqual(['bash']);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_limit', blocked: true }));
    expect(events.some(event => event.type === 'tool_start')).toBe(false);
    expect(cachedEvents).toContainEqual(expect.objectContaining({ type: 'tool_limit', blocked: true }));
    expect(cachedEvents.some(event => event.type === 'tool_approval')).toBe(false);
  });

  test('session grants cover the exact command, while unknown syntax always asks', async () => {
    let prompts = 0;
    const { executor } = setup(async () => { prompts++; return 'allow-session'; });
    const ctx = createRunContext('session');
    for (const command of ['echo hello', 'echo hello', 'echo other', 'echo $(pwd)', 'echo $(pwd)']) {
      await execute(executor, ctx, 'bash', command);
    }
    expect(prompts).toBe(4);
  });

  test('preserves shared session approval for write_file and edit_file', async () => {
    let prompts = 0;
    const { executor, invoked } = setup(async () => { prompts++; return 'allow-session'; });
    const ctx = createRunContext('files');
    await execute(executor, ctx, 'write_file');
    await execute(executor, ctx, 'edit_file');
    expect(prompts).toBe(1);
    expect(invoked).toEqual(['write_file', 'edit_file']);
  });

  test('persists an explicit rule and uses it without another prompt', async () => {
    let prompts = 0;
    const { executor, invoked } = setup(async () => { prompts++; return 'allow-always'; });
    const ctx = createRunContext('persistent');
    await execute(executor, ctx, 'bash', 'pwd');
    await execute(executor, ctx, 'bash', 'pwd');
    expect(prompts).toBe(1);
    expect(invoked).toHaveLength(2);
    expect(loadRuleSet().allow.map(rule => rule.raw)).toContain('Bash(pwd:*)');
  });

  test('built-in deny wins over explicit rules and cached grants', async () => {
    expect(saveConfig({ permissions: { allow: ['Bash'] } })).toBe(true);
    let prompts = 0;
    const { executor, invoked } = setup(async () => { prompts++; return 'allow-once'; }, new Set(['bash:cat < .env']));
    const events = await execute(executor, createRunContext('rule deny'), 'bash', 'cat < .env');
    expect(prompts).toBe(0);
    expect(invoked).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_denied' }));
  });
});
