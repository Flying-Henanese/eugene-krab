import { describe, expect, test } from 'bun:test';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { Agent } from './agent.js';

type AgentWithTruncation = {
  truncateMessages(messages: Array<AIMessage | HumanMessage>, keepRounds: number): number;
};

describe('Agent message truncation', () => {
  test('truncates old rounds when the first message is an AI response', () => {
    const agent = Object.create(Agent.prototype) as AgentWithTruncation;
    const messages = [
      new AIMessage('first response'),
      new HumanMessage('follow-up'),
      new AIMessage('second response'),
      new HumanMessage('latest follow-up'),
    ];

    const removed = agent.truncateMessages(messages, 1);

    expect(removed).toBe(2);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('second response');
  });
});
