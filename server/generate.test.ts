import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import farm from '../src/lessons/farm.json';
import { fromEnv } from './config';
import { chatFromConfig, claudeChat, extractJson, generateLesson, openAiChat } from './generate';

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
