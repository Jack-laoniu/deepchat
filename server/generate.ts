import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config';
import { dropNulls, lessonJsonSchema } from './jsonSchema';
import { charById, MOODS } from '../src/chars/library';
import { GENERATOR_RULES } from '../src/lesson/prompt';
import { salvage, explainIssues, type Salvaged } from '../src/lesson/salvage';
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
  /** truncated：输出写到上限被截断了（finish_reason = length） */
  send(userText: string): Promise<{ text: string; truncated?: boolean } | { refused: true }>;
}
/** 之前的对话轮次（网页上的「继续聊需求」每次把历史带上来） */
export type Turn = { role: 'user' | 'assistant'; content: string };
/**
 * json：要求模型只输出 JSON。true = 任意 JSON；给 schema = 结构化输出（按 schema 约束，strict 时不会缺字段）。
 * 接口不支持时自动降级：schema(strict) → 任意 JSON → 不加约束。
 */
export type JsonFormat = boolean | { name: string; schema: Record<string, unknown> };
export type StartChat = (system: string, history?: Turn[], opts?: { json?: JsonFormat }) => Chat;

/** 单次模型调用的超时（毫秒），可在配置里改 */
export const DEFAULT_CALL_TIMEOUT = 150_000;

// ---------------- Claude ----------------

export function claudeChat(client: Anthropic, model = 'claude-opus-5-5', effort: 'low' | 'medium' | 'high' = 'low', timeout = DEFAULT_CALL_TIMEOUT): StartChat {
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
          }, { timeout, maxRetries: 1 })
          .finalMessage();
        // 保留完整回复（含思考块），下一轮原样带回
        messages.push({ role: 'assistant', content: msg.content });
        if (msg.stop_reason === 'refusal') return { refused: true };
        return { text: msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''), truncated: msg.stop_reason === 'max_tokens' };
      },
    };
  };
}

// ---------------- OpenAI 兼容接口 ----------------

type OaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** 读 SSE 流，拼出完整回复。用流式是为了不被长时间生成拖到 HTTP 超时 */
type Reply = { text: string; finish?: string };

async function readSse(res: Response): Promise<Reply> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let out = '';
  let finish: string | undefined;
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
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] };
        out += j.choices?.[0]?.delta?.content ?? '';
        finish = j.choices?.[0]?.finish_reason ?? finish;
      } catch {
        /* 跳过不完整的片段 */
      }
    }
  }
  return { text: out, finish };
}

const tokenParam = new Map<string, 'max_tokens' | 'max_completion_tokens' | 'none'>();
/** 每个接口+模型能用的最强输出约束（被拒后记住降级结果） */
type Mode = 'schema' | 'object' | 'none';
const jsonMode = new Map<string, Mode>();
const DOWNGRADE: Record<Mode, Mode> = { schema: 'object', object: 'none', none: 'none' };
const RANK: Record<Mode, number> = { none: 0, object: 1, schema: 2 };
const rejectsParam = (status: number, body: string) =>
  status === 400 && /max_completion_tokens|max_tokens|max output|maximum/i.test(body) && /unsupported|not supported|invalid|unrecognized|use|too large|exceed|maximum/i.test(body);
