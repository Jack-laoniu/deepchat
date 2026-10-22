import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import farm from '../src/lessons/farm.json';
import { fromEnv } from './config';
import { chatFromConfig, claudeChat, discussNeed, extractJson, generateLesson, openAiChat, reactLine } from './generate';

/** 假的 Claude 客户端：按顺序返回给定的回复，记录每次请求 */
function fakeClient(replies: string[]) {
  const calls: any[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: any) {
          calls.push(structuredClone(params));
          const text = replies[calls.length - 1] ?? '';
          return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client: claudeChat(client), calls };
}

describe('generateLesson', () => {
  it('feeds validation errors back and accepts the corrected level', async () => {
    const broken = structuredClone(farm) as any;
    broken.rounds[0].beats[0].who = 'ghost';
    const { client, calls } = fakeClient([JSON.stringify(broken), '```json\n' + JSON.stringify(farm) + '\n```']);
    const r = await generateLesson(client, '我想给农场搞个自动洒水器', 'zh');
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const retry = calls[1].messages.at(-1).content as string;
    expect(retry).toContain('ghost');
    expect(calls[0].model).toBe('claude-opus-5-5');
    expect(calls[0].fallbacks).toBe('default');
  });

  it('gives up after a few failed fixes', async () => {
    const { client, calls } = fakeClient(['not json', 'still not', 'nope']);
    const r = await generateLesson(client, 'x', 'en');
    expect(r).toEqual({ ok: false, error: 'invalid' });
    expect(calls).toHaveLength(3);
  });

  it('asks for the user language', async () => {
    const { client, calls } = fakeClient([JSON.stringify(farm)]);
    await generateLesson(client, 'grow veggies', 'en');
    expect(calls[0].messages[0].content).toContain('English');
  });
});

