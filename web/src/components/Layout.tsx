import { useState, useMemo, useEffect } from "react";
import { useTracingStore, ALL_SESSION_ID } from "../stores/tracingStore";
import { formatDateTime } from "../utils/date";

import { MessageTimeline } from "./MessageTimeline";
import { ContextView } from "./ContextView";
import { MessageDetail } from "./MessageDetail";
import { TurnView } from "./TurnView";
import type { TracingEvent } from "../types";


/**
 * Tab 类型定义
 */
type TabType = "turns" | "timeline" | "context";

/**
 * 分页控件组件
 */
interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps): React.ReactElement {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const pageSizeOptions = [50, 100, 200, 500];

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 bg-gray-50 border-t border-gray-200 text-sm">
      <div className="flex items-center gap-2 text-gray-600">
        <span>每页</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>条</span>
      </div>

      <div className="flex items-center gap-2 text-gray-600">
        <span>
          显示 {startItem}-{endItem} / 共 {total} 条
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="首页"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="上一页"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="px-3 py-1 text-gray-700">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="下一页"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="末页"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Tab 按钮组件
 */
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}

function TabButton({ active, onClick, children, icon }: TabButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors
        ${active ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}
      `}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * 连接状态指示器
 */
interface ConnectionStatusProps {
  status: "connecting" | "connected" | "disconnected";
}

function ConnectionStatus({ status }: ConnectionStatusProps): React.ReactElement {
  const config: Record<
    string,
    { label: string; color: string; bgColor: string; pulseColor: string }
  > = {
    connected: {
      label: "已连接",
      color: "text-green-700",
      bgColor: "bg-green-100",
      pulseColor: "bg-green-500",
    },
    connecting: {
      label: "连接中",
      color: "text-yellow-700",
      bgColor: "bg-yellow-100",
      pulseColor: "bg-yellow-500",
    },
    disconnected: {
      label: "未连接",
      color: "text-red-700",
      bgColor: "bg-red-100",
      pulseColor: "bg-red-500",
    },
  };

  const { label, color, bgColor, pulseColor } = config[status];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor}`}>
      <span className="relative flex h-2.5 w-2.5">
        {status === "connecting" && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseColor} opacity-75`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${pulseColor}`} />
      </span>
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </div>
  );
}

/**
 * 应用主布局组件
 */
export function Layout(): React.ReactElement {
  const {
    selectedSessionId,
    selectedSession,
    events,
    connectionStatus,
    stats,
    eventsPagination,
    setEventsPage,
    setEventsPageSize,
    order,
    setOrder,
    setSelectedSessionId,
  } = useTracingStore();
  const [activeTab, setActiveTab] = useState<TabType>("turns");
  const [detailEvent, setDetailEvent] = useState<TracingEvent | null>(null);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSessionId(ALL_SESSION_ID);
    }
  }, [selectedSessionId, setSelectedSessionId]);

  // 当选中 ALL 会话时，直接使用 events，否则按 session_id 过滤
  const sessionEvents = useMemo(() => {
    if (!selectedSessionId) return [];
    if (selectedSessionId === ALL_SESSION_ID) return events;
    return events.filter((e) => e.session_id === selectedSessionId);
  }, [selectedSessionId, events]);

  // 计算显示的事件数量（分页启用时使用 total，否则使用实际长度）
  const displayEventCount = eventsPagination.enabled
    ? eventsPagination.total
    : sessionEvents.length;

  function handleContextSelectEvent(event: TracingEvent): void {
    setDetailEvent(event);
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h1 className="text-xl font-bold text-gray-900">OpenClaw Tracing</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{stats.totalSessions} 会话</span>
              <span className="text-gray-300">|</span>
              <span>{stats.totalEvents} 事件</span>
            </div>
            <ConnectionStatus status={connectionStatus} />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 flex flex-col">
          {selectedSessionId ? (
            <>
              <div className="flex-shrink-0 bg-white border-b border-gray-200">
                <div className="px-6 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 break-all flex items-center gap-2">
                        {selectedSessionId === ALL_SESSION_ID ? (
                          <>
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                            </svg>
                            全部会话
                          </>
                        ) : (
                          selectedSession?.name || selectedSessionId.slice(0, 8)
                        )}
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {displayEventCount} 个事件
                        {eventsPagination.enabled && (
                          <span className="ml-2 text-blue-600">
                            (当前显示 {sessionEvents.length} 条)
                          </span>
                        )}
                        {selectedSessionId !== ALL_SESSION_ID && selectedSession?.updated_at && (
                          <span className="ml-2">
                            · 最后更新: {formatDateTime(selectedSession.updated_at)}
                          </span>
                        )}
                        {selectedSessionId === ALL_SESSION_ID && (
                          <span className="ml-2">
                            · 汇总所有会话的事件
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedSessionId === ALL_SESSION_ID ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          汇总
                        </span>
                      ) : selectedSession?.status && (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            selectedSession.status === "active"
                              ? "bg-green-100 text-green-800"
                              : selectedSession.status === "error"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {selectedSession.status === "active"
                            ? "进行中"
                            : selectedSession.status === "error"
                              ? "错误"
                              : selectedSession.status === "completed"
                                ? "已完成"
                                : "已归档"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-gray-100">
                  <div className="flex">
                    <TabButton
                      active={activeTab === "turns"}
                      onClick={() => setActiveTab("turns")}
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1M13 6H7a2 2 0 00-2 2v6a2 2 0 002 2h2v4l4-4h2a2 2 0 002-2V8a2 2 0 00-2-2z"
                          />
                        </svg>
                      }
                    >
                      会话
                    </TabButton>
                    <TabButton
                      active={activeTab === "context"}
                      onClick={() => setActiveTab("context")}
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                          />
                        </svg>
                      }
                    >
                      LLM 上下文
                    </TabButton>
                    <TabButton
                      active={activeTab === "timeline"}
                      onClick={() => setActiveTab("timeline")}
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      }
                    >
                      时间线
                    </TabButton>
                  </div>
                  <div className="pr-4">
                    <button
                      onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
                      className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    >
                      时间{order === "desc" ? "倒排" : "正排"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {activeTab === "turns" && selectedSessionId && (
                    <TurnView sessionId={selectedSessionId} events={sessionEvents} />
                  )}
                  {activeTab === "timeline" && <MessageTimeline events={sessionEvents} />}
                  {activeTab === "context" && (
                    <ContextView events={sessionEvents} onSelectEvent={handleContextSelectEvent} />
                  )}
                </div>
                
                {/* 分页控件 - 仅在启用分页时显示 */}
                {eventsPagination.enabled && (
                  <PaginationControls
                    page={eventsPagination.page}
                    pageSize={eventsPagination.pageSize}
                    total={eventsPagination.total}
                    onPageChange={setEventsPage}
                    onPageSizeChange={setEventsPageSize}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                  />
                </svg>
                <h3 className="text-xl font-medium text-gray-600 mb-2">选择一个会话</h3>
                <p className="text-gray-400">从左侧列表中选择一个会话以查看详情</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {detailEvent && <MessageDetail event={detailEvent} onClose={() => setDetailEvent(null)} />}
    </div>
  );
}
