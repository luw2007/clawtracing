import { useEffect, useMemo, useState, useCallback, Fragment, useRef } from "react";
import type { TracingEvent, Turn } from "../types";
import { useTracingStore } from "../stores/tracingStore";
import { formatDateTime } from "../utils/date";
import { MessageDetail } from "./MessageDetail";
import { TraceView } from "./TraceView";

/**
 * 自定义 debounce hook
 * @param value 需要 debounce 的值
 * @param delay 延迟时间（毫秒）
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Turn 状态类型
 */
type TurnStatus = "in_progress" | "completed" | "error";

/**
 * 过滤器状态类型：all 表示全部，其他对应具体状态
 */
type FilterStatus = "all" | TurnStatus;

/**
 * 回合视图组件属性
 */
interface TurnViewProps {
  /** 会话 ID */
  sessionId: string;
  /** 会话的事件列表（用于在 Turn 卡片中展示详细事件） */
  events: TracingEvent[];
}

/**
 * 格式化时间戳
 */
function formatTime(timestamp: string): string {
  return formatDateTime(timestamp);
}

/**
 * 格式化持续时间
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * TurnCard 组件属性
 */
interface TurnCardProps {
  turn: Turn;
  events: TracingEvent[];
  extraEvents: TracingEvent[];
  expanded: boolean;
  isNew: boolean;
  onToggle: () => void;
  onEventClick: (event: TracingEvent) => void;
}

/**
 * 回合卡片内部组件
 * 展示单个回合的信息和包含的事件
 */
