import Anthropic from '@anthropic-ai/sdk';
import { GENERATOR_RULES } from '../src/lesson/prompt';
import { parseLesson, type Lesson } from '../src/lesson/schema';
import dog from '../src/lessons/dog.json';
import farm from '../src/lessons/farm.json';

/**
 * 网页版：用户输入一句需求，服务端调用 Claude 生成关卡。
 * 生成后用关卡 schema 校验；不合格就把错误发回给模型修改，最多 MAX_FIX 轮。
 */

const MODEL = process.env.NEED_QUEST_MODEL || 'claude-opus-5-5';
const EFFORT = (process.env.NEED_QUEST_EFFORT || 'low') as 'low' | 'medium' | 'high';
const MAX_FIX = 2;

export type GenerateResult = { ok: true; lesson: Lesson } | { ok: false; error: string };

const LANG_NAME = { zh: '简体中文 (lang "zh", currency CNY unless the need says otherwise)', en: 'English (lang "en", currency USD unless the need says otherwise)' };

/** 从回复里抠出 JSON：容忍代码块和前后多余文字 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export async function generateLesson(client: Anthropic, need: string, lang: 'zh' | 'en'): Promise<GenerateResult> {
  const example = lang === 'zh' ? farm : dog;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: `Example level (a different need):\n${JSON.stringify(example)}\n\nWrite ALL text in ${LANG_NAME[lang]}.\n\nThe user's need:\n${need}`,
    },
  ];

  for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
    const msg = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        system: GENERATOR_RULES,
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages,
      })
      .finalMessage();

    if (msg.stop_reason === 'refusal') return { ok: false, error: 'refused' };
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const r = parseLesson(extractJson(text));
    if (r.ok) return { ok: true, lesson: { ...r.lesson, need: r.lesson.need || need } };

    // 把错误交回给模型改；保留它上一轮的完整回复（对话只追加不改写）
    messages.push({ role: 'assistant', content: msg.content });
    messages.push({
      role: 'user',
      content: `The level is invalid:\n${r.errors.slice(0, 30).map((e) => `- ${e}`).join('\n')}\n\nFix exactly these problems and output the complete corrected JSON only.`,
    });
  }
  return { ok: false, error: 'invalid' };
}