/** 把文字切成 SSE 片段，模拟 OpenAI 兼容接口的流式回复 */
function sse(text: string) {
  const chunks = text.match(/[\s\S]{1,50}/g) ?? [];
  const body = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('OpenAI-compatible provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('streams the reply, keeps history and retries with errors', async () => {
    const broken = structuredClone(farm) as any;
    broken.rounds[0].beats[0].who = 'ghost';
    const bodies: any[] = [];
    const replies = [JSON.stringify(broken), JSON.stringify(farm)];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      bodies.push({ url, auth: (init.headers as Record<string, string>).authorization, body: JSON.parse(init.body as string) });
      return sse(replies[bodies.length - 1]);
    });
    const start = openAiChat({ baseUrl: 'https://agy.example/v1/', apiKey: 'k', model: 'some-model' });
    const r = await generateLesson(start, '农场浇水', 'zh');
    expect(r.ok).toBe(true);
    expect(bodies[0].url).toBe('https://agy.example/v1/chat/completions');
    expect(bodies[0].auth).toBe('Bearer k');
    expect(bodies[0].body).toMatchObject({ model: 'some-model', stream: true });
    const second = bodies[1].body.messages;
    expect(second.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(second[3].content).toContain('ghost');
  });

  it('switches to max_completion_tokens when the model rejects max_tokens, and remembers it', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      if ('max_tokens' in body)
        return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } }), { status: 400 });
      return sse('hello');
    });
    const start = openAiChat({ baseUrl: 'https://api.example/v1', apiKey: 'k', model: 'gpt-x' });
    expect(await start('sys').send('hi')).toEqual({ text: 'hello' });
    expect(await start('sys').send('again')).toEqual({ text: 'hello' });
    expect(bodies.map((b) => ('max_tokens' in b ? 'max_tokens' : 'max_completion_tokens'))).toEqual(['max_tokens', 'max_completion_tokens', 'max_completion_tokens']);
  });

  it('discusses the plan with prior turns as history', async () => {
    let sent: any;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return sse('  Try a used one first. What size is your balcony?  ');
    });
    const start = openAiChat({ baseUrl: 'https://agy.example/v1', apiKey: 'k', model: 'm' });
    const reply = await discussNeed(start, {
      plan: '# PLAN',
      history: [{ role: 'user', content: 'cheaper?' }, { role: 'assistant', content: 'yes' }],
      message: 'what first?',
      lang: 'en',
    });
    expect(reply).toBe('Try a used one first. What size is your balcony?');
    expect(sent.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(sent.messages[0].content).toContain('# PLAN');
  });

  it('passes the previous round to a follow-up level', async () => {
    let prompt = '';
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      prompt = JSON.parse(init.body as string).messages[1].content;
      return sse(JSON.stringify(farm));
    });
    const start = openAiChat({ baseUrl: 'https://agy.example/v1', apiKey: 'k', model: 'm' });
    const r = await generateLesson(start, '农场浇水', 'zh', '## 方案\n预算 3000\n## 还没说清楚\n水源在哪');
    expect(r.ok).toBe(true);
    expect(prompt).toContain('FOLLOW-UP');
    expect(prompt).toContain('水源在哪');
  });

  it('lets the asking character react to free text in persona', async () => {
    let sys = '';
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      sys = JSON.parse(init.body as string).messages[0].content;
      return sse('```json\n{"say": "A husky in a studio? Brave. Who walks it at 7am?", "mood": "worried"}\n```');
    });
    const start = openAiChat({ baseUrl: 'https://agy.example/v1', apiKey: 'k', model: 'm' });
    const r = await reactLine(start, { need: 'get a dog', who: 'wang', q: 'Why a dog?', options: ['I live alone'], text: 'I want a husky in my studio', recent: [], lang: 'en' });
    expect(r).toEqual({ say: 'A husky in a studio? Brave. Who walks it at 7am?', mood: 'worried' });
    expect(sys).toContain('Why a dog?');
    expect(sys).toMatch(/Personality: .+/);
  });

  it('asks for JSON mode when generating, and drops it for relays that reject it', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      if (body.response_format) return new Response('{"error":"response_format is not supported"}', { status: 400 });
      return sse(JSON.stringify(farm));
    });
    const start = openAiChat({ baseUrl: 'https://relay.example/v1', apiKey: 'k', model: 'json-less' });
    expect((await generateLesson(start, '农场浇水', 'zh')).ok).toBe(true);
    // 先要 strict schema，不行降成任意 JSON，还不行就不加约束
    expect(bodies.map((b) => b.response_format?.type)).toEqual(['json_schema', 'json_object', undefined]);
    expect(bodies[0].response_format.json_schema.strict).toBe(true);
    await generateLesson(start, '再来', 'zh');
    expect(bodies.at(-1).response_format).toBeUndefined(); // 记住了
  });

  it('shows the model where its JSON broke', async () => {
    const prompts: string[] = [];
    const good = JSON.stringify(farm);
    const at = good.indexOf('"title"');
    const broken = good.slice(0, at) + '{"k" 1}' + good.slice(at); // 修不好、且报错带位置
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      prompts.push(JSON.parse(init.body as string).messages.at(-1).content);
      return sse(prompts.length === 1 ? broken : good);
    });
    const start = openAiChat({ baseUrl: 'https://relay.example/v1', apiKey: 'k', model: 'm2' });
    expect((await generateLesson(start, '农场浇水', 'zh')).ok).toBe(true);
    expect(prompts[1]).toContain('>>>');
  });

  it('auto-fixes small mistakes on the first reply instead of asking the model again', async () => {
    const l = structuredClone(farm) as any;
    l.rounds.find((r: any) => r.type === 'fix').problem = '一到夏天下午地里就特别特别干旱，水根本不够用';
    let calls = 0;
    vi.stubGlobal('fetch', async () => (calls++, sse(JSON.stringify(l))));
    const start = openAiChat({ baseUrl: 'https://relay.example/v1', apiKey: 'k', model: 'm3' });
    expect((await generateLesson(start, '农场浇水', 'zh')).ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('falls back to a repaired level when the model keeps failing', async () => {
    const l = structuredClone(farm) as any;
    delete l.rounds.find((r: any) => r.type === 'chain').cards[1].right;
    let calls = 0;
    vi.stubGlobal('fetch', async () => (calls++, sse(JSON.stringify(l))));
    const start = openAiChat({ baseUrl: 'https://relay.example/v1', apiKey: 'k', model: 'm4' });
    const r = await generateLesson(start, '农场浇水', 'zh');
    expect(r.ok).toBe(true);
    expect(calls).toBe(3); // 先让模型改，改不好才用删掉一张卡的版本
  });

  it('keeps strict schema mode when supported and strips nulls from the reply', async () => {
    const withNulls = JSON.parse(JSON.stringify(farm), (_k, v) => v);
    withNulls.secret = null; // strict 模式下可选字段会是 null
    const bodies: any[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return sse(JSON.stringify(withNulls));
    });
    const start = openAiChat({ baseUrl: 'https://api.example/v1', apiKey: 'k', model: 'strict-ok' });
    expect((await generateLesson(start, '农场浇水', 'zh')).ok).toBe(true);
    expect(bodies[0].response_format.type).toBe('json_schema');
  });

  it('gives up on a call that hangs past the timeout', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const start = openAiChat({ baseUrl: 'https://slow.example/v1', apiKey: 'k', model: 'slow', timeoutMs: 50 });
    await expect(start('sys').send('hi')).rejects.toMatchObject({ status: 408 });
  });

  it('surfaces upstream HTTP errors', async () => {
    vi.stubGlobal('fetch', async () => new Response('quota exceeded', { status: 429 }));
    const start = openAiChat({ baseUrl: 'https://agy.example/v1', apiKey: 'k', model: 'm' });
    await expect(generateLesson(start, 'x', 'en')).rejects.toMatchObject({ status: 429 });
  });

  it('picks the provider from env', () => {
    expect(chatFromConfig(fromEnv({}))).toBeNull();
    expect(chatFromConfig(fromEnv({ OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'https://a/v1', NEED_QUEST_MODEL: 'm' }))?.label).toContain('openai-compatible');
    expect(chatFromConfig(fromEnv({ OPENAI_API_KEY: 'k' }))).toBeNull(); // 必须给模型名
    expect(chatFromConfig(fromEnv({ ANTHROPIC_API_KEY: 'a' }))?.label).toContain('anthropic');
  });

  it('extracts JSON from chatty replies', () => {
    expect(extractJson('Sure! Here it is:\n```json\n{"a":1}\n```\nEnjoy')).toBe('{"a":1}');
    expect(extractJson('blah {"a":{"b":2}} blah')).toBe('{"a":{"b":2}}');
  });
});
