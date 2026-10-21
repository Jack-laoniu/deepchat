import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config';
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
/** 之前的对话轮次（网页上的「继续聊需求」每次把历史带上来） */
export type Turn = { role: 'user' | 'assistant'; content: string };
export type StartChat = (system: string, history?: Turn[]) => Chat;

// ---------------- Claude ----------------

export function claudeChat(client: Anthropic, model = 'claude-opus-5-5', effort: 'low' | 'medium' | 'high' = 'low'): StartChat {
  return (system, history = []) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
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

/**
 * 输出长度参数：老接口和大多数中转只认 max_tokens；OpenAI 新一代（推理）模型只认 max_completion_tokens。
 * 先按 max_tokens 发，被拒就换另一个重发，并记住这个接口+模型用哪个。
 */
const tokenParam = new Map<string, 'max_tokens' | 'max_completion_tokens'>();
const rejectsParam = (status: number, body: string) =>
  status === 400 && /max_completion_tokens|max_tokens/.test(body) && /unsupported|not supported|invalid|unrecognized|use/i.test(body);

export function openAiChat(opts: { baseUrl: string; apiKey: string; model: string; maxTokens?: number }): StartChat {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const key = `${url}|${opts.model}`;
  const post = (messages: OaMessage[], param: 'max_tokens' | 'max_completion_tokens') =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages, stream: true, [param]: opts.maxTokens ?? 16000 }),
    });
  return (system, history = []) => {
    const messages: OaMessage[] = [{ role: 'system', content: system }, ...history];
    return {
      async send(userText) {
        messages.push({ role: 'user', content: userText });
        const param = tokenParam.get(key) ?? 'max_tokens';
        let res = await post(messages, param);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (!rejectsParam(res.status, body)) throw new UpstreamError(res.status, body.slice(0, 300));
          const other = param === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
          res = await post(messages, other);
          if (!res.ok) throw new UpstreamError(res.status, (await res.text().catch(() => '')).slice(0, 300));
          tokenParam.set(key, other);
        }
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

// ---------------- 结算后继续聊需求 ----------------

const DISCUSS_RULES = `You are Lele, the cheerful guide of a game that helps people pin down what they really need.
The player just finished a level about their need. Below is the plan the game produced from their answers.
Now chat with them to refine it further: answer their question concretely, point out one thing they may not have thought of,
and end with ONE short question that digs deeper into their real situation (budget, constraints, who uses it, timing...).
Keep every reply short (under 90 words, or under 150 Chinese characters), warm and plain. No markdown headings or tables; a short list is fine.
Reply in the same language as the plan (zh = Simplified Chinese, en = English).`;

export async function discussNeed(startChat: StartChat, input: { plan: string; history: Turn[]; message: string; lang: 'zh' | 'en' }): Promise<string | null> {
  const chat = startChat(`${DISCUSS_RULES}\n\nLanguage: ${input.lang}\n\nThe plan:\n${input.plan}`, input.history);
  const reply = await chat.send(input.message);
  return 'refused' in reply ? null : reply.text.trim();
}

/**
 * 按配置选模型：
 * - anthropic.apiKey（可配 baseUrl）→ Claude
 * - openai.apiKey + baseUrl + model → OpenAI 兼容接口
 * 两个都配时用 provider: "openai" | "anthropic" 指定，默认 Claude。
 */
export function chatFromConfig(c: Config): { start: StartChat; label: string } | null {
  const oa = c.openai ?? {};
  const an = c.anthropic ?? {};
  const wantOpenAi = c.provider === 'openai' || (c.provider !== 'anthropic' && !an.apiKey && !!oa.apiKey);
  if (wantOpenAi && oa.apiKey) {
    if (!oa.model) {
      console.error('已填 openai.apiKey，但缺少 openai.model（OpenAI 兼容接口必须指定模型名）');
      return null;
    }
    const baseUrl = oa.baseUrl || 'https://api.openai.com/v1';
    return {
      start: openAiChat({ baseUrl, apiKey: oa.apiKey, model: oa.model, maxTokens: oa.maxTokens }),
      label: `openai-compatible ${baseUrl} ${oa.model}`,
    };
  }
  if (an.apiKey) {
    const model = an.model || 'claude-opus-5-5';
    const client = new Anthropic({ apiKey: an.apiKey, baseURL: an.baseUrl || undefined });
    return { start: claudeChat(client, model, an.effort || 'low'), label: `anthropic ${model}` };
  }
  return null;
}
