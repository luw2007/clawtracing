export interface Correlation {
  runId?: string;
  turnId?: string;
  toolCallId?: string;
  parentEventId?: string;
}

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
  /** 所属会话 ID */
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
    /** Token 使用统计 */
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    /** 其他自定义元数据 */
    [key: string]: unknown;
  };
  /** 父事件 ID（用于事件关联） */
  parent_id?: string;
  /** 事件持续时间（毫秒） */
  duration_ms?: number;
  level?: string;
  error?: unknown;
  cost?: number;
  correlation?: Correlation;
  /** Hook 实例 ID，用于多实例场景下区分数据来源 */
  instance_id?: string;
}
