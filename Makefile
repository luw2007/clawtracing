.PHONY: start build dev test clean web web-build ext ext-sync ext-watch

# Extension 目录配置
EXT_SRC_DIR = dist/extension
EXT_INSTALL_DIR = $(HOME)/.openclaw/extensions/openclaw-tracing

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

# ==================== Extension 开发命令 ====================

# 仅构建 Extension（不含 server/cli）
ext:
	@echo "构建 Extension..."
	npm run build:extension
	@echo "✓ Extension 构建完成: $(EXT_SRC_DIR)"

# 同步 Extension 到 openclaw 安装目录（不重新构建）
ext-sync:
	@echo "同步 Extension 到 $(EXT_INSTALL_DIR)..."
	@mkdir -p $(EXT_INSTALL_DIR)
	@cp -r $(EXT_SRC_DIR)/* $(EXT_INSTALL_DIR)/
	@echo "✓ Extension 已同步到 $(EXT_INSTALL_DIR)"
	@echo ""
	@echo "已复制文件:"
	@ls -la $(EXT_INSTALL_DIR)/*.js 2>/dev/null | awk '{print "  " $$NF}'

# 构建并同步 Extension（开发快捷命令）
e: ext ext-sync
	@echo ""
	@echo "✓ Extension 开发流程完成！"
	@echo "  提示: 重新启动 openclaw 会话以加载新 Extension"

# 监听 Extension 源文件变化并自动同步
ext-watch:
	@echo "监听 Extension 源文件变化..."
	@echo "按 Ctrl+C 停止"
	@while true; do \
		fswatch -1 src/extension/*.ts src/types/*.ts && \
		echo "" && \
		echo "检测到文件变化，重新构建..." && \
		$(MAKE) e; \
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
	@echo "  Extension 开发:"
	@echo "    make e            - 【推荐】构建 Extension 并同步到 openclaw"
	@echo "    make ext          - 仅构建 Extension"
	@echo "    make ext-sync     - 仅同步 Extension（不重新构建）"
	@echo "    make ext-watch    - 监听变化自动构建同步（需要 fswatch）"
	@echo ""
	@echo "  Web UI:"
	@echo "    make web          - 启动 Web UI 开发服务器"
	@echo "    make web-build    - 构建 Web UI"
	@echo ""
	@echo "  Extension 安装目录: $(EXT_INSTALL_DIR)"
