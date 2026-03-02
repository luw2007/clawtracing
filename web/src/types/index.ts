/**
 * 内容块类型定义
 * 用于表示消息中的不同内容片段（文本、工具调用等）
 */
export interface ContentBlock {
  /** 内容块类型 */
  type: "text" | "tool_use" | "tool_result" | "image";
  /** 文本内容（当 type 为 text 时） */
  text?: string;
  /** 工具调用 ID（当 type 为 tool_use 或 tool_result 时） */
  id?: string;
  /** 工具名称（当 type 为 tool_use 时） */
  name?: string;
  /** 工具输入参数（当 type 为 tool_use 时） */
  input?: Record<string, unknown>;
  /** 工具调用结果（当 type 为 tool_result 时） */
  content?: string | ContentBlock[];
  /** 工具调用是否出错（当 type 为 tool_result 时） */
  is_error?: boolean;
  duration_ms?: number;
  level?: string;
  error?: unknown;
  cost?: number;
  /** 图片数据（当 type 为 image 时） */
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

/**
 * 追踪事件类型定义
 * 表示一个完整的追踪事件记录
 */
export interface TracingEvent {
  /** 事件唯一标识符 */
  id: string;
  /** 渠道 ID，格式：平台/标识符（如 feishu/ou_xxx, feishu/oc_xxx）
   * 注：字段名保持 session_id 以兼容现有数据 */
  session_id: string;
  /** 事件类型 */
  type:
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "tool_result"
    | "error"
    | "system"
    | "turn_start"
    | "turn_end"
    | "agent_start"
    | "agent_stop"
    | "llm_input"
    | "llm_output"
    | "before_tool_call"
    | "after_tool_call"
    | "tool_result_persist"
    | "message_received"
    | "message_sending"
    | "message_sent"
    | "before_message_write"
    | "before_model_resolve"
    | "before_prompt_build"
    | "before_agent_start"
    | "agent_end"
    | "before_compaction"
    | "after_compaction"
    | "before_reset"
    | "session_start"
    | "session_end"
    | "gateway_start"
    | "gateway_stop";
  /** 事件时间戳（ISO 8601 格式） */
  timestamp: string;
  /** 事件内容块列表 */
  content: ContentBlock[];
  /** 事件元数据 */
  metadata?: {
    /** 模型名称 */
    model?: string;
    /** 提供商名称 */
    provider?: string;
    /** Token 使用统计 */
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_read?: number;
      cache_write?: number;
      total?: number;
    };
    /** 其他自定义元数据 */
    [key: string]: unknown;
  };
  /** Turn ID（用于 Turn 关联） */
  turnId?: string;
  /** 工具调用 ID（用于工具调用关联） */
  toolCallId?: string;
  /** 父事件 ID（用于事件关联） */
  parent_id?: string;
  /** 父事件 ID（别名） */
  parentEventId?: string;
  /** 事件持续时间（毫秒） */
  duration_ms?: number;
  level?: string;
  error?: unknown;
  cost?: number;
  /** 事件额外数据 */
  data?: Record<string, unknown>;
  /** 关联信息 */
  correlation?: {
    runId?: string;
    turnId?: string;
    toolCallId?: string;
    parentEventId?: string;
  };
  /** Hook 实例 ID，用于多实例场景下区分数据来源 */
  instance_id?: string;
}

/**
 * 渠道状态枚举
 * 注：类型别名 SessionStatus 保持向后兼容
 */
export type SessionStatus = "active" | "completed" | "error" | "archived";
export type ChannelStatus = SessionStatus;

/**
 * 渠道接口定义（Channel）
 * 表示一个聊天渠道（飞书群聊、单聊等），而非工作会话（Session）
 * 
 * 术语说明：
 * - Channel/渠道：具体的群聊(oc_xxx)或单聊(ou_xxx)，ID 格式为 平台/标识符
 * - Session/会话：在本代码中指追踪数据的聚合单元，按 Channel 分组
 * 
 * 注：接口名保持 Session 以兼容现有代码
 */
export interface Session {
  /** 渠道唯一标识符，格式：平台/标识符（如 feishu/ou_xxx） */
  id: string;
  /** 渠道显示名称 */
  name: string;
  /** 会话创建时间（ISO 8601 格式） */
  created_at: string;
  /** 会话最后更新时间（ISO 8601 格式） */
  updated_at: string;
  /** 会话状态 */
  status: SessionStatus;
  /** 会话元数据 */
  metadata?: {
    /** 使用的模型 */
    model?: string;
    /** 工作目录 */
    cwd?: string;
    /** 任务描述 */
    task?: string;
    /** 标签列表 */
    tags?: string[];
    /** 其他自定义元数据 */
    [key: string]: unknown;
  };
  /** 会话统计信息 */
  stats?: SessionStats;
}

