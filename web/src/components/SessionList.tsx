import { useMemo, useState } from "react";
import { useTracingStore, ALL_SESSION_ID } from "../stores/tracingStore";
import type { SessionSummary } from "../types";
import { formatDateTime } from "../utils/date";

/**
 * 格式化相对时间
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return formatDateTime(date);
}

/**
 * 获取状态样式
 */
function getStatusStyle(status: SessionSummary["status"]): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800";
    case "completed":
      return "bg-blue-100 text-blue-800";
    case "error":
      return "bg-red-100 text-red-800";
    case "archived":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

/**
 * 获取状态标签文字
 */
function getStatusLabel(status: SessionSummary["status"]): string {
  switch (status) {
    case "active":
      return "进行中";
    case "completed":
      return "已完成";
    case "error":
      return "错误";
    case "archived":
      return "已归档";
    default:
      return status;
  }
}

/**
 * 从会话名称或 key 中提取设备标识
 */
function extractDevice(session: SessionSummary): string {
  if (session.device) {
    return session.device;
  }
  
  const name = session.name || "";
  const atMatch = name.match(/^([^@]+@[^:]+)/);
  if (atMatch) {
    return atMatch[1];
  }
  
  const colonMatch = name.match(/^([^:]+:[^:]+):/);
  if (colonMatch) {
    return colonMatch[1];
  }
  
  return "未知设备";
}

/**
 * 会话列表项组件
 */
interface SessionItemProps {
  session: SessionSummary;
  isSelected: boolean;
  onClick: () => void;
  showDevice?: boolean;
}

function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

function formatCost(cost: number): string {
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(4)}`;
}

function SessionItem({ session, isSelected, onClick, showDevice = true }: SessionItemProps): React.ReactElement {
  const device = extractDevice(session);
  
  return (
    <div
      onClick={onClick}
      className={`
        p-4 cursor-pointer border-b border-gray-100 transition-colors
        ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900 truncate flex-1" title={session.name}>
          {session.name || session.id.slice(0, 8)}
        </h3>
        <div className="flex items-center gap-2">
          {session.has_error && (
            <span className="w-2 h-2 bg-red-500 rounded-full" title="存在错误"></span>
          )}
          <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusStyle(session.status)}`}>
            {getStatusLabel(session.status)}
          </span>
        </div>
      </div>
      
      {showDevice && device !== "未知设备" && (
        <div className="flex items-center gap-1 mb-2 text-xs text-gray-500">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="truncate" title={device}>{device}</span>
        </div>
      )}
      
      {session.preview && (
        <p className="text-sm text-gray-500 truncate mb-2" title={session.preview}>
          {session.preview}
        </p>
      )}

      {session.top_tools && session.top_tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {session.top_tools.map((tool) => (
            <span
              key={tool}
              className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded"
              title={tool}
            >
              {tool}
            </span>
          ))}
        </div>
      )}
      
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1" title="事件数">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {session.event_count}
          </span>
          {session.turn_count !== undefined && session.turn_count > 0 && (
            <span className="flex items-center gap-1" title="回合数">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {session.turn_count}
            </span>
          )}
          {session.tool_call_count !== undefined && session.tool_call_count > 0 && (
            <span className="flex items-center gap-1" title="工具调用">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {session.tool_call_count}
            </span>
          )}
          {session.total_tokens !== undefined && session.total_tokens > 0 && (
            <span className="flex items-center gap-1" title="Token 总数">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {formatTokenCount(session.total_tokens)}
            </span>
          )}
          {session.total_cost !== undefined && session.total_cost > 0 && (
            <span className="flex items-center gap-1 text-green-600" title="成本">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatCost(session.total_cost)}
            </span>
          )}
        </div>
        <span>{formatRelativeTime(session.updated_at)}</span>
      </div>
    </div>
  );
}

/**
 * 设备分组头部
 */
interface DeviceGroupHeaderProps {
  device: string;
  sessionCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function DeviceGroupHeader({ device, sessionCount, isExpanded, onToggle }: DeviceGroupHeaderProps): React.ReactElement {
  return (
    <div
      onClick={onToggle}
      className="flex items-center justify-between px-4 py-3 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors sticky top-0 z-10"
    >
      <div className="flex items-center gap-2">
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-medium text-gray-700 truncate" title={device}>
          {device}
        </span>
      </div>
      <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-xs">
        {sessionCount}
      </span>
    </div>
  );
}

/**
 * 视图模式切换按钮
 */
interface ViewModeToggleProps {
  mode: "list" | "grouped";
  onChange: (mode: "list" | "grouped") => void;
}

function ViewModeToggle({ mode, onChange }: ViewModeToggleProps): React.ReactElement {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200">
      <button
        onClick={() => onChange("list")}
        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "list" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
        }`}
        title="列表视图"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        onClick={() => onChange("grouped")}
        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "grouped" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
        }`}
        title="按设备分组"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </button>
    </div>
  );
}

/**
 * "All" 会话摘要项组件
 */
interface AllSessionItemProps {
  isSelected: boolean;
  onClick: () => void;
  totalSessions: number;
  totalEvents: number;
}

function AllSessionItem({ isSelected, onClick, totalSessions, totalEvents }: AllSessionItemProps): React.ReactElement {
  return (
    <div
      onClick={onClick}
      className={`
        p-4 cursor-pointer border-b border-gray-100 transition-colors
        ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          全部会话
        </h3>
        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
          汇总
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-2">
        查看所有会话的事件汇总
      </p>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1" title="会话数">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          {totalSessions} 会话
        </span>
        <span className="flex items-center gap-1" title="事件数">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {totalEvents} 事件
        </span>
      </div>
    </div>
  );
}

