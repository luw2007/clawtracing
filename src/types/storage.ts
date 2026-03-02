import type { TracingEvent } from "./events.js";
import type { Session, SessionSummary } from "./session.js";

/**
 * 存储接口定义
 * 定义追踪数据持久化的标准接口
 */
export interface StorageInterface {
  /**
   * 初始化存储
   * 创建必要的数据库表或文件结构
   */
  initialize(): Promise<void>;

  /**
   * 创建新会话
   * @param session - 会话对象（不含 id，由存储层生成）
   * @returns 创建的完整会话对象
   */
  createSession(session: Omit<Session, "id">): Promise<Session>;

  /**
   * 获取会话详情
   * @param sessionId - 会话 ID
   * @returns 会话对象，不存在时返回 null
   */
  getSession(sessionId: string): Promise<Session | null>;

  /**
   * 更新会话信息
   * @param sessionId - 会话 ID
   * @param updates - 要更新的字段
   * @returns 更新后的会话对象
   */
  updateSession(sessionId: string, updates: Partial<Session>): Promise<Session>;

  /**
   * 删除会话及其所有事件
   * @param sessionId - 会话 ID
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * 获取会话列表
   * @param options - 查询选项
   * @returns 会话摘要列表
   */
  listSessions(options?: {
    /** 返回数量限制 */
    limit?: number;
    /** 偏移量 */
    offset?: number;
    /** 状态过滤 */
    status?: Session["status"];
    /** 排序字段 */
    orderBy?: "created_at" | "updated_at";
    /** 排序方向 */
    order?: "asc" | "desc";
  }): Promise<SessionSummary[]>;

  /**
   * 添加事件到会话
   * @param event - 事件对象（不含 id，由存储层生成）
   * @returns 创建的完整事件对象
   */
  addEvent(event: Omit<TracingEvent, "id">): Promise<TracingEvent>;

  /**
   * 获取会话的所有事件
   * @param sessionId - 会话 ID
   * @param options - 查询选项
   * @returns 事件列表
   */
  getEvents(
    sessionId: string,
    options?: {
      /** 返回数量限制 */
      limit?: number;
      /** 偏移量 */
      offset?: number;
      /** 事件类型过滤 */
      type?: TracingEvent["type"];
      /** 开始时间 */
      since?: string;
    }
  ): Promise<TracingEvent[]>;

  /**
   * 获取单个事件
   * @param eventId - 事件 ID
   * @returns 事件对象，不存在时返回 null
   */
  getEvent(eventId: string): Promise<TracingEvent | null>;

  /**
   * 关闭存储连接
   */
  close(): Promise<void>;
}