/** 推理模型（gpt-5 系列、o 系列）默认想很久，又把思考算进输出额度；生成关卡用 low 就够，快很多 */
const noReasoning = new Set<string>();
const isReasoningModel = (model: string) => /^(gpt-5|o[1-9])/i.test(model.replace(/^.*\//, ''));
const rejectsReasoning = (status: number, body: string) => status === 400 && /reasoning/i.test(body);
const rejectsFormat = (status: number, body: string) => (status === 400 || status === 422) && /response_format|json_schema|json_object|json mode|schema|strict/i.test(body);

/** 读回复：正常是 SSE 流；有的中转不支持流式，直接回一个完整 JSON，也认 */
async function readReply(res: Response): Promise<Reply> {
  if (/event-stream/.test(res.headers.get('content-type') ?? '')) return readSse(res);
  const raw = await res.text();
  try {
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    return { text: j.choices?.[0]?.message?.content ?? '', finish: j.choices?.[0]?.finish_reason };
  } catch {
    // 没标 content-type 的 SSE
    return raw.includes('data:') ? readSse(new Response(raw)) : { text: raw };
  }
}

export function openAiChat(opts: { baseUrl: string; apiKey: string; model: string; maxTokens?: number; timeoutMs?: number; reasoningEffort?: string }): StartChat {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const key = `${url}|${opts.model}`;
  const timeout = opts.timeoutMs ?? DEFAULT_CALL_TIMEOUT;
  const format = (mode: Mode, json: JsonFormat | undefined) =>
    !json || mode === 'none' ? {} :
    mode === 'schema' && typeof json === 'object' ? { response_format: { type: 'json_schema', json_schema: { name: json.name, strict: true, schema: json.schema } } } :
    { response_format: { type: 'json_object' } };
  const post = (messages: OaMessage[], param: 'max_tokens' | 'max_completion_tokens' | 'none', mode: Mode, json: JsonFormat | undefined, signal: AbortSignal) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages,
        stream: true,
        // 32000：推理模型的「思考」也算在这个额度里，16000 时长关卡会写到一半被截断
        ...(param === 'none' ? {} : { [param]: opts.maxTokens ?? 32000 }),
        ...(isReasoningModel(opts.model) && !noReasoning.has(key) && opts.reasoningEffort !== 'off' ? { reasoning_effort: opts.reasoningEffort || 'low' } : {}),
        ...format(mode, json),
      }),
      signal,
    });
  return (system, history = [], chatOpts = {}) => {
    const messages: OaMessage[] = [{ role: 'system', content: system }, ...history];
    return {
      async send(userText) {
        messages.push({ role: 'user', content: userText });
        // 整次调用（含流式读取）超时就放弃，免得一直挂着
        const signal = AbortSignal.timeout(timeout);
        // 输出长度参数：老接口和多数中转只认 max_tokens；OpenAI 新一代模型只认 max_completion_tokens；
        // 有的模型输出上限比 16000 小，会说「太大」。依次换着试，记住这个接口+模型能用的那个。
        const order = (['max_tokens', 'max_completion_tokens', 'none'] as const).filter((p) => p !== tokenParam.get(key));
        const tries = tokenParam.has(key) ? [tokenParam.get(key)!, ...order] : order;
        const wanted: Mode = !chatOpts.json ? 'none' : typeof chatOpts.json === 'object' ? 'schema' : 'object';
        // 想要的约束，但不超过这个接口已知能接受的上限
        const cap = jsonMode.get(key) ?? 'schema';
        let mode: Mode = RANK[wanted] <= RANK[cap] ? wanted : cap;
        let res: Response | null = null;
        try {
          for (let i = 0; i < tries.length; i++) {
            const param = tries[i];
            res = await post(messages, param, mode, chatOpts.json, signal);
            if (res.ok) {
              tokenParam.set(key, param);
              break;
            }
            const body = await res.text().catch(() => '');
            // 不认 reasoning_effort：去掉再试
            if (rejectsReasoning(res.status, body) && !noReasoning.has(key)) {
              console.error(`${opts.model}: reasoning_effort not accepted, dropping it`);
              noReasoning.add(key);
              i--;
              continue;
            }
            // 不认这种输出约束：降一级，用同一个长度参数再试
            if (mode !== 'none' && rejectsFormat(res.status, body)) {
              console.error(`${opts.model}: response_format ${mode} not accepted, falling back to ${DOWNGRADE[mode]}`);
              mode = DOWNGRADE[mode];
              jsonMode.set(key, mode);
              i--;
              continue;
            }
            if (!rejectsParam(res.status, body) || i === tries.length - 1) throw new UpstreamError(res.status, body.slice(0, 300));
          }
          const { text, finish } = await readReply(res!);
          messages.push({ role: 'assistant', content: text });
          return { text, truncated: finish === 'length' };
        } catch (e) {
          if (signal.aborted) throw new UpstreamError(408, `timeout after ${Math.round(timeout / 1000)}s`);
          throw e;
        }
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

const parses = (t: string) => {
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
};

/** 整关太长被截断时的重写要求 */
const SHORTER =
  'Your JSON was cut off because it was too long. Write the WHOLE level again, complete, but SHORTER: 8–9 rounds, at most 8 beats per talk, ' +
  '3 map spots with at most 6 beats each, 4 chain cards, 5 sort cards, short "fact" texts (one sentence). It must still end with the boss round. Output the complete JSON only.';

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
export async function generateLesson(startChat: StartChat, need: string, lang: 'zh' | 'en', context = '', deadline = Infinity): Promise<GenerateResult> {
  const example = lang === 'zh' ? farm : dog;
  const chat = startChat(GENERATOR_RULES, [], { json: { name: 'need_quest_level', schema: lessonJsonSchema(true) } });
  const followUp = context
    ? `\n\nThis is a FOLLOW-UP level. The user already played one level for this need. What we learned so far:\n${context}\n\n` +
      `Design a NEW level that digs into what is still unclear or was never covered (especially anything the user says is still unclear). ` +
      `Do not re-ask questions that are already answered; build on the settled facts, budget and items instead of contradicting them. Use different scenes and, where it fits, different characters.`
    : '';
  let prompt = `Example level (a different need):\n${JSON.stringify(example)}\n\nWrite ALL text in ${LANG_NAME[lang]}. Keep the whole JSON under about 22000 characters (it gets cut off beyond that).\n\nThe user's need:\n${need}${followUp}`;

  // 重修过的（删了卡片/回合）先留着，模型一直改不好时用它
  let fallback: Salvaged | null = null;
  const done = (l: Lesson): GenerateResult => ({ ok: true, lesson: { ...l, need: l.need || need } });

  for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
    // 总时间快用完了就别再让模型改了，有修补版就用修补版
    if (attempt > 0 && Date.now() > deadline - 20_000) {
      console.error('generate: out of time budget, stop asking for fixes');
      break;
    }
    const reply = await chat.send(prompt);
    if ('refused' in reply) return fallback ? done(fallback.lesson) : { ok: false, error: 'refused' };
    // 写到输出上限被截断：残缺的 JSON 修补出来也是缺胳膊少腿，直接让它整关写短一点重来
    const cut = reply.truncated || (!/\}\s*(```\s*)?$/.test(reply.text.trim()) && !parses(extractJson(reply.text)));
    if (cut) {
      console.error(`generate attempt ${attempt + 1}: output cut off at ${reply.text.length} chars, asking for a shorter level`);
      prompt = SHORTER;
      continue;
    }
    const json = extractJson(reply.text);
    // 结构化输出里可选字段会是 null，我们的校验不认 null
    let parsed: unknown = json;
    try {
      parsed = dropNulls(JSON.parse(json));
    } catch {
      /* 不是合法 JSON：交给 parseLesson 去修 */
    }
    const r = parseLesson(parsed);
    if (r.ok) return done(r.lesson);
    console.error(`generate attempt ${attempt + 1}: invalid level (${reply.text.length} chars):`, r.errors.slice(0, 5).join(' | '));

    // 小毛病自己修：只截短文字、去掉多余项之类不影响玩法的，直接用，不再麻烦模型
    const s = r.data ? salvage(r.data) : null;
    if (s && !s.heavy) {
      console.error(`generate: auto-fixed ${s.fixes.length} issue(s): ${s.fixes.slice(0, 6).join('; ')}`);
      return done(s.lesson);
    }
    if (s) fallback = s;

    let problems: string;
    if (r.issues) problems = explainIssues(r.data, r.issues).map((e) => `- ${e}`).join('\n');
    else {
      // JSON 语法错：只说「第 6538 个字符」模型看不出是哪儿，把出错位置前后的原文带上
      const pos = Number(r.errors[0].match(/position (\d+)/)?.[1]);
      const near = Number.isFinite(pos) ? `\nThe text around the error (>>> marks the spot):\n${json.slice(Math.max(0, pos - 120), pos)}>>>${json.slice(pos, pos + 60)}\nCommon cause: a double quote inside a string; write quotes inside text as 「」 instead.` : '';
      problems = r.errors.map((e) => `- ${e}`).join('\n') + near;
    }
    prompt = `The level is invalid:\n${problems}\n\nFix exactly these problems and output the complete corrected JSON only.`;
  }
  if (fallback) {
    console.error(`generate: using repaired level, ${fallback.fixes.join('; ')}`);
    return done(fallback.lesson);
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

const DISCUSS_RULES = `You are Xiaofang (小芳), the cheerful guide of a game that helps people pin down what they really need.
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
export type ModelChoice = { start: StartChat; label: string; fallback?: { start: StartChat; label: string } };

export function chatFromConfig(c: Config): ModelChoice | null {
  const oa = c.openai ?? {};
  const an = c.anthropic ?? {};
  const wantOpenAi = c.provider === 'openai' || (c.provider !== 'anthropic' && !an.apiKey && !!oa.apiKey);
  if (wantOpenAi && oa.apiKey) {
    if (!oa.model) {
      console.error('已填 openai.apiKey，但缺少 openai.model（OpenAI 兼容接口必须指定模型名）');
      return null;
    }
    const baseUrl = oa.baseUrl || 'https://api.openai.com/v1';
    const make = (model: string) => openAiChat({ baseUrl, apiKey: oa.apiKey!, model, maxTokens: oa.maxTokens, timeoutMs: (oa.timeoutSec ?? 150) * 1000, reasoningEffort: oa.reasoningEffort });
    return {
      start: make(oa.model),
      label: `openai-compatible ${baseUrl} ${oa.model}`,
      ...(oa.fallbackModel ? { fallback: { start: make(oa.fallbackModel), label: oa.fallbackModel } } : {}),
    };
  }
  if (an.apiKey) {
    const model = an.model || 'claude-opus-5-5';
    const client = new Anthropic({ apiKey: an.apiKey, baseURL: an.baseUrl || undefined });
    const make = (m: string) => claudeChat(client, m, an.effort || 'low', (an.timeoutSec ?? 150) * 1000);
    return {
      start: make(model),
      label: `anthropic ${model}`,
      ...(an.fallbackModel ? { fallback: { start: make(an.fallbackModel), label: an.fallbackModel } } : {}),
    };
  }
  return null;
}
