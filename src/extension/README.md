# OpenClaw Tracing Extension

基于 OpenClaw Extension Hooks 系统的高级追踪扩展。

## 功能特性

- 🎯 细粒度事件监听（17 个 Hooks 全覆盖）
- 📊 10x+ 数据采集量（相比 Internal Hooks）
- 🚀 批量发送优化（可配置批次大小和间隔）
- 🎲 采样支持（全局采样率 + Hook 级别覆盖）
- 📦 聚合模式（Turn 聚合 + Tool 聚合）
- 🐛 Debug 模式（可选显示完整数据）
- ⚙️ 灵活配置（可选择启用的 Hooks）

## 安装

### 方式 1：本地开发安装

```bash
# 编译扩展
cd ~/ai/openclaw-tracing
npm run build

# 复制到 OpenClaw 扩展目录
cp -r dist/extension ~/.openclaw/extensions/openclaw-tracing
```

### 方式 2：通过 OpenClaw CLI 安装

```bash
openclaw extensions install --local ~/ai/openclaw-tracing/dist/extension
```

## 配置

在 `~/.openclaw/config.json` 中添加配置：

```json
{
  "extensions": {
    "openclaw-tracing": {
      "enabled": true,
      "config": {
        "serverUrl": "http://localhost:3456",
        "debug": false,
        "batchSize": 10,
        "batchInterval": 1000,
        "enabledHooks": [
          "llm_input",
          "llm_output",
          "before_tool_call",
          "after_tool_call"
        ],
        "sampling": {
          "before_tool_call": 0.5,
          "after_tool_call": 0.5
        },
        "performance": {
          "maxBufferSize": 100,
          "maxMemoryUsage": 500,
          "autoDowngrade": true,
          "statsInterval": 60000
        }
      }
    }
  }
}
```

## 配置说明

### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `serverUrl` | string | `http://localhost:3456` | Tracing Server 地址 |
| `debug` | boolean | `false` | 是否启用调试模式，显示完整数据 |
| `batchSize` | number | `10` | 批量发送大小，达到此数量立即发送 |
| `batchInterval` | number | `1000` | 批量发送间隔（毫秒），定时发送缓冲区数据 |
| `enabledHooks` | string[] | 全部启用 | 启用的 Hooks 列表 |

### 采样配置 (sampling)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `<hookName>` | number | `1.0` | 按 Hook 类型设置采样率 (0.0-1.0)，未配置默认全量 |

**示例**：对工具调用事件进行 50% 采样

```json
"sampling": {
  "before_tool_call": 0.5,
  "after_tool_call": 0.5
}
```

### 性能配置 (performance)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `maxBufferSize` | number | `100` | 内存缓冲区最大事件数，达到后强制 flush |
| `maxMemoryUsage` | number | `500` | 内存阈值（MB），超过后自动降低 batchSize |
| `autoDowngrade` | boolean | `true` | 是否启用自动降级（降低 batchSize + 强制 flush） |
| `statsInterval` | number | `60000` | 输出统计日志间隔（毫秒），<=0 关闭 |

## 支持的 Hooks（17 个）

### LLM 相关 (4 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `llm_input` | LLM 调用输入 | LLM API 调用前，包含完整的 input payload |
| `llm_output` | LLM 调用输出 | LLM API 返回后，包含完整的 output payload |
| `before_model_resolve` | 模型解析前 | 模型选择和配置解析前 |
| `before_prompt_build` | Prompt 构建前 | System Prompt 和消息构建前 |

### 工具相关 (3 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `before_tool_call` | 工具调用前 | 工具执行前，包含工具名和参数 |
| `after_tool_call` | 工具调用后 | 工具执行后，包含结果和耗时 |
| `tool_result_persist` | 工具结果持久化 | 工具结果写入存储时 |

### Agent 相关 (3 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `before_agent_start` | Agent 启动前 | Agent 初始化前 |
| `agent_end` | Agent 结束 | Agent 任务完成后，包含统计信息 |
| `before_reset` | 重置前 | Agent 状态重置前 |

### 会话相关 (2 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `session_start` | 会话开始 | 新会话创建时 |
| `session_end` | 会话结束 | 会话关闭时，包含统计信息 |

