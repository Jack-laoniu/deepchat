import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config';
import { charById, MOODS } from '../src/chars/library';
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
/** json：要求模型只输出 JSON（支持的接口会用 response_format 强制） */
export type StartChat = (system: string, history?: Turn[], opts?: { json?: boolean }) => Chat;

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

const tokenParam = new Map<string, 'max_tokens' | 'max_completion_tokens' | 'none'>();
/** 不支持 response_format 的接口+模型 */
const noJsonMode = new Set<string>();
const rejectsParam = (status: number, body: string) =>
  status === 400 && /max_completion_tokens|max_tokens|max output|maximum/i.test(body) && /unsupported|not supported|invalid|unrecognized|use|too large|exceed|maximum/i.test(body);

/** 读回复：正常是 SSE 流；有的中转不支持流式，直接回一个完整 JSON，也认 */
async function readReply(res: Response): Promise<string> {
  if (/event-stream/.test(res.headers.get('content-type') ?? '')) return readSse(res);
  const raw = await res.text();
  try {
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? '';
  } catch {
    // 没标 content-type 的 SSE
    return raw.includes('data:') ? readSse(new Response(raw)) : raw;
  }
}

export function openAiChat(opts: { baseUrl: string; apiKey: string; model: string; maxTokens?: number }): StartChat {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const key = `${url}|${opts.model}`;
  const post = (messages: OaMessage[], param: 'max_tokens' | 'max_completion_tokens' | 'none', json: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages,
        stream: true,
        ...(param === 'none' ? {} : { [param]: opts.maxTokens ?? 16000 }),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  return (system, history = [], chatOpts = {}) => {
    const messages: OaMessage[] = [{ role: 'system', content: system }, ...history];
    return {
      async send(userText) {
        messages.push({ role: 'user', content: userText });
        // 输出长度参数：老接口和多数中转只认 max_tokens；OpenAI 新一代模型只认 max_completion_tokens；
        // 有的模型输出上限比 16000 小，会说「太大」。依次换着试，记住这个接口+模型能用的那个。
        const order = (['max_tokens', 'max_completion_tokens', 'none'] as const).filter((p) => p !== tokenParam.get(key));
        const tries = tokenParam.has(key) ? [tokenParam.get(key)!, ...order] : order;
        let res: Response | null = null;
        let json = !!chatOpts.json && !noJsonMode.has(key);
        for (let i = 0; i < tries.length; i++) {
          const param = tries[i];
          res = await post(messages, param, json);
          if (res.ok) {
            tokenParam.set(key, param);
            break;
          }
          const body = await res.text().catch(() => '');
          // 不认 response_format：去掉它用同一个长度参数再试
          if (json && res.status === 400 && /response_format|json_object|json mode/i.test(body)) {
            noJsonMode.add(key);
            json = false;
            i--;
            continue;
          }
          if (!rejectsParam(res.status, body) || i === tries.length - 1) throw new UpstreamError(res.status, body.slice(0, 300));
        }
        const text = await readReply(res!);
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

/**
 * context：「再玩一轮」时带上上一关的结果（方案、用户原话、结算后聊的内容、用户觉得没说清的地方），
 * 让新关卡去挖还不清楚的部分，而不是把问过的再问一遍。
 */
export async function generateLesson(startChat: StartChat, need: string, lang: 'zh' | 'en', context = ''): Promise<GenerateResult> {
  const example = lang === 'zh' ? farm : dog;
  const chat = startChat(GENERATOR_RULES, [], { json: true });
  const followUp = context
    ? `\n\nThis is a FOLLOW-UP level. The user already played one level for this need. What we learned so far:\n${context}\n\n` +
      `Design a NEW level that digs into what is still unclear or was never covered (especially anything the user says is still unclear). ` +
      `Do not re-ask questions that are already answered; build on the settled facts, budget and items instead of contradicting them. Use different scenes and, where it fits, different characters.`
    : '';
  let prompt = `Example level (a different need):\n${JSON.stringify(example)}\n\nWrite ALL text in ${LANG_NAME[lang]}.\n\nThe user's need:\n${need}${followUp}`;

  for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
    const reply = await chat.send(prompt);
    if ('refused' in reply) return { ok: false, error: 'refused' };
    const json = extractJson(reply.text);
    const r = parseLesson(json);
    if (r.ok) return { ok: true, lesson: { ...r.lesson, need: r.lesson.need || need } };
    console.error(`generate attempt ${attempt + 1}: invalid level (${reply.text.length} chars):`, r.errors.slice(0, 5).join(' | '));
    // JSON 语法错：只说「第 6538 个字符」模型看不出是哪儿，把出错位置前后的原文带上
    const pos = Number(r.errors[0].match(/position (\d+)/)?.[1]);
    const near = Number.isFinite(pos) ? `\nThe text around the error (>>> marks the spot):\n${json.slice(Math.max(0, pos - 120), pos)}>>>${json.slice(pos, pos + 60)}\nCommon cause: a double quote inside a string; write quotes inside text as 「」 instead.` : '';
    prompt = `The level is invalid:\n${r.errors.slice(0, 30).map((e) => `- ${e}`).join('\n')}${near}\n\nFix exactly these problems and output the complete corrected JSON only.`;
  }
  return { ok: false, error: 'invalid' };
}

// ---------------- 角色对「自己的话」的即时反应 ----------------

export type ReactInput = { need: string; who: string; as?: string; q: string; options: string[]; text: string; recent: string[]; lang: 'zh' | 'en' };

/** 用户没点选项而是自己打字：让提问的角色用一句符合人设的话，针对用户说的内容回应 */
export async function reactLine(startChat: StartChat, input: ReactInput): Promise<{ say: string; mood?: string } | null> {
  const c = charById(input.who);
  const name = c ? c.name[input.lang] : input.who;
  const system = `You voice ONE character in a short, Duolingo-style story game that helps a player pin down a real need.
Character: ${name}${input.as ? ` (role in this scene: ${input.as})` : ''}. Personality: ${c?.persona ?? 'friendly'}.
The player's need: ${input.need}
Recent dialogue:\n${input.recent.join('\n')}
${name} just asked: "${input.q}"${input.options.length ? `\nThe preset answers were: ${input.options.join(' / ')}` : ''}
The player answered in their own words instead. React IN CHARACTER to exactly what they said: acknowledge the specific detail,
and if it reveals a constraint, risk or cost, say so briefly. One short spoken line only: at most 40 Chinese characters or 18 English words.
Language: ${input.lang === 'zh' ? 'Simplified Chinese' : 'English'}.
Output JSON only: {"say": "...", "mood": one of ${MOODS.join('|')}}`;
  const reply = await startChat(system, [], { json: true }).send(input.text);
  if ('refused' in reply) return null;
  try {
    const j = JSON.parse(extractJson(reply.text)) as { say?: unknown; mood?: unknown };
    const say = typeof j.say === 'string' ? j.say.trim().slice(0, 120) : '';
    if (!say) return null;
    return { say, mood: typeof j.mood === 'string' && (MOODS as readonly string[]).includes(j.mood) ? j.mood : undefined };
  } catch {
    const say = reply.text.trim().split('\n')[0].slice(0, 120);
    return say ? { say } : null;
  }
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
