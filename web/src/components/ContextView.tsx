import { useMemo, useState } from "react";
import type { ContentBlock, TracingEvent } from "../types";
import { formatDateTime } from "../utils/date";

/**
 * 计算到指定事件时的累计 token
 */
function calculateContextTokens(
  events: TracingEvent[],
  upToIndex: number
): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i <= upToIndex && i < events.length; i++) {
    const event = events[i];
    const usage = event?.metadata?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    if (usage) {
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
    }
  }

  return { inputTokens, outputTokens };
}

/**
 * 提取文本内容预览
 */
function extractTextPreview(content: ContentBlock[], maxLength = 200): string {
  for (const block of content) {
    if (block.type === "text" && block.text) {
      const text = block.text.trim();
      if (text.length > maxLength) {
        return text.slice(0, maxLength) + "...";
      }
      return text;
    }
    if (block.type === "tool_use" && block.name) {
      return `[工具调用: ${block.name}]`;
    }
    if (block.type === "tool_result") {
      const isError = block.is_error;
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      const preview = content.slice(0, 100);
      return isError ? `[错误结果: ${preview}...]` : `[执行结果: ${preview}...]`;
    }
  }
  return "[无文本内容]";
}

/**
 * 上下文消息项
 */
interface ContextMessageProps {
  event: TracingEvent;
  index: number;
  totalCount: number;
  isSelected: boolean;
  onClick: () => void;
  cumulativeTokens: { inputTokens: number; outputTokens: number };
}

