import { describe, expect, it } from 'vitest';
import { dropNulls, lessonJsonSchema } from './jsonSchema';

describe('strict json schema', () => {
  it('meets OpenAI strict-mode rules: every object closed and fully required, no unsupported keywords', () => {
    const bad: string[] = [];
    const walk = (n: any, path: string) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'object' && n.properties) {
        if (n.additionalProperties !== false) bad.push(`${path}: additionalProperties`);
        if (JSON.stringify([...n.required].sort()) !== JSON.stringify(Object.keys(n.properties).sort())) bad.push(`${path}: required`);
      }
      for (const k of ['minLength', 'maxLength', 'minItems', 'maxItems', 'default', 'pattern', 'minimum', 'maximum']) if (k in n) bad.push(`${path}: ${k}`);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    walk(lessonJsonSchema(true), '$');
    expect(bad).toEqual([]);
  });

  it('drops nulls that strict mode produces for optional fields', () => {
    expect(dropNulls({ a: 1, b: null, c: [{ d: null, e: 2 }] })).toEqual({ a: 1, c: [{ e: 2 }] });
  });
});
