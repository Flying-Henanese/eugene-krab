import { describe, expect, test } from 'bun:test';
import { Agent } from './agent.js';

describe('CLI-only tool binding', () => {
  test.each(['feishu', 'whatsapp'])('excludes Bash from %s even when explicitly allowlisted', async channel => {
    const agent = await Agent.create({ model: 'gpt-5.5', memoryEnabled: false, channel, toolAllowlist: ['bash', 'read_file'] });
    const state = agent as unknown as { tools: Array<{ name: string }>; systemPrompt: string };
    expect(state.tools.map(tool => tool.name)).toEqual(['read_file']);
    expect(state.systemPrompt).not.toContain('**bash**:');
  });

  test('retains serial Bash execution on CLI on supported platforms', async () => {
    const agent = await Agent.create({ model: 'gpt-5.5', memoryEnabled: false, channel: 'cli', toolAllowlist: ['bash'] });
    const state = agent as unknown as { tools: Array<{ name: string }>; systemPrompt: string };
    const expected = process.platform === 'win32' ? [] : ['bash'];
    expect(state.tools.map(tool => tool.name)).toEqual(expected);
    expect(state.systemPrompt.includes('**bash**:')).toBe(process.platform !== 'win32');
  });
});
