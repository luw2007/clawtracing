import type {
  OpenClawPlugin,
  OpenClawPluginApi,
  PluginHookContext,
  TracingConfig,
  LlmInputEvent,
  LlmOutputEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
  ToolResultPersistEvent,
  BeforeModelResolveEvent,
  BeforePromptBuildEvent,
  BeforeAgentStartEvent,
  AgentEndEvent,
  BeforeCompactionEvent,
  AfterCompactionEvent,
  BeforeResetEvent,
  SessionStartEvent,
  SessionEndEvent,
  GatewayStartEvent,
  GatewayStopEvent,
  MessageReceivedEvent,
  MessageSendingEvent,
  MessageSentEvent,
  BeforeMessageWriteEvent,
} from "./types.js";
import { TracingCollector } from "./collector.js";
import { CorrelationManager } from "./correlation.js";

/**
 * 规范化渠道 ID
 * 将各种格式的输入转换为标准的 平台/标识符 格式
 * @param input - 原始输入
 * @param defaultPlatform - 默认平台
 * @returns 规范化的渠道 ID
 */
function normalizeChannelId(input: string, defaultPlatform = "system"): string {
  if (!input || input === "unknown") {
    return `${defaultPlatform}/unknown`;
  }
  
  if (input.includes("/")) {
    return input;
  }
  
  const prefix = input.split(/[_:]/)[0];
  switch (prefix) {
    case "ou":
    case "oc":
    case "og":
      return `feishu/${input}`;
    case "user":
    case "chat":
      return `feishu/${input.slice(prefix.length + 1)}`;
    case "agent":
      return `agent/${input.slice(6)}`;
    default:
      return `${defaultPlatform}/${input}`;
  }
}

/**
 * 从上下文中提取渠道 ID
 * 
 * 优先级策略（针对飞书业务优化）：
 * 1. 优先使用能识别具体用户/群的字段（conversationId, eventFrom）
 * 2. 如果 ctx.channelId 已经是正确的 feishu/ou_xxx 格式则使用
 * 3. 其他情况使用 sessionKey 或默认值
 * 
 * @param ctx - 插件钩子上下文
 * @param eventFrom - 事件来源（可选，如 feishu:ou_xxx）
 * @param defaultValue - 默认值
 * @returns 规范化的渠道 ID（格式：平台/标识符）
 */
function resolveChannelId(
  ctx: PluginHookContext,
  eventFrom?: string,
  defaultValue = "system/unknown"
): string {
  // 优先使用 conversationId（通常包含 user:ou_xxx 格式）
  if (ctx.conversationId && /^(user|chat):/.test(ctx.conversationId)) {
    return normalizeChannelId(ctx.conversationId);
  }
  
  // 其次使用 eventFrom（如 feishu:ou_xxx）
  if (eventFrom && /^feishu:/.test(eventFrom)) {
    const platformId = eventFrom.slice(7);
    return `feishu/${platformId}`;
  }
  
  // 如果 ctx.channelId 已经是正确格式（feishu/ou_xxx），直接使用
  if (ctx.channelId && /^feishu\/(ou|oc|og)_/.test(ctx.channelId)) {
    return ctx.channelId;
  }
  
  // 回退到其他字段
  const raw = ctx.sessionKey || ctx.channelId || eventFrom || defaultValue;
  return normalizeChannelId(raw);
}

