.PHONY: start build dev test clean web web-build plugin plugin-sync plugin-watch

# 插件目录配置
PLUGIN_SRC_DIR = dist/plugin
PLUGIN_INSTALL_DIR = $(HOME)/.openclaw/extensions/openclaw-tracing

export TRACING_DEBUG ?= 1

# ==================== 主要命令 ====================

start: build
	@echo "启动 openclaw-tracing 服务..."
	TRACING_DEBUG=$(TRACING_DEBUG) node dist/server/index.js

build:
	@echo "编译 TypeScript..."
	npm run build

dev:
	@echo "启动开发模式（监听文件变化）..."
	npm run dev

test:
	@echo "运行测试..."
	npm run test

clean:
	@echo "清理构建产物..."
	rm -rf dist

# ==================== 插件开发命令 ====================

# 仅构建插件（不含 server/cli）
plugin:
	@echo "构建插件..."
	npm run build:plugin
	@echo "✓ 插件构建完成: $(PLUGIN_SRC_DIR)"

# 同步插件到 openclaw 安装目录（不重新构建）
plugin-sync:
	@echo "同步插件到 $(PLUGIN_INSTALL_DIR)..."
	@mkdir -p $(PLUGIN_INSTALL_DIR)
	@cp -r $(PLUGIN_SRC_DIR)/* $(PLUGIN_INSTALL_DIR)/
	@echo "✓ 插件已同步到 $(PLUGIN_INSTALL_DIR)"
	@echo ""
	@echo "已复制文件:"
	@ls -la $(PLUGIN_INSTALL_DIR)/*.js 2>/dev/null | awk '{print "  " $$NF}'

# 构建并同步插件（开发快捷命令）
p: plugin plugin-sync
	@echo ""
	@echo "✓ 插件开发流程完成！"
	@echo "  提示: 重新启动 openclaw 会话以加载新插件"

# 监听插件源文件变化并自动同步
plugin-watch:
	@echo "监听插件源文件变化..."
	@echo "按 Ctrl+C 停止"
	@while true; do \
		fswatch -1 src/plugin/*.ts src/types/*.ts && \
		echo "" && \
		echo "检测到文件变化，重新构建..." && \
		$(MAKE) p; \
	done

# ==================== Web UI 命令 ====================

web:
	@echo "启动 Web UI 开发服务器..."
	cd web && npm run dev

web-build:
	@echo "构建 Web UI..."
	cd web && npm run build

# ==================== 帮助信息 ====================

help:
	@echo "openclaw-tracing Makefile 命令:"
	@echo ""
	@echo "  主要命令:"
	@echo "    make build        - 构建整个项目"
	@echo "    make start        - 构建并启动服务"
	@echo "    make dev          - 开发模式（监听文件变化）"
	@echo "    make test         - 运行测试"
	@echo "    make clean        - 清理构建产物"
	@echo ""
	@echo "  插件开发:"
	@echo "    make p            - 【推荐】构建插件并同步到 openclaw"
	@echo "    make plugin       - 仅构建插件"
	@echo "    make plugin-sync  - 仅同步插件（不重新构建）"
	@echo "    make plugin-watch - 监听变化自动构建同步（需要 fswatch）"
	@echo ""
	@echo "  Web UI:"
	@echo "    make web          - 启动 Web UI 开发服务器"
	@echo "    make web-build    - 构建 Web UI"
	@echo ""
	@echo "  插件安装目录: $(PLUGIN_INSTALL_DIR)"
