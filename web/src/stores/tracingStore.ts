import { create } from "zustand";

import type { ContentBlock, CostResponse, ErrorsResponse, PerfResponse, Session, SessionSummary, ToolCostResponse, TracingEvent, Turn, TurnCostResponse } from "../types";

/**
 * 全局追踪统计信息
 */
export interface GlobalStats {
  totalSessions: number;
  activeSessions: number;
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/**
 * "All" 会话的特殊 ID
 */
export const ALL_SESSION_ID = "__all__";

/**
 * 默认分页大小
 */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * 分页状态
 */
export interface EventsPagination {
  /** 当前页码（从 1 开始） */
  page: number;
  /** 每页大小 */
  pageSize: number;
  /** 总事件数 */
  total: number;
  /** 是否启用分页 */
  enabled: boolean;
}

/**
 * 追踪 Store 状态接口
 */
interface TracingState {
  /** 会话摘要列表 */
  sessions: SessionSummary[];
  /** 当前选中会话详情 */
  selectedSession: Session | null;
  /** 选中会话的事件列表 */
  events: TracingEvent[];
  /** 当前选中的会话 ID */
  selectedSessionId: string | null;
  /** 当前选中的 Hook 实例 ID */
  selectedHookInstanceId: string | null;
  /** 全局统计信息 */
  stats: GlobalStats;
  /** WebSocket 连接状态 */
  connectionStatus: "connecting" | "connected" | "disconnected";
  perf: PerfResponse | null;
  perfLoading: boolean;
  perfError: string | null;
  cost: CostResponse | null;
  costLoading: boolean;
  costError: string | null;
  errors: ErrorsResponse | null;
  errorsLoading: boolean;
  errorsError: string | null;
  filters: TracingFilters;
  eventsRefetchSeq: number;
  /** 按 session_id 存储的 Turn 列表 */
  turns: Map<string, Turn[]>;
  /** 当前选中的 Turn ID */
  selectedTurnId: string | null;
  /** Turn 加载状态 */
  turnsLoading: boolean;
  /** Turn 加载错误信息 */
  turnsError: string | null;
  /** 按工具聚合的成本数据 */
  toolCost: ToolCostResponse | null;
  toolCostLoading: boolean;
  toolCostError: string | null;
  /** 按回合聚合的成本数据 */
  turnCost: TurnCostResponse | null;
  turnCostLoading: boolean;
  turnCostError: string | null;
  /** 事件分页状态 */
  eventsPagination: EventsPagination;
  /** 当前排序顺序 */
  order: SortOrder;

