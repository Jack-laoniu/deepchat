import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import farm from '../src/lessons/farm.json';
import { generateLesson } from './generate';

/** 假的 Claude 客户端：按顺序返回给定的回复，记录每次请求 */
function fakeClient(replies: string[]) {
  const calls: any[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: any) {
          calls.push(structuredClone(params));
          const text = replies[calls.length - 1] ?? '';
          return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe('generateLesson', () => {
  it('feeds validation errors back and accepts the corrected level', async () => {
    const broken = structuredClone(farm) as any;
    broken.rounds[0].beats[0].who = 'ghost';
    const { client, calls } = fakeClient([JSON.stringify(broken), '```json\n' + JSON.stringify(farm) + '\n```']);
    const r = await generateLesson(client, '我想给农场搞个自动洒水器', 'zh');
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const retry = calls[1].messages.at(-1).content as string;
    expect(retry).toContain('ghost');
    expect(calls[0].model).toBe('claude-opus-5-5');
    expect(calls[0].fallbacks).toBe('default');
  });

  it('gives up after a few failed fixes', async () => {
    const { client, calls } = fakeClient(['not json', 'still not', 'nope']);
    const r = await generateLesson(client, 'x', 'en');
    expect(r).toEqual({ ok: false, error: 'invalid' });
    expect(calls).toHaveLength(3);
  });

  it('asks for the user language', async () => {
    const { client, calls } = fakeClient([JSON.stringify(farm)]);
    await generateLesson(client, 'grow veggies', 'en');
    expect(calls[0].messages[0].content).toContain('English');
  });
});
