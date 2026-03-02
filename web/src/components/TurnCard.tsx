import { useState, useMemo } from "react";
import type { Turn, TracingEvent, ContentBlock } from "../types";
import { formatDateTime } from "../utils/date";
import { ToolCallDetail } from "./ToolCallDetail";

/**
 * 格式化耗时显示
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 格式化时间戳为简短时间格式 (HH:mm:ss.SSS)
 */
function formatTime(timestamp: string): string {
  return formatDateTime(timestamp);
}

/**
 * 格式化费用显示
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * 从 ContentBlock 数组中提取纯文本内容
 */
function extractTextFromContent(content: ContentBlock[]): string {
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * 从事件列表中提取工具调用信息
 */
interface ToolCallInfo {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  output?: string | Record<string, unknown>;
  duration_ms?: number;
  is_error: boolean;
}

function extractToolCalls(events: TracingEvent[]): ToolCallInfo[] {
  const toolCalls: Map<string, ToolCallInfo> = new Map();

  for (const event of events) {
    if (event.type === "tool_call") {
      for (const block of event.content) {
        if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.set(block.id, {
            id: block.id,
            name: block.name,
            input: block.input,
            is_error: false,
          });
        }
      }
    } else if (event.type === "tool_result") {
      for (const block of event.content) {
        if (block.type === "tool_result" && block.id) {
          const existing = toolCalls.get(block.id);
          if (existing) {
            existing.output =
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);
            existing.duration_ms = block.duration_ms ?? event.duration_ms;
            existing.is_error = block.is_error ?? false;
          }
        }
      }
    }
  }

  return Array.from(toolCalls.values());
}

/**
 * 消息气泡组件属性
 */
interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  maxPreviewLength?: number;
  isExpanded?: boolean;
}

/**
 * 消息气泡组件
 */
