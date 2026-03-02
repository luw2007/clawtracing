/**
 * Turn 状态枚举
 * 表示回合的当前状态
 */
export type TurnStatus = "in_progress" | "completed" | "error";

/**
 * Turn 接口定义
 * 表示一个完整的对话回合（从用户消息到助手响应）
 */
export interface Turn {
  /** Turn 唯一标识符 */
  id: string;
  /** 所属会话 ID */
  session_id: string;
  /** 回合序号（从 1 开始） */
  turn_number: number;
  /** Turn 开始时间（user_message 时间，ISO 8601 格式） */
  started_at: string;
  /** Turn 结束时间（assistant_message 时间，ISO 8601 格式） */
  ended_at?: string;
  /** 用户消息事件 ID */
  user_event_id?: string;
  /** 助手消息事件 ID */
  assistant_event_id?: string;
  /** 总耗时（毫秒） */
  duration_ms?: number;
  /** 工具调用次数 */
  tool_call_count: number;
  /** 错误次数 */
  error_count: number;
  /** 输入 Token 数 */
  input_tokens: number;
  /** 输出 Token 数 */
  output_tokens: number;
  /** 成本 */
  cost?: number;
  /** Turn 状态 */
  status: TurnStatus;
  /** 关联事件 ID 列表 */
  event_ids: string[];
}
