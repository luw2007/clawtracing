import { useCallback, useEffect, useRef } from "react";

import { useTracingStore } from "../stores/tracingStore";
import type { WebSocketMessage } from "../types";

/**
 * WebSocket 配置选项
 */
interface WebSocketOptions {
  /** WebSocket 服务器 URL */
  url?: string;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
}

const DEFAULT_URL = "ws://localhost:3456";
const DEFAULT_RECONNECT_INTERVAL = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const API_BASE = "http://localhost:3456/api";

function isFilterActive(filters: {
  from?: string;
  to?: string;
  has_error?: number;
  min_duration_ms?: number;
  model?: string;
  tool_name?: string;
}): boolean {
  return (
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.has_error !== undefined ||
    filters.min_duration_ms !== undefined ||
    filters.model !== undefined ||
    filters.tool_name !== undefined
  );
}

function applyFiltersToUrl(
  url: URL,
  filters: {
    from?: string;
    to?: string;
    has_error?: number;
    min_duration_ms?: number;
    model?: string;
    tool_name?: string;
  }
): void {
  if (filters.from) url.searchParams.set("from", filters.from);
  if (filters.to) url.searchParams.set("to", filters.to);
  if (typeof filters.has_error === "number") url.searchParams.set("has_error", String(filters.has_error));
  if (typeof filters.min_duration_ms === "number") url.searchParams.set("min_duration_ms", String(filters.min_duration_ms));
  if (filters.model) url.searchParams.set("model", filters.model);
  if (filters.tool_name) url.searchParams.set("tool_name", filters.tool_name);
}

/**
 * WebSocket 连接 Hook
 * 自动管理连接、重连、消息处理
 */
export function useWebSocket(options: WebSocketOptions = {}): {
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
} {
  const {
    url = DEFAULT_URL,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isManualDisconnectRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  const {
    setSessions,
    upsertSession,
    setEvents,
    setEventsWithPagination,
    addEvent,
    setConnectionStatus,
    fetchPerf,
    fetchCost,
    fetchErrors,
    selectedSessionId,
    selectedHookInstanceId,
    connectionStatus,
    filters,
    eventsRefetchSeq,
    eventsPagination,
    order,
  } = useTracingStore();

  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  const selectedHookInstanceIdRef = useRef<string | null>(selectedHookInstanceId);
  const filtersRef = useRef(filters);
  const eventsPaginationRef = useRef(eventsPagination);
  const perfCostRefreshTimeoutRef = useRef<number | null>(null);
  const lastPerfCostRefreshAtRef = useRef(0);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    selectedHookInstanceIdRef.current = selectedHookInstanceId;
  }, [selectedHookInstanceId]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    eventsPaginationRef.current = eventsPagination;
  }, [eventsPagination]);

  const refreshAggregationsNow = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) return;
    lastPerfCostRefreshAtRef.current = Date.now();
    void fetchPerf({ sessionId });
    void fetchCost();
    void fetchErrors({ sessionId, topN: 10 });
  }, [fetchPerf, fetchCost, fetchErrors]);

  const scheduleRefreshAggregations = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) return;

    const now = Date.now();
    const minIntervalMs = 800;
    const elapsed = now - lastPerfCostRefreshAtRef.current;

    if (elapsed >= minIntervalMs) {
      if (perfCostRefreshTimeoutRef.current) {
        clearTimeout(perfCostRefreshTimeoutRef.current);
        perfCostRefreshTimeoutRef.current = null;
      }
      refreshAggregationsNow();
      return;
    }

    if (perfCostRefreshTimeoutRef.current) {
      return;
    }

    perfCostRefreshTimeoutRef.current = window.setTimeout(() => {
      perfCostRefreshTimeoutRef.current = null;
      refreshAggregationsNow();
    }, minIntervalMs - elapsed);
  }, [refreshAggregationsNow]);

  useEffect(() => {
    return () => {
      if (perfCostRefreshTimeoutRef.current) {
        clearTimeout(perfCostRefreshTimeoutRef.current);
        perfCostRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(`${API_BASE}/sessions`);
    if (selectedHookInstanceId) {
      url.searchParams.set("instance_id", selectedHookInstanceId);
    }
    
    fetch(url.toString(), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as never[];
      })
      .then((sessions) => {
        setSessions(sessions);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        void error;
      });
    
    return () => {
      controller.abort();
    };
  }, [selectedHookInstanceId, setSessions]);

  /**
   * 处理 WebSocket 消息
   */
  const handleMessage = useCallback(
    (data: WebSocketMessage) => {
      switch (data.type) {
        case "sessions_list":
          setSessions(data.sessions);
          break;
        case "session_created":
        case "session_updated":
          upsertSession(data.session);
          break;
        case "events_list":
          if (
            data.session_id === selectedSessionIdRef.current &&
            isFilterActive(filtersRef.current)
          ) {
            break;
          }
          setEvents(data.events);
          break;
        case "event_added":
          addEvent(data.event);
          if (data.event.session_id === selectedSessionIdRef.current) {
            scheduleRefreshAggregations();
          }
          break;
      }
    },
    [setSessions, upsertSession, setEvents, addEvent, scheduleRefreshAggregations]
  );

  /**
   * 建立 WebSocket 连接
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isManualDisconnectRef.current = false;
    setConnectionStatus("connecting");

    const ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnectionStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        handleMessage(data);
      } catch (error) {
        void error;
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      wsRef.current = null;

      if (
        !isManualDisconnectRef.current &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectRef.current();
        }, reconnectInterval);
      }
    };

    ws.onerror = (error) => {
      void error;
    };

    wsRef.current = ws;
  }, [
    url,
    maxReconnectAttempts,
    reconnectInterval,
    handleMessage,
    setConnectionStatus,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  /**
   * 断开 WebSocket 连接
   */
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus("disconnected");
  }, [setConnectionStatus]);

  /**
   * 组件挂载时自动连接，卸载时断开
   */
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    const controller = new AbortController();
    const url = new URL(`${API_BASE}/sessions/${selectedSessionId}/events`);
    applyFiltersToUrl(url, filters);
    url.searchParams.set("order", order);
    if (selectedHookInstanceId) {
      url.searchParams.set("instance_id", selectedHookInstanceId);
    }

    if (eventsPagination.enabled) {
      const offset = (eventsPagination.page - 1) * eventsPagination.pageSize;
      url.searchParams.set("limit", String(eventsPagination.pageSize));
      url.searchParams.set("offset", String(offset));
    }

    const debounceMs = 180;
    const timeoutId = window.setTimeout(() => {
      fetch(url.toString(), {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return (await res.json()) as unknown;
        })
        .then((result) => {
          // 判断返回结果是否为分页格式
          if (result && typeof result === "object" && "events" in result && "total" in result) {
            const paginatedResult = result as { events: never[]; total: number };
            setEventsWithPagination(paginatedResult.events, paginatedResult.total);
          } else {
            setEvents(Array.isArray(result) ? (result as never[]) : []);
          }
          scheduleRefreshAggregations();
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }
          void error;
        });
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedSessionId, selectedHookInstanceId, filters, eventsRefetchSeq, eventsPagination, order, setEvents, setEventsWithPagination, scheduleRefreshAggregations]);

  useEffect(() => {
    if (!selectedSessionId) return;
    scheduleRefreshAggregations();
  }, [selectedSessionId, scheduleRefreshAggregations]);

  useEffect(() => {
    if (!selectedSessionId) return;
    scheduleRefreshAggregations();
  }, [selectedSessionId, filters, scheduleRefreshAggregations]);

  return {
    connect,
    disconnect,
    isConnected: connectionStatus === "connected",
  };
}
