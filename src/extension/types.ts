export interface Correlation {
  runId?: string;
  turnId?: string;
  toolCallId?: string;
  parentEventId?: string;
}

export interface PluginHookContext {
  /** 渠道 ID，格式：平台/标识符（如 feishu/ou_xxx, feishu/oc_xxx） */
  channelId?: string;
  /** @deprecated 使用 channelId 替代 */
  sessionKey?: string;
  agentId?: string;
  accountId?: string;
  /** @deprecated 使用 channelId 替代 */
  conversationId?: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
}

export interface OpenClawPluginApi {
  config: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
  logger: {
    info(message: string): void;
    error(message: string): void;
    warn(message: string): void;
    debug?(message: string): void;
  };
  on<T = unknown>(
    hookName: string,
    handler: (event: T, ctx: PluginHookContext) => Promise<void> | void,
    options?: { priority?: number }
  ): void;
}

export interface OpenClawPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  activate(api: OpenClawPluginApi): Promise<void> | void;
}

export interface TracingConfig {
  serverUrl: string;
  debug: boolean;
  enabledHooks?: string[];
  batchSize?: number;
  batchInterval?: number;
  sampling?: {
    [hookName: string]: number;
  };
  performance?: {
    maxBufferSize?: number;
    maxMemoryUsage?: number;
    autoDowngrade?: boolean;
    statsInterval?: number;
  };
  /** 实例名称，用于在 UI 中显示。默认使用工作目录名称 */
  instanceName?: string;
}

export interface TracingEvent {
  session_id: string;
  type: string;
  timestamp: string;
  content?: unknown;
  duration_ms?: number;
  data?: Record<string, unknown>;
  turnId?: string;
  toolCallId?: string;
  parentEventId?: string;
  correlation?: Correlation;
  /** Hook 实例 ID，用于多实例场景下区分数据来源 */
  instance_id?: string;
}

export interface LlmInputEvent {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  historyMessages: Array<{ role: string; content: unknown }>;
  imagesCount: number;
}

export interface LlmOutputEvent {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  assistantTexts: string[];
  lastAssistant?: unknown;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

export interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
}

export interface AfterToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface BeforeModelResolveEvent {
  runId: string;
  model?: string;
  provider?: string;
}

export interface BeforePromptBuildEvent {
  systemPrompt?: string;
  messages?: Array<{ role: string; content: unknown }>;
  context?: Record<string, unknown>;
}

export interface BeforeAgentStartEvent {
  agentId?: string;
  config?: Record<string, unknown>;
}

export interface AgentEndEvent {
  usage?: { input?: number; output?: number; total?: number };
  cost?: number;
  messageCount?: number;
  toolCallCount?: number;
  durationMs?: number;
}

export interface BeforeCompactionEvent {
  messageCount?: number;
  estimatedTokens?: number;
}

export interface AfterCompactionEvent {
  originalCount?: number;
  compactedCount?: number;
  tokensSaved?: number;
}

export interface BeforeResetEvent {
  reason?: string;
  currentMessageCount?: number;
}

export interface ToolResultPersistEvent {
  toolName: string;
  toolId?: string;
  result?: unknown;
  persistPath?: string;
}

export interface SessionStartEvent {
  sessionId?: string;
  config?: Record<string, unknown>;
  startTime?: string;
}

export interface SessionEndEvent {
  sessionId?: string;
  messageCount?: number;
  totalTokens?: number;
  totalCost?: number;
  duration?: number;
  endTime?: string;
}

export interface GatewayStartEvent {
  version?: string;
  config?: Record<string, unknown>;
  workingDir?: string;
  startTime?: string;
}

export interface GatewayStopEvent {
  reason?: string;
  totalSessions?: number;
  uptime?: number;
  stopTime?: string;
}

export interface MessageReceivedEvent {
  messageId?: string;
  role?: string;
  from?: string;
  content: unknown;
  timestamp?: string | number;
  metadata?: {
    to?: string;
    provider?: string;
    surface?: string;
    originatingChannel?: string;
    originatingTo?: string;
    messageId?: string;
    senderId?: string;
    senderName?: string;
    [key: string]: unknown;
  };
}

export interface MessageSendingEvent {
  to?: string;
  messageId?: string;
  content: unknown;
  targetRole?: string;
  metadata?: {
    channel?: string;
    accountId?: string;
    mediaUrls?: string[];
    [key: string]: unknown;
  };
}

export interface MessageSentEvent {
  to?: string;
  messageId?: string;
  content?: string;
  success: boolean;
  error?: string;
}

export interface BeforeMessageWriteEvent {
  messageId?: string;
  content: unknown;
  filePath?: string;
}