function MessageBubble({
  role,
  content,
  timestamp,
  maxPreviewLength = 300,
  isExpanded = true,
}: MessageBubbleProps): React.ReactElement {
  const [showFull, setShowFull] = useState(false);
  const isLongContent = content.length > maxPreviewLength;

  const displayContent = useMemo(() => {
    if (showFull || !isLongContent || !isExpanded) {
      return isExpanded ? content : content.slice(0, 100) + (content.length > 100 ? "..." : "");
    }
    return content.slice(0, maxPreviewLength) + "...";
  }, [content, showFull, isLongContent, maxPreviewLength, isExpanded]);

  const isUser = role === "user";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{isUser ? "👤" : "🤖"}</span>
          <span className="text-sm font-medium text-gray-700">
            {isUser ? "User" : "Assistant"}
          </span>
        </div>
        <span className="text-xs text-gray-400 font-mono">{formatTime(timestamp)}</span>
      </div>
      <div
        className={`rounded-lg p-3 ${
          isUser ? "bg-blue-50 border border-blue-100" : "bg-gray-50 border border-gray-200"
        }`}
      >
        <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
          {displayContent}
        </pre>
        {isExpanded && isLongContent && (
          <button
            onClick={() => setShowFull(!showFull)}
            className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {showFull ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              )}
            </svg>
            <span>{showFull ? "收起内容" : "展开查看完整内容"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * TurnCard 组件属性
 */
export interface TurnCardProps {
  /** Turn 数据 */
  turn: Turn;
  /** 该 Turn 关联的所有事件 */
  events: TracingEvent[];
  /** 是否展开 */
  expanded?: boolean;
  /** 切换展开/折叠回调 */
  onToggle?: () => void;
}

/**
 * TurnCard 组件
 * 展示单个回合卡片，包含用户消息、工具调用列表和助手消息
 */
export function TurnCard({
  turn,
  events,
  expanded: controlledExpanded,
  onToggle,
}: TurnCardProps): React.ReactElement {
  const [internalExpanded, setInternalExpanded] = useState(false);

  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const userEvent = useMemo(
    () => events.find((e) => e.id === turn.user_event_id),
    [events, turn.user_event_id]
  );

  const assistantEvent = useMemo(
    () => events.find((e) => e.id === turn.assistant_event_id),
    [events, turn.assistant_event_id]
  );

  const toolCalls = useMemo(() => extractToolCalls(events), [events]);

  const userMessage = useMemo(
    () => (userEvent ? extractTextFromContent(userEvent.content) : turn.user_preview ?? ""),
    [userEvent, turn.user_preview]
  );

  const assistantMessage = useMemo(
    () =>
      assistantEvent
        ? extractTextFromContent(assistantEvent.content)
        : turn.assistant_preview ?? "",
    [assistantEvent, turn.assistant_preview]
  );

  const processingDuration = useMemo(() => {
    if (!userEvent || !assistantEvent) {
      return turn.duration_ms ?? 0;
    }
    const start = new Date(userEvent.timestamp).getTime();
    const end = new Date(assistantEvent.timestamp).getTime();
    return end - start;
  }, [userEvent, assistantEvent, turn.duration_ms]);

  const isError = turn.status === "error" || turn.error_count > 0;
  const isInProgress = turn.status === "in_progress";

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
        isError
          ? "bg-red-50/50 border-red-300"
          : isInProgress
            ? "bg-yellow-50/50 border-yellow-300"
            : "bg-white border-gray-200"
      }`}
    >
      {/* 卡片头部 - 始终显示 */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer ${
          isError ? "bg-red-50" : isInProgress ? "bg-yellow-50" : "bg-gray-50"
        }`}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800">Turn {turn.turn_number}</span>
          {!expanded && userMessage && (
            <span className="text-sm text-gray-500 truncate max-w-xs">
              {userMessage.slice(0, 50)}
              {userMessage.length > 50 ? "..." : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {typeof turn.duration_ms === "number" && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <span>⏱</span>
              <span className="font-mono">{formatDuration(turn.duration_ms)}</span>
            </span>
          )}

          {typeof turn.cost === "number" && turn.cost > 0 && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <span>💰</span>
              <span className="font-mono">{formatCost(turn.cost)}</span>
            </span>
          )}

          {turn.tool_call_count > 0 && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <span>🔧</span>
              <span className="font-mono">{turn.tool_call_count}</span>
            </span>
          )}

          <span
            className={`flex items-center justify-center w-6 h-6 rounded-full ${
              isError
                ? "bg-red-100"
                : isInProgress
                  ? "bg-yellow-100"
                  : "bg-green-100"
            }`}
          >
            {isError ? (
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : isInProgress ? (
              <svg
                className="w-4 h-4 text-yellow-500 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>

          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-4 py-4 space-y-4">
          {/* 用户消息 */}
          {userEvent && userMessage && (
            <MessageBubble
              role="user"
              content={userMessage}
              timestamp={userEvent.timestamp}
            />
          )}

          {/* 工具调用区域 */}
          {toolCalls.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <span className="text-sm font-medium text-gray-700">Agent Processing</span>
                {processingDuration > 0 && (
                  <span className="text-xs text-gray-400 font-mono">
                    ⏱ {formatDuration(processingDuration)}
                  </span>
                )}
              </div>
              <div className="ml-6 space-y-2 border-l-2 border-gray-200 pl-4">
                {toolCalls.map((tool) => (
                  <ToolCallDetail
                    key={tool.id}
                    name={tool.name}
                    input={tool.input}
                    output={tool.output}
                    duration_ms={tool.duration_ms}
                    is_error={tool.is_error}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 助手消息 */}
          {assistantEvent && assistantMessage && (
            <MessageBubble
              role="assistant"
              content={assistantMessage}
              timestamp={assistantEvent.timestamp}
            />
          )}

          {/* 进行中提示 */}
          {isInProgress && !assistantEvent && (
            <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 rounded-lg p-3">
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>正在处理中...</span>
            </div>
          )}

          {/* 统计信息 */}
          <div className="flex items-center gap-4 pt-2 border-t border-gray-100 text-xs text-gray-400">
            {turn.input_tokens > 0 && (
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                  输入: {turn.input_tokens.toLocaleString()}
                </span>
              </span>
            )}
            {turn.output_tokens > 0 && (
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                  输出: {turn.output_tokens.toLocaleString()}
                </span>
              </span>
            )}
            {turn.error_count > 0 && (
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                  错误: {turn.error_count}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
