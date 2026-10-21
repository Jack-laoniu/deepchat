#!/usr/bin/env bash
# 在服务器上直接测试 AI 接口（用服务的身份和配置文件）：
#   sudo bash deploy/check.sh              # 看接口通不通
#   sudo bash deploy/check.sh 我想养只猫     # 完整生成一关，打印每一轮结果
set -euo pipefail
NODE=$(grep -oP '^ExecStart=\K\S+' /etc/systemd/system/need-quest.service)
ENV_FILE=/etc/need-quest.env
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
exec sudo -E -u needquest "$NODE" /opt/need-quest/server.mjs --check "$@"