function ContextMessage({
  event,
  index,
  totalCount,
  isSelected,
  onClick,
  cumulativeTokens,
}: ContextMessageProps): React.ReactElement {
  const roleConfig: Record<
    TracingEvent["type"],
    { label: string; bgColor: string; borderColor: string }
  > = {
    user_message: { label: "用户", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
    assistant_message: { label: "助手", bgColor: "bg-green-50", borderColor: "border-green-200" },
    tool_call: { label: "工具", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
    tool_result: { label: "结果", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
    error: { label: "错误", bgColor: "bg-red-50", borderColor: "border-red-200" },
    system: { label: "系统", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
    turn_start: { label: "回合开始", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
    turn_end: { label: "回合结束", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
    agent_start: { label: "Agent启动", bgColor: "bg-indigo-50", borderColor: "border-indigo-200" },
    agent_stop: { label: "Agent停止", bgColor: "bg-indigo-50", borderColor: "border-indigo-200" },
    llm_input: { label: "LLM输入", bgColor: "bg-green-50", borderColor: "border-green-200" },
    llm_output: { label: "LLM输出", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
    before_tool_call: { label: "工具调用前", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
    after_tool_call: { label: "工具调用后", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
    tool_result_persist: { label: "工具持久化", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
    message_received: { label: "消息接收", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
    message_sending: { label: "消息发送中", bgColor: "bg-cyan-50", borderColor: "border-cyan-200" },
    message_sent: { label: "消息已发送", bgColor: "bg-green-50", borderColor: "border-green-200" },
    before_message_write: { label: "消息写入", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
    before_model_resolve: { label: "模型解析", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
    before_prompt_build: { label: "Prompt构建", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
    before_agent_start: { label: "Agent启动前", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
    agent_end: { label: "Agent结束", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
    before_compaction: { label: "压缩前", bgColor: "bg-indigo-50", borderColor: "border-indigo-200" },
    after_compaction: { label: "压缩后", bgColor: "bg-indigo-50", borderColor: "border-indigo-200" },
    before_reset: { label: "重置前", bgColor: "bg-red-50", borderColor: "border-red-200" },
    session_start: { label: "会话开始", bgColor: "bg-green-50", borderColor: "border-green-200" },
    session_end: { label: "会话结束", bgColor: "bg-red-50", borderColor: "border-red-200" },
    gateway_start: { label: "网关启动", bgColor: "bg-cyan-50", borderColor: "border-cyan-200" },
    gateway_stop: { label: "网关停止", bgColor: "bg-red-50", borderColor: "border-red-200" },
  };

  const config = roleConfig[event.type];
  const preview = extractTextPreview(event.content);

  return (
    <div
      onClick={onClick}
      className={`
        relative p-3 rounded-lg border cursor-pointer transition-all
        ${config.bgColor} ${config.borderColor}
        ${isSelected ? "ring-2 ring-blue-500 shadow-md" : "hover:shadow-sm"}
      `}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-current opacity-20" />
      
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">#{index + 1}/{totalCount}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor.replace("50", "100")} ${config.borderColor.replace("border-", "text-").replace("-200", "-700")}`}>
            {config.label}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {formatDateTime(event.timestamp)}
        </span>
      </div>

      <p className="text-sm text-gray-700 line-clamp-2">{preview}</p>

      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span title="累计输入 Token">📥 {cumulativeTokens.inputTokens}</span>
        <span title="累计输出 Token">📤 {cumulativeTokens.outputTokens}</span>
        <span title="累计总 Token">
          📊 {cumulativeTokens.inputTokens + cumulativeTokens.outputTokens}
        </span>
      </div>
    </div>
  );
}

/**
 * 上下文统计面板
 */
interface ContextStatsProps {
  events: TracingEvent[];
  selectedIndex: number | null;
}

function ContextStats({ events, selectedIndex }: ContextStatsProps): React.ReactElement {
  const stats = useMemo(() => {
    const totalTokens = calculateContextTokens(events, events.length - 1);
    const selectedTokens =
      selectedIndex !== null ? calculateContextTokens(events, selectedIndex) : null;

    const messageCount = events.filter(
      (e) => e.type === "user_message" || e.type === "assistant_message"
    ).length;
    const toolCallCount = events.filter((e) => e.type === "tool_call").length;

    return {
      totalEvents: events.length,
      messageCount,
      toolCallCount,
      totalInputTokens: totalTokens.inputTokens,
      totalOutputTokens: totalTokens.outputTokens,
      selectedInputTokens: selectedTokens?.inputTokens ?? 0,
      selectedOutputTokens: selectedTokens?.outputTokens ?? 0,
    };
  }, [events, selectedIndex]);

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">上下文统计</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">总事件数:</span>
          <span className="font-medium">{stats.totalEvents}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">对话轮数:</span>
          <span className="font-medium">{stats.messageCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">工具调用:</span>
          <span className="font-medium">{stats.toolCallCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">总 Token:</span>
          <span className="font-medium">{stats.totalInputTokens + stats.totalOutputTokens}</span>
        </div>
      </div>

      {selectedIndex !== null && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">
            选中位置 (#{selectedIndex + 1}) 时的上下文:
          </p>
          <div className="flex items-center gap-4 text-sm">
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
              输入: {stats.selectedInputTokens}
            </span>
            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
              输出: {stats.selectedOutputTokens}
            </span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
              总计: {stats.selectedInputTokens + stats.selectedOutputTokens}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

type FilterCategory = "system" | "user" | "assistant" | "tools" | "error" | "agent" | "llm" | "prompt" | "io";

function matchesFilter(event: TracingEvent, filter: FilterCategory): boolean {
  switch (filter) {
    case "system":
      return event.type === "system";
    case "user":
      return event.type === "user_message" || event.type === "message_received";
    case "assistant":
      return event.type === "assistant_message" || event.type === "message_sent" || event.type === "message_sending";
    case "tools":
      return event.type === "tool_call" || event.type === "tool_result" || event.type === "before_tool_call" || event.type === "after_tool_call" || event.type === "tool_result_persist";
    case "agent":
      return event.type === "agent_start" || event.type === "agent_stop" || event.type === "before_agent_start" || event.type === "agent_end";
    case "llm":
      return event.type === "llm_input" || event.type === "llm_output" || event.type === "before_model_resolve";
    case "prompt":
      return event.type === "before_prompt_build" || event.type === "before_compaction" || event.type === "after_compaction";
    case "io":
      return event.type === "before_message_write";
    case "error":
      return event.type === "error" || event.error !== undefined;
    default:
      return false;
  }
}

function getFilterCount(events: TracingEvent[], filter: FilterCategory): number {
  return events.filter((e) => matchesFilter(e, filter)).length;
}

const ALL_FILTERS: FilterCategory[] = ["user", "assistant", "system", "tools", "agent", "llm", "prompt", "io", "error"];

/**
 * 上下文筛选器（支持多选）
 */
interface ContextFilterProps {
  selectedFilters: FilterCategory[];
  onFiltersChange: (filters: FilterCategory[]) => void;
  events: TracingEvent[];
}

function ContextFilter({ selectedFilters, onFiltersChange, events }: ContextFilterProps): React.ReactElement {
  const options: Array<{ value: FilterCategory; label: string }> = [
    { value: "user", label: "User" },
    { value: "assistant", label: "Assistant" },
    { value: "system", label: "System" },
    { value: "tools", label: "工具" },
    { value: "agent", label: "Agent" },
    { value: "llm", label: "LLM" },
    { value: "prompt", label: "Prompt" },
    { value: "io", label: "I/O" },
    { value: "error", label: "错误" },
  ];

  const isAllSelected = selectedFilters.length === 0 || selectedFilters.length === ALL_FILTERS.length;

  function handleToggle(filter: FilterCategory): void {
    if (selectedFilters.includes(filter)) {
      const newFilters = selectedFilters.filter((f) => f !== filter);
      onFiltersChange(newFilters.length === 0 ? [] : newFilters);
    } else {
      const newFilters = [...selectedFilters, filter];
      onFiltersChange(newFilters.length === ALL_FILTERS.length ? [] : newFilters);
    }
  }

  function handleSelectAll(): void {
    onFiltersChange([]);
  }

  return (
    <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin w-full">
      <span className="text-sm text-gray-500 whitespace-nowrap flex-shrink-0">筛选:</span>
      <div className="flex gap-2 flex-nowrap">
        <button
          onClick={handleSelectAll}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap flex-shrink-0 ${
            isAllSelected
              ? "bg-blue-500 text-white border-blue-500 shadow-sm"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
          }`}
        >
          全部({events.length})
        </button>
        {options.map((option) => {
          const count = getFilterCount(events, option.value);
          const isSelected = selectedFilters.includes(option.value);
          return (
            <button
              key={option.value}
              onClick={() => handleToggle(option.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap flex-shrink-0 ${
                isSelected && !isAllSelected
                  ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              {option.label}
              {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * LLM 上下文展示组件
 * 展示完整的对话上下文和 Token 统计
 */
export interface ContextViewProps {
  events: TracingEvent[];
  onSelectEvent: (event: TracingEvent) => void;
}

export function ContextView({ events, onSelectEvent }: ContextViewProps): React.ReactElement {
  const [selectedFilters, setSelectedFilters] = useState<FilterCategory[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const chronologicalEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [events]
  );

  const sortedEvents = useMemo(() => events, [events]);

  const filteredEvents = useMemo(() => {
    if (selectedFilters.length === 0) {
      return sortedEvents;
    }
    return sortedEvents.filter((e) => selectedFilters.some((f) => matchesFilter(e, f)));
  }, [sortedEvents, selectedFilters]);

  function handleEventClick(index: number): void {
    setSelectedIndex(index);
    onSelectEvent(filteredEvents[index]!);
  }

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
        <p>暂无上下文数据</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">LLM 上下文</h3>
        <ContextStats events={chronologicalEvents} selectedIndex={selectedIndex} />
        <ContextFilter selectedFilters={selectedFilters} onFiltersChange={setSelectedFilters} events={chronologicalEvents} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredEvents.map((event, index) => {
          const originalIndex = chronologicalEvents.findIndex((e) => e.id === event.id);
          const cumulativeTokens = calculateContextTokens(chronologicalEvents, originalIndex);

          return (
            <ContextMessage
              key={event.id}
              event={event}
              index={index}
              totalCount={filteredEvents.length}
              isSelected={selectedIndex === index}
              onClick={() => handleEventClick(index)}
              cumulativeTokens={cumulativeTokens}
            />
          );
        })}
      </div>

      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          点击任意消息查看详情和该位置的上下文大小
        </p>
      </div>
    </div>
  );
}
