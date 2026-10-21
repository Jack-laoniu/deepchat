#!/usr/bin/env bash
# 只更新需求闯关本身，不碰 Caddy / 其它网站配置
#
#   cd deepchat && git pull && sudo bash deploy/update.sh
#
# 顺便设置在线生成用的配置（都可选，只写你给出的那几项，其余保持不变）：
#   Claude：
#     ANTHROPIC_API_KEY=...          生成关卡用的 key
#     ANTHROPIC_BASE_URL=https://... 兼容 Anthropic 接口的中转地址（不设就是官方接口）
#   OpenAI 兼容接口（比如测试期的中转服务）：
#     OPENAI_API_KEY=...             它给的 key
#     OPENAI_BASE_URL=https://.../v1 它给的接口地址（通常以 /v1 结尾）
#     NEED_QUEST_PROVIDER=openai     两种 key 都配了时用它指定走哪个
#   NEED_QUEST_MODEL=...             模型名（Claude 默认 claude-opus-5-5；OpenAI 兼容接口必填）
#   NEED_QUEST_ACCESS_CODE=...     测试访问码：设置后网页上要填对访问码才能生成
# 例：
#   OPENAI_API_KEY=sk-xxx OPENAI_BASE_URL=https://example.com/v1 NEED_QUEST_MODEL=模型名 NEED_QUEST_ACCESS_CODE=1234 sudo -E bash deploy/update.sh

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR=/opt/need-quest
ENV_FILE=/etc/need-quest.env

[ "$(id -u)" = 0 ] || { echo "请用 root 运行：sudo -E bash $0"; exit 1; }
[ -f /etc/systemd/system/need-quest.service ] || { echo "还没安装过，请先运行 deploy/install.sh"; exit 1; }

install -m 0644 "$HERE/need-quest-server.mjs" "$APP_DIR/server.mjs"
echo "==> 程序已更新"

# 合并环境变量：只覆盖本次给出的项
touch "$ENV_FILE" && chmod 600 "$ENV_FILE"
for k in ANTHROPIC_API_KEY ANTHROPIC_BASE_URL OPENAI_API_KEY OPENAI_BASE_URL NEED_QUEST_PROVIDER NEED_QUEST_MODEL NEED_QUEST_MAX_TOKENS NEED_QUEST_ACCESS_CODE NEED_QUEST_EFFORT NEED_QUEST_IP_LIMIT NEED_QUEST_DAILY_LIMIT; do
  v="${!k:-}"
  [ -n "$v" ] || continue
  grep -v "^$k=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  echo "$k=$v" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE" && chmod 600 "$ENV_FILE"
  echo "==> 已设置 $k"
done

# 老版本的服务文件可能没读环境变量文件，补上
if ! grep -q "EnvironmentFile=" /etc/systemd/system/need-quest.service; then
  sed -i "s#^ExecStart=#EnvironmentFile=-$ENV_FILE\nExecStart=#" /etc/systemd/system/need-quest.service
  systemctl daemon-reload
fi

systemctl restart need-quest
for _ in $(seq 1 20); do
  curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS http://127.0.0.1:8787/health && echo
curl -fsS http://127.0.0.1:8787/api/config && echo
echo "==> 完成（generate:true 表示网页上可以在线生成；needCode:true 表示需要访问码）"