function TurnCard({ turn, events, extraEvents, expanded, isNew, onToggle, onEventClick }: TurnCardProps): React.ReactElement {
  const hasError = turn.error_count > 0;
  const [showHighlight, setShowHighlight] = useState(isNew);
  const [viewMode, setViewMode] = useState<"list" | "trace">("list");

  useEffect(() => {
    if (isNew) {
      setShowHighlight(true);
      const timer = setTimeout(() => {
        setShowHighlight(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  const turnEvents = useMemo(() => {
    const baseEvents = events.filter((e) => turn.event_ids.includes(e.id));
    const combined = baseEvents.length === 0 ? [...extraEvents] : [...baseEvents, ...extraEvents];
    return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [events, extraEvents, turn.event_ids]);

  const statusConfig = {
    in_progress: {
      label: "进行中",
      bgColor: "bg-blue-100",
      textColor: "text-blue-700",
      borderColor: "border-blue-300",
    },
    completed: {
      label: "已完成",
      bgColor: "bg-green-100",
      textColor: "text-green-700",
      borderColor: "border-green-300",
    },
    error: {
      label: "错误",
      bgColor: "bg-red-100",
      textColor: "text-red-700",
      borderColor: "border-red-300",
    },
  };

  const config = statusConfig[turn.status];

  const highlightClass = showHighlight
    ? "ring-2 ring-blue-400 ring-offset-1 animate-pulse"
    : "";

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${highlightClass} ${
        hasError ? "border-red-300 bg-red-50/30" : "border-gray-200 bg-white"
      }`}
    >
      {/* 卡片头部 - 可点击展开/折叠 */}
      <div
        className={`px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
          hasError ? "hover:bg-red-50" : ""
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {/* 展开/折叠图标 */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* 回合序号 */}
          <span className="font-semibold text-gray-700">回合 #{turn.turn_number}</span>

          {/* 状态标签 */}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.textColor}`}>
            {config.label}
          </span>

          {/* 错误标识 */}
          {hasError && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {turn.error_count} 错误
            </span>
          )}
        </div>

        {/* 右侧统计信息 */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {/* 工具调用数 */}
          {turn.tool_call_count > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {turn.tool_call_count}
            </span>
          )}

          {/* Token 统计 */}
          {(turn.input_tokens > 0 || turn.output_tokens > 0) && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              {turn.input_tokens + turn.output_tokens}
            </span>
          )}

          {/* 费用 */}
          {turn.cost !== undefined && turn.cost > 0 && (
            <span className="text-amber-600">${turn.cost.toFixed(4)}</span>
          )}

          {/* 持续时间 */}
          <span>{formatDuration(turn.duration_ms)}</span>

          {/* 时间 */}
          <span>{formatTime(turn.started_at)}</span>
        </div>
      </div>

      {/* 用户消息预览 */}
      {turn.user_preview && (
        <div className="px-4 pb-2">
          <div className="text-sm text-gray-600 truncate">
            <span className="text-gray-400 mr-2">用户:</span>
            {turn.user_preview}
          </div>
        </div>
      )}

      {/* 展开内容 - 事件列表 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50">
          {/* 助手回复预览 */}
          {turn.assistant_preview && (
            <div className="px-4 py-2 border-b border-gray-100">
              <div className="text-sm text-gray-600">
                <span className="text-gray-400 mr-2">助手:</span>
                {turn.assistant_preview.length > 200
                  ? turn.assistant_preview.slice(0, 200) + "..."
                  : turn.assistant_preview}
              </div>
            </div>
          )}

          {/* 视图切换 */}
          <div className="px-4 py-2 border-b border-gray-100 flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setViewMode("list"); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                viewMode === "list" ? "bg-white shadow text-blue-600 font-medium" : "text-gray-500 hover:bg-gray-200"
              }`}
            >
              列表视图
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setViewMode("trace"); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                viewMode === "trace" ? "bg-white shadow text-blue-600 font-medium" : "text-gray-500 hover:bg-gray-200"
              }`}
            >
              Trace 视图
            </button>
          </div>

          {/* 视图内容 */}
          <div className="p-3">
            {viewMode === "list" ? (
              <>
                <div className="text-xs text-gray-500 mb-2 px-1">
                  事件列表 ({turnEvents.length})
                </div>
                <div className="space-y-1">
                  {turnEvents.map((event) => (
                    <EventItem key={event.id} event={event} onClick={() => onEventClick(event)} />
                  ))}
                  {turnEvents.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-4">
                      暂无事件数据
                    </div>
                  )}
                </div>
              </>
            ) : (
              <TraceView events={turnEvents} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 事件项组件属性
 */
interface EventItemProps {
  event: TracingEvent;
  onClick: () => void;
}

/**
 * 获取事件类型配置
 */
function getEventTypeConfig(type: TracingEvent["type"]) {
  const configs: Record<string, { label: string; bgColor: string; textColor: string }> = {
    user_message: { label: "用户", bgColor: "bg-blue-100", textColor: "text-blue-700" },
    assistant_message: { label: "助手", bgColor: "bg-green-100", textColor: "text-green-700" },
    tool_call: { label: "工具调用", bgColor: "bg-orange-100", textColor: "text-orange-700" },
    tool_result: { label: "工具结果", bgColor: "bg-amber-100", textColor: "text-amber-700" },
    error: { label: "错误", bgColor: "bg-red-100", textColor: "text-red-700" },
    system: { label: "系统", bgColor: "bg-gray-100", textColor: "text-gray-700" },
    turn_start: { label: "回合开始", bgColor: "bg-indigo-100", textColor: "text-indigo-700" },
    turn_end: { label: "回合结束", bgColor: "bg-indigo-100", textColor: "text-indigo-700" },
    agent_start: { label: "Agent启动", bgColor: "bg-purple-100", textColor: "text-purple-700" },
    agent_stop: { label: "Agent停止", bgColor: "bg-purple-100", textColor: "text-purple-700" },
    llm_input: { label: "LLM输入", bgColor: "bg-green-100", textColor: "text-green-700" },
    llm_output: { label: "LLM输出", bgColor: "bg-blue-100", textColor: "text-blue-700" },
    before_tool_call: { label: "工具调用前", bgColor: "bg-orange-100", textColor: "text-orange-700" },
    after_tool_call: { label: "工具调用后", bgColor: "bg-orange-100", textColor: "text-orange-700" },
    tool_result_persist: { label: "工具持久化", bgColor: "bg-amber-100", textColor: "text-amber-700" },
    message_received: { label: "消息接收", bgColor: "bg-blue-100", textColor: "text-blue-700" },
    message_sending: { label: "消息发送中", bgColor: "bg-cyan-100", textColor: "text-cyan-700" },
    message_sent: { label: "消息已发送", bgColor: "bg-green-100", textColor: "text-green-700" },
    before_message_write: { label: "消息写入", bgColor: "bg-gray-100", textColor: "text-gray-700" },
    before_model_resolve: { label: "模型解析", bgColor: "bg-purple-100", textColor: "text-purple-700" },
    before_prompt_build: { label: "Prompt构建", bgColor: "bg-pink-100", textColor: "text-pink-700" },
    before_agent_start: { label: "Agent启动前", bgColor: "bg-purple-100", textColor: "text-purple-700" },
    agent_end: { label: "Agent结束", bgColor: "bg-purple-100", textColor: "text-purple-700" },
    before_compaction: { label: "压缩前", bgColor: "bg-indigo-100", textColor: "text-indigo-700" },
    after_compaction: { label: "压缩后", bgColor: "bg-indigo-100", textColor: "text-indigo-700" },
    before_reset: { label: "重置前", bgColor: "bg-red-100", textColor: "text-red-700" },
    session_start: { label: "会话开始", bgColor: "bg-green-100", textColor: "text-green-700" },
    session_end: { label: "会话结束", bgColor: "bg-red-100", textColor: "text-red-700" },
    gateway_start: { label: "网关启动", bgColor: "bg-cyan-100", textColor: "text-cyan-700" },
    gateway_stop: { label: "网关停止", bgColor: "bg-red-100", textColor: "text-red-700" },
  };
  return configs[type] ?? { label: type, bgColor: "bg-gray-100", textColor: "text-gray-700" };
}

/**
 * 提取事件预览文本
 */
function extractEventPreview(event: TracingEvent, maxLength = 80): string {
  for (const block of event.content) {
    if (block.type === "text" && block.text) {
      const text = block.text.trim();
      return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
    }
    if (block.type === "tool_use" && block.name) {
      return `调用 ${block.name}`;
    }
    if (block.type === "tool_result") {
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      const preview = content.slice(0, 60);
      return block.is_error ? `错误: ${preview}` : `结果: ${preview}`;
    }
  }
  return "[无预览]";
}

/**
 * 事件项组件
 */
function EventItem({ event, onClick }: EventItemProps): React.ReactElement {
  const config = getEventTypeConfig(event.type);
  const preview = extractEventPreview(event);
  const hasError = event.type === "error" || event.error !== undefined;

  return (
    <div
      onClick={onClick}
      className={`px-3 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${
        hasError ? "bg-red-50 hover:bg-red-100" : "bg-white hover:bg-gray-100"
      }`}
    >
      {/* 类型标签 */}
      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${config.bgColor} ${config.textColor}`}>
        {config.label}
      </span>

      {/* 预览文本 */}
      <span className="text-sm text-gray-600 truncate flex-1">{preview}</span>

      {/* 时间和其他信息 */}
      <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
        {typeof event.duration_ms === "number" && <span>{event.duration_ms}ms</span>}
        <span>{formatTime(event.timestamp)}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

/**
 * 加载中状态组件
 */
function LoadingState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">加载回合数据...</p>
      </div>
    </div>
  );
}

/**
 * 错误状态组件
 */
function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <svg className="w-12 h-12 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}

/**
 * 空状态组件
 */
function EmptyState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center text-gray-400">
        <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <p className="text-sm">暂无回合数据</p>
        <p className="text-xs text-gray-300 mt-1">等待用户交互...</p>
      </div>
    </div>
  );
}

