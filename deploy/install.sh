#!/usr/bin/env bash
# 需求闯关 一键部署 / 更新（幂等，重复运行即更新）
#
#   sudo bash deploy/install.sh tlkgo.com
#
# 做的事：
#   1. 没有 Node 18+ 就装 Node 20（官方二进制，放在 /opt/node，不动系统包）
#   2. 没有 Caddy 就装 Caddy（单个二进制，自动申请/续期 HTTPS 证书）
#   3. 把打包好的服务器（单文件，无需 npm install）放到 /opt/need-quest，并注册 systemd 服务
#   4. Caddy 反向代理：https://<域名>/ 是游戏网页，https://<域名>/mcp 是 MCP 接口
#
# 为低配服务器设计：Node 堆内存上限 128MB，服务内存上限 256MB。
# 国内网络下载慢可以设置镜像：NODE_MIRROR=https://npmmirror.com/mirrors/node

set -euo pipefail

DOMAIN="${1:-tlkgo.com}"
APP_DIR=/opt/need-quest
NODE_DIR=/opt/node
NODE_VERSION="${NODE_VERSION:-v20.18.1}"
NODE_MIRROR="${NODE_MIRROR:-https://nodejs.org/dist}"
CADDY_VERSION="${CADDY_VERSION:-2.8.4}"
PORT=8787
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "请用 root 运行：sudo bash $0 $DOMAIN"
[ -f "$HERE/need-quest-server.mjs" ] || die "找不到 $HERE/need-quest-server.mjs"
command -v systemctl >/dev/null || die "需要 systemd"
command -v curl >/dev/null || die "需要 curl"

case "$(uname -m)" in
  x86_64 | amd64) ARCH=x64; CADDY_ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64; CADDY_ARCH=arm64 ;;
  *) die "不支持的架构 $(uname -m)" ;;
esac

# ---------- Node ----------
NODE_BIN=""
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then
  NODE_BIN="$(command -v node)"
  log "使用已有 Node $(node -v)"
elif [ -x "$NODE_DIR/bin/node" ]; then
  NODE_BIN="$NODE_DIR/bin/node"
  log "使用 $NODE_DIR 里的 Node $($NODE_BIN -v)"
else
  log "安装 Node $NODE_VERSION 到 $NODE_DIR"
  tmp="$(mktemp -d)"
  curl -fsSL "$NODE_MIRROR/$NODE_VERSION/node-$NODE_VERSION-linux-$ARCH.tar.gz" -o "$tmp/node.tgz"
  mkdir -p "$NODE_DIR"
  tar -xzf "$tmp/node.tgz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
  NODE_BIN="$NODE_DIR/bin/node"
fi

# ---------- Caddy ----------
if ! command -v caddy >/dev/null; then
  log "安装 Caddy $CADDY_VERSION"
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/caddy_${CADDY_VERSION}_linux_${CADDY_ARCH}.tar.gz" -o "$tmp/caddy.tgz"
  tar -xzf "$tmp/caddy.tgz" -C "$tmp" caddy
  install -m 0755 "$tmp/caddy" /usr/local/bin/caddy
  rm -rf "$tmp"
fi
CADDY_BIN="$(command -v caddy)"

for u in needquest caddy; do
  id "$u" >/dev/null 2>&1 || useradd --system --home-dir /var/lib/$u --create-home --shell /usr/sbin/nologin "$u" 2>/dev/null || useradd -r -m -d /var/lib/$u -s /sbin/nologin "$u"
done

# ---------- 应用 ----------
log "部署应用到 $APP_DIR"
mkdir -p "$APP_DIR"
install -m 0644 "$HERE/need-quest-server.mjs" "$APP_DIR/server.mjs"

cat > /etc/systemd/system/need-quest.service <<EOF
[Unit]
Description=Need Quest MCP server
After=network.target

[Service]
User=needquest
Environment=PORT=$PORT HOST=127.0.0.1 NODE_ENV=production
EnvironmentFile=-/etc/need-quest.env
ExecStart=$NODE_BIN --max-old-space-size=128 $APP_DIR/server.mjs --http
Restart=always
RestartSec=3
MemoryMax=256M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# ---------- Caddy 配置（不覆盖已有站点）----------
SKIP_CADDY=0
if [ -f /etc/caddy/Caddyfile ] && grep -vF "import /etc/caddy/need-quest.caddy" /etc/caddy/Caddyfile | grep -qE "(^|[[:space:],])$DOMAIN([[:space:],{]|$)"; then
  SKIP_CADDY=1
  log "Caddyfile 里已经配置了 $DOMAIN，不改动 Caddy 配置"
  rm -f /etc/caddy/need-quest.caddy
  sed -i "\#^import /etc/caddy/need-quest.caddy\$#d" /etc/caddy/Caddyfile
