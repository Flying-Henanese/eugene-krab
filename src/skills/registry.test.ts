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
    expect(helpSkill?.description).toContain('Feishu chat');

    const loaded = getSkill('dexter-help');
    expect(loaded?.instructions).toContain('Explain Dexter as an AI financial research assistant');
    expect(loaded?.instructions).toContain('Default to Feishu chat usage');
  });

  test('discovers and loads the China technical-analysis workflow', () => {
    clearSkillCache();
    const metadata = discoverSkills().find((skill) => skill.name === 'technical-analysis');
    expect(metadata?.description).toContain('技术面分析');

    const loaded = getSkill('technical-analysis');
    expect(loaded?.instructions).toContain('technical_analysis');
    expect(loaded?.instructions).toContain('latest data date');
    expect(loaded?.instructions).toContain('partial');
  });
});
