import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import widgetHtml from '../dist-widget/index.html?raw';
import { createNeedQuestServer, VERSION } from './create';

/**
 * 启动方式：
 *   node dist-server/index.js            # stdio（Claude Desktop 等本地客户端）
 *   node dist-server/index.js --http     # Streamable HTTP，监听 PORT（默认 8787）的 /mcp（ChatGPT、远程连接器）
 */

async function stdio() {
  await createNeedQuestServer(widgetHtml).connect(new StdioServerTransport());
}

function http(port: number, host: string) {
  const srv = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    // 首页直接就是可玩的游戏（独立网页模式）
    if ((path === '/' || path === '/play') && req.method === 'GET')
      return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }).end(widgetHtml);
    if (path === '/health') return void res.writeHead(200, { 'content-type': 'text/plain' }).end(`need-quest MCP ${VERSION}`);
    if (path !== '/mcp') return void res.writeHead(404).end();
    if (req.method !== 'POST') return void res.writeHead(405, { allow: 'POST' }).end();

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    } catch {
      return void res.writeHead(400).end('invalid JSON');
    }

    // 无状态模式：每个请求一套 server + transport，便于水平扩展和无服务器部署
    const server = createNeedQuestServer(widgetHtml);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500).end('internal error');
    }
  });
  srv.listen(port, host, () => console.error(`need-quest MCP ${VERSION} listening on http://${host}:${port}/mcp`));
}

if (process.argv.includes('--http')) http(Number(process.env.PORT) || 8787, process.env.HOST || '127.0.0.1');
else void stdio();
