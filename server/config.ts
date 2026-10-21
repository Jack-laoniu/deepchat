import { readFileSync, statSync } from 'node:fs';

/**
 * 服务器配置文件（默认 /etc/need-quest/config.json，可用 NEED_QUEST_CONFIG 改路径）。
 * 每次用到时检查文件修改时间，改完保存即生效，不用重启服务。
 * 没有配置文件时回退到环境变量（旧的部署方式）。
 */

export interface Config {
  /** 在线生成用哪个：openai = OpenAI 兼容接口，anthropic = Claude；留空则自动选有 key 的那个 */
  provider?: 'openai' | 'anthropic' | '';
  openai?: { apiKey?: string; baseUrl?: string; model?: string; maxTokens?: number };
  anthropic?: { apiKey?: string; baseUrl?: string; model?: string; effort?: 'low' | 'medium' | 'high' };
  /** 测试访问码：填了以后网页上要输入它才能生成 */
  accessCode?: string;
  limits?: { perIpPerHour?: number; perDay?: number; concurrency?: number };
}

export const CONFIG_PATH = process.env.NEED_QUEST_CONFIG || '/etc/need-quest/config.json';

export function fromEnv(env = process.env): Config {
  return {
    provider: (env.NEED_QUEST_PROVIDER as Config['provider']) || '',
    openai: { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, model: env.NEED_QUEST_MODEL, maxTokens: Number(env.NEED_QUEST_MAX_TOKENS) || undefined },
    anthropic: { apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL, model: env.NEED_QUEST_MODEL, effort: env.NEED_QUEST_EFFORT as 'low' },
    accessCode: env.NEED_QUEST_ACCESS_CODE,
    limits: {
      perIpPerHour: Number(env.NEED_QUEST_IP_LIMIT) || undefined,
      perDay: Number(env.NEED_QUEST_DAILY_LIMIT) || undefined,
      concurrency: Number(env.NEED_QUEST_CONCURRENCY) || undefined,
    },
  };
}

/** 文件里填了的值优先，空字符串视为没填 */
function merge<T extends object>(base: T, over: Partial<T> | undefined): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over ?? {})) {
    if (k.startsWith('_') || v === '' || v === null || v === undefined) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge((out[k] as object) ?? {}, v as object) : v;
  }
  return out as T;
}

let cached: { mtime: number; config: Config; error: string | null } | null = null;

export function loadConfig(path = CONFIG_PATH): { config: Config; error: string | null; fromFile: boolean } {
  let mtime = -1;
  try {
    mtime = statSync(path).mtimeMs;
  } catch {
    return { config: fromEnv(), error: null, fromFile: false };
  }
  if (cached?.mtime !== mtime) {
    try {
      const file = JSON.parse(readFileSync(path, 'utf8')) as Config;
      cached = { mtime, config: merge(fromEnv(), file), error: null };
      console.error(`loaded config ${path}`);
    } catch (e) {
      // 文件写坏了：保留上一次能用的配置，并把错误报出来
      cached = { mtime, config: cached?.config ?? fromEnv(), error: `配置文件格式错误：${(e as Error).message}` };
      console.error(cached.error);
    }
  }
  return { config: cached.config, error: cached.error, fromFile: true };
}
