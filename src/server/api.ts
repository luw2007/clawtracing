/**
 * Express API 路由
 * 提供事件接收、会话查询和统计接口
 */

import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import type { StorageManager } from "./storage/index.js";
import type { WebSocketServer } from "./websocket.js";
import type { TracingEvent, Turn } from "../types/index.js";
import { createLogger } from "./logger.js";

const logger = createLogger({ name: "api" });

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  return s.length > 0 ? s : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toOptionalTimestampMs(value: unknown): number | undefined {
  const s = toOptionalString(value);
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : undefined;
}

function toOptionalIsoTimestamp(value: unknown): string | undefined {
  const ms = toOptionalTimestampMs(value);
  if (ms === undefined) return undefined;
  return new Date(ms).toISOString();
}

function toOptionalBool01(value: unknown): number | undefined {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return 1;
    if (value === 0) return 0;
  }
  const s = toOptionalString(value);
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "1" || lower === "true" || lower === "yes") return 1;
  if (lower === "0" || lower === "false" || lower === "no") return 0;
  return undefined;
}

function toSortOrder(value: unknown): "asc" | "desc" | undefined {
  const s = toOptionalString(value);
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "asc") return "asc";
  if (lower === "desc") return "desc";
  return undefined;
}

function toOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

interface HookHeartbeat {
  instanceId: string;
  instanceName?: string;
  workingDir?: string;
  hostname?: string;
  timestamp: string;
  pid: number;
  lastSeen: number;
}

const hookHeartbeats = new Map<string, HookHeartbeat>();

const HEARTBEAT_TIMEOUT_MS = 90000;

export function getOnlineHookCount(): number {
  const now = Date.now();
  let count = 0;
  for (const [id, heartbeat] of hookHeartbeats) {
    if (now - heartbeat.lastSeen < HEARTBEAT_TIMEOUT_MS) {
      count++;
    } else {
      hookHeartbeats.delete(id);
    }
  }
  return count;
}

export interface ApiRouterOptions {
  storage: StorageManager;
  wsServer: WebSocketServer;
}

