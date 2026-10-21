import { zodToJsonSchema } from 'zod-to-json-schema';
import { LessonShape } from '../src/lesson/schema';

/**
 * 给 OpenAI 兼容接口的「结构化输出」用的关卡 JSON Schema。
 *
 * strict 模式下模型只能输出符合 schema 的 JSON（不会缺字段、类型不会错），但它有几条硬要求：
 * - 每个对象 additionalProperties: false，所有字段都要在 required 里（可选字段改成「可以是 null」）
 * - 不支持长度/数量/数值范围这类关键字（minLength、maxItems、minimum…），留着会直接报错
 * 文字宽度、数量上限这些交给我们自己的校验和自动修补（salvage）。
 */

type S = Record<string, unknown>;
const UNSUPPORTED = ['default', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', '$schema', 'errorMessage'];

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== 'object') return node;
  const s: S = {};
  for (const [k, v] of Object.entries(node as S)) if (!UNSUPPORTED.includes(k)) s[k] = strictify(v);
  // const → 单值 enum（更多实现支持）
  if ('const' in s) {
    s.enum = [s.const];
    delete s.const;
  }
  if (s.type === 'object' && s.properties && typeof s.properties === 'object') {
    const props = s.properties as S;
    const required = new Set((s.required as string[] | undefined) ?? []);
    for (const key of Object.keys(props)) if (!required.has(key)) props[key] = { anyOf: [props[key], { type: 'null' }] };
    s.required = Object.keys(props);
    s.additionalProperties = false;
  }
  return s;
}

let cache: { strict: S; loose: S } | null = null;

export function lessonJsonSchema(strict: boolean): S {
  if (!cache) {
    const base = zodToJsonSchema(LessonShape, { $refStrategy: 'none', effectStrategy: 'input' }) as S;
    delete base.$schema;
    cache = { strict: strictify(base) as S, loose: base };
  }
  return strict ? cache.strict : cache.loose;
}

/** strict 模式里可选字段会给 null；我们的校验不认 null，先去掉 */
export function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (!v || typeof v !== 'object') return v;
  const out: S = {};
  for (const [k, x] of Object.entries(v as S)) if (x !== null) out[k] = dropNulls(x);
  return out;
}
