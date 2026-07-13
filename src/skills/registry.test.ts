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
    expect(metadata?.description).toContain('技术结构变化');
    expect(metadata?.description).toContain('已发生回撤');
    expect(metadata?.description).not.toContain('买卖信号');

    const loaded = getSkill('technical-analysis');
    expect(loaded?.instructions).toContain('technical_analysis');
    expect(loaded?.instructions).toContain('latest data date');
    expect(loaded?.instructions).toContain('partial');
    expect(loaded?.instructions).toContain('neutral state or structural-change language');
    expect(loaded?.instructions).toContain('does not predict subsequent direction');
    expect(loaded?.instructions).toContain('Bollinger-band contact as location evidence');
    expect(loaded?.instructions).toContain('Applicability V2.1 remains offline and unvalidated');
    expect(loaded?.instructions).toContain('ordinary single-symbol response');
  });

  test('discovers a bounded combined A-share analysis workflow', () => {
    clearSkillCache();
    const metadata = discoverSkills().find((skill) => skill.name === 'stock-analysis');

    expect(metadata?.description).toContain('分析一下某只股票');
    expect(metadata?.description).toContain('深入分析某公司');
    expect(metadata?.description).toContain('这只股票最近怎么样');
    expect(metadata?.description).toContain('Do not use when the request is explicitly technical-analysis only');
    expect(metadata?.description).toContain('multi-company comparison');
    expect(metadata?.description).toContain('investment memo');

    const loaded = getSkill('stock-analysis');
    expect(loaded?.instructions).toContain('a_share_analysis');
    expect(loaded?.instructions).toContain('technical_analysis');
    expect(loaded?.instructions).toContain('web_search');
    expect(loaded?.instructions).toContain('Company-disclosed fact');
    expect(loaded?.instructions).toContain('基本面承压、价格结构改善');
    expect(loaded?.instructions).toContain('Do not call book value liquidation value or a hard floor');
    expect(loaded?.instructions).toContain('Never relabel a 20-day metric as a 60-day metric');
    expect(loaded?.instructions).toContain('Use `n_income_attr_p` for 归母净利润');
    expect(loaded?.instructions).toContain('`latest_week_partial` value exactly');
    expect(loaded?.instructions).toContain('“回报下限”');
    expect(loaded?.instructions).toContain('financial_calculator');
    expect(loaded?.instructions).toContain('not a validated T+5 prediction horizon');
    expect(loaded?.instructions).toContain('cross-horizon agreement or tension');
    expect(loaded?.instructions).toContain('latest.price_position.ma20');
    expect(loaded?.instructions).toContain('Do not invent an arbitrary intraday price threshold');
    expect(loaded?.instructions).toContain('technical_analysis.decision_context');
    expect(loaded?.instructions).toContain('Pre-Publication Check');
    expect(loaded?.instructions).toContain('The main agent retains the `stock-analysis` skill');
    expect(loaded?.instructions).toContain('`research` may handle a clearly isolated multi-step current-information lane');
    expect(loaded?.instructions).toContain('a prioritized list of at most five material topics');
    expect(loaded?.instructions).toContain('accept partial evidence with explicit limitations');
    expect(loaded?.instructions).toContain('`technical-analysis` may handle a clearly isolated deterministic technical lane');
    expect(loaded?.instructions).toContain('Never delegate the complete ordinary single-company analysis to `analysis` or `general-purpose`');
  });
});
