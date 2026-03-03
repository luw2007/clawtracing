# OpenClaw Tracing

> ⚠️ **Demo / Experimental** - 本项目当前为演示/实验性质，API 和功能可能随时变更，不建议用于生产环境。欢迎试用和反馈！

实时观测 AI Agent 行为的追踪与分析工具。

## 功能特性

- **实时事件收集** - 捕获 AI Agent 的消息、工具调用等事件
- **消息时间线可视化** - 直观展示会话中的消息流
- **Token 使用统计** - 追踪输入/输出 Token 消耗
- **工具调用分析** - 统计各工具的使用频率
- **Web Dashboard** - 现代化的 Web 界面实时监控
- **CLI 工具** - 命令行数据分析与导出

## 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    OpenClaw     │────▶│ Tracing Collector│────▶│     Storage     │
│    (Gateway)    │◀────│     (Hook)       │◀────│  JSONL/SQLite   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Web Dashboard  │
                        │   (WebSocket)    │
                        └──────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Extension

```bash
# 推荐方式：使用 make 命令安装
make install

# 或者使用 npm script
npm run ext:install
```

安装完成后，Extension 将被复制到 `~/.openclaw/extensions/openclaw-tracing/` 目录。

### 3. 启动 Tracing Server

```bash
# 使用 make（会自动构建）
make start

# 或者使用 npx
npx openclaw-tracing start
```

### 4. 访问 Dashboard

打开浏览器访问: http://localhost:3456

### 5. 重启 OpenClaw

重启 OpenClaw 会话以加载新安装的 Extension。Extension 会自动连接 Tracing Server 并开始收集数据。

### 卸载

```bash
make uninstall
```

## CLI 命令参考

### start - 启动服务器

```bash
npx openclaw-tracing start [options]

选项:
  -p, --port <port>     HTTP API 端口 (默认: 3456)
  -q, --quiet           静默模式
```

### analyze - 分析数据

```bash
npx openclaw-tracing analyze [options]

选项:
  --system-prompt  分析系统提示词
  --tokens         显示 Token 统计
  --tools          显示工具使用统计
  --all            显示所有分析 (默认)
```

### export - 导出数据

```bash
npx openclaw-tracing export [options]

选项:
  -f, --format <fmt>   输出格式: json, jsonl (默认: jsonl)
  -o, --output <file>  输出文件路径
```

### clear - 清除数据

```bash
npx openclaw-tracing clear [options]

选项:
  --yes  跳过确认提示
```

## 配置说明

### 在 OpenClaw 中启用 Extension

```json
{
  "extensions": {
    "openclaw-tracing": {
      "enabled": true,
      "config": {
        "serverUrl": "http://localhost:3456",
        "debug": false
      }
    }
  }
}
```

扩展文件默认放在 OpenClaw 扩展目录：`~/.openclaw/extensions/openclaw-tracing/`。

### 端口配置

| 端口 | 用途 |
|------|------|
| 3456 | HTTP API / WebSocket / Web Dashboard |

### 数据存储路径

- SQLite 数据库: `~/.openclaw/tracing/tracing.db`
- JSONL 文件: `~/.openclaw/tracing/jsonl/`

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/events` | 接收追踪事件 |
| GET | `/api/sessions` | 获取会话列表 |
| GET | `/api/sessions/:id/events` | 获取会话事件 |
| GET | `/api/stats` | 获取统计数据 |
| DELETE | `/api/data` | 清除 JSONL 数据 |
| GET | `/health` | 健康检查 |

## 故障排查

### 端口占用

如果启动时提示端口被占用:

```bash
# 查找占用端口的进程
lsof -i :3456

# 使用其他端口启动
npx openclaw-tracing start -p 3458
```

### 数据目录权限

如果写入数据失败，检查目录权限:

```bash
# 确保目录存在并有写权限
mkdir -p ~/.openclaw/tracing
chmod 755 ~/.openclaw/tracing
```

### WebSocket 连接失败

1. 确认服务已启动: `curl http://localhost:3456/health`
2. 检查防火墙设置是否阻止 WebSocket 连接
3. 确认浏览器支持 WebSocket

### 心跳/事件发送失败

1. 确认 Tracing Server 已启动: `npx openclaw-tracing start`
2. 确认 OpenClaw 配置使用了 `config` 包裹层（见上方配置示例）
3. 若当前环境不需要采集，直接将插件 `enabled` 设为 `false`

## 开发

```bash
# 监听模式编译
npm run dev

# 直接启动服务
npm start
```

## 技术栈

- **后端**: Node.js, Express, WebSocket (ws)
- **存储**: SQLite (better-sqlite3), JSONL
- **前端**: React, Vite, Tailwind CSS, Zustand
- **CLI**: Commander.js

## 许可证

MIT
