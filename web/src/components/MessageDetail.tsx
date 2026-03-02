import { useState } from "react";
import type { ContentBlock, TracingEvent } from "../types";
import { formatDateTime } from "../utils/date";

/**
 * 格式化时间戳为完整本地时间
 */
function formatFullTime(timestamp: string): string {
  return formatDateTime(timestamp);
}

/**
 * JSON 格式化展示组件
 */
interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

function JsonViewer({ data, maxHeight = "300px" }: JsonViewerProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const formatted = JSON.stringify(data, null, 2);
  const lines = formatted.split("\n");
  const isLong = lines.length > 20;

  return (
    <div className="relative">
      <pre
        className={`p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap ${!expanded && isLong ? "max-h-48 overflow-hidden" : ""}`}
        style={{ maxHeight: expanded ? "none" : maxHeight }}
      >
        <code>{formatted}</code>
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute bottom-2 right-2 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

/**
 * 内容块详情展示
 */
interface ContentBlockDetailProps {
  block: ContentBlock;
  index: number;
}

function ContentBlockDetail({ block, index }: ContentBlockDetailProps): React.ReactElement {
  const [showRaw, setShowRaw] = useState(false);

  function renderBlockContent(): React.ReactElement {
    switch (block.type) {
      case "text":
        return (
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-gray-700 font-sans text-sm">{block.text}</pre>
          </div>
        );

      case "tool_use":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                工具调用
              </span>
              <span className="font-mono text-sm font-medium">{block.name}</span>
              {block.id && (
                <span className="text-xs text-gray-400 font-mono">ID: {block.id}</span>
              )}
            </div>
            {block.input && Object.keys(block.input).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">输入参数:</p>
                <JsonViewer data={block.input} />
              </div>
            )}
          </div>
        );

      case "tool_result":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${block.is_error ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
              >
                {block.is_error ? "执行错误" : "执行结果"}
              </span>
              {block.id && (
                <span className="text-xs text-gray-400 font-mono">ID: {block.id}</span>
              )}
              {typeof block.duration_ms === "number" && (
                <span className="text-xs text-gray-500">{block.duration_ms}ms</span>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">返回内容:</p>
              <JsonViewer
                data={typeof block.content === "string" ? block.content : block.content ?? null}
                maxHeight="400px"
              />
            </div>
          </div>
        );

      case "image":
        if (block.source?.type === "base64") {
          return (
            <div className="space-y-2">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                图片
              </span>
              <img
                src={`data:${block.source.media_type};base64,${block.source.data}`}
                alt="Image content"
                className="max-w-full h-auto rounded-lg border border-gray-200"
              />
            </div>
          );
        }
        return <span className="text-gray-400 text-sm">图片数据不可用</span>;

      default:
        return <JsonViewer data={block} />;
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
        onClick={() => setShowRaw(!showRaw)}
      >
        <span className="text-xs font-medium text-gray-600">
          内容块 #{index + 1} - {block.type}
        </span>
        <button className="text-xs text-blue-500 hover:text-blue-700">
          {showRaw ? "显示格式化" : "显示原始数据"}
        </button>
      </div>
      <div className="p-3">
        {showRaw ? <JsonViewer data={block} /> : renderBlockContent()}
      </div>
    </div>
  );
}

/**
 * 元数据展示组件
 */
interface MetadataViewerProps {
  metadata: TracingEvent["metadata"];
}

function MetadataViewer({ metadata }: MetadataViewerProps): React.ReactElement | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  const { usage, model, ...rest } = metadata;

  return (
    <div className="space-y-3">
      {model && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">模型:</span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
            {model}
          </span>
        </div>
      )}
      {usage && (
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">Token 使用:</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
              输入: {(usage as { input_tokens?: number }).input_tokens ?? 0}
            </span>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
              输出: {(usage as { output_tokens?: number }).output_tokens ?? 0}
            </span>
          </div>
        </div>
      )}
      {Object.keys(rest).length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">其他元数据:</p>
          <JsonViewer data={rest} maxHeight="200px" />
        </div>
      )}
    </div>
  );
}

/**
 * 消息详情面板组件
 * 展示单条消息的完整信息
 */
export interface MessageDetailProps {
  event: TracingEvent;
  onClose: () => void;
}

