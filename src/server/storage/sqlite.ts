/**
 * SQLite 存储实现
 * 使用 better-sqlite3 提供结构化数据存储
 */

import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { TracingEvent } from "../../types/index.js";
import type { Turn, TurnStatus } from "../../types/turn.js";
import { estimateCostUsdFromUsage } from "../pricing.js";

/** 排序顺序 */
export type SortOrder = "asc" | "desc";

/** SQLite 存储配置选项 */
export interface SqliteStorageOptions {
  /** 数据库文件路径，默认 ~/.openclaw_tracing/tracing.db */
  dbPath?: string;
}

/** 事件记录行类型 */
interface EventRow {
  id: string;
  type: string;
  action: string | null;
  session_id: string;
  session_key: string | null;
  timestamp: string;
  duration_ms?: number | null;
  model?: string | null;
  token?: number | null;
  cost?: number | null;
  has_error?: number | null;
  error_type?: string | null;
  error_message?: string | null;
  tool_call_id?: string | null;
  instance_id?: string | null;
  data: string;
}

/** 会话记录行类型 */
interface SessionRow {
  id: string;
  key: string | null;
  started_at: string;
  message_count: number;
  total_tokens: number;
  model?: string | null;
  token?: number | null;
  cost?: number | null;
  duration_ms?: number | null;
  has_error?: number | null;
}

/** Token 统计类型 */
export interface TokenStats {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  session_count: number;
}

/** 工具使用统计类型 */
export interface ToolUsageStats {
  tool_name: string;
  call_count: number;
  error_count: number;
}

/** 综合统计类型 */
export interface StorageStats {
  tokens: TokenStats;
  tools: ToolUsageStats[];
  event_count: number;
  session_count: number;
}

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

export interface ErrorAggregations {
  error_rate: ErrorRateRow;
  top_error_tools: TopErrorToolRow[];
  top_error_messages: TopErrorMessageRow[];
}

/** 按工具聚合成本行类型 */
export interface ToolCostRow {
  tool_name: string;
  call_count: number;
  total_cost: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  error_count: number;
}

/** 按回合聚合成本行类型 */
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

/**
 * SQLite 存储类
 * 提供结构化的事件和会话存储
 */
export class SqliteStorage {
  private readonly dbPath: string;
  private db: Database.Database | null = null;

  constructor(options: SqliteStorageOptions = {}) {
    this.dbPath =
      options.dbPath ?? join(homedir(), ".openclaw_tracing", "tracing.db");
  }

