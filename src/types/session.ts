/**
 * 会话状态枚举
 */
export type SessionStatus = "active" | "completed" | "error" | "archived";

/**
 * 会话接口定义
 * 表示一个完整的追踪会话
 */
export interface Session {
  /** 会话唯一标识符 */
  id: string;
  /** 会话名称/标题 */
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
  stats?: {
    /** 事件总数 */
    event_count: number;
    /** 总输入 Token 数 */
    total_input_tokens: number;
    /** 总输出 Token 数 */
    total_output_tokens: number;
    /** 会话持续时间（毫秒） */
    duration_ms: number;
  };
}

/**
 * 会话摘要接口定义
 * 用于列表展示的精简会话信息
 */
export interface SessionSummary {
  /** 会话唯一标识符 */
  id: string;
  /** 会话名称/标题 */
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
}
