import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 排查用的存档：生成好的关卡、模型写坏的原始回复，各留最新 30 份。
 * 目录默认 /tmp/need-quest/levels，可用 NEED_QUEST_DATA 改。日志里会打印文件路径。
 */
const DIR = join(process.env.NEED_QUEST_DATA || join(tmpdir(), 'need-quest'), 'levels');

export function keep(prefix: 'level' | 'invalid', content: string): string | null {
  try {
    mkdirSync(DIR, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${prefix}.${prefix === 'level' ? 'json' : 'txt'}`;
    writeFileSync(join(DIR, name), content);
    const all = readdirSync(DIR).filter((f) => f.includes(`-${prefix}.`)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - 30))) unlinkSync(join(DIR, f));
    return join(DIR, name);
  } catch {
    return null;
  }
}
