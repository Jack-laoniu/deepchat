import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 分享给真实朋友的行程：分享的人的关卡、压缩好的选择、身份（同行 / 参谋），以及朋友们的回复。
 * 每份一个文件，存在服务的数据目录；60 天后清掉。拿到链接的人都能看到，所以只存分享时用户自己确认过的内容。
 */
const DIR = () => join(process.env.STATE_DIRECTORY || process.env.NEED_QUEST_DATA || join(tmpdir(), 'need-quest'), 'shares');
const TTL = 60 * 86400_000;
const MAX_REPLIES = 20;
export const isShareId = (id: string) => /^[A-Za-z0-9_-]{8,16}$/.test(id);

/** owner = 分享的人手里的口令，拍板时要带上；读分享时不返回 */
export type Share = { at: string; role: 'companion' | 'advisor'; from: string; owner?: string; lesson: unknown; picks: unknown[]; replies: Reply[] };
type Reply = Record<string, unknown> & { rid?: string; decisions?: Record<string, Choice> };
export type Choice = 'mine' | 'theirs' | 'both';
const CHOICES = new Set<string>(['mine', 'theirs', 'both']);

function sweep(dir: string) {
  try {
    for (const f of readdirSync(dir)) if (Date.now() - statSync(join(dir, f)).mtimeMs > TTL) unlinkSync(join(dir, f));
  } catch {
    /* 清不掉下次再清 */
  }
}

export function createShare(s: Omit<Share, 'at' | 'replies' | 'owner'>): { id: string; owner: string } | null {
  try {
    const dir = DIR();
    mkdirSync(dir, { recursive: true });
    sweep(dir);
    const id = randomBytes(7).toString('base64url');
    const owner = randomBytes(12).toString('base64url');
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...s, owner, at: new Date().toISOString(), replies: [] }), { mode: 0o600 });
    return { id, owner };
  } catch {
    return null;
  }
}

/** 给拿着链接的人看的：去掉分享的人的口令 */
export function publicShare(s: Share): Omit<Share, 'owner'> {
  const { owner: _owner, ...rest } = s;
  return rest;
}

const save = (id: string, s: Share) => writeFileSync(join(DIR(), `${id}.json`), JSON.stringify(s), { mode: 0o600 });

export function loadShare(id: string): Share | null {
  if (!isShareId(id)) return null;
  try {
    const file = join(DIR(), `${id}.json`);
    if (Date.now() - statSync(file).mtimeMs > TTL) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as Share;
  } catch {
    return null;
  }
}

/** 朋友交回结果；返回这条回复的 id（朋友自己记着，回头来看分享的人怎么拍板） */
export function addReply(id: string, reply: object): string | null {
  const s = loadShare(id);
  if (!s || s.replies.length >= MAX_REPLIES) return null;
  try {
    const rid = randomBytes(6).toString('base64url');
    s.replies.push({ ...reply, rid, at: new Date().toISOString() });
    save(id, s);
    return rid;
  } catch {
    return null;
  }
}

/** 分享的人对和某位朋友的分歧拍板：每个分歧点听谁的。要带分享时拿到的口令 */
export function decide(id: string, owner: string, rid: string, decisions: unknown): boolean {
  const s = loadShare(id);
  const r = s?.replies.find((x) => x.rid === rid);
  if (!s || !s.owner || s.owner !== owner || !r || !decisions || typeof decisions !== 'object') return false;
  const clean: Record<string, Choice> = {};
  for (const [k, v] of Object.entries(decisions).slice(0, 40)) if (typeof v === 'string' && CHOICES.has(v) && k.length <= 80) clean[k] = v as Choice;
  try {
    r.decisions = clean;
    r.decidedAt = new Date().toISOString();
    save(id, s);
    return true;
  } catch {
    return false;
  }
}
