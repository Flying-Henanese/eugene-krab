import { describe, expect, test } from 'bun:test';
import { ApprovalPromptComponent } from './approval-prompt.js';

describe('Bash approval prompt', () => {
  test('shows the full command and describes the exact query-scoped grant', () => {
    const command = `echo ${'x'.repeat(160)}; echo END_MARKER`;
    const prompt = new ApprovalPromptComponent('bash', { command }, { command, proposedRule: 'Bash(echo:*)' });
    const text = prompt.render(80).join('\n');
    expect(text).toContain('END_MARKER');
    expect(text).toContain('allow this exact command this query');
    expect(text).toContain('always allow Bash(echo:*)');
    expect(text).not.toContain('all edits');
  });

  test('unknown syntax offers only a one-time approval or denial', () => {
    const command = 'echo $(pwd)';
    const prompt = new ApprovalPromptComponent('bash', { command }, { command, sessionCacheable: false });
    const text = prompt.render(80).join('\n');
    expect(text).not.toContain('this query');
    expect(text).not.toContain('this session');
    expect(text).not.toContain('always allow');
    let decision = '';
    prompt.onSelect = value => { decision = value; };
    prompt.selector.handleInput('\u001b');
    expect(decision).toBe('deny');
  });

  test('preserves the existing file-write session approval option', () => {
    const prompt = new ApprovalPromptComponent('write_file', { path: 'report.md' });
    expect(prompt.render(80).join('\n')).toContain('allow all edits this session');
  });
});
