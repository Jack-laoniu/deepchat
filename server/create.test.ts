import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import farm from '../src/lessons/farm.json';
import { createNeedQuestServer, WIDGET_MCP_APP, WIDGET_OPENAI } from './create';

async function connect() {
  const server = createNeedQuestServer('<html>widget</html>');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('MCP server', () => {
  it('exposes one tool whose description teaches the model the level format and the character library', async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name)).toEqual(['start_need_quest']);
    const tool = tools[0];
    expect(tool.description).toContain('wang');
    expect(tool.description).toContain('"lang"');
    expect(JSON.stringify(tool.inputSchema)).toContain('rounds');
    expect(tool._meta?.['openai/outputTemplate']).toBe(WIDGET_OPENAI);
    expect((tool._meta?.ui as { resourceUri: string }).resourceUri).toBe(WIDGET_MCP_APP);
  });

  it('serves the widget as both a ChatGPT and an MCP Apps resource', async () => {
    const c = await connect();
    const a = await c.readResource({ uri: WIDGET_OPENAI });
    const b = await c.readResource({ uri: WIDGET_MCP_APP });
    expect(a.contents[0]).toMatchObject({ mimeType: 'text/html+skybridge', text: '<html>widget</html>' });
    expect(b.contents[0]).toMatchObject({ mimeType: 'text/html;profile=mcp-app' });
  });

  it('returns the validated lesson as structured content', async () => {
    const c = await connect();
    const r = await c.callTool({ name: 'start_need_quest', arguments: { lesson: farm } });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as { lesson: { title: string } }).lesson.title).toBe('农场自动浇水');
  });

  it('returns readable errors so the model can fix the level and retry', async () => {
    const c = await connect();
    const bad = structuredClone(farm) as any;
    bad.rounds[2].beats[1].who = 'ghost';
    const r = await c.callTool({ name: 'start_need_quest', arguments: { lesson: bad } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('ghost');
  });
});
