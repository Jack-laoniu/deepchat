import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import example from '../deploy/config.example.json';
import { loadConfig } from './config';
import { chatFromConfig } from './generate';

describe('config file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nq-'));
  const path = join(dir, 'config.json');
  const write = (body: string, t: number) => {
    writeFileSync(path, body);
    utimesSync(path, t, t);
  };

  it('falls back to env when the file is missing', () => {
    expect(loadConfig(join(dir, 'nope.json')).fromFile).toBe(false);
  });

  it('the shipped template is valid and turns generation off', () => {
    write(JSON.stringify(example), 1000);
    const { config, error } = loadConfig(path);
    expect(error).toBeNull();
    expect(config.limits?.perIpPerHour).toBe(5);
    expect(chatFromConfig(config)).toBeNull();
  });

  it('reloads on change and keeps the last good config on a typo', () => {
    write(JSON.stringify({ ...example, openai: { apiKey: 'k', baseUrl: 'https://agy.example/v1', model: 'm' }, accessCode: '42' }), 2000);
    const a = loadConfig(path);
    expect(a.config.accessCode).toBe('42');
    expect(chatFromConfig(a.config)?.label).toContain('agy.example');
    expect(loadConfig(path).config).toBe(a.config); // 没改就不重读

    write('{ "accessCode": "43", }', 3000);
    const b = loadConfig(path);
    expect(b.error).toMatch(/格式错误/);
    expect(b.config.accessCode).toBe('42');
  });
});