const tracingExtension: OpenClawPlugin = {
  id: "openclaw-tracing",
  name: "OpenClaw Tracing Collector",
  version: "0.2.0",
  description: "Advanced tracing with Extension Hooks for fine-grained monitoring",
  
  activate(api: OpenClawPluginApi) {
    const rawPluginConfig = api.pluginConfig ?? {};
    const pluginConfig =
      typeof rawPluginConfig.config === "object" && rawPluginConfig.config
        ? (rawPluginConfig.config as Record<string, unknown>)
        : rawPluginConfig;
    const config: TracingConfig = {
      serverUrl: (pluginConfig.serverUrl as string) ?? "http://localhost:3456",
      debug: (pluginConfig.debug as boolean) ?? false,
      enabledHooks: pluginConfig.enabledHooks as string[] | undefined,
      batchSize: (pluginConfig.batchSize as number) ?? 10,
      batchInterval: (pluginConfig.batchInterval as number) ?? 1000,
      sampling: pluginConfig.sampling as Record<string, number> | undefined,
      performance: pluginConfig.performance as {
        maxBufferSize?: number;
        maxMemoryUsage?: number;
        autoDowngrade?: boolean;
        statsInterval?: number;
      } | undefined,
      instanceName: pluginConfig.instanceName as string | undefined,
    };
    
    const collector = new TracingCollector(api, config);
    const correlationManager = new CorrelationManager();
    
    api.on<GatewayStopEvent>("gateway_stop", async (event, ctx: PluginHookContext) => {
      const channelId = resolveChannelId(ctx, undefined, "system/gateway");
      await collector.send({
        session_id: channelId,
        type: "gateway_stop",
        timestamp: new Date().toISOString(),
        content: `Gateway stopping: ${event.reason || "normal shutdown"}`,
        data: {
          reason: event.reason,
          totalSessions: event.totalSessions,
          uptime: event.uptime,
          stopTime: event.stopTime || new Date().toISOString(),
        },
      });
      await collector.dispose();
    });

    const shouldHookEnabled = (hookName: string): boolean => {
      if (!config.enabledHooks) return true;
      return config.enabledHooks.includes(hookName);
    };

    if (shouldHookEnabled("llm_input")) {
      api.on<LlmInputEvent>("llm_input", async (event, ctx: PluginHookContext) => {
        const rawChannelId = resolveChannelId(ctx);
        let activeCtx = correlationManager.getActiveContext(rawChannelId);
        const runId = event.runId || activeCtx?.runId || `run-${Date.now()}`;
        
        // 如果是 agent/xxx 类型的渠道，尝试通过 runId 找到原始渠道
        let channelId = rawChannelId;
        if (rawChannelId.startsWith("agent/") && runId) {
          const originalChannelId = correlationManager.getOriginalChannelId(runId);
          if (originalChannelId) {
            channelId = originalChannelId;
            activeCtx = correlationManager.getActiveContext(originalChannelId) || activeCtx;
          }
        }
        
        if (config.debug) {
          api.logger.info(`[tracing] llm_input: runId=${event.runId}, channelId=${channelId}, rawChannelId=${rawChannelId}`);
        }
        if (!activeCtx) {
          correlationManager.startTurn(runId, channelId);
          activeCtx = correlationManager.getActiveContext(channelId);
        }
        await collector.send({
          session_id: channelId,
          type: "llm_input",
          timestamp: new Date().toISOString(),
          content: `LLM input: ${event.provider}/${event.model}`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : { runId, turnId: runId },
          data: {
            provider: event.provider,
            model: event.model,
            messageCount: event.historyMessages?.length || 0,
            messages: config.debug ? event.historyMessages : undefined,
            systemPrompt: event.systemPrompt?.substring(0, 100) + "...",
            estimatedTokens: event.historyMessages?.reduce((sum, m) => {
              const content = JSON.stringify(m.content);
              return sum + (content.length / 4);
            }, 0),
          },
        });
      });
    }

    if (shouldHookEnabled("llm_output")) {
      api.on<LlmOutputEvent>("llm_output", async (event, ctx: PluginHookContext) => {
        const rawChannelId = resolveChannelId(ctx);
        let activeCtx = correlationManager.getActiveContext(rawChannelId);
        const runId = event.runId || activeCtx?.runId;
        
        // 如果是 agent/xxx 类型的渠道，尝试通过 runId 找到原始渠道
        let channelId = rawChannelId;
        if (rawChannelId.startsWith("agent/") && runId) {
          const originalChannelId = correlationManager.getOriginalChannelId(runId);
          if (originalChannelId) {
            channelId = originalChannelId;
            activeCtx = correlationManager.getActiveContext(originalChannelId) || activeCtx;
          }
        }
        
        if (config.debug) {
          api.logger.info(`[tracing] llm_output: runId=${event.runId}, activeCtx.runId=${activeCtx?.runId}, channelId=${channelId}`);
        }
        await collector.send({
          session_id: channelId,
          type: "llm_output",
          timestamp: new Date().toISOString(),
          content: `LLM output: ${event.provider}/${event.model}`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            provider: event.provider,
            model: event.model,
            usage: event.usage,
            response: config.debug ? { texts: event.assistantTexts } : {
              textsCount: event.assistantTexts?.length || 0,
            },
          },
        });
        correlationManager.endTurn(channelId, "completed");
      });
    }

    if (shouldHookEnabled("before_tool_call")) {
      api.on<BeforeToolCallEvent>("before_tool_call", async (event, ctx: PluginHookContext) => {
        const rawChannelId = resolveChannelId(ctx);
        let activeCtx = correlationManager.getActiveContext(rawChannelId);
        const runId = activeCtx?.runId;
        
        // 如果是 agent/xxx 类型的渠道，尝试通过 runId 找到原始渠道
        let channelId = rawChannelId;
        if (rawChannelId.startsWith("agent/") && runId) {
          const originalChannelId = correlationManager.getOriginalChannelId(runId);
          if (originalChannelId) {
            channelId = originalChannelId;
            activeCtx = correlationManager.getActiveContext(originalChannelId) || activeCtx;
          }
        }
        
        const toolCallId = correlationManager.generateToolCallId();
        correlationManager.recordToolCall(channelId, toolCallId);
        await collector.send({
          session_id: channelId,
          type: "tool_call",
          timestamp: new Date().toISOString(),
          content: `Tool call: ${event.toolName}`,
          correlation: {
            runId: activeCtx?.runId,
            turnId: activeCtx?.turnId,
            toolCallId,
          },
          data: {
            tool_name: event.toolName,
            input: config.debug ? event.params : {
              paramCount: Object.keys(event.params || {}).length,
            },
            params: config.debug ? event.params : undefined,
          },
        });
      });
    }

    if (shouldHookEnabled("after_tool_call")) {
      api.on<AfterToolCallEvent>("after_tool_call", async (event, ctx: PluginHookContext) => {
        const rawChannelId = resolveChannelId(ctx);
        let activeCtx = correlationManager.getActiveContext(rawChannelId);
        const runId = activeCtx?.runId;
        
        // 如果是 agent/xxx 类型的渠道，尝试通过 runId 找到原始渠道
        let channelId = rawChannelId;
        if (rawChannelId.startsWith("agent/") && runId) {
          const originalChannelId = correlationManager.getOriginalChannelId(runId);
          if (originalChannelId) {
            channelId = originalChannelId;
            activeCtx = correlationManager.getActiveContext(originalChannelId) || activeCtx;
          }
        }
        
        await collector.send({
          session_id: channelId,
          type: "tool_result",
          timestamp: new Date().toISOString(),
          content: `Tool result: ${event.toolName}`,
          duration_ms: event.durationMs,
          correlation: {
            runId: activeCtx?.runId,
            turnId: activeCtx?.turnId,
            toolCallId: activeCtx?.currentToolCallId,
          },
          data: {
            tool_name: event.toolName,
            result: config.debug ? event.result : {
              hasContent: !!event.result,
            },
            duration_ms: event.durationMs,
            error: event.error,
          },
        });
      });
    }

    if (shouldHookEnabled("tool_result_persist")) {
      api.on<ToolResultPersistEvent>("tool_result_persist", (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        void collector.send({
          session_id: channelId,
          type: "tool_result_persist",
          timestamp: new Date().toISOString(),
          content: `Tool result persist: ${event.toolName}`,
          correlation: {
            runId: activeCtx?.runId,
            turnId: activeCtx?.turnId,
            toolCallId: activeCtx?.currentToolCallId,
          },
          data: {
            tool_name: event.toolName,
            tool_id: event.toolId,
            result: config.debug ? event.result : {
              hasContent: !!event.result,
            },
            persist_path: event.persistPath,
          },
        });
      });
    }

    if (shouldHookEnabled("message_received")) {
      api.on<MessageReceivedEvent>("message_received", async (event, ctx: PluginHookContext) => {
        // 解析渠道 ID，优先级：ctx.channelId > ctx.sessionKey > ctx.conversationId > event.from
        const channelId = resolveChannelId(ctx, event.from || event.metadata?.senderId);

        let activeCtx = correlationManager.getActiveContext(channelId);
        
        // 从 from 字段推断角色
        let role = event.role;
        if (!role && event.from) {
          role = "user";
        }
        
        let type = "message_received";
        if (role === "user") {
          type = "user_message";
          // 用户消息到达时，如果没有活跃的 turn，则自动创建一个新的 turn
          // 这确保 user_message 能与后续的 llm_output 关联成同一回合
          if (!activeCtx) {
            const newTurnId = crypto.randomUUID();
            // 传入 originalChannelId，用于跨渠道关联（如 agent/main -> feishu/ou_xxx）
            correlationManager.startTurn(newTurnId, channelId, channelId, channelId);
            activeCtx = correlationManager.getActiveContext(channelId);
          }
        } else if (role === "assistant" || role === "model") {
          type = "assistant_message";
        } else if (role === "system") {
          type = "system";
        }

        let content: unknown[] = [];
        if (typeof event.content === "string") {
            content = [{ type: "text", text: event.content }];
        } else if (Array.isArray(event.content)) {
            content = event.content;
        } else {
            content = [{ type: "text", text: JSON.stringify(event.content) }];
        }

        // 构造时间戳
        let timestamp: string;
        if (typeof event.timestamp === "number") {
          timestamp = new Date(event.timestamp).toISOString();
        } else if (typeof event.timestamp === "string") {
          timestamp = event.timestamp;
        } else {
          timestamp = new Date().toISOString();
        }

        await collector.send({
          session_id: channelId,
          type: type,
          timestamp: timestamp,
          content: content,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            messageId: event.messageId || event.metadata?.messageId,
            role: role,
            from: event.from,
            content: event.content,
            provider: event.metadata?.provider,
            surface: event.metadata?.surface,
            senderId: event.metadata?.senderId,
            senderName: event.metadata?.senderName,
            channelId: channelId,
            accountId: ctx.accountId,
            conversationId: ctx.conversationId,
          },
        });
      });
    }

    if (shouldHookEnabled("message_sending")) {
      api.on<MessageSendingEvent>("message_sending", async (event, ctx: PluginHookContext) => {
        // 解析渠道 ID，优先从上下文获取，fallback 到 event.to
        const channelId = resolveChannelId(ctx, event.to);
        const activeCtx = correlationManager.getActiveContext(channelId);

        let content: unknown[] = [];
        if (typeof event.content === "string") {
            content = [{ type: "text", text: event.content }];
        } else if (Array.isArray(event.content)) {
            content = event.content;
        } else {
            content = [{ type: "text", text: JSON.stringify(event.content) }];
        }

        await collector.send({
          session_id: channelId,
          type: "message_sending",
          timestamp: new Date().toISOString(),
          content: content,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            messageId: event.messageId,
            targetRole: event.targetRole,
            content: event.content,
            to: event.to,
            channelId: channelId,
            accountId: ctx.accountId || event.metadata?.accountId,
          },
        });
      });
    }

    if (shouldHookEnabled("message_sent")) {
      api.on<MessageSentEvent>("message_sent", async (event, ctx: PluginHookContext) => {
        // 解析渠道 ID，优先从上下文获取，fallback 到 event.to
        const channelId = resolveChannelId(ctx, event.to);
        const activeCtx = correlationManager.getActiveContext(channelId);
        
        let content: unknown[] = [];
        if (event.content) {
          if (typeof event.content === "string") {
            content = [{ type: "text", text: event.content }];
          } else {
            content = [{ type: "text", text: JSON.stringify(event.content) }];
          }
        } else {
          content = [{ type: "text", text: `Message sent: ${event.success ? "success" : "failed"}` }];
        }
        
        await collector.send({
          session_id: channelId,
          type: "message_sent",
          timestamp: new Date().toISOString(),
          content: content,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            messageId: event.messageId,
            success: event.success,
            error: event.error,
            to: event.to,
            channelId: channelId,
            accountId: ctx.accountId,
          },
        });
      });
    }

    if (shouldHookEnabled("before_message_write")) {
      api.on<BeforeMessageWriteEvent>("before_message_write", (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);

        let content: unknown[] = [];
        if (typeof event.content === "string") {
            content = [{ type: "text", text: event.content }];
        } else if (Array.isArray(event.content)) {
            content = event.content;
        } else {
            content = [{ type: "text", text: JSON.stringify(event.content) }];
        }

        // 同步 hook，使用 fire-and-forget 模式
        void collector.send({
          session_id: channelId,
          type: "before_message_write",
          timestamp: new Date().toISOString(),
          content: content,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            messageId: event.messageId,
            filePath: event.filePath,
            content: event.content,
          },
        });
      });
    }

    if (shouldHookEnabled("session_start")) {
      api.on<SessionStartEvent>("session_start", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx, event.sessionId);
        correlationManager.startTurn(`turn-${Date.now()}`, channelId);
        await collector.send({
          session_id: channelId,
          type: "session_start",
          timestamp: event.startTime || new Date().toISOString(),
          content: `Session started: ${channelId}`,
          data: {
            channelId: channelId,
            sessionId: event.sessionId,
            config: config.debug ? event.config : undefined,
            startTime: event.startTime || new Date().toISOString(),
          },
        });
      });
    }

    if (shouldHookEnabled("session_end")) {
      api.on<SessionEndEvent>("session_end", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx, event.sessionId);
        await collector.send({
          session_id: channelId,
          type: "session_end",
          timestamp: event.endTime || new Date().toISOString(),
          content: `Session ended: ${channelId}`,
          duration_ms: event.duration,
          data: {
            channelId: channelId,
            sessionId: event.sessionId,
            messageCount: event.messageCount,
            totalTokens: event.totalTokens,
            totalCost: event.totalCost,
            duration: event.duration,
            endTime: event.endTime || new Date().toISOString(),
          },
        });
        correlationManager.endTurn(channelId, "completed");
      });
    }

    if (shouldHookEnabled("gateway_start")) {
      api.on<GatewayStartEvent>("gateway_start", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx, undefined, "system/gateway");
        await collector.send({
          session_id: channelId,
          type: "gateway_start",
          timestamp: event.startTime || new Date().toISOString(),
          content: `Gateway started: v${event.version || "unknown"}`,
          data: {
            version: event.version,
            config: config.debug ? event.config : undefined,
            workingDir: event.workingDir,
            startTime: event.startTime || new Date().toISOString(),
          },
        });
      });
    }

    if (shouldHookEnabled("before_model_resolve")) {
      api.on<BeforeModelResolveEvent>("before_model_resolve", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        let activeCtx = correlationManager.getActiveContext(channelId);
        const runId = event.runId || `run-${Date.now()}`;
        if (!activeCtx) {
          correlationManager.startTurn(runId, channelId);
          activeCtx = correlationManager.getActiveContext(channelId);
        }
        await collector.send({
          session_id: channelId,
          type: "before_model_resolve",
          timestamp: new Date().toISOString(),
          content: `Model resolve: ${event.provider || "unknown"}/${event.model || "unknown"}`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : { runId, turnId: runId },
          data: {
            runId: event.runId,
            model: event.model,
            provider: event.provider,
          },
        });
      });
    }

    if (shouldHookEnabled("before_prompt_build")) {
      api.on<BeforePromptBuildEvent>("before_prompt_build", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        await collector.send({
          session_id: channelId,
          type: "before_prompt_build",
          timestamp: new Date().toISOString(),
          content: `Prompt build: ${event.messages?.length || 0} messages`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            systemPrompt: config.debug ? event.systemPrompt : event.systemPrompt?.substring(0, 100),
            messageCount: event.messages?.length || 0,
            messages: config.debug ? event.messages : undefined,
            context: config.debug ? event.context : Object.keys(event.context || {}),
          },
        });
      });
    }

    if (shouldHookEnabled("before_agent_start")) {
      api.on<BeforeAgentStartEvent>("before_agent_start", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        await collector.send({
          session_id: channelId,
          type: "before_agent_start",
          timestamp: new Date().toISOString(),
          content: `Agent start: ${event.agentId || "unknown"}`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            agentId: event.agentId,
            config: config.debug ? event.config : Object.keys(event.config || {}),
          },
        });
      });
    }

    if (shouldHookEnabled("agent_end")) {
      api.on<AgentEndEvent>("agent_end", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        await collector.send({
          session_id: channelId,
          type: "agent_end",
          timestamp: new Date().toISOString(),
          content: `Agent end: ${event.durationMs || 0}ms`,
          duration_ms: event.durationMs,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            usage: event.usage,
            cost: event.cost,
            messageCount: event.messageCount,
            toolCallCount: event.toolCallCount,
            durationMs: event.durationMs,
          },
        });
        if (activeCtx) {
          correlationManager.endTurn(channelId, "completed");
        }
      });
    }

    if (shouldHookEnabled("before_compaction")) {
      api.on<BeforeCompactionEvent>("before_compaction", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        await collector.send({
          session_id: channelId,
          type: "before_compaction",
          timestamp: new Date().toISOString(),
          content: `Before compaction: ${event.messageCount || 0} messages, ~${event.estimatedTokens || 0} tokens`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            messageCount: event.messageCount,
            estimatedTokens: event.estimatedTokens,
          },
        });
      });
    }

    if (shouldHookEnabled("after_compaction")) {
      api.on<AfterCompactionEvent>("after_compaction", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        await collector.send({
          session_id: channelId,
          type: "after_compaction",
          timestamp: new Date().toISOString(),
          content: `After compaction: ${event.originalCount || 0} -> ${event.compactedCount || 0} messages`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            originalCount: event.originalCount,
            compactedCount: event.compactedCount,
            tokensSaved: event.tokensSaved,
          },
        });
      });
    }

    if (shouldHookEnabled("before_reset")) {
      api.on<BeforeResetEvent>("before_reset", async (event, ctx: PluginHookContext) => {
        const channelId = resolveChannelId(ctx);
        const activeCtx = correlationManager.getActiveContext(channelId);
        await collector.send({
          session_id: channelId,
          type: "before_reset",
          timestamp: new Date().toISOString(),
          content: `Before reset: ${event.reason || "unknown reason"}`,
          correlation: activeCtx
            ? { runId: activeCtx.runId, turnId: activeCtx.turnId }
            : undefined,
          data: {
            reason: event.reason,
            currentMessageCount: event.currentMessageCount,
          },
        });
      });
    }

    api.logger.info(`OpenClaw Tracing extension activated (server: ${config.serverUrl})`);
  },
};

export default tracingExtension;