### 消息相关 (4 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `message_received` | 消息接收 | 收到用户或系统消息时 |
| `message_sending` | 消息发送中 | 准备发送消息时 |
| `message_sent` | 消息已发送 | 消息发送完成后 |
| `before_message_write` | 消息写入前 | 消息写入文件前 |

### 网关相关 (2 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `gateway_start` | Gateway 启动 | Gateway 服务启动时 |
| `gateway_stop` | Gateway 停止 | Gateway 服务停止时 |

### 压缩相关 (2 个)

| Hook 名称 | 说明 | 触发时机 |
|-----------|------|----------|
| `before_compaction` | 压缩前 | 消息历史压缩前 |
| `after_compaction` | 压缩后 | 消息历史压缩后，包含节省的 token 数 |

## 配置示例

### 最小配置（仅 LLM 监控）

```json
{
  "extensions": {
    "openclaw-tracing": {
      "enabled": true,
      "config": {
        "serverUrl": "http://localhost:3456",
        "enabledHooks": ["llm_input", "llm_output"]
      }
    }
  }
}
```

### 开发环境配置（全量采集 + Debug）

```json
{
  "extensions": {
    "openclaw-tracing": {
      "enabled": true,
      "config": {
        "serverUrl": "http://localhost:3456",
        "debug": true,
        "batchSize": 5,
        "batchInterval": 500
      }
    }
  }
}
```

### 生产环境配置（采样）

```json
{
  "extensions": {
    "openclaw-tracing": {
      "enabled": true,
      "config": {
        "serverUrl": "https://tracing.example.com",
        "debug": false,
        "batchSize": 50,
        "batchInterval": 5000,
        "sampling": {
          "before_tool_call": 0.1,
          "after_tool_call": 0.1
        }
      }
    }
  }
}
```

### 仅工具监控配置

```json
{
  "extensions": {
    "openclaw-tracing": {
      "enabled": true,
      "config": {
        "serverUrl": "http://localhost:3456",
        "enabledHooks": [
          "before_tool_call",
          "after_tool_call",
          "tool_result_persist"
        ]
      }
    }
  }
}
```

## 数据示例

### LLM Input 事件

```json
{
  "type": "llm_input",
  "timestamp": "2026-02-27T10:00:00.000Z",
  "session_id": "agent:main:main",
  "content": "LLM input: anthropic/claude-3-5-sonnet-20241022",
  "data": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "messageCount": 15,
    "systemPrompt": "You are a helpful coding assistant...",
    "estimatedTokens": 12543
  }
}
```

### Tool Call 事件

```json
{
  "type": "tool_call",
  "timestamp": "2026-02-27T10:00:01.500Z",
  "session_id": "agent:main:main",
  "content": "Tool call: Read",
  "data": {
    "tool_name": "Read",
    "input": { "paramCount": 2 }
  }
}
```

### Agent End 事件

```json
{
  "type": "agent_end",
  "timestamp": "2026-02-27T10:05:00.000Z",
  "session_id": "agent:main:main",
  "content": "Agent end: 300000ms",
  "duration_ms": 300000,
  "data": {
    "usage": { "input": 50000, "output": 10000, "total": 60000 },
    "cost": 0.15,
    "messageCount": 45,
    "toolCallCount": 12,
    "durationMs": 300000
  }
}
```

## 验证

```bash
# 重启 OpenClaw Gateway
openclaw gateway restart

# 查看日志确认扩展已加载
tail -f ~/.openclaw/logs/gateway.log | grep "OpenClaw Tracing extension"

# 确认 Tracing Server 正常
curl -s http://localhost:3456/health
```

## 开发

```bash
# 监听模式（自动编译）
npm run dev

# 编译
npm run build

# 部署到 OpenClaw
cp -r dist/extension ~/.openclaw/extensions/openclaw-tracing && openclaw gateway restart
```

## 版本

- v0.2.0 - 基础 Extension Hooks 实现（llm_input, llm_output, tool_call）
- v0.1.0 - Internal Hooks 实现（已弃用）

## 许可

MIT
