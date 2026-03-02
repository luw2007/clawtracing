#!/bin/bash
# OpenClaw Tracing Plugin - 完整安装脚本
# 包含所有测试中发现的修复

set -e

echo "🦞 OpenClaw Tracing Plugin - 完整安装脚本"
echo "============================================"
echo ""

# 步骤 1: 编译插件
echo "📦 步骤 1: 编译插件..."
npm run build
echo "   ✅ 编译完成"
echo ""

# 步骤 2: 编译 better-sqlite3
echo "🔨 步骤 2: 编译 better-sqlite3 native bindings..."
cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3
npm run build-release > /dev/null 2>&1
cd ~/ai/openclaw-tracing
echo "   ✅ better-sqlite3 编译完成"
echo ""

# 步骤 3: 清理残留文件
echo "🧹 步骤 3: 清理残留文件..."
if [ -f ~/.openclaw/extensions/index.js ]; then
    rm -f ~/.openclaw/extensions/index.js
    echo "   ✅ 已清理残留文件"
else
    echo "   ✅ 无残留文件"
fi
echo ""

# 步骤 4: 安装插件
echo "📥 步骤 4: 安装插件到 OpenClaw..."
openclaw plugins install ~/ai/openclaw-tracing/dist/plugin/
echo "   ✅ 插件安装完成"
echo ""

# 步骤 5: 验证安装
echo "🔍 步骤 5: 验证插件安装..."
if openclaw plugins list | grep -q "openclaw-tracing"; then
    echo "   ✅ 插件已成功安装到 OpenClaw"
else
    echo "   ⚠️  插件可能未正确安装"
fi
echo ""

# 步骤 6: 启动 Tracing Server（后台）
echo "🚀 步骤 6: 启动 Tracing Server..."
npm start > /dev/null 2>&1 &
SERVER_PID=$!
sleep 2

# 验证服务器
if curl -s http://localhost:3456/health > /dev/null; then
    echo "   ✅ Tracing Server 启动成功 (PID: $SERVER_PID)"
    echo "   📊 Health check: http://localhost:3456/health"
else
    echo "   ❌ Tracing Server 启动失败"
    exit 1
fi
echo ""

echo "============================================"
echo "✅ 安装完成！"
echo ""
echo "📝 下一步操作："
echo "1. 配置 OpenClaw（编辑 ~/.openclaw/openclaw.json）："
echo "   添加到 plugins.entries:"
echo '   "openclaw-tracing": {'
echo '     "enabled": true'
echo '   }'
echo ""
echo "2. 重启 OpenClaw Gateway:"
echo "   openclaw gateway restart"
echo ""
echo "3. 查看插件日志:"
echo "   tail -f ~/.openclaw/logs/gateway.log | grep tracing"
echo ""
echo "4. 查看 Tracing Server 日志:"
echo "   tail -f .dbg/trae-debug-log-*.ndjson"
echo ""
echo "⚠️  注意：Tracing Server 正在后台运行 (PID: $SERVER_PID)"
echo "   停止服务器: kill $SERVER_PID"
