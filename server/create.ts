import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GENERATOR_RULES } from '../src/lesson/prompt';
import { LessonShape, parseLesson } from '../src/lesson/schema';

/**
 * 需求闯关 MCP 服务器。
 *
 * 宿主大模型就是关卡编译器：它按工具描述（生成规则 + 角色库）写出关卡 JSON 作为参数调用工具，
 * 服务端校验后把关卡作为 structuredContent 返回，宿主用注册的 UI 资源把游戏渲染出来。
 * 同一份 HTML 以两种格式注册：
 * - ChatGPT Apps：text/html+skybridge，工具 _meta["openai/outputTemplate"] 指向它
 * - MCP Apps（Claude 等）：text/html;profile=mcp-app，工具 _meta.ui.resourceUri 指向它
 */

export const VERSION = '0.2.0';
export const WIDGET_OPENAI = 'ui://widget/need-quest.html';
export const WIDGET_MCP_APP = 'ui://need-quest/app.html';

/** 插画（Noto 表情）和字体要从 Google 加载，需要在 CSP 里放行 */
const DOMAINS = ['https://fonts.gstatic.com', 'https://fonts.googleapis.com'];

const TOOL_DESCRIPTION = `Start an interactive "Need Quest" game that helps the user figure out what they actually need.

Use this when the user asks for help deciding or planning something (buy, build, plan, set up, organize, choose…) and the key details — situation, budget, constraints, preferences — are still unclear, or when they ask to play Need Quest. Do not use it for factual questions, quick tasks, or when the user has already given enough detail to answer directly. Instead of asking a list of questions, write a level as described below and pass it as "lesson". The user plays it (stories, chats with characters, a walkable map, quick choices, a finale) and the game sends back a structured summary of their real situation, own words, budget and accepted risks — use that to give the detailed plan.

If the user already said relevant things earlier in this conversation (for example an earlier Need Quest summary: they chose a plug-in hybrid, have no fixed parking spot), build them into the level: characters mention them naturally (「你刚才说想买插混？」), do not re-ask what is known, and only confirm what may have changed. Include only what is needed for this need; never include sensitive personal data (ID numbers, health, finances beyond a budget range, passwords) or unrelated conversation content.

The game finds out what the user NEEDS; it does not deliver the solution. After it returns the summary, you give the detailed plan.

If the tool returns validation errors, fix exactly those fields and call it again.

${GENERATOR_RULES}`;

/** origin：对外的网址（如 https://quest.example.com），上架 ChatGPT 时作为组件的专属域名 */
export function createNeedQuestServer(widgetHtml: string, origin?: string): McpServer {
  const server = new McpServer({ name: 'need-quest', version: VERSION });

  server.registerResource(
    'need-quest-widget',
    WIDGET_OPENAI,
    { title: 'Need Quest', description: 'Need Quest game UI', mimeType: 'text/html+skybridge' },
    async () => ({
      contents: [
        {
          uri: WIDGET_OPENAI,
          mimeType: 'text/html+skybridge',
          text: widgetHtml,
          _meta: {
            'openai/widgetDescription': 'An interactive mini game that turns a vague need into a clear, structured need.',
            'openai/widgetPrefersBorder': true,
            'openai/widgetCSP': { connect_domains: DOMAINS, resource_domains: DOMAINS },
            ...(origin ? { 'openai/widgetDomain': origin } : {}),
          },
        },
      ],
    }),
  );

  server.registerResource(
    'need-quest-app',
    WIDGET_MCP_APP,
    { title: 'Need Quest', description: 'Need Quest game UI (MCP Apps)', mimeType: 'text/html;profile=mcp-app' },
    async () => ({
      contents: [
        {
          uri: WIDGET_MCP_APP,
          mimeType: 'text/html;profile=mcp-app',
          text: widgetHtml,
          _meta: { ui: { csp: { connectDomains: DOMAINS, resourceDomains: DOMAINS }, prefersBorder: true } },
        },
      ],
    }),
  );

  server.registerTool(
    'start_need_quest',
    {
      title: 'Start Need Quest',
      description: TOOL_DESCRIPTION,
      inputSchema: { lesson: LessonShape },
      annotations: { title: 'Start Need Quest', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: {
        'openai/outputTemplate': WIDGET_OPENAI,
        'openai/toolInvocation/invoking': 'Building your quest…',
        'openai/toolInvocation/invoked': 'Quest ready',
        'openai/widgetAccessible': true,
        ui: { resourceUri: WIDGET_MCP_APP },
      },
    },
    async ({ lesson }) => {
      const r = parseLesson(lesson);
      if (!r.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: `The level is invalid. Fix these fields and call start_need_quest again:\n${r.errors.map((e) => `- ${e}`).join('\n')}` }],
        };
      }
      const l = r.lesson;
      return {
        content: [
          {
            type: 'text',
            text: `Quest "${l.title}" started (${l.rounds.length} rounds). The user is playing now; when they finish, the game sends their summary as a new message. Do not answer the need until then.`,
          },
        ],
        structuredContent: { lesson: l },
      };
    },
  );

  return server;
}
