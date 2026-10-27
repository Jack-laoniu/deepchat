import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { addReply, createShare, decide, loadShare, publicShare } from './shares';

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
});
