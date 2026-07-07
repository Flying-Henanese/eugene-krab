import { describe, expect, test } from 'bun:test';
import { getChannelProfile } from './channels.js';

describe('getChannelProfile', () => {
  test('resolves Feishu profile', () => {
    const profile = getChannelProfile('feishu');

    expect(profile.label).toBe('Feishu');
    expect(profile.tables).toContain('Use markdown tables');
    expect(profile.tables).toContain('card rendering');
    expect(profile.responseFormat.join('\n')).toContain('Use markdown tables for compact comparative data');
    expect(profile.responseFormat.join('\n')).toContain('Never simulate tables with slash-separated rows');
    expect(profile.responseFormat.join('\n')).toContain('Use short section labels');
  });
});
