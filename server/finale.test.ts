import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import car from '../src/lessons/car.json';
import { play } from '../src/lesson/engine';
import { bossOf, journeyText, withBoss } from '../src/lesson/journey';
import { parseLesson, type Lesson } from '../src/lesson/schema';
import { claudeChat } from './generate';
import { finaleFor } from './generate';

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
  return { client: claudeChat(client), calls };
}

const lesson = (parseLesson(car) as { ok: true; lesson: Lesson }).lesson;
const mine = {
  type: 'boss',
  id: 'whatever',
  who: 'wang',
  q: '你说的长途回家，选哪条？',
  emoji: '🧭',
  options: [
    { id: 'go_erev', emoji: '🔀', label: '增程', fact: '倾向增程车，回老家长途不焦虑', set: ['go_erev'], pros: '长途不焦虑', cons: '贵一点', remove: ['charger'] },
    { id: 'go_ev', emoji: '🔌', label: '纯电', fact: '倾向纯电', set: ['go_ev'], pros: '用车便宜', cons: '春节排队充电' },
  ],
  probe: [{ id: 'p1', who: 'wang', q: '老家那边有充电桩吗？', options: [{ id: 'y', emoji: '✅', label: '有', fact: '老家有充电桩' }], if: { any: ['go_erev'] } }],
  bring: [{ id: 'park', emoji: '🅿️', label: '车位情况', fact: '小区车位能否装桩' }],
};

describe('personal finale', () => {
  it('journey lists the user words and marks blind-guess items', () => {
    const p = play(lesson, []);
    const j = journeyText(lesson, p);
    expect(j).toContain('never touched');
    expect(j).toContain('Plan items now');
  });

  it('rewrites the finale from what the user did, keeping the original id', async () => {
    const { client, calls } = fakeClient([JSON.stringify(mine)]);
    const r = await finaleFor(client, { lesson, journey: 'In their own words:\n- asked 「为什么买车」 → 「过年回老家方便」' });
    expect(r).not.toBeNull();
    expect(r!.boss.id).toBe(bossOf(lesson)!.id);
    expect(r!.boss.q).toBe(mine.q);
    const prompt = calls[0].messages.at(-1).content as string;
    expect(prompt).toContain('过年回老家方便');
    expect(prompt).toContain('TODAY is');
    expect(parseLesson({ ...withBoss(lesson, r!.boss), cast: r!.cast }).ok).toBe(true);
  });

  it('asks for a fix when the finale is broken, and keeps the original when it stays broken', async () => {
    const bad = { ...mine, who: 'ghost', options: [mine.options[0]] };
    const { client, calls } = fakeClient([JSON.stringify(bad), 'not json at all']);
    const r = await finaleFor(client, { lesson, journey: 'x' });
    expect(r).toBeNull();
    expect(calls).toHaveLength(2);
  });
});