/**
 * 状态过滤器按钮配置
 */
const STATUS_FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "error", label: "错误" },
];

/**
 * 回合视图组件
 * 按照用户-助手对话回合组织展示事件
 */
export function TurnView({ sessionId, events }: TurnViewProps): React.ReactElement {
  const { turns, turnsLoading, turnsError, fetchTurns } = useTracingStore();

  const [selectedEvent, setSelectedEvent] = useState<TracingEvent | null>(null);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const debouncedSearchKeyword = useDebounce(searchKeyword, 300);

  const sessionTurns = useMemo(() => {
    return turns.get(sessionId) ?? [];
  }, [turns, sessionId]);

  const sortedTurns = useMemo(() => {
    return sessionTurns;
  }, [sessionTurns]);

  const orphanEventsByTurn = useMemo(() => {
    if (sortedTurns.length === 0 || events.length === 0) {
      return new Map<string, TracingEvent[]>();
    }

    const eventIds = new Set<string>();
    for (const turn of sortedTurns) {
      for (const eventId of turn.event_ids) {
        eventIds.add(eventId);
      }
    }

    const boundaries = sortedTurns.map((turn, index) => {
      const start = new Date(turn.started_at).getTime();
      const nextStart =
        index < sortedTurns.length - 1 ? new Date(sortedTurns[index + 1].started_at).getTime() : Number.POSITIVE_INFINITY;
      const endTime = turn.ended_at ? new Date(turn.ended_at).getTime() : nextStart;
      const end = Math.min(endTime, nextStart);
      return { id: turn.id, start, end };
    });

    const map = new Map<string, TracingEvent[]>();
    const firstBoundary = boundaries[0];
    const lastBoundary = boundaries[boundaries.length - 1];

    for (const event of events) {
      if (event.session_id !== sessionId) {
        continue;
      }
      if (eventIds.has(event.id)) {
        continue;
      }

      const time = new Date(event.timestamp).getTime();
      let target = boundaries.find((b) => time >= b.start && time < b.end);

      if (!target && time < firstBoundary.start) {
        target = firstBoundary;
      }

      if (!target && time >= lastBoundary.start) {
        target = lastBoundary;
      }

      if (!target) {
        target = boundaries.reduce((closest, current) => {
          const currentDelta = Math.abs(time - current.start);
          const closestDelta = Math.abs(time - closest.start);
          return currentDelta < closestDelta ? current : closest;
        }, boundaries[0]);
      }

      const list = map.get(target.id);
      if (list) {
        list.push(event);
      } else {
        map.set(target.id, [event]);
      }
    }

    return map;
  }, [events, sortedTurns, sessionId]);

  const filteredTurns = useMemo(() => {
    return sortedTurns.filter((turn) => {
      if (statusFilter !== "all" && turn.status !== statusFilter) {
        return false;
      }
      if (debouncedSearchKeyword) {
        const keyword = debouncedSearchKeyword.toLowerCase();
        const userMatch = turn.user_preview?.toLowerCase().includes(keyword) ?? false;
        const assistantMatch = turn.assistant_preview?.toLowerCase().includes(keyword) ?? false;
        if (!userMatch && !assistantMatch) {
          return false;
        }
      }
      return true;
    });
  }, [sortedTurns, statusFilter, debouncedSearchKeyword]);

  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(() => new Set());
  const [lastInitSessionId, setLastInitSessionId] = useState<string | null>(null);

  const prevTurnIdsRef = useRef<Set<string>>(new Set());
  const [newTurnIds, setNewTurnIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (sessionId) {
      fetchTurns(sessionId);
    }
  }, [sessionId, fetchTurns]);

  useEffect(() => {
    if (lastInitSessionId !== sessionId) {
      prevTurnIdsRef.current = new Set();
      setNewTurnIds(new Set());
    }
  }, [sessionId, lastInitSessionId]);

  useEffect(() => {
    const currentIds = new Set(sortedTurns.map((t) => t.id));
    const prevIds = prevTurnIdsRef.current;

    if (prevIds.size > 0) {
      const newIds: string[] = [];
      for (const id of currentIds) {
        if (!prevIds.has(id)) {
          newIds.push(id);
        }
      }

      if (newIds.length > 0) {
        setNewTurnIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) {
            next.add(id);
          }
          return next;
        });

        setExpandedTurns((prev) => {
          const next = new Set(prev);
          for (const id of newIds) {
            next.add(id);
          }
          return next;
        });

        setTimeout(() => {
          setNewTurnIds((prev) => {
            const next = new Set(prev);
            for (const id of newIds) {
              next.delete(id);
            }
            return next;
          });
        }, 2000);
      }
    }

    prevTurnIdsRef.current = currentIds;
  }, [sortedTurns]);

  const shouldInitialize = sortedTurns.length > 0 && lastInitSessionId !== sessionId;
  const computedExpandedTurns = useMemo(() => {
    if (shouldInitialize) {
      const lastTurnId = sortedTurns[sortedTurns.length - 1].id;
      return new Set([lastTurnId]);
    }
    return expandedTurns;
  }, [shouldInitialize, sortedTurns, expandedTurns]);

  const handleToggleTurn = useCallback((turnId: string) => {
    setLastInitSessionId(sessionId);
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }, [sessionId]);

  const handleExpandAll = useCallback(() => {
    setLastInitSessionId(sessionId);
    setExpandedTurns(new Set(filteredTurns.map((t) => t.id)));
  }, [filteredTurns, sessionId]);

  const handleCollapseAll = useCallback(() => {
    setLastInitSessionId(sessionId);
    setExpandedTurns(new Set());
  }, [sessionId]);

  const handleRetry = useCallback(() => {
    fetchTurns(sessionId);
  }, [sessionId, fetchTurns]);

  const handleClearFilters = useCallback(() => {
    setSearchKeyword("");
    setStatusFilter("all");
  }, []);

  const allExpanded = filteredTurns.length > 0 && filteredTurns.every((t) => computedExpandedTurns.has(t.id));
  const hasFilters = searchKeyword !== "" || statusFilter !== "all";

  if (turnsLoading && sessionTurns.length === 0) {
    return <LoadingState />;
  }

  if (turnsError && sessionTurns.length === 0) {
    return <ErrorState error={turnsError} onRetry={handleRetry} />;
  }

  if (sortedTurns.length === 0) {
    return <EmptyState />;
  }

  return (
    <Fragment>
      <div className="p-4">
        {/* 头部 */}
        <div className="flex flex-col mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800">回合视图</h3>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-sm">
                {hasFilters ? `${filteredTurns.length}/${sortedTurns.length}` : sortedTurns.length} 个回合
              </span>
              {turnsLoading && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* 展开/折叠全部按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={allExpanded ? handleCollapseAll : handleExpandAll}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
              >
                {allExpanded ? "折叠全部" : "展开全部"}
              </button>
            </div>
          </div>

          {/* 统计信息栏 */}
          <div className="flex items-center gap-4 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
             <div className="flex items-center gap-1">
                <span className="font-medium text-gray-700">总 Token:</span>
                <span>{sessionTurns.reduce((acc, t) => acc + t.input_tokens + t.output_tokens, 0).toLocaleString()}</span>
             </div>
             <div className="flex items-center gap-1">
                <span className="font-medium text-gray-700">总耗时:</span>
                <span>{formatDuration(sessionTurns.reduce((acc, t) => acc + (t.duration_ms || 0), 0))}</span>
             </div>
             <div className="flex items-center gap-1">
                <span className="font-medium text-gray-700">总成本:</span>
                <span>${sessionTurns.reduce((acc, t) => acc + (t.cost || 0), 0).toFixed(4)}</span>
             </div>
          </div>
        </div>

        {/* 搜索框和过滤器 */}
        <div className="flex items-center gap-3 mb-4">
          {/* 搜索框 */}
          <div className="relative flex-1 max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索用户消息内容..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* 状态过滤器按钮组 */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === option.value
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* 清除过滤器按钮 */}
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              清除筛选
            </button>
          )}
        </div>

        {/* 回合卡片列表 */}
        <div className="space-y-3">
          {filteredTurns.length > 0 ? (
            filteredTurns.map((turn) => (
              <TurnCard
                key={turn.id}
                turn={turn}
                events={events}
                extraEvents={orphanEventsByTurn.get(turn.id) ?? []}
                expanded={computedExpandedTurns.has(turn.id)}
                isNew={newTurnIds.has(turn.id)}
                onToggle={() => handleToggleTurn(turn.id)}
                onEventClick={setSelectedEvent}
              />
            ))
          ) : (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-sm">没有找到匹配的回合</p>
              <button
                onClick={handleClearFilters}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                清除筛选条件
              </button>
            </div>
          )}
        </div>

        {/* 错误提示（有数据时显示在底部） */}
        {turnsError && sessionTurns.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
            <span>刷新失败: {turnsError}</span>
            <button
              onClick={handleRetry}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded transition-colors"
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* 事件详情弹窗 */}
      {selectedEvent && (
        <MessageDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </Fragment>
  );
}
