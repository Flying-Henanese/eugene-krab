import { describe, expect, test } from 'bun:test';
import { clearSkillCache, discoverSkills, getSkill } from './registry.js';

describe('skill registry', () => {
  test('discovers Dexter usage help skill', () => {
    clearSkillCache();

    const skills = discoverSkills();
    const helpSkill = skills.find((skill) => skill.name === 'dexter-help');

    expect(helpSkill).toBeDefined();
    expect(helpSkill?.description).toContain('how to use Dexter');
    expect(helpSkill?.description).toContain('what Dexter can do');
    expect(helpSkill?.description).toContain('how to ask');

    const loaded = getSkill('dexter-help');
    expect(loaded?.instructions).toContain('Explain Dexter as an AI financial research assistant');
  });
});
