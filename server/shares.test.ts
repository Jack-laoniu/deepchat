import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { addReply, createShare, decide, loadShare, publicShare, setShareVoices } from './shares';

beforeAll(() => {
  process.env.NEED_QUEST_DATA = mkdtempSync(join(tmpdir(), 'nq-shares-'));
});

describe('shares', () => {
  it('only the sharer (with the owner token) can decide, and the token is never served', () => {
    const made = createShare({ role: 'companion', from: 'Jack', lesson: {}, picks: [] })!;
    expect(made.owner).toBeTruthy();
    const rid = addReply(made.id, { role: 'companion', name: 'Amy', picks: [] })!;
    expect(rid).toBeTruthy();
    expect(decide(made.id, 'wrong', rid, { 'arrive.why': 'mine' })).toBe(false);
    expect(decide(made.id, made.owner, 'nope', { 'arrive.why': 'mine' })).toBe(false);
    expect(decide(made.id, made.owner, rid, { 'arrive.why': 'theirs', bad: 'evil', 'boss': 'both' })).toBe(true);
    const s = loadShare(made.id)!;
    expect(s.replies[0].decisions).toEqual({ 'arrive.why': 'theirs', boss: 'both' });
    expect('owner' in publicShare(s)).toBe(false);
  });

  it('only the sharer can attach their own voice answers, and friends can read them', () => {
    const made = createShare({ role: 'companion', from: 'Jack', lesson: {}, picks: [] })!;
    const voices = { 'arrive.why': { vid: 'abcdefghij12', text: '玩水上世界' } };
    expect(setShareVoices(made.id, 'wrong', voices)).toBe(false);
    expect(setShareVoices(made.id, made.owner, voices)).toBe(true);
    expect(publicShare(loadShare(made.id)!).voices).toEqual(voices);
  });
});
