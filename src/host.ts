/**
 * 宿主桥接。目前对接 ChatGPT Apps SDK 注入的 window.openai；
 * Claude（MCP Apps）的桥接在接 MCP 服务器时补上。
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

export const inHost = () => typeof window !== 'undefined' && typeof window.openai?.sendFollowUpMessage === 'function';

/** 宿主模型调用工具时传入的关卡（允许直接是关卡，或 { lesson }） */
export function hostLesson(): unknown {
  const out = window.openai?.toolOutput as { lesson?: unknown } | undefined;
  return out?.lesson ?? out ?? null;
}

export async function hostFollowUp(prompt: string) {
  await window.openai?.sendFollowUpMessage?.({ prompt });
}
