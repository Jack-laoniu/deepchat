# 被 install.sh / update.sh 引用：没有配置文件就从模板建一个（已有的绝不覆盖）
# 权限 640 root:needquest —— 只有 root 能改，服务用户 needquest 能读
CONFIG_DIR=/etc/need-quest
CONFIG_FILE=$CONFIG_DIR/config.json
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_FILE" ]; then
  install -m 0640 -o root -g needquest "$HERE/config.example.json" "$CONFIG_FILE"
  echo "==> 已创建配置文件 $CONFIG_FILE（填 key：sudo nano $CONFIG_FILE，保存即生效）"
else
  chown root:needquest "$CONFIG_FILE" && chmod 0640 "$CONFIG_FILE"
fi
chown root:needquest "$CONFIG_DIR" && chmod 0750 "$CONFIG_DIR"