/**
 * 渠道统计信息
 */
export interface SessionStats {
  /** 事件总数 */
  event_count: number;
  /** 总输入 Token 数 */
  total_input_tokens: number;
  /** 总输出 Token 数 */
  total_output_tokens: number;
  /** 持续时间（毫秒） */
  duration_ms: number;
}
export type ChannelStats = SessionStats;

/**
 * Hook 实例心跳信息
 */
export interface HookInstance {
  /** 实例唯一标识符 */
  instanceId: string;
  /** 实例显示名称（项目名/工作目录名） */
  instanceName?: string;
  /** 工作目录路径 */
  workingDir?: string;
  /** 主机名 */
  hostname?: string;
  /** 心跳时间戳 */
  timestamp: string;
  /** 进程 ID */
  pid: number;
  /** 最后一次心跳时间（毫秒） */
  lastSeen: number;
  /** 是否在线 */
  online: boolean;
}

/**
 * Hook 心跳响应
 */
export interface HeartbeatResponse {
  total: number;
  online: number;
  instances: HookInstance[];
}

/**
 * 渠道摘要接口定义
 * 用于列表展示的精简渠道信息
 */
export interface SessionSummary {
  /** 渠道唯一标识符，格式：平台/标识符（如 feishu/ou_xxx） */
  id: string;
  /** 渠道显示名称 */
  name: string;
  /** 会话创建时间（ISO 8601 格式） */
  created_at: string;
  /** 会话最后更新时间（ISO 8601 格式） */
  updated_at: string;
  /** 会话状态 */
  status: SessionStatus;
  /** 事件数量 */
  event_count: number;
  /** 首条消息预览 */
  preview?: string;
  /** 设备标识（hostname 或实例 ID） */
  device?: string;
  /** 回合数量 */
  turn_count?: number;
  /** 工具调用总数 */
  tool_call_count?: number;
  /** Token 总数 */
  total_tokens?: number;
  /** 总成本 */
  total_cost?: number;
  /** 是否有错误 */
  has_error?: boolean;
  /** 使用最多的工具（最多3个） */
  top_tools?: string[];
}

/**
 * WebSocket 消息类型定义
 */
export type WebSocketMessage =
  | { type: "session_created"; session: Session }
  | { type: "session_updated"; session: Session }
  | { type: "event_added"; event: TracingEvent }
  | { type: "sessions_list"; sessions: SessionSummary[] }
  | { type: "events_list"; session_id: string; events: TracingEvent[] };

export interface QuantileStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface ToolDurationRow {
  tool_call_id: string;
  tool_name: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  has_error: number;
  cost: number;
  model: string | null;
}

export interface TurnDurationRow {
  session_id: string;
  user_event_id: string;
  assistant_event_id: string;
  user_timestamp: string;
  assistant_timestamp: string;
  duration_ms: number;
}

export interface PerfResponse {
  tool_duration_quantiles: QuantileStats;
  slow_tools: ToolDurationRow[];
  turn_duration_quantiles: QuantileStats;
  slow_turns: TurnDurationRow[];
}

export interface DailyCostRow {
  day: string;
  cost: number;
  token: number;
}

export interface CostSessionRow {
  id: string;
  key: string | null;
  started_at: string;
  model: string | null;
  token: number;
  cost: number;
  duration_ms: number;
  has_error: number;
}

export interface CostResponse {
  daily: DailyCostRow[];
  top_sessions: CostSessionRow[];
}

export interface ToolCostRow {
  tool_name: string;
  call_count: number;
  total_cost: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  error_count: number;
}

export interface TurnCostRow {
  turn_id: string;
  session_id: string;
  turn_number: number;
  started_at: string;
  ended_at: string | null;
  cost: number;
  token: number;
  duration_ms: number;
  tool_call_count: number;
  has_error: number;
}

export interface ToolCostResponse {
  tools: ToolCostRow[];
}

export interface TurnCostResponse {
  turns: TurnCostRow[];
}

export interface ErrorRateRow {
  total: number;
  error: number;
  error_rate: number;
}

export interface TopErrorToolRow {
  tool_name: string;
  error_count: number;
}

