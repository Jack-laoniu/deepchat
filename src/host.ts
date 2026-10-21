/**
 * 宿主桥接：把同一个游戏嵌进不同的大模型应用里。
 *
 * - ChatGPT Apps：宿主注入 window.openai，toolOutput 是工具返回的 structuredContent；
 *   数据晚到时会触发 openai:set_globals 事件；sendFollowUpMessage 把结果发回对话。
 * - MCP Apps（Claude 等）：iframe 与宿主通过 postMessage 上的 JSON-RPC 通信；
 *   宿主用 ui/notifications/tool-result 推送工具结果，ui/message 把结果发回对话。
 *   按 MCP Apps 扩展规范实现，尚未在真实宿主里联调。
 * - 独立网页：都没有时，什么也不做。
 */

interface OpenAiBridge {
  toolOutput?: unknown;
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>;
}

declare global {
  interface Window {
    openai?: OpenAiBridge;
  }
}

type Listener = (lesson: unknown) => void;
const listeners = new Set<Listener>();
let latest: unknown = null;

const lessonOf = (out: unknown): unknown => {
  if (!out || typeof out !== 'object') return null;
  const o = out as { lesson?: unknown; structuredContent?: { lesson?: unknown } };
  return o.lesson ?? o.structuredContent?.lesson ?? null;
};

function publish(lesson: unknown) {
  if (!lesson || lesson === latest) return;
  latest = lesson;
  listeners.forEach((fn) => fn(lesson));
}

// ---------------- MCP Apps：postMessage JSON-RPC ----------------

const inIframe = typeof window !== 'undefined' && window.parent !== window;
let rpcId = 0;
const pending = new Map<number, (v: unknown) => void>();

function rpc(method: string, params: unknown): Promise<unknown> {
  const id = ++rpcId;
  window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
  return new Promise((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => pending.delete(id) && resolve(null), 10000);
  });
}

let mcpApp = false;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { jsonrpc?: string; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown };
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.id !== undefined && pending.has(m.id)) {
      pending.get(m.id)!(m.result ?? null);
      pending.delete(m.id);
      return;
    }
    if (m.method === 'ui/notifications/tool-result') publish(lessonOf(m.params));
    else if (m.method === 'ui/notifications/tool-input') publish(lessonOf((m.params as { arguments?: unknown })?.arguments));
  });

  // ChatGPT 的数据可能在页面加载后才到
  window.addEventListener('openai:set_globals', () => publish(lessonOf(window.openai?.toolOutput)));

  if (inIframe && !window.openai) {
    void rpc('ui/initialize', { protocolVersion: '2025-06-18', appInfo: { name: 'need-quest', version: '0.2.0' }, appCapabilities: {} }).then((r) => {
      if (!r) return;
      mcpApp = true;
      window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*');
    });
  }
}

/** 在大模型应用里运行（可以把结果直接发回对话） */
export const inHost = () => typeof window !== 'undefined' && (typeof window.openai?.sendFollowUpMessage === 'function' || mcpApp);

/** 订阅宿主传来的关卡；已经有的会立即回调一次 */
export function onHostLesson(fn: Listener): () => void {
  listeners.add(fn);
  const now = lessonOf(window.openai?.toolOutput) ?? latest;
  if (now) fn(now);
  return () => listeners.delete(fn);
}

/** 把通关结果作为用户消息发回对话，让宿主模型接着出详细方案 */
export async function hostFollowUp(prompt: string) {
  if (typeof window.openai?.sendFollowUpMessage === 'function') return window.openai.sendFollowUpMessage({ prompt });
  if (mcpApp) await rpc('ui/message', { role: 'user', content: [{ type: 'text', text: prompt }] });
}
