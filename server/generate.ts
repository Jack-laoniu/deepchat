import Anthropic from '@anthropic-ai/sdk';
import { GENERATOR_RULES } from '../src/lesson/prompt';
import { parseLesson, type Lesson } from '../src/lesson/schema';
import dog from '../src/lessons/dog.json';
import farm from '../src/lessons/farm.json';

/**
 * 网页版：用户输入一句需求，服务端调用大模型生成关卡。
 * 生成后用关卡 schema 校验；不合格就把错误发回给模型修改，最多 MAX_FIX 轮。
 *
 * 模型可以是 Claude（官方 SDK），也可以是任何 OpenAI 兼容接口（测试期用的中转服务）。
 */

const MAX_FIX = 2;

export type GenerateResult = { ok: true; lesson: Lesson } | { ok: false; error: string };

/** 一次多轮对话：每次发一条用户消息，拿回模型的文字回复。历史由实现自己维护（只追加）。 */
export interface Chat {
  send(userText: string): Promise<{ text: string } | { refused: true }>;
}
export type StartChat = (system: string) => Chat;

// ---------------- Claude ----------------

export function claudeChat(client: Anthropic, model = process.env.NEED_QUEST_MODEL || 'claude-opus-5-5'): StartChat {
  const effort = (process.env.NEED_QUEST_EFFORT || 'low') as 'low' | 'medium' | 'high';
  return (system) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    return {
      async send(userText) {
        messages.push({ role: 'user', content: userText });
        const msg = await client.beta.messages
          .stream({
            model,
            max_tokens: 32000,
            system,
            output_config: { effort },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            messages,
          })
          .finalMessage();
        // 保留完整回复（含思考块），下一轮原样带回
        messages.push({ role: 'assistant', content: msg.content });
        if (msg.stop_reason === 'refusal') return { refused: true };
        return { text: msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('') };
      },
    };
  };
}

// ---------------- OpenAI 兼容接口 ----------------

type OaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** 读 SSE 流，拼出完整回复。用流式是为了不被长时间生成拖到 HTTP 超时 */
async function readSse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, '');
      if (!data || data === '[DONE]' || !line.trim().startsWith('data:')) continue;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        out += j.choices?.[0]?.delta?.content ?? '';
      } catch {
        /* 跳过不完整的片段 */
      }
    }
  }
  return out;
}

export function openAiChat(opts: { baseUrl: string; apiKey: string; model: string; maxTokens?: number }): StartChat {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return (system) => {
    const messages: OaMessage[] = [{ role: 'system', content: system }];
    return {
      async send(userText) {
        messages.push({ role: 'user', content: userText });
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({ model: opts.model, messages, stream: true, max_tokens: opts.maxTokens ?? 16000 }),
        });
        if (!res.ok) throw new UpstreamError(res.status, (await res.text().catch(() => '')).slice(0, 300));
        const text = await readSse(res);
        messages.push({ role: 'assistant', content: text });
        return { text };
      },
    };
  };
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`upstream ${status}: ${detail}`);
  }
}

// ---------------- 生成 + 校验 + 修正 ----------------

const LANG_NAME = { zh: '简体中文 (lang "zh", currency CNY unless the need says otherwise)', en: 'English (lang "en", currency USD unless the need says otherwise)' };

/** 从回复里抠出 JSON：容忍代码块和前后多余文字 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export async function generateLesson(startChat: StartChat, need: string, lang: 'zh' | 'en'): Promise<GenerateResult> {
  const example = lang === 'zh' ? farm : dog;
  const chat = startChat(GENERATOR_RULES);
  let prompt = `Example level (a different need):\n${JSON.stringify(example)}\n\nWrite ALL text in ${LANG_NAME[lang]}.\n\nThe user's need:\n${need}`;

  for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
    const reply = await chat.send(prompt);
    if ('refused' in reply) return { ok: false, error: 'refused' };
    const r = parseLesson(extractJson(reply.text));
    if (r.ok) return { ok: true, lesson: { ...r.lesson, need: r.lesson.need || need } };
    prompt = `The level is invalid:\n${r.errors.slice(0, 30).map((e) => `- ${e}`).join('\n')}\n\nFix exactly these problems and output the complete corrected JSON only.`;
  }
  return { ok: false, error: 'invalid' };
}

/**
 * 按环境变量选模型：
 * - ANTHROPIC_API_KEY（可配 ANTHROPIC_BASE_URL）→ Claude
 * - OPENAI_API_KEY + OPENAI_BASE_URL + NEED_QUEST_MODEL → OpenAI 兼容接口
 * 两个都配时用 NEED_QUEST_PROVIDER=openai|anthropic 指定，默认 Claude。
 */
export function chatFromEnv(env = process.env): { start: StartChat; label: string } | null {
  const wantOpenAi = env.NEED_QUEST_PROVIDER === 'openai' || (!env.ANTHROPIC_API_KEY && !!env.OPENAI_API_KEY);
  if (wantOpenAi && env.OPENAI_API_KEY) {
    if (!env.NEED_QUEST_MODEL) {
      console.error('OPENAI_API_KEY 已设置，但缺少 NEED_QUEST_MODEL（OpenAI 兼容接口必须指定模型名）');
      return null;
    }
    const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    return {
      start: openAiChat({ baseUrl, apiKey: env.OPENAI_API_KEY, model: env.NEED_QUEST_MODEL, maxTokens: Number(env.NEED_QUEST_MAX_TOKENS) || undefined }),
      label: `openai-compatible ${baseUrl} ${env.NEED_QUEST_MODEL}`,
    };
  }
  if (env.ANTHROPIC_API_KEY) return { start: claudeChat(new Anthropic()), label: `anthropic ${env.NEED_QUEST_MODEL || 'claude-opus-5-5'}` };
  return null;
}