/**
 * 会话列表组件
 * 显示所有追踪会话的列表，支持选择会话查看详情
 * 支持按设备分组展示
 */
export function SessionList(): React.ReactElement {
  const { sessions, selectedSessionId, setSelectedSessionId } = useTracingStore();
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());

  // 计算总事件数
  const totalEvents = useMemo(() => {
    return sessions.reduce((sum, s) => sum + s.event_count, 0);
  }, [sessions]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [sessions]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, SessionSummary[]>();
    
    for (const session of sortedSessions) {
      const device = extractDevice(session);
      const existing = groups.get(device) ?? [];
      existing.push(session);
      groups.set(device, existing);
    }
    
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const aLatest = Math.max(...a[1].map((s) => new Date(s.updated_at).getTime()));
      const bLatest = Math.max(...b[1].map((s) => new Date(s.updated_at).getTime()));
      return bLatest - aLatest;
    });
    
    return sortedGroups;
  }, [sortedSessions]);

  function toggleDeviceExpanded(device: string): void {
    setExpandedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(device)) {
        next.delete(device);
      } else {
        next.add(device);
      }
      return next;
    });
  }

  const allDevices = useMemo(() => groupedSessions.map(([device]) => device), [groupedSessions]);

  function expandAll(): void {
    setExpandedDevices(new Set(allDevices));
  }

  function collapseAll(): void {
    setExpandedDevices(new Set());
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-center">暂无会话记录</p>
        <p className="text-sm mt-1">等待新的追踪数据...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        {viewMode === "grouped" && (
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="展开全部"
            >
              展开
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={collapseAll}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="折叠全部"
            >
              折叠
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* "All" 会话选项 - 始终显示在顶部 */}
        <AllSessionItem
          isSelected={selectedSessionId === ALL_SESSION_ID}
          onClick={() => setSelectedSessionId(ALL_SESSION_ID)}
          totalSessions={sessions.length}
          totalEvents={totalEvents}
        />
        
        {viewMode === "list" ? (
          sortedSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isSelected={selectedSessionId === session.id}
              onClick={() => setSelectedSessionId(session.id)}
            />
          ))
        ) : (
          groupedSessions.map(([device, deviceSessions]) => {
            const isExpanded = expandedDevices.has(device);
            
            return (
              <div key={device}>
                <DeviceGroupHeader
                  device={device}
                  sessionCount={deviceSessions.length}
                  isExpanded={isExpanded}
                  onToggle={() => toggleDeviceExpanded(device)}
                />
                {isExpanded && (
                  <div className="border-l-2 border-gray-200 ml-4">
                    {deviceSessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isSelected={selectedSessionId === session.id}
                        onClick={() => setSelectedSessionId(session.id)}
                        showDevice={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {viewMode === "grouped" && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 text-center">
          {groupedSessions.length} 个设备，共 {sessions.length} 个会话
        </div>
      )}
    </div>
  );
}
