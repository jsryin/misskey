#!/bin/bash
# =============================================
# Mac 开发一键部署脚本 - rsync 推送
# 使用方法：在项目目录下执行 ./deploy.sh
# =============================================

echo "🚀 开始同步到远程服务器..."

rsync -avzP --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='*.log' \
  --exclude='.env*' \
  --exclude='__pycache__/' \
  ./ \
  dockerjvx@64.90.15.32:/work/front/misskey

echo "✅ 同步完成！"

# 可选：同步后在服务器上执行命令（重启服务等）
# ssh username@your.server.ip "cd /path/to/remote/project && npm install && pm2 restart all"