  /** 设置会话列表 */
  setSessions: (sessions: SessionSummary[]) => void;
  /** 添加或更新会话 */
  upsertSession: (session: Session | SessionSummary) => void;
  /** 设置选中的会话 */
  setSelectedSession: (session: Session | null) => void;
  /** 设置选中的会话 ID */
  setSelectedSessionId: (sessionId: string | null) => void;
  /** 设置选中的 Hook 实例 ID */
  setSelectedHookInstanceId: (instanceId: string | null) => void;
  /** 设置事件列表 */
  setEvents: (events: TracingEvent[]) => void;
  /** 设置事件列表（带分页信息） */
  setEventsWithPagination: (events: TracingEvent[], total: number) => void;
  /** 添加新事件 */
  addEvent: (event: TracingEvent) => void;
  /** 设置连接状态 */
  setConnectionStatus: (status: "connecting" | "connected" | "disconnected") => void;
  /** 更新全局统计信息 */
  updateStats: () => void;
  fetchPerf: (options?: { sessionId?: string | null; limit?: number }) => Promise<void>;
  fetchCost: (options?: { limit?: number; dailyLimit?: number }) => Promise<void>;
  fetchErrors: (options?: { sessionId?: string | null; topN?: number }) => Promise<void>;
  setFilters: (filters: Partial<TracingFilters>) => void;
  resetFilters: () => void;
  /** 获取指定会话的 Turn 列表 */
  fetchTurns: (sessionId: string) => Promise<void>;
  /** 设置选中的 Turn */
  setSelectedTurn: (turnId: string | null) => void;
  /** 获取按工具聚合的成本数据 */
  fetchToolCost: (options?: { sessionId?: string | null; limit?: number }) => Promise<void>;
  /** 获取按回合聚合的成本数据 */
  fetchTurnCost: (sessionId: string) => Promise<void>;
  /** 设置分页页码 */
  setEventsPage: (page: number) => void;
  /** 设置每页大小 */
  setEventsPageSize: (pageSize: number) => void;
  /** 重置分页状态 */
  resetEventsPagination: () => void;
  /** 设置排序顺序 */
  setOrder: (order: SortOrder) => void;
}

/**
 * 计算全局统计信息
 */
function calculateStats(sessions: SessionSummary[]): GlobalStats {
  return {
    totalSessions: sessions.length,
    activeSessions: sessions.filter((s) => s.status === "active").length,
    totalEvents: sessions.reduce((sum, s) => sum + s.event_count, 0),
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const API_BASE = "http://localhost:3456/api";
let perfFetchSeq = 0;
let costFetchSeq = 0;
let errorsFetchSeq = 0;
let turnsFetchSeq = 0;
let toolCostFetchSeq = 0;
let turnCostFetchSeq = 0;

/** 排序顺序 */
export type SortOrder = "asc" | "desc";

export interface TracingFilters {
  from?: string;
  to?: string;
  has_error?: 0 | 1;
  min_duration_ms?: number;
  model?: string;
  tool_name?: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as unknown;
}

function normalizeFilters(input: Partial<TracingFilters>, base: TracingFilters): TracingFilters {
  const merged: TracingFilters = { ...base, ...input };

  if (typeof merged.from !== "string" || merged.from.trim().length === 0) merged.from = undefined;
  if (typeof merged.to !== "string" || merged.to.trim().length === 0) merged.to = undefined;

  if (typeof merged.has_error !== "number" || !(merged.has_error === 0 || merged.has_error === 1)) {
    merged.has_error = undefined;
  }

  if (typeof merged.min_duration_ms !== "number" || !Number.isFinite(merged.min_duration_ms)) {
    merged.min_duration_ms = undefined;
  } else {
    merged.min_duration_ms = Math.max(0, Math.floor(merged.min_duration_ms));
  }

  if (typeof merged.model !== "string" || merged.model.trim().length === 0) merged.model = undefined;
  if (typeof merged.tool_name !== "string" || merged.tool_name.trim().length === 0) merged.tool_name = undefined;

  return merged;
}

function isFilterActive(filters: TracingFilters): boolean {
  return (
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.has_error !== undefined ||
    filters.min_duration_ms !== undefined ||
    filters.model !== undefined ||
    filters.tool_name !== undefined
  );
}

function applyFiltersToUrl(url: URL, filters: TracingFilters): void {
  if (filters.from) url.searchParams.set("from", filters.from);
  if (filters.to) url.searchParams.set("to", filters.to);
  if (filters.has_error !== undefined) url.searchParams.set("has_error", String(filters.has_error));
  if (filters.min_duration_ms !== undefined) url.searchParams.set("min_duration_ms", String(filters.min_duration_ms));
  if (filters.model) url.searchParams.set("model", filters.model);
  if (filters.tool_name) url.searchParams.set("tool_name", filters.tool_name);
}

function eventHasError(event: TracingEvent): boolean | "unknown" {
  if (event.type === "error") return true;

  const hasTopLevelError = event.error !== undefined && event.error !== null && event.error !== false;
  if (hasTopLevelError) return true;

  for (const block of event.content) {
    if (block.type === "tool_result" && block.is_error === true) return true;
    if (block.error !== undefined && block.error !== null && block.error !== false) return true;
    if (block.type === "tool_use" || block.type === "text" || block.type === "image") {
      continue;
    }
  }

  return false;
}

function doesEventMatchFilters(event: TracingEvent, filters: TracingFilters): boolean | "unknown" {
  if (filters.from) {
    const fromMs = Date.parse(filters.from);
    const tsMs = Date.parse(event.timestamp);
    if (!Number.isFinite(fromMs) || !Number.isFinite(tsMs)) return "unknown";
    if (tsMs < fromMs) return false;
  }
  if (filters.to) {
    const toMs = Date.parse(filters.to);
    const tsMs = Date.parse(event.timestamp);
    if (!Number.isFinite(toMs) || !Number.isFinite(tsMs)) return "unknown";
    if (tsMs >= toMs) return false;
  }

  if (filters.has_error !== undefined) {
    const hasError = eventHasError(event);
    if (hasError === "unknown") return "unknown";
    if ((hasError ? 1 : 0) !== filters.has_error) return false;
  }

  if (filters.min_duration_ms !== undefined) {
    if (typeof event.duration_ms !== "number" || !Number.isFinite(event.duration_ms)) return "unknown";
    if (event.duration_ms < filters.min_duration_ms) return false;
  }

  if (filters.model) {
    const raw = (event as unknown as { model?: unknown }).model;
    const model = typeof raw === "string" && raw.length > 0 ? raw : event.metadata?.model;
    if (typeof model !== "string" || model.length === 0) return "unknown";
    if (model !== filters.model) return false;
  }

  if (filters.tool_name) {
    let found = false;
    for (const block of event.content) {
      if (block.type === "tool_use" && block.name === filters.tool_name) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  return true;
}

function normalizeContentBlock(input: unknown): ContentBlock {
  const block: Record<string, unknown> = isRecord(input) ? input : {};
  const type = toOptionalString(block.type) ?? "text";

  const normalized: ContentBlock = {
    ...(block as unknown as ContentBlock),
    type: type as ContentBlock["type"],
  };

  const durationMs =
    toOptionalNumber(normalized.duration_ms) ??
    toOptionalNumber((block as Record<string, unknown>).durationMs);
  if (durationMs !== undefined) normalized.duration_ms = durationMs;

  const level = toOptionalString(normalized.level) ?? toOptionalString(block.log_level);
  if (level !== undefined) normalized.level = level;

  const cost =
    toOptionalNumber(normalized.cost) ??
    toOptionalNumber(block.cost_usd) ??
    toOptionalNumber(block.costUsd);
  if (cost !== undefined) normalized.cost = cost;

  const error = normalized.error ?? block.err ?? block.error;
  if (error !== undefined) normalized.error = error;

  if (normalized.is_error && normalized.error === undefined) {
    normalized.error = true;
  }

  if (Array.isArray(normalized.content)) {
    normalized.content = normalized.content.map(normalizeContentBlock);
  }

  return normalized;
}

function normalizeTracingEvent(input: unknown): TracingEvent {
  const event: Record<string, unknown> = isRecord(input) ? input : {};
  const metadata = isRecord(event.metadata) ? event.metadata : undefined;

  const rawContent = event.content;
  const normalizedContent: ContentBlock[] = Array.isArray(rawContent)
    ? rawContent.map(normalizeContentBlock)
    : typeof rawContent === "string"
      ? [normalizeContentBlock({ type: "text", text: rawContent })]
      : [];

  const normalized: TracingEvent = {
    ...(event as unknown as TracingEvent),
    content: normalizedContent,
  };

  const durationMs =
    toOptionalNumber(normalized.duration_ms) ??
    toOptionalNumber((event as Record<string, unknown>).durationMs) ??
    toOptionalNumber(metadata?.duration_ms) ??
    toOptionalNumber(metadata?.durationMs) ??
    toOptionalNumber(metadata?.duration);
  if (durationMs !== undefined) normalized.duration_ms = durationMs;

  const level =
    toOptionalString(normalized.level) ??
    toOptionalString((event as Record<string, unknown>).log_level) ??
    toOptionalString(metadata?.level) ??
    toOptionalString(metadata?.log_level);
  if (level !== undefined) normalized.level = level;

  const cost =
    toOptionalNumber(normalized.cost) ??
    toOptionalNumber(metadata?.cost) ??
    toOptionalNumber(metadata?.cost_usd) ??
    toOptionalNumber(metadata?.costUsd);
  if (cost !== undefined) normalized.cost = cost;

  const error = normalized.error ?? metadata?.error ?? metadata?.err ?? (event as Record<string, unknown>).err;
  if (error !== undefined) normalized.error = error;

  return normalized;
}

/**
 * Zustand 追踪状态管理 Store
 */
export const useTracingStore = create<TracingState>((set, get) => ({
  sessions: [],
  selectedSession: null,
  events: [],
  selectedSessionId: null,
  selectedHookInstanceId: null,
  stats: {
    totalSessions: 0,
    activeSessions: 0,
    totalEvents: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
  connectionStatus: "disconnected",
  perf: null,
  perfLoading: false,
  perfError: null,
  cost: null,
  costLoading: false,
  costError: null,
  errors: null,
  errorsLoading: false,
  errorsError: null,
  filters: {},
  eventsRefetchSeq: 0,
  turns: new Map(),
  selectedTurnId: null,
  turnsLoading: false,
  turnsError: null,
  toolCost: null,
  toolCostLoading: false,
  toolCostError: null,
  turnCost: null,
  turnCostLoading: false,
  turnCostError: null,
  eventsPagination: {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    enabled: false,
  },
  order: "desc",

  setSessions: (sessions) => {
    const uniqueSessionsMap = new Map<string, SessionSummary>();
    for (const session of sessions) {
      const existingSession = uniqueSessionsMap.get(session.id);
      if (!existingSession || new Date(session.updated_at) > new Date(existingSession.updated_at)) {
        uniqueSessionsMap.set(session.id, session);
      }
    }
    const uniqueSessions = Array.from(uniqueSessionsMap.values());
    set({ sessions: uniqueSessions });
    get().updateStats();
  },

  upsertSession: (session) => {
    set((state) => {
      const existingIndex = state.sessions.findIndex((s) => s.id === session.id);
      const summary: SessionSummary = {
        id: session.id,
        name: session.name,
        created_at: session.created_at,
        updated_at: session.updated_at,
        status: session.status,
        event_count: (session as Session).stats?.event_count ?? (session as SessionSummary).event_count ?? 0,
        preview: (session as SessionSummary).preview,
      };

      if (existingIndex >= 0) {
        const newSessions = [...state.sessions];
        newSessions[existingIndex] = summary;
        return { sessions: newSessions };
      }
      return { sessions: [summary, ...state.sessions] };
    });
    get().updateStats();
  },

  setSelectedSession: (session) => {
    set({ selectedSession: session, selectedSessionId: session?.id ?? null });
  },

  setSelectedSessionId: (sessionId) => {
    const isAllSession = sessionId === ALL_SESSION_ID;
    set({
      selectedSessionId: sessionId,
      eventsPagination: {
        page: 1,
        pageSize: get().eventsPagination.pageSize,
        total: 0,
        enabled: isAllSession,
      },
    });
    if (!sessionId) {
      set({
        selectedSession: null,
        events: [],
        perf: null,
        perfLoading: false,
        perfError: null,
        cost: null,
        costLoading: false,
        costError: null,
        errors: null,
        errorsLoading: false,
        errorsError: null,
      });
    }
  },

  setSelectedHookInstanceId: (instanceId) => {
    set({
      selectedHookInstanceId: instanceId,
      selectedSessionId: null,
      selectedSession: null,
      events: [],
      eventsPagination: {
        page: 1,
        pageSize: get().eventsPagination.pageSize,
        total: 0,
        enabled: false,
      },
      eventsRefetchSeq: get().eventsRefetchSeq + 1,
    });
  },

  setEvents: (events) => {
    set({ events: events.map(normalizeTracingEvent) });
  },

  setEventsWithPagination: (events, total) => {
    set((state) => ({
      events: events.map(normalizeTracingEvent),
      eventsPagination: {
        ...state.eventsPagination,
        total,
      },
    }));
  },

  addEvent: (event) => {
    const normalizedEvent = normalizeTracingEvent(event);
    const state = get();

    const alreadyExists = state.events.some((e) => e.id === normalizedEvent.id);
    if (alreadyExists) return;

    if (normalizedEvent.session_id === state.selectedSessionId) {
      const filters = state.filters;
      if (!isFilterActive(filters)) {
        set((s) => ({ events: [...s.events, normalizedEvent] }));
      } else {
        const match = doesEventMatchFilters(normalizedEvent, filters);
        if (match === true) {
          set((s) => ({ events: [...s.events, normalizedEvent] }));
        } else if (match === "unknown") {
          set((s) => ({ eventsRefetchSeq: s.eventsRefetchSeq + 1 }));
        }
      }
    }
    set((s) => ({
      sessions: s.sessions.map((session) =>
        session.id === normalizedEvent.session_id
          ? {
              ...session,
              event_count: session.event_count + 1,
              updated_at: normalizedEvent.timestamp,
            }
          : session
      ),
    }));
    get().updateStats();
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  updateStats: () => {
    set((state) => ({ stats: calculateStats(state.sessions) }));
  },
  fetchPerf: async (options) => {
    const seq = (perfFetchSeq += 1);
    set({ perfLoading: true, perfError: null });
    try {
      const sessionId = options?.sessionId ?? get().selectedSessionId;
      const url = new URL(`${API_BASE}/perf`);
      if (sessionId) url.searchParams.set("session_id", sessionId);
      const limit = typeof options?.limit === "number" ? Math.max(0, Math.floor(options.limit)) : undefined;
      if (limit !== undefined) url.searchParams.set("limit", String(limit));
      applyFiltersToUrl(url, get().filters);

      const data = await fetchJson(url.toString());
      if (seq !== perfFetchSeq) return;
      set({ perf: data as PerfResponse, perfLoading: false, perfError: null });
    } catch (error) {
      if (seq !== perfFetchSeq) return;
      set({ perfLoading: false, perfError: toErrorMessage(error) });
    }
  },
  fetchCost: async (options) => {
    const seq = (costFetchSeq += 1);
    set({ costLoading: true, costError: null });
    try {
      const url = new URL(`${API_BASE}/cost`);
      const limit = typeof options?.limit === "number" ? Math.max(0, Math.floor(options.limit)) : undefined;
      if (limit !== undefined) url.searchParams.set("limit", String(limit));
      const dailyLimit =
        typeof options?.dailyLimit === "number" ? Math.max(0, Math.floor(options.dailyLimit)) : undefined;
      if (dailyLimit !== undefined) url.searchParams.set("daily_limit", String(dailyLimit));
      applyFiltersToUrl(url, get().filters);

      const data = await fetchJson(url.toString());
      if (seq !== costFetchSeq) return;
      set({ cost: data as CostResponse, costLoading: false, costError: null });
    } catch (error) {
      if (seq !== costFetchSeq) return;
      set({ costLoading: false, costError: toErrorMessage(error) });
    }
  },
  fetchErrors: async (options) => {
    const seq = (errorsFetchSeq += 1);
    set({ errorsLoading: true, errorsError: null });
    try {
      const sessionId = options?.sessionId ?? get().selectedSessionId;
      const url = new URL(`${API_BASE}/errors`);
      if (sessionId) url.searchParams.set("session_id", sessionId);
      const topN = typeof options?.topN === "number" ? Math.max(0, Math.floor(options.topN)) : undefined;
      if (topN !== undefined) url.searchParams.set("top_n", String(topN));
      applyFiltersToUrl(url, get().filters);

      const data = await fetchJson(url.toString());
      if (seq !== errorsFetchSeq) return;
      set({ errors: data as ErrorsResponse, errorsLoading: false, errorsError: null });
    } catch (error) {
      if (seq !== errorsFetchSeq) return;
      set({ errorsLoading: false, errorsError: toErrorMessage(error) });
    }
  },
  setFilters: (filters) => {
    set((s) => ({ filters: normalizeFilters(filters, s.filters), eventsRefetchSeq: s.eventsRefetchSeq + 1 }));
  },
  resetFilters: () => {
    set((s) => ({ filters: {}, eventsRefetchSeq: s.eventsRefetchSeq + 1 }));
  },
  fetchTurns: async (sessionId: string) => {
    const seq = (turnsFetchSeq += 1);
    set({ turnsLoading: true, turnsError: null });
    try {
      const order = get().order;
      const url = new URL(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/turns`);
      url.searchParams.set("order", order);
      const data = await fetchJson(url.toString());
      if (seq !== turnsFetchSeq) return;

      const responseData = isRecord(data) && Array.isArray(data.turns) ? data.turns : (Array.isArray(data) ? data : []);
      const turnsList = responseData as Turn[];
      set((state) => {
        const newTurns = new Map(state.turns);
        newTurns.set(sessionId, turnsList);
        return { turns: newTurns, turnsLoading: false, turnsError: null };
      });
    } catch (error) {
      if (seq !== turnsFetchSeq) return;
      set({ turnsLoading: false, turnsError: toErrorMessage(error) });
    }
  },
  setSelectedTurn: (turnId: string | null) => {
    set({ selectedTurnId: turnId });
  },
  fetchToolCost: async (options) => {
    const seq = (toolCostFetchSeq += 1);
    set({ toolCostLoading: true, toolCostError: null });
    try {
      const url = new URL(`${API_BASE}/cost/by-tool`);
      const sessionId = options?.sessionId;
      if (sessionId) url.searchParams.set("session_id", sessionId);
      const limit = typeof options?.limit === "number" ? Math.max(0, Math.floor(options.limit)) : undefined;
      if (limit !== undefined) url.searchParams.set("limit", String(limit));
      applyFiltersToUrl(url, get().filters);

      const data = await fetchJson(url.toString());
      if (seq !== toolCostFetchSeq) return;
      set({ toolCost: data as ToolCostResponse, toolCostLoading: false, toolCostError: null });
    } catch (error) {
      if (seq !== toolCostFetchSeq) return;
      set({ toolCostLoading: false, toolCostError: toErrorMessage(error) });
    }
  },
  fetchTurnCost: async (sessionId: string) => {
    const seq = (turnCostFetchSeq += 1);
    set({ turnCostLoading: true, turnCostError: null });
    try {
      const url = new URL(`${API_BASE}/cost/by-turn/${encodeURIComponent(sessionId)}`);

      const data = await fetchJson(url.toString());
      if (seq !== turnCostFetchSeq) return;
      set({ turnCost: data as TurnCostResponse, turnCostLoading: false, turnCostError: null });
    } catch (error) {
      if (seq !== turnCostFetchSeq) return;
      set({ turnCostLoading: false, turnCostError: toErrorMessage(error) });
    }
  },

  setEventsPage: (page: number) => {
    set((state) => ({
      eventsPagination: {
        ...state.eventsPagination,
        page: Math.max(1, page),
      },
      eventsRefetchSeq: state.eventsRefetchSeq + 1,
    }));
  },

  setEventsPageSize: (pageSize: number) => {
    set((state) => ({
      eventsPagination: {
        ...state.eventsPagination,
        pageSize: Math.max(10, pageSize),
        page: 1,
      },
      eventsRefetchSeq: state.eventsRefetchSeq + 1,
    }));
  },

  resetEventsPagination: () => {
    set((state) => ({
      eventsPagination: {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        enabled: state.selectedSessionId === ALL_SESSION_ID,
      },
      eventsRefetchSeq: state.eventsRefetchSeq + 1,
    }));
  },
  setOrder: (order: SortOrder) => {
    set((state) => ({ order, eventsRefetchSeq: state.eventsRefetchSeq + 1 }));
  },
}));