export function MessageDetail({ event, onClose }: MessageDetailProps): React.ReactElement {
  const typeLabels: Record<TracingEvent["type"], string> = {
    user_message: "用户消息",
    assistant_message: "助手消息",
    tool_call: "工具调用",
    tool_result: "工具结果",
    error: "错误",
    system: "系统事件",
    turn_start: "回合开始",
    turn_end: "回合结束",
    agent_start: "Agent启动",
    agent_stop: "Agent停止",
    llm_input: "LLM输入",
    llm_output: "LLM输出",
    before_tool_call: "工具调用前",
    after_tool_call: "工具调用后",
    tool_result_persist: "工具持久化",
    message_received: "消息接收",
    message_sending: "消息发送中",
    message_sent: "消息已发送",
    before_message_write: "消息写入",
    before_model_resolve: "模型解析",
    before_prompt_build: "Prompt构建",
    before_agent_start: "Agent启动前",
    agent_end: "Agent结束",
    before_compaction: "压缩前",
    after_compaction: "压缩后",
    before_reset: "重置前",
    session_start: "会话开始",
    session_end: "会话结束",
    gateway_start: "网关启动",
    gateway_stop: "网关停止",
  };

  const typeStyles: Record<TracingEvent["type"], string> = {
    user_message: "bg-blue-100 text-blue-700",
    assistant_message: "bg-green-100 text-green-700",
    tool_call: "bg-orange-100 text-orange-700",
    tool_result: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
    system: "bg-gray-100 text-gray-700",
    turn_start: "bg-purple-100 text-purple-700",
    turn_end: "bg-purple-100 text-purple-700",
    agent_start: "bg-indigo-100 text-indigo-700",
    agent_stop: "bg-indigo-100 text-indigo-700",
    llm_input: "bg-green-100 text-green-700",
    llm_output: "bg-blue-100 text-blue-700",
    before_tool_call: "bg-orange-100 text-orange-700",
    after_tool_call: "bg-orange-100 text-orange-700",
    tool_result_persist: "bg-amber-100 text-amber-700",
    message_received: "bg-blue-100 text-blue-700",
    message_sending: "bg-cyan-100 text-cyan-700",
    message_sent: "bg-green-100 text-green-700",
    before_message_write: "bg-gray-100 text-gray-700",
    before_model_resolve: "bg-purple-100 text-purple-700",
    before_prompt_build: "bg-pink-100 text-pink-700",
    before_agent_start: "bg-purple-100 text-purple-700",
    agent_end: "bg-purple-100 text-purple-700",
    before_compaction: "bg-indigo-100 text-indigo-700",
    after_compaction: "bg-indigo-100 text-indigo-700",
    before_reset: "bg-red-100 text-red-700",
    session_start: "bg-green-100 text-green-700",
    session_end: "bg-red-100 text-red-700",
    gateway_start: "bg-cyan-100 text-cyan-700",
    gateway_stop: "bg-red-100 text-red-700",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">消息详情</h2>
            <span className={`px-2 py-1 rounded text-xs font-medium ${typeStyles[event.type]}`}>
              {typeLabels[event.type]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">基本信息</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">事件 ID:</span>
                <p className="font-mono text-xs mt-1 break-all">{event.id}</p>
              </div>
              <div>
                <span className="text-gray-500">会话 ID:</span>
                <p className="font-mono text-xs mt-1 break-all">{event.session_id}</p>
              </div>
              <div>
                <span className="text-gray-500">时间戳:</span>
                <p className="mt-1">{formatFullTime(event.timestamp)}</p>
              </div>
              {typeof event.duration_ms === "number" && (
                <div>
                  <span className="text-gray-500">耗时:</span>
                  <p className="mt-1">{event.duration_ms} ms</p>
                </div>
              )}
              {event.parent_id && (
                <div>
                  <span className="text-gray-500">父事件 ID:</span>
                  <p className="font-mono text-xs mt-1 break-all">{event.parent_id}</p>
                </div>
              )}
              {typeof event.cost === "number" && event.cost > 0 && (
                <div>
                  <span className="text-gray-500">成本:</span>
                  <p className="mt-1">${event.cost.toFixed(6)}</p>
                </div>
              )}
            </div>
          </section>

          {event.correlation && (event.correlation.runId || event.correlation.turnId || event.correlation.toolCallId) && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">关联信息 (Correlation)</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {event.correlation.runId && (
                  <div>
                    <span className="text-gray-500">Run ID:</span>
                    <p className="font-mono text-xs mt-1 break-all">
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                        {event.correlation.runId}
                      </span>
                    </p>
                  </div>
                )}
                {event.correlation.turnId && (
                  <div>
                    <span className="text-gray-500">Turn ID:</span>
                    <p className="font-mono text-xs mt-1 break-all">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                        {event.correlation.turnId}
                      </span>
                    </p>
                  </div>
                )}
                {event.correlation.toolCallId && (
                  <div>
                    <span className="text-gray-500">Tool Call ID:</span>
                    <p className="font-mono text-xs mt-1 break-all">
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                        {event.correlation.toolCallId}
                      </span>
                    </p>
                  </div>
                )}
                {event.correlation.parentEventId && (
                  <div>
                    <span className="text-gray-500">Parent Event ID:</span>
                    <p className="font-mono text-xs mt-1 break-all">{event.correlation.parentEventId}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">元数据</h3>
              <MetadataViewer metadata={event.metadata} />
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              内容 ({event.content.length} 个块)
            </h3>
            <div className="space-y-3">
              {event.content.map((block, index) => (
                <ContentBlockDetail key={index} block={block} index={index} />
              ))}
            </div>
          </section>

          {event.error !== undefined && event.error !== null && (
            <section>
              <h3 className="text-sm font-semibold text-red-700 mb-3">错误信息</h3>
              <JsonViewer data={event.error as Record<string, unknown>} />
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">原始事件数据</h3>
            <JsonViewer data={event} maxHeight="400px" />
          </section>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