export function createApiRouter(options: ApiRouterOptions): Router {
  const { storage, wsServer } = options;
  const router = Router();

  function parseEventBody(body: Record<string, unknown>): TracingEvent | { kind: "error"; error: string } {
    const sessionId = body.session_id || body.sessionId;
    const rawType: unknown = body.type;

    if (!sessionId || !rawType) {
      return { kind: "error", error: "缺少必要字段: session_id/sessionId, type" };
    }

    const content = body.content || (body.data as Record<string, unknown>)?.content || JSON.stringify(body.data || {});

    const durationMs = toOptionalNumber(
      body.duration_ms ?? body.durationMs ?? (body.data as Record<string, unknown>)?.duration_ms ?? (body.data as Record<string, unknown>)?.durationMs ?? (body.data as Record<string, unknown>)?.duration
    );
    const level: unknown =
      body.level ?? body.log_level ?? (body.data as Record<string, unknown>)?.level ?? (body.data as Record<string, unknown>)?.log_level ?? (body.data as Record<string, unknown>)?.logLevel;
    const error: unknown = body.error ?? body.err ?? (body.data as Record<string, unknown>)?.error ?? (body.data as Record<string, unknown>)?.err;
    const cost = toOptionalNumber(
      body.cost ?? body.cost_usd ?? body.costUsd ?? (body.data as Record<string, unknown>)?.cost ?? (body.data as Record<string, unknown>)?.cost_usd ?? (body.data as Record<string, unknown>)?.costUsd
    );

    const directMappedTypes: TracingEvent["type"][] = [
      "user_message",
      "assistant_message",
      "tool_call",
      "tool_result",
      "error",
      "system",
      "turn_start",
      "turn_end",
      "agent_start",
      "agent_stop",
      "llm_input",
      "llm_output",
      "before_tool_call",
      "after_tool_call",
      "tool_result_persist",
      "message_received",
      "message_sending",
      "message_sent",
      "before_message_write",
      "before_model_resolve",
      "before_prompt_build",
      "before_agent_start",
      "agent_end",
      "before_compaction",
      "after_compaction",
      "before_reset",
      "session_start",
      "session_end",
      "gateway_start",
      "gateway_stop",
    ];

    let eventType: TracingEvent["type"] = "system";
    if (directMappedTypes.includes(rawType as TracingEvent["type"])) {
      eventType = rawType as TracingEvent["type"];
    } else if (rawType === "message") {
      eventType = body.action === "received" ? "user_message" : "assistant_message";
    } else if (rawType === "agent") {
      const action = body.action as string;
      if (action === "tool:start") {
        eventType = "tool_call";
      } else if (action === "tool:end") {
        eventType = "tool_result";
      } else if (action === "turn:start") {
        eventType = "turn_start";
      } else if (action === "turn:end") {
        eventType = "turn_end";
      } else if (action === "message") {
        eventType = "assistant_message";
      } else if (action === "start") {
        eventType = "agent_start";
      } else if (action === "stop") {
        eventType = "agent_stop";
      } else if (action === "error") {
        eventType = "error";
      } else {
        eventType = "system";
      }
    } else if (rawType === "command" || rawType === "session" || rawType === "gateway") {
      eventType = "system";
    }

    const data = toOptionalRecord(body.data);
    const metadata = toOptionalRecord(body.metadata);
    const mergedMetadata: Record<string, unknown> = {
      ...(data ?? {}),
      ...(metadata ?? {}),
    };
    if (body.action !== undefined) {
      mergedMetadata.action = body.action;
    }
    const explicitSessionKey = toOptionalString(body.sessionKey ?? body.session_key);
    if (explicitSessionKey) {
      mergedMetadata.sessionKey = explicitSessionKey;
      mergedMetadata.session_key = explicitSessionKey;
    }

    const correlation = toOptionalRecord(body.correlation);

    return {
      id: nanoid(),
      session_id: sessionId as string,
      type: eventType,
      timestamp: (body.timestamp as string) ?? new Date().toISOString(),
      content: typeof content === "string" ? [{ type: "text", text: content }] : (content as TracingEvent["content"]),
      metadata: mergedMetadata,
      duration_ms: durationMs,
      level: typeof level === "string" ? level : undefined,
      error: error === undefined ? undefined : error,
      cost,
      correlation,
    };
  }

  router.post("/events", async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;

      logger.debug({ body }, "收到事件");

      if (Array.isArray(body.events)) {
        const results: { id: string }[] = [];
        const errors: { index: number; error: unknown }[] = [];

        for (let i = 0; i < body.events.length; i++) {
          const eventBody = body.events[i] as Record<string, unknown>;
      const parsed = parseEventBody(eventBody);

      if ("kind" in parsed) {
        errors.push({ index: i, error: parsed.error });
            continue;
          }

      await storage.writeEvent(parsed);
      wsServer.broadcast(parsed);
      results.push({ id: parsed.id });
        }

        if (errors.length > 0 && results.length === 0) {
          res.status(400).json({ errors });
        } else {
          res.status(201).json({ ids: results.map((r) => r.id), errors: errors.length > 0 ? errors : undefined });
        }
        return;
      }

      const parsed = parseEventBody(body);

      if ("kind" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      await storage.writeEvent(parsed);
      wsServer.broadcast(parsed);

      res.status(201).json({ id: parsed.id });
    } catch (err) {
      logger.error({ err }, "事件处理失败");
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/sessions", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const order = toSortOrder(req.query.order) ?? "desc";
      const instanceId = toOptionalString(req.query.instance_id);
      const sessionsWithStats = sqlite.getSessionsWithStats(order, instanceId);

      const sessions = sessionsWithStats.map((row) => {
        return {
          id: row.id,
          name: row.key ?? "",
          created_at: row.started_at,
          updated_at: row.updated_at,
          status: row.has_error ? "error" : "active",
          event_count: row.message_count,
          turn_count: row.turn_count,
          tool_call_count: row.tool_call_count,
          total_tokens: row.total_tokens,
          total_cost: row.total_cost,
          has_error: row.has_error,
          top_tools: row.top_tools,
        };
      });

      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/sessions/:id/events", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const sessionId = req.params.id as string;
      const fromRaw = req.query.from;
      const toRaw = req.query.to;
      const hasErrorRaw = req.query.has_error ?? req.query.hasError;
      const minDurationRaw = req.query.min_duration_ms ?? req.query.minDurationMs;
      const model = toOptionalString(req.query.model);
      const toolName = toOptionalString(req.query.tool_name ?? req.query.toolName);
      const turnId = toOptionalString(req.query.turn_id ?? req.query.turnId);
      const toolCallId = toOptionalString(req.query.tool_call_id ?? req.query.toolCallId);
      const eventType = toOptionalString(req.query.type);
      const instanceId = toOptionalString(req.query.instance_id);
      const limitRaw = req.query.limit;
      const offsetRaw = req.query.offset;
      const order = toSortOrder(req.query.order) ?? "asc";

      const fromMs = fromRaw === undefined ? undefined : toOptionalTimestampMs(fromRaw);
      const toMs = toRaw === undefined ? undefined : toOptionalTimestampMs(toRaw);
      const hasError = hasErrorRaw === undefined ? undefined : toOptionalBool01(hasErrorRaw);
      const minDurationMs = minDurationRaw === undefined ? undefined : toOptionalNumber(minDurationRaw);
      const limit = limitRaw === undefined ? undefined : toOptionalNumber(limitRaw);
      const offset = offsetRaw === undefined ? undefined : toOptionalNumber(offsetRaw);

      if (fromRaw !== undefined && fromMs === undefined) {
        res.status(400).json({ error: "无效的 from 参数" });
        return;
      }
      if (toRaw !== undefined && toMs === undefined) {
        res.status(400).json({ error: "无效的 to 参数" });
        return;
      }
      if (hasErrorRaw !== undefined && hasError === undefined) {
        res.status(400).json({ error: "无效的 has_error 参数" });
        return;
      }
      if (minDurationRaw !== undefined && minDurationMs === undefined) {
        res.status(400).json({ error: "无效的 min_duration_ms 参数" });
        return;
      }
      if (fromMs !== undefined && toMs !== undefined && fromMs >= toMs) {
        res.status(400).json({ error: "from 必须小于 to" });
        return;
      }
      if (limitRaw !== undefined && (limit === undefined || limit < 1)) {
        res.status(400).json({ error: "无效的 limit 参数，必须为正整数" });
        return;
      }
      if (offsetRaw !== undefined && (offset === undefined || offset < 0)) {
        res.status(400).json({ error: "无效的 offset 参数，必须为非负整数" });
        return;
      }

      const from = fromMs === undefined ? undefined : new Date(fromMs).toISOString();
      const to = toMs === undefined ? undefined : new Date(toMs).toISOString();

      const effectiveSessionId = sessionId === "__all__" ? undefined : sessionId;

      const result = sqlite.getEventsFiltered({
        session_id: effectiveSessionId,
        from,
        to,
        has_error: hasError,
        min_duration_ms: minDurationMs,
        model,
        tool_name: toolName,
        type: eventType,
        turn_id: turnId,
        tool_call_id: toolCallId,
        instance_id: instanceId,
        limit,
        offset,
        order,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/sessions/:id/events/by-type/:type", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const sessionId = req.params.id as string;
      const eventType = req.params.type as string;
      const order = toSortOrder(req.query.order) ?? "asc";

      const events = sqlite.getEventsFiltered({
        session_id: sessionId,
        type: eventType,
        order,
      });

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/sessions/:id/stats", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const sessionId = req.params.id as string;

      const stats = sqlite.getSessionStats(sessionId);

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/perf", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();

      const sinceRaw = req.query.since ?? req.query.from;
      const untilRaw = req.query.until ?? req.query.to;
      const since = sinceRaw === undefined ? undefined : toOptionalIsoTimestamp(sinceRaw);
      const until = untilRaw === undefined ? undefined : toOptionalIsoTimestamp(untilRaw);
      const sessionId = toOptionalString(req.query.session_id ?? req.query.sessionId);
      const toolName = toOptionalString(req.query.tool_name ?? req.query.toolName);
      const model = toOptionalString(req.query.model);
      const hasErrorRaw = req.query.has_error ?? req.query.hasError;
      const minDurationRaw = req.query.min_duration_ms ?? req.query.minDurationMs;
      const hasError = hasErrorRaw === undefined ? undefined : toOptionalBool01(hasErrorRaw);
      const minDurationMs = minDurationRaw === undefined ? undefined : toOptionalNumber(minDurationRaw);

      if (sinceRaw !== undefined && since === undefined) {
        res.status(400).json({ error: "无效的 since/from 参数" });
        return;
      }
      if (untilRaw !== undefined && until === undefined) {
        res.status(400).json({ error: "无效的 until/to 参数" });
        return;
      }
      if (hasErrorRaw !== undefined && hasError === undefined) {
        res.status(400).json({ error: "无效的 has_error 参数" });
        return;
      }
      if (minDurationRaw !== undefined && minDurationMs === undefined) {
        res.status(400).json({ error: "无效的 min_duration_ms 参数" });
        return;
      }

      const limitN = toOptionalNumber(req.query.limit);
      const topN = typeof limitN === "number" ? Math.max(0, Math.floor(limitN)) : 20;

      res.json({
        tool_duration_quantiles: sqlite.getToolDurationQuantiles({
          since,
          until,
          tool_name: toolName,
          session_id: sessionId,
          has_error: hasError,
          min_duration_ms: minDurationMs,
          model,
        }),
        slow_tools: sqlite.getSlowToolsTopN(topN, {
          since,
          until,
          tool_name: toolName,
          session_id: sessionId,
          has_error: hasError,
          min_duration_ms: minDurationMs,
          model,
        }),
        turn_duration_quantiles: sqlite.getTurnDurationQuantiles({
          since,
          until,
          session_id: sessionId,
          has_error: hasError,
          min_duration_ms: minDurationMs,
          model,
          tool_name: toolName,
        }),
        slow_turns: sqlite.getSlowTurnsTopN(topN, {
          since,
          until,
          session_id: sessionId,
          has_error: hasError,
          min_duration_ms: minDurationMs,
          model,
          tool_name: toolName,
        }),
      });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/cost", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();

      const sinceRaw = req.query.since ?? req.query.from;
      const untilRaw = req.query.until ?? req.query.to;
      const since = sinceRaw === undefined ? undefined : toOptionalIsoTimestamp(sinceRaw);
      const until = untilRaw === undefined ? undefined : toOptionalIsoTimestamp(untilRaw);
      const model = toOptionalString(req.query.model);
      const toolName = toOptionalString(req.query.tool_name ?? req.query.toolName);
      const hasErrorRaw = req.query.has_error ?? req.query.hasError;
      const minDurationRaw = req.query.min_duration_ms ?? req.query.minDurationMs;
      const hasError = hasErrorRaw === undefined ? undefined : toOptionalBool01(hasErrorRaw);
      const minDurationMs = minDurationRaw === undefined ? undefined : toOptionalNumber(minDurationRaw);

      if (sinceRaw !== undefined && since === undefined) {
        res.status(400).json({ error: "无效的 since/from 参数" });
        return;
      }
      if (untilRaw !== undefined && until === undefined) {
        res.status(400).json({ error: "无效的 until/to 参数" });
        return;
      }
      if (hasErrorRaw !== undefined && hasError === undefined) {
        res.status(400).json({ error: "无效的 has_error 参数" });
        return;
      }
      if (minDurationRaw !== undefined && minDurationMs === undefined) {
        res.status(400).json({ error: "无效的 min_duration_ms 参数" });
        return;
      }

      const limitN = toOptionalNumber(req.query.limit);
      const limit = typeof limitN === "number" ? Math.max(0, Math.floor(limitN)) : 20;

      const dailyLimitN = toOptionalNumber(req.query.daily_limit ?? req.query.dailyLimit);
      const dailyLimit = typeof dailyLimitN === "number" ? Math.max(0, Math.floor(dailyLimitN)) : undefined;

      res.json({
        daily: sqlite.getDailyCostAggregation({
          since,
          until,
          limit: dailyLimit,
          has_error: hasError,
          min_duration_ms: minDurationMs,
          model,
          tool_name: toolName,
        }),
        top_sessions: sqlite.getTopCostSessions({
          since,
          until,
          limit,
          has_error: hasError,
          min_duration_ms: minDurationMs,
          model,
          tool_name: toolName,
        }),
      });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/cost/by-tool", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();

      const sinceRaw = req.query.since ?? req.query.from;
      const untilRaw = req.query.until ?? req.query.to;
      const since = sinceRaw === undefined ? undefined : toOptionalIsoTimestamp(sinceRaw);
      const until = untilRaw === undefined ? undefined : toOptionalIsoTimestamp(untilRaw);
      const sessionId = toOptionalString(req.query.session_id ?? req.query.sessionId);
      const limitN = toOptionalNumber(req.query.limit);
      const limit = typeof limitN === "number" ? Math.max(0, Math.floor(limitN)) : undefined;

      if (sinceRaw !== undefined && since === undefined) {
        res.status(400).json({ error: "无效的 since/from 参数" });
        return;
      }
      if (untilRaw !== undefined && until === undefined) {
        res.status(400).json({ error: "无效的 until/to 参数" });
        return;
      }

      const tools = sqlite.getToolCostAggregation({
        session_id: sessionId,
        since,
        until,
        limit,
      });

      res.json({ tools });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/cost/by-turn/:sessionId", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const sessionId = req.params.sessionId as string;

      const turns = sqlite.getTurnCostAggregation(sessionId);

      res.json({ turns });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/errors", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();

      const sinceRaw = req.query.since ?? req.query.from;
      const untilRaw = req.query.until ?? req.query.to;
      const since = sinceRaw === undefined ? undefined : toOptionalIsoTimestamp(sinceRaw);
      const until = untilRaw === undefined ? undefined : toOptionalIsoTimestamp(untilRaw);
      const sessionId = toOptionalString(req.query.session_id ?? req.query.sessionId);
      const toolName = toOptionalString(req.query.tool_name ?? req.query.toolName);
      const model = toOptionalString(req.query.model);
      const topNRaw = req.query.top_n ?? req.query.topN;
      const hasErrorRaw = req.query.has_error ?? req.query.hasError;
      const minDurationRaw = req.query.min_duration_ms ?? req.query.minDurationMs;

      const topN = topNRaw === undefined ? undefined : toOptionalNumber(topNRaw);
      const hasError = hasErrorRaw === undefined ? undefined : toOptionalBool01(hasErrorRaw);
      const minDurationMs = minDurationRaw === undefined ? undefined : toOptionalNumber(minDurationRaw);

      if (sinceRaw !== undefined && since === undefined) {
        res.status(400).json({ error: "无效的 since/from 参数" });
        return;
      }
      if (untilRaw !== undefined && until === undefined) {
        res.status(400).json({ error: "无效的 until/to 参数" });
        return;
      }
      if (topNRaw !== undefined && topN === undefined) {
        res.status(400).json({ error: "无效的 top_n 参数" });
        return;
      }
      if (hasErrorRaw !== undefined && hasError === undefined) {
        res.status(400).json({ error: "无效的 has_error 参数" });
        return;
      }
      if (minDurationRaw !== undefined && minDurationMs === undefined) {
        res.status(400).json({ error: "无效的 min_duration_ms 参数" });
        return;
      }

      const result = sqlite.getErrorAggregations({
        since,
        until,
        session_id: sessionId,
        tool_name: toolName,
        has_error: hasError,
        min_duration_ms: minDurationMs,
        model,
        top_n: topN,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/sessions/:id/turns", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const sessionId = req.params.id as string;
      const order = toSortOrder(req.query.order) ?? "desc";

      let turns;
      if (sessionId === "__all__") {
        turns = sqlite.getAllTurns(order);
      } else {
        turns = sqlite.getTurnsForSession(sessionId, order);
      }

      res.json({ turns });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/turns/:id/events", (req: Request, res: Response): void => {
    try {
      const sqlite = storage.getSqliteStorage();
      const turnId = req.params.id as string;
      const order = toSortOrder(req.query.order) ?? "asc";

      const result = sqlite.getEventsForTurn(turnId, order);

      if (!result) {
        res.status(404).json({ error: "Turn 不存在" });
        return;
      }

      res.json({
        turn: result.turn,
        events: result.events,
      });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/stats", (_req: Request, res: Response): void => {
    try {
      const stats = storage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.delete("/data", async (_req: Request, res: Response): Promise<void> => {
    try {
      await storage.clearJsonl();
      res.json({ message: "JSONL 数据已清除" });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.post("/heartbeat", (req: Request, res: Response): void => {
    try {
      const { instanceId, instanceName, workingDir, hostname, timestamp, pid } = req.body;

      if (!instanceId) {
        res.status(400).json({ error: "缺少 instanceId" });
        return;
      }

      hookHeartbeats.set(instanceId, {
        instanceId,
        instanceName: instanceName ?? undefined,
        workingDir: workingDir ?? undefined,
        hostname: hostname ?? undefined,
        timestamp: timestamp ?? new Date().toISOString(),
        pid: pid ?? 0,
        lastSeen: Date.now(),
      });

      res.json({ status: "ok" });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  router.get("/heartbeat", (_req: Request, res: Response): void => {
    try {
      const now = Date.now();
      const instances: Array<HookHeartbeat & { online: boolean }> = [];

      for (const [id, heartbeat] of hookHeartbeats) {
        const online = now - heartbeat.lastSeen < HEARTBEAT_TIMEOUT_MS;
        if (!online) {
          hookHeartbeats.delete(id);
          continue;
        }
        instances.push({ ...heartbeat, online });
      }

      res.json({
        total: instances.length,
        online: instances.filter((i) => i.online).length,
        instances,
      });
    } catch (error) {
      res.status(500).json({ error: "服务器内部错误" });
    }
  });

  return router;
}
