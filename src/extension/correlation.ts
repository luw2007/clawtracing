export interface Correlation {
  runId?: string;
  turnId?: string;
  toolCallId?: string;
  parentEventId?: string;
}

export interface CorrelationContext {
  runId: string;
  turnId: string;
  /** 渠道 ID，格式：平台/标识符（如 feishu/ou_xxx） */
  channelId: string;
  /** 原始渠道 ID，用于跨 channelId 关联（如 agent 子任务关联到原始渠道） */
  originalChannelId?: string;
  /** @deprecated 使用 channelId 替代 */
  sessionKey?: string;
  /** @deprecated 使用 channelId 替代 */
  sessionId?: string;
  toolCallIds: string[];
  eventIds: string[];
  currentToolCallId?: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "completed" | "error";
}

export class CorrelationManager {
  private activeContexts: Map<string, CorrelationContext> = new Map();
  private contextByRunId: Map<string, CorrelationContext> = new Map();
  private toolCallCounter = 0;

  /**
   * 开始一个新的对话回合
   * @param runId - 运行 ID
   * @param channelId - 渠道 ID，格式：平台/标识符（如 feishu/ou_xxx）
   * @param sessionId - 兼容旧版 sessionId（已废弃）
   * @param originalChannelId - 原始渠道 ID，用于 agent 子任务关联到原始渠道
   */
  startTurn(
    runId: string,
    channelId: string,
    sessionId?: string,
    originalChannelId?: string
  ): CorrelationContext {
    const context: CorrelationContext = {
      runId,
      turnId: runId,
      channelId,
      originalChannelId: originalChannelId || sessionId,
      sessionKey: channelId,
      sessionId,
      toolCallIds: [],
      eventIds: [],
      startedAt: new Date().toISOString(),
      status: "active",
    };

    this.activeContexts.set(channelId, context);
    this.contextByRunId.set(runId, context);

    return context;
  }

  /** 通过 runId 获取原始渠道 ID，用于跨 channelId 关联 */
  getOriginalChannelId(runId: string): string | undefined {
    const context = this.contextByRunId.get(runId);
    return context?.originalChannelId;
  }

  /** @deprecated 使用 getOriginalChannelId 替代 */
  getOriginalSessionId(runId: string): string | undefined {
    return this.getOriginalChannelId(runId);
  }

  getActiveContext(channelId: string): CorrelationContext | undefined {
    return this.activeContexts.get(channelId);
  }

  getContextByRunId(runId: string): CorrelationContext | undefined {
    return this.contextByRunId.get(runId);
  }

  recordToolCall(channelId: string, toolCallId: string): void {
    const context = this.activeContexts.get(channelId);
    if (context) {
      context.toolCallIds.push(toolCallId);
      context.currentToolCallId = toolCallId;
    }
  }

  endTurn(
    channelId: string,
    status: "completed" | "error" = "completed"
  ): CorrelationContext | undefined {
    const context = this.activeContexts.get(channelId);
    if (context) {
      context.endedAt = new Date().toISOString();
      context.status = status;
      context.currentToolCallId = undefined;
      this.activeContexts.delete(channelId);
    }
    return context;
  }

  generateToolCallId(): string {
    const timestamp = Date.now();
    this.toolCallCounter++;
    return `tc-${timestamp}-${this.toolCallCounter}`;
  }
}