  /**
   * 初始化数据库
   * 创建必要的表结构
   */
  async initialize(): Promise<void> {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        action TEXT,
        session_id TEXT NOT NULL,
        session_key TEXT,
        timestamp TEXT NOT NULL,
        duration_ms INTEGER,
        model TEXT,
        token INTEGER,
        cost REAL,
        has_error INTEGER,
        error_type TEXT,
        error_message TEXT,
        tool_call_id TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        key TEXT,
        started_at TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        model TEXT,
        token INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        has_error INTEGER DEFAULT 0
      );
    `);

    const schemaChanged = this.ensureSchema();
    if (schemaChanged) {
      this.backfillAndRebuildSessions();
    }
    this.ensureIndexes();
  }

  /**
   * 插入事件
   * @param event - 追踪事件对象
   */
  insertEvent(event: TracingEvent): void {
    this.ensureInitialized();

    const action = this.extractAction(event);
    const sessionKey = this.extractSessionKey(event);
    const durationMs = this.extractDurationMs(event);
    const model = this.extractModel(event);
    const token = this.extractToken(event);
    const cost = this.extractCost(event);
    const hasError = this.extractHasError(event);
    const errorType = hasError ? this.extractErrorType(event) : null;
    const errorMessage = hasError ? this.extractErrorMessage(event) : null;
    const toolCallId = this.extractToolCallId(event);
    const instanceId = event.instance_id ?? null;

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO events (
        id,
        type,
        action,
        session_id,
        session_key,
        timestamp,
        duration_ms,
        model,
        token,
        cost,
        has_error,
        error_type,
        error_message,
        tool_call_id,
        instance_id,
        data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.type,
      action,
      event.session_id,
      sessionKey,
      event.timestamp,
      durationMs,
      model,
      token,
      cost,
      hasError,
      errorType,
      errorMessage,
      toolCallId,
      instanceId,
      JSON.stringify(event)
    );

    this.updateSessionStats(event);
  }

  /**
   * 获取事件列表
   * @param sessionId - 可选，按会话 ID 过滤
   * @param order - 排序顺序，默认 asc
   * @returns 事件列表
   */
  getEvents(sessionId?: string, order: SortOrder = "asc"): TracingEvent[] {
    this.ensureInitialized();

    const orderSql = order === "desc" ? "DESC" : "ASC";
    let stmt: Database.Statement;
    let rows: EventRow[];

    if (sessionId) {
      stmt = this.db!.prepare(`
        SELECT data FROM events WHERE session_id = ? ORDER BY timestamp ${orderSql}
      `);
      rows = stmt.all(sessionId) as EventRow[];
    } else {
      stmt = this.db!.prepare(`
        SELECT data FROM events ORDER BY timestamp ${orderSql}
      `);
      rows = stmt.all() as EventRow[];
    }

    return rows.map((row) => JSON.parse(row.data) as TracingEvent);
  }

  getEventsFiltered(options?: {
    session_id?: string;
    from?: string;
    to?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    tool_name?: string;
    type?: string;
    turn_id?: string;
    tool_call_id?: string;
    instance_id?: string;
    limit?: number;
    offset?: number;
    order?: SortOrder;
  }): TracingEvent[] | { events: TracingEvent[]; total: number } {
    this.ensureInitialized();

    const where: string[] = [];
    const params: Array<string | number> = [];
    let joinSql = "";

    if (options?.session_id) {
      where.push(`e.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.from) {
      where.push(`e.timestamp >= ?`);
      params.push(options.from);
    }
    if (options?.to) {
      where.push(`e.timestamp < ?`);
      params.push(options.to);
    }
    if (typeof options?.has_error === "number") {
      where.push(`COALESCE(e.has_error, 0) = ?`);
      params.push(Math.max(0, Math.min(1, Math.floor(options.has_error))));
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      where.push(`COALESCE(e.duration_ms, 0) >= ?`);
      params.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      where.push(`e.model = ?`);
      params.push(options.model);
    }
    if (options?.type) {
      where.push(`e.type = ?`);
      params.push(options.type);
    }
    if (options?.tool_call_id) {
      where.push(`e.tool_call_id = ?`);
      params.push(options.tool_call_id);
    }
    if (options?.instance_id) {
      where.push(`e.instance_id = ?`);
      params.push(options.instance_id);
    }
    if (options?.tool_name) {
      joinSql = `
        LEFT JOIN events c
          ON c.session_id = e.session_id
          AND c.tool_call_id = e.tool_call_id
          AND c.type = 'tool_call'
      `;
      where.push(`(
        (e.type = 'tool_call' AND e.action = ?)
        OR
        (e.type = 'tool_result' AND c.action = ?)
      )`);
      params.push(options.tool_name, options.tool_name);
    }

    let events: TracingEvent[];

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const needPagination = typeof options?.limit === "number" && options.limit > 0;
    const orderSql = options?.order === "desc" ? "DESC" : "ASC";

    const stmt = this.db!.prepare(`
      SELECT e.data
      FROM events e
      ${joinSql}
      ${whereSql}
      ORDER BY e.timestamp ${orderSql}
    `);
    const rows = stmt.all(...params) as Array<{ data: string }>;
    events = rows.map((row) => JSON.parse(row.data) as TracingEvent);

    if (options?.turn_id) {
      const turnResult = this.getEventsForTurn(options.turn_id);
      if (turnResult) {
        const turnEventIds = new Set(turnResult.turn.event_ids);
        events = events.filter((e) => turnEventIds.has(e.id));
      } else {
        events = [];
      }
    }

    // 如果需要分页，返回带 total 的对象
    if (needPagination) {
      const total = events.length;
      const offset = Math.max(0, options?.offset ?? 0);
      const limit = options!.limit!;
      const paginatedEvents = events.slice(offset, offset + limit);
      return { events: paginatedEvents, total };
    }

    return events;
  }

  /**
   * 获取会话列表
   * @param order - 排序顺序，默认 desc
   * @returns 会话列表
   */
  getSessions(order: SortOrder = "desc"): SessionRow[] {
    this.ensureInitialized();

    const orderSql = order === "asc" ? "ASC" : "DESC";
    const stmt = this.db!.prepare(`
      SELECT * FROM sessions ORDER BY started_at ${orderSql}
    `);
    return stmt.all() as SessionRow[];
  }

  /**
   * 获取会话列表（带扩展统计）
   * @param order - 排序顺序，默认 desc
   * @param instanceId - 可选，按 Hook 实例 ID 过滤
   * @returns 会话列表及统计数据
   */
  getSessionsWithStats(order: SortOrder = "desc", instanceId?: string): Array<{
    id: string;
    key: string | null;
    started_at: string;
    updated_at: string;
    message_count: number;
    turn_count: number;
    tool_call_count: number;
    total_tokens: number;
    total_cost: number;
    has_error: boolean;
    top_tools: string[];
  }> {
    this.ensureInitialized();

    const orderSql = order === "asc" ? "ASC" : "DESC";
    const instanceFilter = instanceId ? `AND instance_id = ?` : "";
    const instanceFilterParam = instanceId ? [instanceId] : [];

    const sessionsStmt = this.db!.prepare(`
      SELECT
        s.id,
        s.key,
        s.started_at,
        COALESCE(
          (SELECT MAX(timestamp) FROM events WHERE session_id = s.id ${instanceFilter}),
          s.started_at
        ) as updated_at,
        s.message_count,
        (
          SELECT COUNT(DISTINCT json_extract(data, '$.correlation.turnId'))
          FROM events
          WHERE session_id = s.id
            AND json_extract(data, '$.correlation.turnId') IS NOT NULL
            ${instanceFilter}
        ) as turn_count,
        COALESCE(
          (SELECT COUNT(*) FROM events WHERE session_id = s.id AND type = 'tool_call' ${instanceFilter}),
          0
        ) as tool_call_count,
        COALESCE(
          (SELECT SUM(COALESCE(token, 0)) FROM events WHERE session_id = s.id ${instanceFilter}),
          0
        ) as total_tokens,
        COALESCE(
          (SELECT SUM(COALESCE(cost, 0)) FROM events WHERE session_id = s.id ${instanceFilter}),
          0
        ) as total_cost,
        COALESCE(
          (SELECT MAX(COALESCE(has_error, 0)) FROM events WHERE session_id = s.id ${instanceFilter}),
          0
        ) as has_error
      FROM sessions s
      WHERE EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id ${instanceFilter})
      ORDER BY updated_at ${orderSql}
    `);

    const params = instanceId
      ? [instanceId, instanceId, instanceId, instanceId, instanceId, instanceId, instanceId]
      : [];
    const sessions = sessionsStmt.all(...params) as Array<{
      id: string;
      key: string | null;
      started_at: string;
      updated_at: string;
      message_count: number;
      turn_count: number;
      tool_call_count: number;
      total_tokens: number;
      total_cost: number;
      has_error: number;
    }>;

    const topToolsStmt = this.db!.prepare(`
      SELECT action as tool_name, COUNT(*) as cnt
      FROM events
      WHERE session_id = ?
        AND type = 'tool_call'
        AND action IS NOT NULL
      GROUP BY action
      ORDER BY cnt DESC
      LIMIT 3
    `);

    return sessions.map((s) => {
      const toolRows = topToolsStmt.all(s.id) as Array<{ tool_name: string; cnt: number }>;
      return {
        id: s.id,
        key: s.key,
        started_at: s.started_at,
        updated_at: s.updated_at,
        message_count: s.message_count,
        turn_count: s.turn_count,
        tool_call_count: s.tool_call_count,
        total_tokens: s.total_tokens,
        total_cost: s.total_cost,
        has_error: s.has_error === 1,
        top_tools: toolRows.map((r) => r.tool_name),
      };
    });
  }

  /**
   * 获取统计信息
   * @returns 综合统计数据
   */
  getStats(): StorageStats {
    this.ensureInitialized();

    const tokenStats = this.getTokenStats();
    const toolStats = this.getToolUsageStats();
    const eventCount = this.getEventCount();
    const sessionCount = this.getSessionCount();

    return {
      tokens: tokenStats,
      tools: toolStats,
      event_count: eventCount,
      session_count: sessionCount,
    };
  }

  /**
   * 获取会话统计信息
   * @param sessionId - 会话 ID
   * @returns 会话统计数据
   */
  getSessionStats(sessionId: string): {
    total_events: number;
    events_by_type: Record<string, number>;
    total_duration_ms: number;
    total_tokens: number;
    total_cost: number;
    error_count: number;
    tool_call_count: number;
    turn_count: number;
    first_event_at: string | null;
    last_event_at: string | null;
  } {
    this.ensureInitialized();

    const countStmt = this.db!.prepare(`
      SELECT COUNT(*) as total FROM events WHERE session_id = ?
    `);
    const countRow = countStmt.get(sessionId) as { total: number };

    const typeStmt = this.db!.prepare(`
      SELECT type, COUNT(*) as count FROM events WHERE session_id = ? GROUP BY type
    `);
    const typeRows = typeStmt.all(sessionId) as Array<{ type: string; count: number }>;
    const eventsByType: Record<string, number> = {};
    for (const row of typeRows) {
      eventsByType[row.type] = row.count;
    }

    const aggStmt = this.db!.prepare(`
      SELECT 
        COALESCE(SUM(COALESCE(duration_ms, 0)), 0) as total_duration_ms,
        COALESCE(SUM(COALESCE(token, 0)), 0) as total_tokens,
        COALESCE(SUM(COALESCE(cost, 0)), 0) as total_cost,
        SUM(CASE WHEN COALESCE(has_error, 0) = 1 THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN type = 'tool_call' THEN 1 ELSE 0 END) as tool_call_count,
        MIN(timestamp) as first_event_at,
        MAX(timestamp) as last_event_at
      FROM events WHERE session_id = ?
    `);
    const aggRow = aggStmt.get(sessionId) as {
      total_duration_ms: number;
      total_tokens: number;
      total_cost: number;
      error_count: number;
      tool_call_count: number;
      first_event_at: string | null;
      last_event_at: string | null;
    };

    const turns = this.getTurnsForSession(sessionId);

    return {
      total_events: countRow.total,
      events_by_type: eventsByType,
      total_duration_ms: aggRow.total_duration_ms || 0,
      total_tokens: aggRow.total_tokens || 0,
      total_cost: aggRow.total_cost || 0,
      error_count: aggRow.error_count || 0,
      tool_call_count: aggRow.tool_call_count || 0,
      turn_count: turns.length,
      first_event_at: aggRow.first_event_at,
      last_event_at: aggRow.last_event_at,
    };
  }

  getToolDurationQuantiles(options?: {
    since?: string;
    until?: string;
    tool_name?: string;
    session_id?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
  }): QuantileStats {
    const rows = this.getToolDurations({
      ...options,
      limit: undefined,
      order_by: "duration_desc",
    });
    const durations = rows.map((r) => r.duration_ms).filter((v) => Number.isFinite(v));
    return this.computeQuantileStats(durations);
  }

  getSlowToolsTopN(
    limit = 20,
    options?: {
      since?: string;
      until?: string;
      tool_name?: string;
      session_id?: string;
      has_error?: number;
      min_duration_ms?: number;
      model?: string;
    }
  ): ToolDurationRow[] {
    return this.getToolDurations({
      ...options,
      limit,
      order_by: "duration_desc",
    });
  }

  getTurnDurationQuantiles(options?: {
    since?: string;
    until?: string;
    session_id?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    tool_name?: string;
  }): QuantileStats {
    const rows = this.getTurnDurations({
      ...options,
      limit: undefined,
      order_by: "duration_desc",
    });
    const durations = rows.map((r) => r.duration_ms).filter((v) => Number.isFinite(v));
    return this.computeQuantileStats(durations);
  }

  getSlowTurnsTopN(
    limit = 20,
    options?: {
      since?: string;
      until?: string;
      session_id?: string;
      has_error?: number;
      min_duration_ms?: number;
      model?: string;
      tool_name?: string;
    }
  ): TurnDurationRow[] {
    return this.getTurnDurations({
      ...options,
      limit,
      order_by: "duration_desc",
    });
  }

  getDailyCostAggregation(options?: {
    since?: string;
    until?: string;
    limit?: number;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    tool_name?: string;
  }): DailyCostRow[] {
    this.ensureInitialized();

    const where: string[] = [];
    const params: Array<string | number> = [];
    let joinSql = "";

    if (options?.since) {
      where.push(`e.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`e.timestamp < ?`);
      params.push(options.until);
    }
    if (typeof options?.has_error === "number") {
      where.push(`COALESCE(e.has_error, 0) = ?`);
      params.push(Math.max(0, Math.min(1, Math.floor(options.has_error))));
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      where.push(`COALESCE(e.duration_ms, 0) >= ?`);
      params.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      where.push(`e.model = ?`);
      params.push(options.model);
    }
    if (options?.tool_name) {
      joinSql = `
        LEFT JOIN events c
          ON c.session_id = e.session_id
          AND c.tool_call_id = e.tool_call_id
          AND c.type = 'tool_call'
      `;
      where.push(`(
        (e.type = 'tool_call' AND e.action = ?)
        OR
        (e.type = 'tool_result' AND c.action = ?)
      )`);
      params.push(options.tool_name, options.tool_name);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limitSql = typeof options?.limit === "number" ? `LIMIT ${Math.max(0, Math.floor(options.limit))}` : "";

    const stmt = this.db!.prepare(`
      SELECT
        substr(e.timestamp, 1, 10) as day,
        SUM(COALESCE(e.cost, 0)) as cost,
        SUM(COALESCE(e.token, 0)) as token
      FROM events e
      ${joinSql}
      ${whereSql}
      GROUP BY day
      ORDER BY day DESC
      ${limitSql}
    `);

    const rows = stmt.all(...params) as Array<{ day: string; cost: number; token: number }>;
    return rows.map((r) => ({
      day: r.day,
      cost: Number(r.cost) || 0,
      token: Number(r.token) || 0,
    }));
  }

  getTopCostSessions(options?: {
    limit?: number;
    since?: string;
    until?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    tool_name?: string;
  }): CostSessionRow[] {
    this.ensureInitialized();

    const limit = Math.max(0, Math.floor(options?.limit ?? 20));
    const where: string[] = [];
    const params: Array<string | number> = [];
    let joinSql = "";

    if (options?.since) {
      where.push(`e.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`e.timestamp < ?`);
      params.push(options.until);
    }
    if (typeof options?.has_error === "number") {
      where.push(`COALESCE(e.has_error, 0) = ?`);
      params.push(Math.max(0, Math.min(1, Math.floor(options.has_error))));
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      where.push(`COALESCE(e.duration_ms, 0) >= ?`);
      params.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      where.push(`e.model = ?`);
      params.push(options.model);
    }
    if (options?.tool_name) {
      joinSql = `
        LEFT JOIN events c
          ON c.session_id = e.session_id
          AND c.tool_call_id = e.tool_call_id
          AND c.type = 'tool_call'
      `;
      where.push(`(
        (e.type = 'tool_call' AND e.action = ?)
        OR
        (e.type = 'tool_result' AND c.action = ?)
      )`);
      params.push(options.tool_name, options.tool_name);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const stmt = this.db!.prepare(`
      WITH filtered AS (
        SELECT
          e.session_id as session_id,
          SUM(COALESCE(e.token, 0)) as token,
          SUM(COALESCE(e.cost, 0)) as cost,
          SUM(COALESCE(e.duration_ms, 0)) as duration_ms,
          MAX(COALESCE(e.has_error, 0)) as has_error,
          MAX(e.model) as model
        FROM events e
        ${joinSql}
        ${whereSql}
        GROUP BY e.session_id
      )
      SELECT
        s.id as id,
        s.key as key,
        s.started_at as started_at,
        filtered.model as model,
        filtered.token as token,
        filtered.cost as cost,
        filtered.duration_ms as duration_ms,
        filtered.has_error as has_error
      FROM filtered
      JOIN sessions s ON s.id = filtered.session_id
      ORDER BY filtered.cost DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, limit) as Array<{
      id: string;
      key: string | null;
      started_at: string;
      model: string | null;
      token: number;
      cost: number;
      duration_ms: number;
      has_error: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      key: r.key ?? null,
      started_at: r.started_at,
      model: r.model ?? null,
      token: Number(r.token) || 0,
      cost: Number(r.cost) || 0,
      duration_ms: Number(r.duration_ms) || 0,
      has_error: Number(r.has_error) || 0,
    }));
  }

  getErrorAggregations(options?: {
    since?: string;
    until?: string;
    session_id?: string;
    tool_name?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    top_n?: number;
  }): ErrorAggregations {
    this.ensureInitialized();

    const topN = Math.max(0, Math.floor(options?.top_n ?? 10));

    const errorRate = this.getErrorRate({
      since: options?.since,
      until: options?.until,
      session_id: options?.session_id,
      tool_name: options?.tool_name,
      has_error: options?.has_error,
      min_duration_ms: options?.min_duration_ms,
      model: options?.model,
    });

    const topErrorTools = this.getTopErrorTools(topN, {
      since: options?.since,
      until: options?.until,
      session_id: options?.session_id,
      tool_name: options?.tool_name,
      min_duration_ms: options?.min_duration_ms,
      model: options?.model,
    });

    const topErrorMessages = this.getTopErrorMessages(topN, {
      since: options?.since,
      until: options?.until,
      session_id: options?.session_id,
      tool_name: options?.tool_name,
      min_duration_ms: options?.min_duration_ms,
      model: options?.model,
    });

    return {
      error_rate: errorRate,
      top_error_tools: topErrorTools,
      top_error_messages: topErrorMessages,
    };
  }

  /**
   * 按工具聚合成本
   * 返回每个工具的调用次数、总成本、平均耗时等统计信息
   */
  getToolCostAggregation(options?: {
    session_id?: string;
    since?: string;
    until?: string;
    limit?: number;
  }): ToolCostRow[] {
    this.ensureInitialized();

    const where: string[] = ["e.type = 'tool_call'", "e.action IS NOT NULL"];
    const params: Array<string | number> = [];

    if (options?.session_id) {
      where.push(`e.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.since) {
      where.push(`e.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`e.timestamp < ?`);
      params.push(options.until);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const limitSql = typeof options?.limit === "number" ? `LIMIT ${Math.max(0, Math.floor(options.limit))}` : "";

    const stmt = this.db!.prepare(`
      WITH tool_calls AS (
        SELECT
          e.action as tool_name,
          e.tool_call_id,
          e.session_id,
          e.timestamp as call_timestamp,
          COALESCE(e.cost, 0) as call_cost,
          COALESCE(e.duration_ms, 0) as call_duration,
          COALESCE(e.has_error, 0) as call_error
        FROM events e
        ${whereSql}
      ),
      tool_results AS (
        SELECT
          r.tool_call_id,
          COALESCE(r.cost, 0) as result_cost,
          COALESCE(r.duration_ms, 0) as result_duration,
          COALESCE(r.has_error, 0) as result_error
        FROM events r
        WHERE r.type = 'tool_result' AND r.tool_call_id IS NOT NULL
      ),
      combined AS (
        SELECT
          tc.tool_name,
          COALESCE(tc.call_cost, 0) + COALESCE(tr.result_cost, 0) as total_cost,
          COALESCE(tr.result_duration, tc.call_duration) as duration_ms,
          CASE WHEN tc.call_error = 1 OR tr.result_error = 1 THEN 1 ELSE 0 END as has_error
        FROM tool_calls tc
        LEFT JOIN tool_results tr ON tc.tool_call_id = tr.tool_call_id
      )
      SELECT
        tool_name,
        COUNT(*) as call_count,
        SUM(total_cost) as total_cost,
        SUM(duration_ms) as total_duration_ms,
        AVG(duration_ms) as avg_duration_ms,
        SUM(has_error) as error_count
      FROM combined
      GROUP BY tool_name
      ORDER BY total_cost DESC
      ${limitSql}
    `);

    const rows = stmt.all(...params) as Array<{
      tool_name: string;
      call_count: number;
      total_cost: number;
      total_duration_ms: number;
      avg_duration_ms: number;
      error_count: number;
    }>;

    return rows.map((r) => ({
      tool_name: r.tool_name,
      call_count: Number(r.call_count) || 0,
      total_cost: Number(r.total_cost) || 0,
      total_duration_ms: Number(r.total_duration_ms) || 0,
      avg_duration_ms: Number(r.avg_duration_ms) || 0,
      error_count: Number(r.error_count) || 0,
    }));
  }

  /**
   * 按回合聚合成本
   * 返回指定会话的每个回合的成本、Token、耗时等统计信息
   */
  getTurnCostAggregation(sessionId: string): TurnCostRow[] {
    this.ensureInitialized();

    const turns = this.getTurnsForSession(sessionId);

    return turns.map((turn) => ({
      turn_id: turn.id,
      session_id: turn.session_id,
      turn_number: turn.turn_number,
      started_at: turn.started_at,
      ended_at: turn.ended_at ?? null,
      cost: turn.cost ?? 0,
      token: turn.input_tokens + turn.output_tokens,
      duration_ms: turn.duration_ms ?? 0,
      tool_call_count: turn.tool_call_count,
      has_error: turn.error_count > 0 ? 1 : 0,
    }));
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 获取数据库路径
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * 确保数据库已初始化
   */
  private ensureInitialized(): void {
    if (!this.db) {
      throw new Error("SqliteStorage 未初始化，请先调用 initialize()");
    }
  }

  /**
   * 从事件中提取 action 信息
   * 主要用于工具调用事件
   */
  private extractAction(event: TracingEvent): string | null {
    if (event.type === "tool_call" && event.content.length > 0) {
      const block = event.content[0];
      if (block.type === "tool_use" && block.name) {
        return block.name;
      }
    }
    return null;
  }

  /**
   * 从事件元数据中提取会话 key
   */
  private extractSessionKey(event: TracingEvent): string | null {
    const m = event.metadata as Record<string, unknown> | undefined;
    const v =
      (m?.session_key as string | undefined) ??
      (m?.sessionKey as string | undefined) ??
      (m?.key as string | undefined);
    return typeof v === "string" && v.length > 0 ? v : null;
  }

  private extractToolCallId(event: TracingEvent): string | null {
    for (const block of event.content) {
      if (event.type === "tool_call" && block.type === "tool_use" && typeof block.id === "string") {
        return block.id;
      }
      if (event.type === "tool_result" && block.type === "tool_result" && typeof block.id === "string") {
        return block.id;
      }
    }
    return null;
  }

  private extractDurationMs(event: TracingEvent): number | null {
    if (typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms)) {
      return Math.max(0, Math.floor(event.duration_ms));
    }
    let best: number | null = null;
    for (const block of event.content) {
      if (typeof block.duration_ms === "number" && Number.isFinite(block.duration_ms)) {
        const v = Math.max(0, Math.floor(block.duration_ms));
        if (best === null || v > best) {
          best = v;
        }
      }
    }
    return best;
  }

  private extractModel(event: TracingEvent): string | null {
    const model = event.metadata?.model;
    return typeof model === "string" && model.length > 0 ? model : null;
  }

  private extractToken(event: TracingEvent): number {
    const usage = event.metadata?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    const input = typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
    const output = typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;
    const total = input + output;
    return Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  }

  private extractCost(event: TracingEvent): number {
    if (typeof event.cost === "number" && Number.isFinite(event.cost)) {
      return event.cost;
    }
    const sumBlocks = (blocks: TracingEvent["content"]): { sum: number; has: boolean } => {
      let sum = 0;
      let has = false;
      for (const block of blocks) {
        if (typeof block.cost === "number" && Number.isFinite(block.cost)) {
          sum += block.cost;
          has = true;
        }
        if (Array.isArray(block.content)) {
          const nested = sumBlocks(block.content);
          sum += nested.sum;
          has = has || nested.has;
        }
      }
      return { sum, has };
    };

    const blocks = sumBlocks(event.content);
    if (blocks.has) {
      return Number.isFinite(blocks.sum) ? blocks.sum : 0;
    }

    const usage = event.metadata?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    return estimateCostUsdFromUsage({
      model: event.metadata?.model,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    });
  }

  private extractHasError(event: TracingEvent): number {
    if (event.type === "error") {
      return 1;
    }
    if (event.error !== undefined && event.error !== null) {
      return 1;
    }
    for (const block of event.content) {
      if (block.type === "tool_result" && block.is_error) {
        return 1;
      }
      if (block.error !== undefined && block.error !== null) {
        return 1;
      }
      if (typeof block.level === "string" && block.level.toLowerCase() === "error") {
        return 1;
      }
    }
    if (typeof event.level === "string" && event.level.toLowerCase() === "error") {
      return 1;
    }
    return 0;
  }

  private extractErrorType(event: TracingEvent): string | null {
    const direct = this.toErrorType(event.error);
    if (direct) return direct;
    for (const block of event.content) {
      const v = this.toErrorType(block.error);
      if (v) return v;
      if (block.type === "tool_result" && block.is_error) {
        return "tool_result_error";
      }
      if (typeof block.level === "string" && block.level.toLowerCase() === "error") {
        return "error";
      }
    }
    if (typeof event.level === "string" && event.level.toLowerCase() === "error") {
      return "error";
    }
    return null;
  }

  private extractErrorMessage(event: TracingEvent): string | null {
    const direct = this.toErrorMessage(event.error);
    if (direct) return direct;
    for (const block of event.content) {
      const v = this.toErrorMessage(block.error);
      if (v) return v;
      if (block.type === "tool_result" && block.is_error) {
        const msg = this.toErrorMessage(block.content);
        if (msg) return msg;
      }
      if (typeof block.level === "string" && block.level.toLowerCase() === "error") {
        const msg = this.toErrorMessage(block.content);
        if (msg) return msg;
      }
    }
    return null;
  }

  private toErrorType(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "bigint") return "bigint";
    if (typeof value === "symbol") return "symbol";
    if (typeof value === "function") return "function";
    if (value instanceof Error) {
      const name = value.name?.trim();
      return name && name.length > 0 ? name : "Error";
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (name) return name;
      const type = typeof obj.type === "string" ? obj.type.trim() : "";
      if (type) return type;
      return "object";
    }
    return null;
  }

  private toErrorMessage(value: unknown): string | null {
    const s = this.toStringValue(value);
    if (!s) return null;
    return s.length > 2000 ? s.slice(0, 2000) : s;
  }

  private toStringValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const s = value.trim();
      return s.length > 0 ? s : null;
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (value instanceof Error) {
      const msg = value.message?.trim();
      return msg && msg.length > 0 ? msg : value.name;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = this.toStringValue(item);
        if (nested) return nested;
      }
      return null;
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const msg = this.toStringValue(obj.message);
      if (msg) return msg;
      const text = this.toStringValue(obj.text);
      if (text) return text;
      try {
        const json = JSON.stringify(value);
        const s = json.trim();
        return s.length > 0 ? s : null;
      } catch {
        return null;
      }
    }
    try {
      const s = String(value).trim();
      return s.length > 0 ? s : null;
    } catch {
      return null;
    }
  }

  /**
   * 更新会话统计信息
   */
  private updateSessionStats(event: TracingEvent): void {
    const sessionKey = this.extractSessionKey(event);
    const model = this.extractModel(event);
    const token = this.extractToken(event);
    const cost = this.extractCost(event);
    const durationMs = this.extractDurationMs(event) ?? 0;
    const hasError = this.extractHasError(event);

    const existingSession = this.db!.prepare(
      `SELECT id FROM sessions WHERE id = ?`
    ).get(event.session_id) as SessionRow | undefined;

    if (!existingSession) {
      this.db!.prepare(`
        INSERT INTO sessions (
          id,
          key,
          started_at,
          message_count,
          total_tokens,
          model,
          token,
          cost,
          duration_ms,
          has_error
        )
        VALUES (?, ?, ?, 0, 0, ?, 0, 0, 0, 0)
      `).run(event.session_id, sessionKey, event.timestamp, model);
    }

    if (sessionKey) {
      this.db!.prepare(`
        UPDATE sessions SET key = COALESCE(key, ?) WHERE id = ?
      `).run(sessionKey, event.session_id);
    }

    if (model) {
      this.db!.prepare(`
        UPDATE sessions SET model = ? WHERE id = ?
      `).run(model, event.session_id);
    }

    if (event.type === "user_message" || event.type === "assistant_message") {
      this.db!.prepare(`
        UPDATE sessions SET message_count = message_count + 1 WHERE id = ?
      `).run(event.session_id);
    }

    if (token > 0) {
      this.db!.prepare(`
        UPDATE sessions
        SET total_tokens = total_tokens + ?, token = COALESCE(token, 0) + ?
        WHERE id = ?
      `).run(token, token, event.session_id);
    }

    if (cost !== 0) {
      this.db!.prepare(`
        UPDATE sessions SET cost = COALESCE(cost, 0) + ? WHERE id = ?
      `).run(cost, event.session_id);
    }

    if (durationMs > 0) {
      this.db!.prepare(`
        UPDATE sessions SET duration_ms = COALESCE(duration_ms, 0) + ? WHERE id = ?
      `).run(durationMs, event.session_id);
    }

    if (hasError) {
      this.db!.prepare(`
        UPDATE sessions SET has_error = 1 WHERE id = ?
      `).run(event.session_id);
    }
  }

  /**
   * 获取 Token 统计
   */
  private getTokenStats(): TokenStats {
    const events = this.getEvents();
    let totalInput = 0;
    let totalOutput = 0;

    for (const event of events) {
      const usage = event.metadata?.usage;
      if (usage && typeof usage === "object") {
        totalInput += (usage as { input_tokens?: number }).input_tokens ?? 0;
        totalOutput += (usage as { output_tokens?: number }).output_tokens ?? 0;
      }
    }

    const sessionCount = this.getSessionCount();

    return {
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      total_tokens: totalInput + totalOutput,
      session_count: sessionCount,
    };
  }

  /**
   * 获取工具使用统计
   */
  private getToolUsageStats(): ToolUsageStats[] {
    const stmt = this.db!.prepare(`
      WITH calls AS (
        SELECT action as tool_name, session_id, tool_call_id
        FROM events
        WHERE type = 'tool_call' AND action IS NOT NULL AND tool_call_id IS NOT NULL
      ),
      result_min AS (
        SELECT session_id, tool_call_id, MIN(timestamp) as result_ts
        FROM events
        WHERE type = 'tool_result' AND tool_call_id IS NOT NULL
        GROUP BY session_id, tool_call_id
      ),
      results AS (
        SELECT
          r.session_id as session_id,
          r.tool_call_id as tool_call_id,
          COALESCE(r.has_error, 0) as has_error
        FROM result_min rm
        JOIN events r
          ON r.session_id = rm.session_id
          AND r.tool_call_id = rm.tool_call_id
          AND r.timestamp = rm.result_ts
      )
      SELECT
        calls.tool_name as tool_name,
        COUNT(*) as call_count,
        SUM(COALESCE(results.has_error, 0)) as error_count
      FROM calls
      LEFT JOIN results
        ON results.session_id = calls.session_id AND results.tool_call_id = calls.tool_call_id
      GROUP BY calls.tool_name
      ORDER BY call_count DESC
    `);

    const rows = stmt.all() as Array<{ tool_name: string; call_count: number; error_count: number }>;

    return rows.map((row) => ({
      tool_name: row.tool_name,
      call_count: row.call_count,
      error_count: row.error_count ?? 0,
    }));
  }

  /**
   * 获取事件总数
   */
  private getEventCount(): number {
    const row = this.db!.prepare(`SELECT COUNT(*) as count FROM events`).get() as {
      count: number;
    };
    return row.count;
  }

  /**
   * 获取会话总数
   */
  private getSessionCount(): number {
    const row = this.db!.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as {
      count: number;
    };
    return row.count;
  }

  private ensureSchema(): boolean {
    this.ensureInitialized();

    const requiredEventColumns: Array<{ name: string; definition: string }> = [
      { name: "action", definition: "TEXT" },
      { name: "session_key", definition: "TEXT" },
      { name: "duration_ms", definition: "INTEGER" },
      { name: "model", definition: "TEXT" },
      { name: "token", definition: "INTEGER" },
      { name: "cost", definition: "REAL" },
      { name: "has_error", definition: "INTEGER" },
      { name: "error_type", definition: "TEXT" },
      { name: "error_message", definition: "TEXT" },
      { name: "tool_call_id", definition: "TEXT" },
      { name: "instance_id", definition: "TEXT" },
    ];

    const requiredSessionColumns: Array<{ name: string; definition: string }> = [
      { name: "message_count", definition: "INTEGER DEFAULT 0" },
      { name: "total_tokens", definition: "INTEGER DEFAULT 0" },
      { name: "model", definition: "TEXT" },
      { name: "token", definition: "INTEGER DEFAULT 0" },
      { name: "cost", definition: "REAL DEFAULT 0" },
      { name: "duration_ms", definition: "INTEGER DEFAULT 0" },
      { name: "has_error", definition: "INTEGER DEFAULT 0" },
    ];

    let changed = false;

    for (const col of requiredEventColumns) {
      if (!this.hasColumn("events", col.name)) {
        this.db!.exec(`ALTER TABLE events ADD COLUMN ${col.name} ${col.definition}`);
        changed = true;
      }
    }

    for (const col of requiredSessionColumns) {
      if (!this.hasColumn("sessions", col.name)) {
        this.db!.exec(`ALTER TABLE sessions ADD COLUMN ${col.name} ${col.definition}`);
        changed = true;
      }
    }

    return changed;
  }

  private ensureIndexes(): void {
    this.ensureInitialized();

    const indexSpecs: Array<{ name: string; table: "events" | "sessions"; columns: string[] }> = [
      { name: "idx_events_session_id", table: "events", columns: ["session_id"] },
      { name: "idx_events_timestamp", table: "events", columns: ["timestamp"] },
      { name: "idx_events_type", table: "events", columns: ["type"] },
      { name: "idx_events_action", table: "events", columns: ["action"] },
      { name: "idx_events_tool_call_id", table: "events", columns: ["tool_call_id"] },
      { name: "idx_events_session_type_timestamp", table: "events", columns: ["session_id", "type", "timestamp"] },
      { name: "idx_events_cost", table: "events", columns: ["cost"] },
      { name: "idx_events_has_error", table: "events", columns: ["has_error"] },
      { name: "idx_events_error_type", table: "events", columns: ["error_type"] },
      { name: "idx_events_error_message", table: "events", columns: ["error_message"] },
      { name: "idx_events_model", table: "events", columns: ["model"] },
      { name: "idx_events_instance_id", table: "events", columns: ["instance_id"] },
      { name: "idx_sessions_started_at", table: "sessions", columns: ["started_at"] },
      { name: "idx_sessions_cost", table: "sessions", columns: ["cost"] },
      { name: "idx_sessions_has_error", table: "sessions", columns: ["has_error"] },
    ];

    for (const spec of indexSpecs) {
      if (spec.columns.every((c) => this.hasColumn(spec.table, c))) {
        this.db!.exec(`CREATE INDEX IF NOT EXISTS ${spec.name} ON ${spec.table}(${spec.columns.join(", ")});`);
      }
    }
  }

  private hasColumn(table: "events" | "sessions", column: string): boolean {
    const rows = this.db!.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((r) => r.name === column);
  }

  private backfillAndRebuildSessions(): void {
    this.ensureInitialized();

    const tx = this.db!.transaction(() => {
      const selectEvents = this.db!.prepare(`SELECT id, data FROM events ORDER BY timestamp ASC`);
      const updateEvent = this.db!.prepare(`
        UPDATE events
        SET
          action = ?,
          session_key = ?,
          duration_ms = ?,
          model = ?,
          token = ?,
          cost = ?,
          has_error = ?,
          error_type = ?,
          error_message = ?,
          tool_call_id = ?
        WHERE id = ?
      `);

      const rows = selectEvents.all() as Array<{ id: string; data: string }>;
      for (const row of rows) {
        let event: TracingEvent | null = null;
        try {
          event = JSON.parse(row.data) as TracingEvent;
        } catch {
          event = null;
        }
        if (!event) {
          continue;
        }

        const action = this.extractAction(event);
        const sessionKey = this.extractSessionKey(event);
        const durationMs = this.extractDurationMs(event);
        const model = this.extractModel(event);
        const token = this.extractToken(event);
        const cost = this.extractCost(event);
        const hasError = this.extractHasError(event);
        const errorType = hasError ? this.extractErrorType(event) : null;
        const errorMessage = hasError ? this.extractErrorMessage(event) : null;
        const toolCallId = this.extractToolCallId(event);

        updateEvent.run(
          action,
          sessionKey,
          durationMs,
          model,
          token,
          cost,
          hasError,
          errorType,
          errorMessage,
          toolCallId,
          row.id
        );
      }

      this.db!.exec(`DELETE FROM sessions`);

      for (const row of rows) {
        let event: TracingEvent | null = null;
        try {
          event = JSON.parse(row.data) as TracingEvent;
        } catch {
          event = null;
        }
        if (!event) {
          continue;
        }
        this.updateSessionStats(event);
      }
    });

    tx();
  }

  private computeQuantileStats(values: number[]): QuantileStats {
    const cleaned = values.filter((v) => typeof v === "number" && Number.isFinite(v)).map((v) => v);
    cleaned.sort((a, b) => a - b);
    const count = cleaned.length;
    if (count === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
    }
    const min = cleaned[0]!;
    const max = cleaned[count - 1]!;
    const avg = cleaned.reduce((a, b) => a + b, 0) / count;

    const q = (p: number): number => {
      const idx = (count - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) {
        return cleaned[lo]!;
      }
      const w = idx - lo;
      return cleaned[lo]! * (1 - w) + cleaned[hi]! * w;
    };

    return {
      count,
      min,
      max,
      avg,
      p50: q(0.5),
      p90: q(0.9),
      p95: q(0.95),
      p99: q(0.99),
    };
  }

  private getToolDurations(options?: {
    since?: string;
    until?: string;
    tool_name?: string;
    session_id?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    limit?: number;
    order_by?: "duration_desc" | "duration_asc" | "ended_desc" | "started_desc";
  }): ToolDurationRow[] {
    this.ensureInitialized();

    const where: string[] = [
      `c.type = 'tool_call'`,
      `c.tool_call_id IS NOT NULL`,
      `c.action IS NOT NULL`,
    ];
    const params: Array<string | number> = [];

    if (options?.tool_name) {
      where.push(`c.action = ?`);
      params.push(options.tool_name);
    }
    if (options?.session_id) {
      where.push(`c.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.since) {
      where.push(`c.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`c.timestamp < ?`);
      params.push(options.until);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const orderBy =
      options?.order_by === "duration_asc"
        ? `duration_ms ASC`
        : options?.order_by === "ended_desc"
          ? `ended_at DESC`
          : options?.order_by === "started_desc"
            ? `started_at DESC`
            : `duration_ms DESC`;
    const limit = options?.limit === undefined ? "" : `LIMIT ${Math.max(0, Math.floor(options.limit))}`;

    const stmt = this.db!.prepare(`
      WITH result_min AS (
        SELECT session_id, tool_call_id, MIN(timestamp) as result_ts
        FROM events
        WHERE type = 'tool_result' AND tool_call_id IS NOT NULL
        GROUP BY session_id, tool_call_id
      ),
      pairs AS (
        SELECT
          c.tool_call_id as tool_call_id,
          c.action as tool_name,
          c.session_id as session_id,
          c.timestamp as started_at,
          r.timestamp as ended_at,
          COALESCE(r.duration_ms, CAST((julianday(r.timestamp) - julianday(c.timestamp)) * 86400000 AS INTEGER)) as duration_ms,
          COALESCE(r.has_error, 0) as has_error,
          (COALESCE(c.cost, 0) + COALESCE(r.cost, 0)) as cost,
          COALESCE(r.model, c.model) as model
        FROM events c
        JOIN result_min rm
          ON rm.session_id = c.session_id AND rm.tool_call_id = c.tool_call_id
        JOIN events r
          ON r.session_id = rm.session_id
          AND r.tool_call_id = rm.tool_call_id
          AND r.timestamp = rm.result_ts
        ${whereSql}
      )
      SELECT
        tool_call_id,
        tool_name,
        session_id,
        started_at,
        ended_at,
        duration_ms,
        has_error,
        cost,
        model
      FROM pairs
      WHERE 1 = 1
        ${typeof options?.has_error === "number" && Number.isFinite(options.has_error) ? "AND has_error = ?" : ""}
        ${typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms) ? "AND duration_ms >= ?" : ""}
        ${options?.model ? "AND model = ?" : ""}
      ORDER BY ${orderBy}
      ${limit}
    `);

    const extra: Array<string | number> = [];
    if (typeof options?.has_error === "number") {
      extra.push(Math.max(0, Math.min(1, Math.floor(options.has_error))));
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      extra.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      extra.push(options.model);
    }

    const rows = stmt.all(...params, ...extra) as Array<{
      tool_call_id: string;
      tool_name: string;
      session_id: string;
      started_at: string;
      ended_at: string;
      duration_ms: number;
      has_error: number;
      cost: number;
      model: string | null;
    }>;

    return rows.map((r) => ({
      tool_call_id: r.tool_call_id,
      tool_name: r.tool_name,
      session_id: r.session_id,
      started_at: r.started_at,
      ended_at: r.ended_at,
      duration_ms: Number(r.duration_ms) || 0,
      has_error: Number(r.has_error) || 0,
      cost: Number(r.cost) || 0,
      model: r.model ?? null,
    }));
  }

  private getTurnDurations(options?: {
    since?: string;
    until?: string;
    session_id?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    tool_name?: string;
    limit?: number;
    order_by?: "duration_desc" | "duration_asc" | "assistant_desc" | "user_desc";
  }): TurnDurationRow[] {
    this.ensureInitialized();

    const where: string[] = [`u.type = 'user_message'`];
    const params: Array<string | number> = [];

    if (options?.session_id) {
      where.push(`u.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.since) {
      where.push(`u.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`u.timestamp < ?`);
      params.push(options.until);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const orderBy =
      options?.order_by === "duration_asc"
        ? `duration_ms ASC`
        : options?.order_by === "assistant_desc"
          ? `assistant_timestamp DESC`
          : options?.order_by === "user_desc"
            ? `user_timestamp DESC`
            : `duration_ms DESC`;
    const limit = options?.limit === undefined ? "" : `LIMIT ${Math.max(0, Math.floor(options.limit))}`;

    const stmt = this.db!.prepare(`
      WITH turns AS (
        SELECT
          u.session_id as session_id,
          u.id as user_event_id,
          u.timestamp as user_timestamp,
          (
            SELECT a.id
            FROM events a
            WHERE a.session_id = u.session_id
              AND a.type = 'assistant_message'
              AND a.timestamp > u.timestamp
            ORDER BY a.timestamp ASC
            LIMIT 1
          ) as assistant_event_id,
          (
            SELECT a.timestamp
            FROM events a
            WHERE a.session_id = u.session_id
              AND a.type = 'assistant_message'
              AND a.timestamp > u.timestamp
            ORDER BY a.timestamp ASC
            LIMIT 1
          ) as assistant_timestamp
        FROM events u
        ${whereSql}
      ),
      enriched AS (
        SELECT
          t.session_id as session_id,
          t.user_event_id as user_event_id,
          t.assistant_event_id as assistant_event_id,
          t.user_timestamp as user_timestamp,
          t.assistant_timestamp as assistant_timestamp,
          CAST((julianday(t.assistant_timestamp) - julianday(t.user_timestamp)) * 86400000 AS INTEGER) as duration_ms,
          (
            SELECT a.model
            FROM events a
            WHERE a.id = t.assistant_event_id
            LIMIT 1
          ) as assistant_model,
          EXISTS(
            SELECT 1
            FROM events e
            WHERE e.session_id = t.session_id
              AND e.timestamp > t.user_timestamp
              AND e.timestamp <= t.assistant_timestamp
              AND COALESCE(e.has_error, 0) = 1
            LIMIT 1
          ) as has_error,
          EXISTS(
            SELECT 1
            FROM events e
            WHERE e.session_id = t.session_id
              AND e.timestamp > t.user_timestamp
              AND e.timestamp <= t.assistant_timestamp
              AND e.type = 'tool_call'
              AND e.action IS NOT NULL
              ${options?.tool_name ? "AND e.action = ?" : ""}
            LIMIT 1
          ) as has_tool
        FROM turns t
        WHERE t.assistant_event_id IS NOT NULL AND t.assistant_timestamp IS NOT NULL
      )
      SELECT
        session_id,
        user_event_id,
        assistant_event_id,
        user_timestamp,
        assistant_timestamp,
        duration_ms
      FROM enriched
      WHERE 1 = 1
        ${typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms) ? "AND duration_ms >= ?" : ""}
        ${typeof options?.has_error === "number" && Number.isFinite(options.has_error) ? "AND has_error = ?" : ""}
        ${options?.model ? "AND assistant_model = ?" : ""}
        ${options?.tool_name ? "AND has_tool = 1" : ""}
      ORDER BY ${orderBy}
      ${limit}
    `);

    const extra: Array<string | number> = [];
    if (options?.tool_name) {
      extra.push(options.tool_name);
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      extra.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (typeof options?.has_error === "number") {
      extra.push(Math.max(0, Math.min(1, Math.floor(options.has_error))));
    }
    if (options?.model) {
      extra.push(options.model);
    }

    const rows = stmt.all(...params, ...extra) as Array<{
      session_id: string;
      user_event_id: string;
      assistant_event_id: string;
      user_timestamp: string;
      assistant_timestamp: string;
      duration_ms: number;
    }>;

    return rows.map((r) => ({
      session_id: r.session_id,
      user_event_id: r.user_event_id,
      assistant_event_id: r.assistant_event_id,
      user_timestamp: r.user_timestamp,
      assistant_timestamp: r.assistant_timestamp,
      duration_ms: Number(r.duration_ms) || 0,
    }));
  }

  private getErrorRate(options?: {
    since?: string;
    until?: string;
    session_id?: string;
    tool_name?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
  }): ErrorRateRow {
    const where: string[] = [];
    const params: Array<string | number> = [];
    let joinSql = "";

    if (options?.session_id) {
      where.push(`e.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.since) {
      where.push(`e.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`e.timestamp < ?`);
      params.push(options.until);
    }
    if (typeof options?.has_error === "number") {
      where.push(`COALESCE(e.has_error, 0) = ?`);
      params.push(Math.max(0, Math.min(1, Math.floor(options.has_error))));
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      where.push(`COALESCE(e.duration_ms, 0) >= ?`);
      params.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      where.push(`e.model = ?`);
      params.push(options.model);
    }
    if (options?.tool_name) {
      joinSql = `
        LEFT JOIN events c
          ON c.session_id = e.session_id
          AND c.tool_call_id = e.tool_call_id
          AND c.type = 'tool_call'
      `;
      where.push(`(
        (e.type = 'tool_call' AND e.action = ?)
        OR
        (e.type = 'tool_result' AND c.action = ?)
      )`);
      params.push(options.tool_name, options.tool_name);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const stmt = this.db!.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(COALESCE(e.has_error, 0)) as error
      FROM events e
      ${joinSql}
      ${whereSql}
    `);
    const row = stmt.get(...params) as { total: number; error: number } | undefined;
    const total = Number(row?.total) || 0;
    const error = Number(row?.error) || 0;
    return {
      total,
      error,
      error_rate: total > 0 ? error / total : 0,
    };
  }

  private getTopErrorTools(
    limit: number,
    options?: { since?: string; until?: string; session_id?: string; tool_name?: string; min_duration_ms?: number; model?: string }
  ): TopErrorToolRow[] {
    const where: string[] = [
      `c.type = 'tool_call'`,
      `c.tool_call_id IS NOT NULL`,
      `c.action IS NOT NULL`,
    ];
    const params: Array<string | number> = [];

    if (options?.tool_name) {
      where.push(`c.action = ?`);
      params.push(options.tool_name);
    }
    if (options?.session_id) {
      where.push(`c.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.since) {
      where.push(`c.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`c.timestamp < ?`);
      params.push(options.until);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const extra: Array<string | number> = [];
    const filterSql = [
      `has_error = 1`,
      typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms) ? `duration_ms >= ?` : null,
      options?.model ? `model = ?` : null,
    ].filter((v): v is string => typeof v === "string");

    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      extra.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      extra.push(options.model);
    }

    const stmt = this.db!.prepare(`
      WITH result_min AS (
        SELECT session_id, tool_call_id, MIN(timestamp) as result_ts
        FROM events
        WHERE type = 'tool_result' AND tool_call_id IS NOT NULL
        GROUP BY session_id, tool_call_id
      ),
      pairs AS (
        SELECT
          c.action as tool_name,
          COALESCE(r.duration_ms, CAST((julianday(r.timestamp) - julianday(c.timestamp)) * 86400000 AS INTEGER)) as duration_ms,
          COALESCE(r.has_error, 0) as has_error,
          COALESCE(r.model, c.model) as model
        FROM events c
        JOIN result_min rm
          ON rm.session_id = c.session_id AND rm.tool_call_id = c.tool_call_id
        JOIN events r
          ON r.session_id = rm.session_id
          AND r.tool_call_id = rm.tool_call_id
          AND r.timestamp = rm.result_ts
        ${whereSql}
      )
      SELECT
        tool_name,
        COUNT(*) as error_count
      FROM pairs
      WHERE ${filterSql.join(" AND ")}
      GROUP BY tool_name
      ORDER BY error_count DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, ...extra, Math.max(0, Math.floor(limit))) as Array<{
      tool_name: string;
      error_count: number;
    }>;
    return rows.map((r) => ({
      tool_name: r.tool_name,
      error_count: Number(r.error_count) || 0,
    }));
  }

  private getTopErrorMessages(
    limit: number,
    options?: { since?: string; until?: string; session_id?: string; tool_name?: string; min_duration_ms?: number; model?: string }
  ): TopErrorMessageRow[] {
    const where: string[] = [`COALESCE(e.has_error, 0) = 1`, `e.error_message IS NOT NULL`, `length(trim(e.error_message)) > 0`];
    const params: Array<string | number> = [];
    let joinSql = "";

    if (options?.session_id) {
      where.push(`e.session_id = ?`);
      params.push(options.session_id);
    }
    if (options?.since) {
      where.push(`e.timestamp >= ?`);
      params.push(options.since);
    }
    if (options?.until) {
      where.push(`e.timestamp < ?`);
      params.push(options.until);
    }
    if (typeof options?.min_duration_ms === "number" && Number.isFinite(options.min_duration_ms)) {
      where.push(`COALESCE(e.duration_ms, 0) >= ?`);
      params.push(Math.max(0, Math.floor(options.min_duration_ms)));
    }
    if (options?.model) {
      where.push(`e.model = ?`);
      params.push(options.model);
    }
    if (options?.tool_name) {
      joinSql = `
        LEFT JOIN events c
          ON c.session_id = e.session_id
          AND c.tool_call_id = e.tool_call_id
          AND c.type = 'tool_call'
      `;
      where.push(`(
        (e.type = 'tool_call' AND e.action = ?)
        OR
        (e.type = 'tool_result' AND c.action = ?)
      )`);
      params.push(options.tool_name, options.tool_name);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const stmt = this.db!.prepare(`
      SELECT
        e.error_type as error_type,
        e.error_message as error_message,
        COUNT(*) as error_count
      FROM events e
      ${joinSql}
      ${whereSql}
      GROUP BY e.error_type, e.error_message
      ORDER BY error_count DESC
      LIMIT ?
    `);
    const rows = stmt.all(...params, Math.max(0, Math.floor(limit))) as Array<{
      error_type: string | null;
      error_message: string;
      error_count: number;
    }>;
    return rows.map((r) => ({
      error_type: r.error_type ?? null,
      error_message: r.error_message,
      error_count: Number(r.error_count) || 0,
    }));
  }

  /**
   * 获取会话的所有 Turn 聚合数据
   * 优先基于 correlation.turnId 聚合，如果无 correlation 数据则回退到 user_message/assistant_message 边界逻辑
   * @param sessionId - 会话 ID
   * @param order - 排序顺序，默认 asc
   * @returns Turn 列表
   */
  getTurnsForSession(sessionId: string, order: SortOrder = "asc"): Turn[] {
    this.ensureInitialized();

    const correlationTurns = this.getTurnsByCorrelation(sessionId, order);
    if (correlationTurns.length > 0) {
      return correlationTurns;
    }

    return this.getTurnsByMessageBoundary(sessionId, order);
  }

  /**
   * 获取所有会话的回合数据
   * 遍历所有会话，收集所有回合并按开始时间排序
   * @param order - 排序顺序，默认 desc
   * @returns 所有回合列表
   */
  getAllTurns(order: SortOrder = "desc"): Turn[] {
    this.ensureInitialized();

    const sessions = this.getSessions();
    const allTurns: Turn[] = [];

    for (const session of sessions) {
      const sessionTurns = this.getTurnsForSession(session.id);
      allTurns.push(...sessionTurns);
    }

    allTurns.sort((a, b) => {
      const timeA = new Date(a.started_at).getTime();
      const timeB = new Date(b.started_at).getTime();
      return order === "asc" ? timeA - timeB : timeB - timeA;
    });

    return allTurns;
  }

  private getTurnsByCorrelation(sessionId: string, order: SortOrder = "asc"): Turn[] {
    const orderSql = order === "desc" ? "DESC" : "ASC";
    const stmt = this.db!.prepare(`
      SELECT
        json_extract(data, '$.correlation.turnId') as turn_id,
        json_extract(data, '$.correlation.runId') as run_id,
        MIN(timestamp) as started_at,
        MAX(timestamp) as ended_at,
        COUNT(*) as event_count,
        SUM(CASE WHEN type = 'tool_call' THEN 1 ELSE 0 END) as tool_call_count,
        SUM(COALESCE(token, 0)) as total_tokens,
        SUM(COALESCE(cost, 0)) as total_cost,
        MAX(COALESCE(has_error, 0)) as has_error
      FROM events
      WHERE session_id = ?
        AND json_extract(data, '$.correlation.turnId') IS NOT NULL
      GROUP BY json_extract(data, '$.correlation.turnId')
      ORDER BY started_at ${orderSql}
    `);

    const rows = stmt.all(sessionId) as Array<{
      turn_id: string;
      run_id: string | null;
      started_at: string;
      ended_at: string;
      event_count: number;
      tool_call_count: number;
      total_tokens: number;
      total_cost: number;
      has_error: number;
    }>;

    if (rows.length === 0) {
      return [];
    }

    const turns: Turn[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const turnNumber = i + 1;

      const eventStmt = this.db!.prepare(`
        SELECT data FROM events
        WHERE session_id = ?
          AND json_extract(data, '$.correlation.turnId') = ?
        ORDER BY timestamp ASC
      `);
      const eventRows = eventStmt.all(sessionId, row.turn_id) as Array<{ data: string }>;
      const turnEvents = eventRows.map((r) => JSON.parse(r.data) as TracingEvent);

      const userEvent = turnEvents.find((e) => e.type === "user_message");
      const assistantEvent = turnEvents.filter((e) => e.type === "assistant_message").pop();

      let inputTokens = 0;
      let outputTokens = 0;
      let errorCount = 0;
      const eventIds: string[] = [];

      for (const event of turnEvents) {
        eventIds.push(event.id);
        if (this.extractHasError(event) === 1) {
          errorCount++;
        }
        const usage = event.metadata?.usage as
          | { input_tokens?: number; output_tokens?: number }
          | undefined;
        if (usage) {
          inputTokens += typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
          outputTokens += typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
        }
      }

      let durationMs: number | undefined;
      const startTime = new Date(row.started_at).getTime();
      const endTime = new Date(row.ended_at).getTime();
      if (Number.isFinite(startTime) && Number.isFinite(endTime)) {
        durationMs = endTime - startTime;
      }

      let status: TurnStatus;
      if (errorCount > 0) {
        status = "error";
      } else if (assistantEvent) {
        status = "completed";
      } else {
        status = "in_progress";
      }

      turns.push({
        id: row.turn_id,
        session_id: sessionId,
        turn_number: turnNumber,
        started_at: row.started_at,
        ended_at: assistantEvent ? row.ended_at : undefined,
        user_event_id: userEvent?.id,
        assistant_event_id: assistantEvent?.id,
        duration_ms: durationMs,
        tool_call_count: row.tool_call_count,
        error_count: errorCount,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost: row.total_cost > 0 ? row.total_cost : undefined,
        status,
        event_ids: eventIds,
      });
    }

    return turns;
  }

  private getTurnsByMessageBoundary(sessionId: string, order: SortOrder = "asc"): Turn[] {
    const events = this.getEvents(sessionId, "asc");
    if (events.length === 0) {
      return [];
    }

    const turns: Turn[] = [];
    let currentTurn: {
      userEvent: TracingEvent;
      events: TracingEvent[];
      turnNumber: number;
    } | null = null;
    let turnNumber = 0;

    for (const event of events) {
      if (event.type === "user_message") {
        if (currentTurn !== null) {
          turns.push(this.buildTurnFromEvents(currentTurn.userEvent, currentTurn.events, currentTurn.turnNumber, null));
        }
        turnNumber++;
        currentTurn = {
          userEvent: event,
          events: [event],
          turnNumber,
        };
      } else if (event.type === "assistant_message" && currentTurn !== null) {
        currentTurn.events.push(event);
        turns.push(this.buildTurnFromEvents(currentTurn.userEvent, currentTurn.events, currentTurn.turnNumber, event));
        currentTurn = null;
      } else if (currentTurn !== null) {
        currentTurn.events.push(event);
      }
    }

    if (currentTurn !== null) {
      turns.push(this.buildTurnFromEvents(currentTurn.userEvent, currentTurn.events, currentTurn.turnNumber, null));
    }

    if (order === "desc") {
      turns.reverse();
    }

    return turns;
  }

  /**
   * 从事件列表构建 Turn 对象
   * @param userEvent - 用户消息事件（Turn 开始）
   * @param events - Turn 内所有事件
   * @param turnNumber - 回合序号
   * @param assistantEvent - 助手消息事件（Turn 结束），可能为空
   */
  private buildTurnFromEvents(
    userEvent: TracingEvent,
    events: TracingEvent[],
    turnNumber: number,
    assistantEvent: TracingEvent | null
  ): Turn {
    let toolCallCount = 0;
    let errorCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cost = 0;
    const eventIds: string[] = [];

    for (const event of events) {
      eventIds.push(event.id);

      if (event.type === "tool_call") {
        toolCallCount++;
      }

      if (this.extractHasError(event) === 1) {
        errorCount++;
      }

      const usage = event.metadata?.usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (usage) {
        inputTokens += typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
        outputTokens += typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
      }

      cost += this.extractCost(event);
    }

    const startedAt = userEvent.timestamp;
    const endedAt = assistantEvent?.timestamp;
    let durationMs: number | undefined;

    if (endedAt) {
      const startTime = new Date(startedAt).getTime();
      const endTime = new Date(endedAt).getTime();
      if (Number.isFinite(startTime) && Number.isFinite(endTime)) {
        durationMs = endTime - startTime;
      }
    }

    let status: TurnStatus;
    if (errorCount > 0) {
      status = "error";
    } else if (assistantEvent) {
      status = "completed";
    } else {
      status = "in_progress";
    }

    return {
      id: `${userEvent.session_id}-turn-${turnNumber}`,
      session_id: userEvent.session_id,
      turn_number: turnNumber,
      started_at: startedAt,
      ended_at: endedAt,
      user_event_id: userEvent.id,
      assistant_event_id: assistantEvent?.id,
      duration_ms: durationMs,
      tool_call_count: toolCallCount,
      error_count: errorCount,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost: cost > 0 ? cost : undefined,
      status,
      event_ids: eventIds,
    };
  }

  /**
   * 获取指定 Turn 的详情及关联事件
   * @param turnId - Turn ID，格式为 {session_id}-turn-{turn_number}
   * @param order - 事件排序顺序，默认 asc
   * @returns Turn 和关联事件，若 Turn 不存在则返回 null
   */
  getEventsForTurn(turnId: string, order: SortOrder = "asc"): { turn: Turn; events: TracingEvent[] } | null {
    this.ensureInitialized();

    const match = turnId.match(/^(.+)-turn-(\d+)$/);
    if (!match) {
      return null;
    }

    const sessionId = match[1]!;
    const turnNumber = parseInt(match[2]!, 10);

    const turns = this.getTurnsForSession(sessionId);
    const turn = turns.find((t) => t.turn_number === turnNumber);

    if (!turn) {
      return null;
    }

    const allEvents = this.getEvents(sessionId, order);
    const turnEventIds = new Set(turn.event_ids);
    const events = allEvents.filter((e) => turnEventIds.has(e.id));

    return { turn, events };
  }
}
