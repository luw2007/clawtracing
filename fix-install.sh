#!/bin/bash
# OpenClaw Tracing Plugin - 安装修复脚本

set -e

echo "🔧 OpenClaw Tracing Plugin 安装修复脚本"
echo "=========================================="
echo ""

# 步骤 1: 清理残留文件
echo "📁 步骤 1: 清理残留文件..."
if [ -f ~/.openclaw/extensions/index.js ]; then
    echo "   发现残留文件 ~/.openclaw/extensions/index.js"
    rm -f ~/.openclaw/extensions/index.js
    echo "   ✅ 已删除"
else
    echo "   ✅ 无需清理"
fi
echo ""

# 步骤 2: 重新编译插件
echo "🔨 步骤 2: 重新编译插件..."
npm run build
echo "   ✅ 编译完成"
echo ""

# 步骤 3: 安装插件
echo "📦 步骤 3: 安装插件..."
openclaw plugins install ~/ai/openclaw-tracing/dist/plugin/
echo "   ✅ 安装完成"
echo ""

# 步骤 4: 验证安装
echo "🔍 步骤 4: 验证安装..."
openclaw plugins list | grep openclaw-tracing
echo ""

echo "=========================================="
echo "✅ 安装修复完成！"
echo ""
echo "下一步："
echo "1. 启动 Tracing Server: npm start"
echo "2. 重启 OpenClaw Gateway: openclaw gateway restart"
echo "3. 查看插件日志: tail -f ~/.openclaw/logs/gateway.log"
