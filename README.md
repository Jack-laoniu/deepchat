# Need Quest · 需求闯关

一句模糊需求 → 一局多邻国式小游戏 → 一份理清楚的方案。可以作为 MCP 应用接入 ChatGPT 和 Claude。

不让用户填表，而是让他在游戏里自然地说出真实情况和真实意图：

- **小故事**（像多邻国的听力故事）：固定角色库里的人物在小舞台上演出这个需求在现实里会踩的坑，说话的人有口型、表情和手势，台词逐句朗读，中途停下来问「你家是哪种？」
- **聊天 / 角色扮演**：向导乐乐、老板、家人跟你视频聊天；可以点现成的回答，也可以打字或语音用自己的话说，关键词会影响后面的剧情，原话进交付物
- **地图任务**（像多邻国的冒险）：自己的小人走到不同地点，NPC 会在附近溜达、转身、挥手；每个人问清一个方面
- **点选、滑卡、预算滑杆、拖工具修坑、Boss**：每个选择都会改变方案和价格，选错会「炸」出坑，赌一把可能翻车

通关后得到方案清单，以及一份给 AI 的上下文，分开写「用户原话 / 已确认 / 待核实 / 接受的风险 / 试过不行的做法」。在 ChatGPT / Claude 里会直接发回对话，让模型接着出详细方案。

## 角色库

`src/chars/library.ts` 里有 9 个固定角色（向导乐乐、过来人老王、商家钱老板、管钱的美姐、发烧友阿哲、奶奶、陆爷爷、龚工、小孩豆豆），每个人有固定的长相、性格和声音，所有关卡复用。大模型生成关卡时只挑角色并给一个身份（`{"id":"wang","as":"爸爸"}`）。角色是 `src/chars/Character.tsx` 里的矢量骨架，支持眨眼、口型、8 种表情、手势、挥手、跳、走路。打开 `#gallery` 可以看全部角色。

## 多语言

界面、朗读、语音输入、币种、交付物都跟随关卡的 `lang`（zh / en / ja / es）和 `currency`。字数上限按显示宽度算（汉字 1、拉丁字母约 0.55），各语言公平。示例里有中文关卡和一个英文关卡。

## 开发

```bash
npm install
npm run dev            # 本地玩（独立网页）
npm test               # 规则 + MCP 服务器测试
npm run build:server   # 构建单文件游戏界面 + MCP 服务器
```

## MCP 服务器

```bash
npm run build:server
npm start              # Streamable HTTP：http://localhost:8787/mcp（ChatGPT 开发者模式 / 远程连接器）
npm run start:stdio    # stdio（Claude Desktop 等本地客户端）
```

Claude Desktop 配置示例：

```json
{ "mcpServers": { "need-quest": { "command": "node", "args": ["/path/to/deepchat/dist-server/index.js"] } } }
```

服务器提供：

- 工具 `start_need_quest`：描述里就是关卡生成规则和角色库，宿主大模型据此写出关卡 JSON 作为参数调用；服务端校验，失败时返回可读的错误让模型改了重试，成功时把关卡作为 `structuredContent` 返回
- 界面资源 `ui://widget/need-quest.html`（ChatGPT Apps，`text/html+skybridge`）和 `ui://need-quest/app.html`（MCP Apps，`text/html;profile=mcp-app`），同一份单文件 HTML；CSP 放行 Google 字体与 Noto 表情

游戏界面里的宿主桥接见 `src/host.ts`。

## 部署到自己的服务器

服务器只需要能联网、有 systemd；不需要 npm，也不在服务器上编译（`deploy/need-quest-server.mjs` 是打包好的单文件，常驻内存约 120MB）。域名先解析到服务器，然后：

```bash
git clone https://github.com/Jack-laoniu/deepchat.git && cd deepchat
ANTHROPIC_API_KEY=sk-ant-... sudo -E bash deploy/install.sh quest.example.com
```

- 脚本按需安装 Node 20 和 Caddy（自动 HTTPS），注册 systemd 服务
- **不会覆盖已有网站**：站点写在 `/etc/caddy/need-quest.caddy`，原 Caddyfile 只追加一行 `import`，改之前先备份为 `Caddyfile.bak-时间`
- `ANTHROPIC_API_KEY` 可选，写入 `/etc/need-quest.env`（仅 root 可读）；有了它，网页上输入需求就能直接生成关卡（默认 `claude-opus-5-5`，可用 `NEED_QUEST_MODEL` 改）。每个 IP 每小时 5 次、每天总共 200 次、同时最多 3 个，可用 `NEED_QUEST_IP_LIMIT` / `NEED_QUEST_DAILY_LIMIT` / `NEED_QUEST_CONCURRENCY` 调整
- 完成后：`https://<域名>/` 是游戏网页，`https://<域名>/mcp` 是 MCP 接口

更新：`git pull && sudo bash deploy/update.sh`（只换程序、不碰 Caddy；可顺带用环境变量设置 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `NEED_QUEST_MODEL` / `NEED_QUEST_ACCESS_CODE`，见脚本开头说明）。关闭并移除：`sudo bash deploy/uninstall.sh`（不动其它站点）。修改代码后用 `npm run build:deploy` 重新生成打包文件再提交。

## 目录

- `src/lesson/` 关卡格式、规则、交付物、生成提示词（与界面无关，服务端复用）
- `src/chars/` 角色库与矢量角色
- `src/rounds/` 玩法：Talk（故事/聊天）、Map（地图）、Pick、Swipe、Slider、Repair（修坑/Boss）
- `src/lessons/` 示例关卡
- `server/` MCP 服务器
