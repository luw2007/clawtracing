import { useMemo, useState, useCallback } from "react";
import type { ContentBlock, TracingEvent } from "../types";
import { formatDateTime } from "../utils/date";
import { MessageDetail } from "./MessageDetail";
import { TraceView } from "./TraceView";

type ViewMode = "compact" | "expanded" | "tracing";

/**
 * 时间线项配置
 */
interface TimelineItemConfig {
  label: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  icon: React.ReactNode;
}

function getTimelineConfig(type: TracingEvent["type"]): TimelineItemConfig {
  switch (type) {
    case "user_message":
      return {
        label: "用户",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        dotColor: "bg-blue-500",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      };
    case "assistant_message":
      return {
        label: "助手",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        dotColor: "bg-green-500",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      };
    case "tool_call":
      return {
        label: "工具调用",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200",
        dotColor: "bg-orange-500",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      };
    case "tool_result":
      return {
        label: "执行结果",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
        dotColor: "bg-amber-500",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "error":
      return {
        label: "错误",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        dotColor: "bg-red-500",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "turn_start":
      return {
        label: "Turn 开始",
        bgColor: "bg-purple-50",
        borderColor: "border-purple-200",
        dotColor: "bg-purple-500",
        icon: <span className="text-sm">⚡</span>,
      };
    case "turn_end":
      return {
        label: "Turn 结束",
        bgColor: "bg-purple-50",
        borderColor: "border-purple-200",
        dotColor: "bg-purple-500",
        icon: <span className="text-sm">⚡</span>,
      };
    case "agent_start":
      return {
        label: "Agent 启动",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-200",
        dotColor: "bg-indigo-500",
        icon: <span className="text-sm">🚀</span>,
      };
    case "agent_stop":
      return {
        label: "Agent 停止",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-200",
        dotColor: "bg-indigo-500",
        icon: <span className="text-sm">🛑</span>,
      };
    default:
      return {
        label: "系统",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-200",
        dotColor: "bg-gray-500",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
  }
}

/**
 * 格式化时间
 */
function formatTime(timestamp: string): string {
  return formatDateTime(timestamp);
}

/**
 * 提取预览文本
 */
function extractPreview(content: ContentBlock[], maxLength = 150): string {
  for (const block of content) {
    if (block.type === "text" && block.text) {
      const text = block.text.trim();
      if (text.length > maxLength) {
        return text.slice(0, maxLength) + "...";
      }
      return text;
    }
    if (block.type === "tool_use" && block.name) {
      return `调用工具: ${block.name}`;
    }
    if (block.type === "tool_result") {
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      const preview = content.slice(0, 80);
      return block.is_error ? `错误: ${preview}...` : `结果: ${preview}...`;
    }
  }
  return "[无预览]";
}

/**
 * Turn 分组数据
 */
interface TurnGroup {
  turnNumber: number;
  turnId?: string;
  events: TracingEvent[];
  userMessage?: TracingEvent;
  assistantMessage?: TracingEvent;
  toolCalls: TracingEvent[];
  startTime: string;
  endTime: string;
  totalDuration?: number;
  totalCost?: number;
}

/**
 * 计算 Turn 统计信息
 */
function computeTurnStats(events: TracingEvent[]): { duration?: number; cost?: number } {
  let duration = 0;
  let cost = 0;
  for (const e of events) {
    if (typeof e.duration_ms === "number") duration += e.duration_ms;
    if (typeof e.cost === "number") cost += e.cost;
  }
  return { duration: duration || undefined, cost: cost || undefined };
}

/**
 * 紧凑版事件行
 */
interface CompactEventRowProps {
  event: TracingEvent;
  onClick: () => void;
}

function CompactEventRow({ event, onClick }: CompactEventRowProps): React.ReactElement {
  const config = getTimelineConfig(event.type);
  const preview = extractPreview(event.content, 80);
  
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-l-2 border-transparent hover:border-blue-400 transition-colors"
    >
      <span className={`w-2 h-2 rounded-full ${config.dotColor} flex-shrink-0`} />
      <span className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.borderColor.replace("border-", "text-").replace("-200", "-600")} flex-shrink-0 w-16 text-center`}>
        {config.label}
      </span>
      <span className="text-xs text-gray-400 flex-shrink-0 w-20">{formatTime(event.timestamp)}</span>
      {typeof event.duration_ms === "number" && (
        <span className="text-xs text-gray-400 flex-shrink-0 w-12 text-right">{event.duration_ms}ms</span>
      )}
      <span className="text-sm text-gray-600 truncate flex-1">{preview}</span>
    </div>
  );
}

/**
 * Turn 卡片组件（折叠模式）
 */
interface TurnCardProps {
  turn: TurnGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onEventClick: (event: TracingEvent) => void;
}

function TurnCard({ turn, isExpanded, onToggle, onEventClick }: TurnCardProps): React.ReactElement {
  const userPreview = turn.userMessage ? extractPreview(turn.userMessage.content, 60) : "";
  const assistantPreview = turn.assistantMessage ? extractPreview(turn.assistantMessage.content, 60) : "";
  const stats = computeTurnStats(turn.events);
  
  return (
    <div className="border rounded-lg mb-2 overflow-hidden bg-white shadow-sm">
      <div 
        onClick={onToggle}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className={`transform transition-transform ${isExpanded ? "rotate-90" : ""}`}>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        
        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
          Turn {turn.turnNumber}
        </span>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {userPreview && (
              <span className="text-sm text-gray-700 truncate">
                <span className="text-blue-500 font-medium">用户:</span> {userPreview}
              </span>
            )}
          </div>
          {assistantPreview && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              <span className="text-green-600">助手:</span> {assistantPreview}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-400">
          {turn.toolCalls.length > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0" />
              </svg>
              {turn.toolCalls.length}
            </span>
          )}
          {stats.duration && <span>{stats.duration}ms</span>}
          {stats.cost && <span>${stats.cost.toFixed(4)}</span>}
          <span className="text-gray-300">|</span>
          <span>{turn.events.length} 事件</span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="border-t bg-gray-50">
          {turn.events.map((event) => (
            <CompactEventRow key={event.id} event={event} onClick={() => onEventClick(event)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 时间线项组件
 */
interface TimelineItemProps {
  event: TracingEvent;
  isLast: boolean;
  onClick: () => void;
}

function TimelineItem({ event, isLast, onClick }: TimelineItemProps): React.ReactElement {
  const config = getTimelineConfig(event.type);
  const preview = extractPreview(event.content);

  return (
    <div className="relative flex group">
      <div className="flex flex-col items-center mr-4">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor} ${config.borderColor} border-2 z-10`}>
          {config.icon}
        </div>
        {!isLast && <div className="w-0.5 h-full bg-gray-200 -mt-1" />}
      </div>

      <div
        onClick={onClick}
        className={`
          flex-1 mb-4 p-4 rounded-xl border cursor-pointer
          ${config.bgColor} ${config.borderColor}
          hover:shadow-md transition-shadow
          group-hover:border-blue-300
        `}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor.replace("50", "100")} ${config.borderColor.replace("border-", "text-").replace("-200", "-700")}`}>
              {config.label}
            </span>
            {event.correlation?.turnId && (
              <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-purple-100 text-purple-600" title={`Turn ID: ${event.correlation.turnId}`}>
                T:{event.correlation.turnId.slice(-8)}
              </span>
            )}
            {typeof event.duration_ms === "number" && (
              <span className="text-xs text-gray-400">{event.duration_ms}ms</span>
            )}
            {typeof event.cost === "number" && event.cost > 0 && (
              <span className="text-xs text-gray-400">${event.cost.toFixed(4)}</span>
            )}
          </div>
          <span className="text-xs text-gray-400">{formatTime(event.timestamp)}</span>
        </div>

        <div className="text-sm text-gray-700 line-clamp-3">{preview}</div>

        {event.content.length > 1 && (
          <div className="mt-2 text-xs text-gray-400">
            共 {event.content.length} 个内容块
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            点击查看详情
          </div>
          <svg
            className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * 消息时间线组件
 * 显示会话中所有事件的时间线视图
 */
export interface MessageTimelineProps {
  events: TracingEvent[];
}

export function MessageTimeline({ events }: MessageTimelineProps): React.ReactElement {
  const [selectedEvent, setSelectedEvent] = useState<TracingEvent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const sortedEvents = useMemo(() => events, [events]);

  /**
   * 将事件按 Turn 分组
   */
  const turnGroups = useMemo(() => {
    const ascEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const groups: TurnGroup[] = [];
    let currentGroup: TurnGroup | null = null;
    let turnNumber = 0;

    for (const event of ascEvents) {
      if (event.type === "user_message") {
        if (currentGroup) {
          currentGroup.endTime = event.timestamp;
          groups.push(currentGroup);
        }
        turnNumber++;
        currentGroup = {
          turnNumber,
          turnId: event.correlation?.turnId,
          events: [event],
          userMessage: event,
          toolCalls: [],
          startTime: event.timestamp,
          endTime: event.timestamp,
        };
      } else if (currentGroup) {
        currentGroup.events.push(event);
        currentGroup.endTime = event.timestamp;
        if (event.type === "assistant_message" || event.type === "message_sending") {
          currentGroup.assistantMessage = event;
        }
        if (event.type === "tool_call") {
          currentGroup.toolCalls.push(event);
        }
      } else {
        if (!currentGroup) {
          turnNumber++;
          currentGroup = {
            turnNumber,
            turnId: event.correlation?.turnId,
            events: [],
            toolCalls: [],
            startTime: event.timestamp,
            endTime: event.timestamp,
          };
        }
        currentGroup.events.push(event);
        currentGroup.endTime = event.timestamp;
      }
    }

    if (currentGroup && currentGroup.events.length > 0) {
      groups.push(currentGroup);
    }

    return groups.slice().reverse();
  }, [events]);

  const toggleTurn = useCallback((turnNumber: number) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(turnNumber)) {
        next.delete(turnNumber);
      } else {
        next.add(turnNumber);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedTurns(new Set(turnGroups.map(t => t.turnNumber)));
  }, [turnGroups]);

  const collapseAll = useCallback(() => {
    setExpandedTurns(new Set());
  }, []);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
        <p>暂无消息数据</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{turnGroups.length} 个 Turn，{events.length} 个事件</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
          >
            全部展开
          </button>
          <button
            onClick={collapseAll}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
          >
            全部折叠
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <button
            onClick={() => setViewMode("compact")}
            className={`px-2 py-1 text-xs rounded ${viewMode === "compact" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            折叠
          </button>
          <button
            onClick={() => setViewMode("expanded")}
            className={`px-2 py-1 text-xs rounded ${viewMode === "expanded" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            时间线
          </button>
          <button
            onClick={() => setViewMode("tracing")}
            className={`px-2 py-1 text-xs rounded ${viewMode === "tracing" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            Tracing
          </button>
        </div>
      </div>

      {viewMode === "compact" && (
        <div className="p-4 flex-1 overflow-auto">
          {turnGroups.map((turn) => (
            <TurnCard
              key={turn.turnNumber}
              turn={turn}
              isExpanded={expandedTurns.has(turn.turnNumber)}
              onToggle={() => toggleTurn(turn.turnNumber)}
              onEventClick={setSelectedEvent}
            />
          ))}
        </div>
      )}
      {viewMode === "expanded" && (
        <div className="p-6 flex-1 overflow-auto">
          {sortedEvents.map((event, index) => (
            <TimelineItem
              key={event.id}
              event={event}
              isLast={index === sortedEvents.length - 1}
              onClick={() => setSelectedEvent(event)}
            />
          ))}
        </div>
      )}
      {viewMode === "tracing" && (
        <div className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
          <TraceView events={events} />
        </div>
      )}

      {selectedEvent && (
        <MessageDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
