import { describe, expect, test } from 'bun:test';
import { getChannelProfile } from './channels.js';

describe('getChannelProfile', () => {
  test('resolves Feishu profile', () => {
    const profile = getChannelProfile('feishu');

    expect(profile.label).toBe('Feishu');
    expect(profile.tables).toBeNull();
    expect(profile.responseFormat.join('\n')).toContain('No markdown tables');
    expect(profile.responseFormat.join('\n')).toContain('Use short section labels');
  });
});
