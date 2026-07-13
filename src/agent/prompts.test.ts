import { describe, expect, test } from 'bun:test';
import { buildSystemPrompt } from './prompts.js';

describe('buildSystemPrompt subagent routing policy', () => {
  test('keeps company synthesis in the main agent and exposes bounded auxiliary lanes', () => {
    const prompt = buildSystemPrompt('gpt-5.5');

    expect(prompt).toContain(
      'the main agent owns the stock-analysis skill, structured fundamentals',
    );
    expect(prompt).toContain(
      'material arithmetic verification, cross-lane evidence reconciliation, pre-publication review, and final company-level synthesis',
    );
    expect(prompt).toContain(
      'delegate only a clearly isolated multi-step current-information lane to research',
    );
    expect(prompt).toContain(
      'a clearly isolated deterministic technical lane to technical-analysis',
    );
    expect(prompt).toContain(
      'Use analysis only for one standardized company lane in a multi-company comparison',
    );
    expect(prompt).toContain(
      'Never use it for the complete ordinary single-company report',
    );
    expect(prompt).toContain(
      'Do not use general-purpose for company, stock, market, or technical analysis',
    );
    expect(prompt).toContain(
      'emit multiple spawn_subagent calls in a SINGLE turn',
    );
    expect(prompt).toContain(
      'Build one like-for-like evidence table',
    );
  });
});