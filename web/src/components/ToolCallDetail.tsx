import { useState, useMemo } from "react";

/**
 * 计算内容大小（字节）
 */
function formatContentSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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
 * 可折叠内容区域组件
 */
interface CollapsibleSectionProps {
  title: string;
  content: string;
  defaultExpanded?: boolean;
  maxPreviewLength?: number;
}

function CollapsibleSection({
  title,
  content,
  defaultExpanded = false,
  maxPreviewLength = 500,
}: CollapsibleSectionProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showFull, setShowFull] = useState(false);

  const isLongContent = content.length > maxPreviewLength;
  const displayContent = useMemo(() => {
    if (showFull || !isLongContent) {
      return content;
    }
    return content.slice(0, maxPreviewLength) + "...";
  }, [content, showFull, isLongContent, maxPreviewLength]);

  const contentSize = formatContentSize(content);

  return (
    <div className="mt-2">
      <div
        className="flex items-center justify-between cursor-pointer py-1 hover:bg-gray-50 rounded px-1 -mx-1"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium">{title}</span>
          <span className="text-gray-400">({contentSize})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-blue-500 hover:text-blue-700">
            {expanded ? "折叠" : "展开"}
          </span>
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 relative">
          <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
            <code>{displayContent}</code>
          </pre>

          {isLongContent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFull(!showFull);
              }}
              className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showFull ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                )}
              </svg>
              <span>{showFull ? "收起内容" : `查看完整内容 - 共 ${contentSize}`}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 工具调用详情组件属性
 */
export interface ToolCallDetailProps {
  /** 工具名称 */
  name: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 输出结果 */
  output?: string | Record<string, unknown>;
  /** 耗时（毫秒） */
  duration_ms?: number;
  /** 是否错误 */
  is_error?: boolean;
  /** 是否默认展开 */
  expanded?: boolean;
  /** 切换展开/折叠回调 */
  onToggle?: () => void;
}

/**
 * 工具调用详情组件
 * 展示工具调用的完整信息，包括输入参数、输出结果、耗时和状态
 */
export function ToolCallDetail({
  name,
  input,
  output,
  duration_ms,
  is_error = false,
  expanded: controlledExpanded,
  onToggle,
}: ToolCallDetailProps): React.ReactElement {
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

  const inputStr = useMemo(() => {
    if (!input || Object.keys(input).length === 0) {
      return "";
    }
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  }, [input]);

  const outputStr = useMemo(() => {
    if (output === undefined || output === null) {
      return "";
    }
    if (typeof output === "string") {
      return output;
    }
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }, [output]);

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
        is_error
          ? "bg-red-50 border-red-200"
          : "bg-orange-50 border-orange-200"
      }`}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-5 h-5 ${is_error ? "text-red-500" : "text-orange-500"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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

          <span className="font-mono font-medium text-gray-800">{name}</span>
        </div>

        <div className="flex items-center gap-3">
          {typeof duration_ms === "number" && (
            <span className="text-sm text-gray-500 font-mono">
              {formatDuration(duration_ms)}
            </span>
          )}

          <span
            className={`flex items-center justify-center w-6 h-6 rounded-full ${
              is_error ? "bg-red-100" : "bg-green-100"
            }`}
          >
            {is_error ? (
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-200/50">
          {inputStr && (
            <CollapsibleSection
              title="Input"
              content={inputStr}
              defaultExpanded={true}
            />
          )}

          {outputStr && (
            <CollapsibleSection
              title="Output"
              content={outputStr}
              defaultExpanded={false}
            />
          )}

          {!inputStr && !outputStr && (
            <div className="mt-3 text-xs text-gray-400 italic">
              无输入/输出数据
            </div>
          )}
        </div>
      )}
    </div>
  );
}
