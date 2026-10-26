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

export type Share = { at: string; role: 'companion' | 'advisor'; from: string; lesson: unknown; picks: unknown[]; replies: unknown[] };

function sweep(dir: string) {
  try {
    for (const f of readdirSync(dir)) if (Date.now() - statSync(join(dir, f)).mtimeMs > TTL) unlinkSync(join(dir, f));
  } catch {
    /* 清不掉下次再清 */
  }
}

export function createShare(s: Omit<Share, 'at' | 'replies'>): string | null {
  try {
    const dir = DIR();
    mkdirSync(dir, { recursive: true });
    sweep(dir);
    const id = randomBytes(7).toString('base64url');
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...s, at: new Date().toISOString(), replies: [] }), { mode: 0o600 });
    return id;
  } catch {
    return null;
  }
}

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

export function addReply(id: string, reply: unknown): boolean {
  const s = loadShare(id);
  if (!s || s.replies.length >= MAX_REPLIES) return false;
  try {
    s.replies.push({ ...(reply as object), at: new Date().toISOString() });
    writeFileSync(join(DIR(), `${id}.json`), JSON.stringify(s), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
