#!/usr/bin/env bash
# 只更新需求闯关本身，不碰 Caddy / 其它网站配置
#
#   cd deepchat && git pull && sudo bash deploy/update.sh
#
# key、接口地址、模型名、访问码都在配置文件里改（改完保存即生效，不用重启）：
#   sudo nano /etc/need-quest/config.json
#
# 旧的环境变量方式（/etc/need-quest.env）仍然兼容，配置文件里填了的项优先。

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR=/opt/need-quest
ENV_FILE=/etc/need-quest.env

[ "$(id -u)" = 0 ] || { echo "请用 root 运行：sudo -E bash $0"; exit 1; }
[ -f /etc/systemd/system/need-quest.service ] || { echo "还没安装过，请先运行 deploy/install.sh"; exit 1; }

install -m 0644 "$HERE/need-quest-server.mjs" "$APP_DIR/server.mjs"
echo "==> 程序已更新"

. "$HERE/ensure-config.sh"

# 兼容旧方式：命令行给了环境变量就合并进 /etc/need-quest.env（只覆盖给出的项）
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
echo "==> 测试 AI 接口：sudo bash deploy/check.sh（加一句需求可完整生成一关）"
echo "==> 完成（generate:true 表示网页上可以在线生成；needCode:true 表示需要访问码；configError 表示配置文件写错了）"