export interface TopErrorMessageRow {
  error_type: string | null;
  error_message: string;
  error_count: number;
}

export interface ErrorsResponse {
  error_rate: ErrorRateRow;
  top_error_tools: TopErrorToolRow[];
  top_error_messages: TopErrorMessageRow[];
}

/**
 * Turn 状态枚举
 * 表示一个 Turn 的执行状态
 */
export type TurnStatus = "in_progress" | "completed" | "error";

/**
 * Turn 接口定义
 * 表示一次用户-助手交互回合
 */
export interface Turn {
  /** Turn 唯一标识符 */
  id: string;
  /** 所属会话 ID */
  session_id: string;
  /** Turn 序号（从 1 开始） */
  turn_number: number;
  /** Turn 开始时间（ISO 8601 格式） */
  started_at: string;
  /** Turn 结束时间（ISO 8601 格式，可选） */
  ended_at?: string;
  /** 用户消息事件 ID */
  user_event_id: string;
  /** 助手消息事件 ID（可选） */
  assistant_event_id?: string;
  /** Turn 持续时间（毫秒，可选） */
  duration_ms?: number;
  /** 工具调用次数 */
  tool_call_count: number;
  /** 错误次数 */
  error_count: number;
  /** 输入 Token 数 */
  input_tokens: number;
  /** 输出 Token 数 */
  output_tokens: number;
  /** 费用（可选） */
  cost?: number;
  /** Turn 状态 */
  status: TurnStatus;
  /** 关联的事件 ID 列表 */
  event_ids: string[];
  /** 用户消息预览（可选） */
  user_preview?: string;
  /** 助手消息预览（可选） */
  assistant_preview?: string;
}

/**
 * 渠道平台类型
 */
export type ChannelPlatform = 
  | "feishu"    // 飞书
  | "discord"   // Discord
  | "slack"     // Slack
  | "telegram"  // Telegram
  | "wechat"    // 微信
  | "system"    // 系统内部
  | "cli"       // 命令行
  | "agent"     // Agent 内部
  | string;     // 其他自定义平台

/**
 * 解析渠道 ID
 * @param channelId - 渠道 ID，格式：平台/标识符
 * @returns 解析结果，包含平台和标识符
 */
export function parseChannelId(channelId: string): {
  platform: ChannelPlatform;
  platformId: string;
  segments: string[];
} {
  const segments = channelId.split("/");
  const platform = segments[0] || "unknown";
  const platformId = segments.slice(1).join("/") || channelId;
  return { platform, platformId, segments };
}

/**
 * 判断是否为飞书渠道
 */
export function isFeishuChannel(channelId: string): boolean {
  return channelId.startsWith("feishu/");
}

/**
 * 判断是否为飞书单聊
 */
export function isFeishuDirectMessage(channelId: string): boolean {
  if (!isFeishuChannel(channelId)) return false;
  const { platformId } = parseChannelId(channelId);
  return platformId.startsWith("ou_");
}

/**
 * 判断是否为飞书群聊
 */
export function isFeishuGroupChat(channelId: string): boolean {
  if (!isFeishuChannel(channelId)) return false;
  const { platformId } = parseChannelId(channelId);
  return platformId.startsWith("oc_");
}

/**
 * 获取渠道显示名称
 * @param channelId - 渠道 ID
 * @returns 友好的显示名称
 */
export function getChannelDisplayName(channelId: string): string {
  const { platform, platformId } = parseChannelId(channelId);
  
  // 飞书渠道
  if (platform === "feishu") {
    if (platformId.startsWith("ou_")) {
      return `飞书单聊 ${platformId.slice(3, 11)}...`;
    }
    if (platformId.startsWith("oc_")) {
      return `飞书群聊 ${platformId.slice(3, 11)}...`;
    }
    return `飞书 ${platformId.slice(0, 8)}...`;
  }
  
  // 系统渠道
  if (platform === "system") {
    return `系统 ${platformId}`;
  }
  
  // Agent 渠道
  if (platform === "agent") {
    return `Agent ${platformId}`;
  }
  
  // CLI 渠道
  if (platform === "cli") {
    return `CLI ${platformId.slice(0, 8)}...`;
  }
  
  // 其他渠道
  return `${platform}/${platformId.slice(0, 8)}...`;
}

/**
 * 类型别名：Channel = Session
 * 用于渐进式迁移到新的术语
 */
export type Channel = Session;
export type ChannelSummary = SessionSummary;
