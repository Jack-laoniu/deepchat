import { describe, expect, it } from 'vitest';
import { legalPage, markdownToHtml, providerNames } from './legal';

describe('legal pages', () => {
  it('fills placeholders from config and names the configured provider', () => {
    const html = legalPage('privacy', { openai: { apiKey: 'k', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, legal: { operator: '张三', contact: 'a@b.c' } }, 'https://q.example.com');
    expect(html).toContain('张三');
    expect(html).toContain('a@b.c');
    expect(html).toContain('DeepSeek');
    expect(html).toContain('https://q.example.com');
    expect(html).not.toMatch(/\{\{\w+\}\}/);
  });

  it('says when online generation is off', () => {
    expect(providerNames({})).toContain('暂未开启');
  });

  it('renders tables, lists and escapes html', () => {
    const html = markdownToHtml('| a | b |\n| --- | --- |\n| <x> | **y** |\n\n- one\n- two');
    expect(html).toContain('<td>&lt;x&gt;</td>');
    expect(html).toContain('<strong>y</strong>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
  });
});
