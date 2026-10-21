#!/usr/bin/env bash
# 关闭并移除需求闯关，不动你原有的网站配置
#   sudo bash deploy/uninstall.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "请用 root 运行：sudo bash $0"; exit 1; }

systemctl disable --now need-quest 2>/dev/null || true
rm -f /etc/systemd/system/need-quest.service

IMPORT_LINE="import /etc/caddy/need-quest.caddy"
rm -f /etc/caddy/need-quest.caddy
if [ -f /etc/caddy/Caddyfile ] && grep -qF "$IMPORT_LINE" /etc/caddy/Caddyfile; then
  grep -vF "$IMPORT_LINE" /etc/caddy/Caddyfile > /etc/caddy/Caddyfile.tmp || true
  mv /etc/caddy/Caddyfile.tmp /etc/caddy/Caddyfile
fi

# Caddyfile 里已经没有别的站点了，说明 Caddy 只是为我们装的，一起停掉
if [ ! -f /etc/caddy/Caddyfile ] || ! grep -q '[^[:space:]]' /etc/caddy/Caddyfile; then
  systemctl disable --now caddy 2>/dev/null || true
  echo "已停止 Caddy（它只服务于需求闯关）。"
else
  systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
  echo "已从 Caddy 移除需求闯关，其它站点保持不变。"
fi
systemctl daemon-reload

echo "需求闯关已关闭。程序在 /opt/need-quest，配置和 key 在 /etc/need-quest/config.json 与 /etc/need-quest.env，需要可手动删除。"
if ls /etc/caddy/Caddyfile.bak-* >/dev/null 2>&1; then
  ls /etc/caddy/Caddyfile.bak-*
  echo "↑ 安装前备份的原 Caddyfile，需要恢复：sudo cp <备份文件> /etc/caddy/Caddyfile && sudo systemctl restart caddy"
fi
echo "如果原来的网站由 nginx / apache 提供，现在可以启动它：sudo systemctl start nginx（或 apache2 / httpd）"