fi
if [ "$SKIP_CADDY" = 0 ]; then
# 我们的站点单独放在 need-quest.caddy，主 Caddyfile 里只加一行 import；改动前先备份。
mkdir -p /etc/caddy
SITES="$DOMAIN"
case "$DOMAIN" in *.*.*) ;; *) SITES="$DOMAIN, www.$DOMAIN" ;; esac   # 只有根域名才顺带 www
cat > /etc/caddy/need-quest.caddy <<EOF
# 由 need-quest 的 deploy/install.sh 生成，卸载：sudo bash deploy/uninstall.sh
$SITES {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
IMPORT_LINE="import /etc/caddy/need-quest.caddy"
if [ -f /etc/caddy/Caddyfile ]; then
  if ! grep -qF "$IMPORT_LINE" /etc/caddy/Caddyfile; then
    backup="/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)"
    cp /etc/caddy/Caddyfile "$backup"
    # 旧版本脚本生成的整份配置（只有我们自己的站点）直接换成 import；否则在末尾追加
    if grep -q "reverse_proxy 127.0.0.1:$PORT" /etc/caddy/Caddyfile && [ "$(grep -c . /etc/caddy/Caddyfile)" -le 4 ]; then
      echo "$IMPORT_LINE" > /etc/caddy/Caddyfile
    else
      printf '\n%s\n' "$IMPORT_LINE" >> /etc/caddy/Caddyfile
    fi
    log "已备份原 Caddyfile 到 $backup"
  fi
else
  echo "$IMPORT_LINE" > /etc/caddy/Caddyfile
fi
fi
CADDY_OK=1
if ! "$CADDY_BIN" validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  CADDY_OK=0
  warn "Caddy 配置校验没通过，为了不影响你已有的网站，这次不重启 Caddy。运行 caddy validate --config /etc/caddy/Caddyfile 看详情"
fi

# ---------- 在线生成的配置（key 等，可选）----------
. "$HERE/ensure-config.sh"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  (umask 077 && echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > /etc/need-quest.env)
  log "已写入 API key 到 /etc/need-quest.env（仅 root 可读）"
fi
grep -q '"apiKey": *"[^"]' "$CONFIG_FILE" || [ -f /etc/need-quest.env ] || \
  warn "还没配置 key：网页上「生成我的关卡」不可用（示例和 MCP 不受影响）。配置：sudo nano $CONFIG_FILE"

CADDY_UNIT_NEW=0
if ! systemctl cat caddy >/dev/null 2>&1; then
CADDY_UNIT_NEW=1
cat > /etc/systemd/system/caddy.service <<EOF
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
ExecStart=$CADDY_BIN run --environ --config /etc/caddy/Caddyfile
ExecReload=$CADDY_BIN reload --config /etc/caddy/Caddyfile --force
Restart=on-failure
AmbientCapabilities=CAP_NET_BIND_SERVICE
LimitNOFILE=1048576
MemoryMax=128M

[Install]
WantedBy=multi-user.target
EOF
fi

# 80/443 被别的程序（比如 nginx）占着，Caddy 就拿不到证书
for p in 80 443; do
  holder="$(ss -ltnp 2>/dev/null | awk -v p=":$p" '$4 ~ p"$" {print $6}' | grep -v caddy || true)"
  if [ -n "$holder" ]; then
    warn "端口 $p 已被占用：$holder —— 请先停掉它（例如 systemctl stop nginx），否则 HTTPS 无法启用"
  fi
done

# 防火墙放行 80/443
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http --add-service=https >/dev/null && firewall-cmd --reload >/dev/null
fi

systemctl daemon-reload
systemctl enable need-quest >/dev/null 2>&1
systemctl restart need-quest
if [ "$CADDY_OK" = 1 ]; then
  systemctl enable caddy >/dev/null 2>&1 || true
  if systemctl is-active --quiet caddy; then systemctl reload caddy; else systemctl start caddy; fi
fi

log "检查服务"
for i in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/health" || die "应用没有启动，查看日志：journalctl -u need-quest -n 50"
echo

cat <<EOF

部署完成（证书第一次申请需要几十秒）：
  游戏网页   https://$DOMAIN/
  MCP 接口   https://$DOMAIN/mcp
  健康检查   https://$DOMAIN/health

常用命令：
  journalctl -u need-quest -f     # 应用日志
  journalctl -u caddy -f          # HTTPS / 证书日志
  sudo bash deploy/install.sh $DOMAIN   # 更新（先 git pull）
EOF
