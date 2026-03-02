import { useEffect, useState, useCallback } from "react";
import type { HeartbeatResponse, HookInstance } from "../types";

const API_BASE = "http://localhost:3456/api";
const POLL_INTERVAL_MS = 5000;

/**
 * 格式化相对时间
 */
function formatLastSeen(lastSeen: number): string {
  const now = Date.now();
  const diffMs = now - lastSeen;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "刚刚";
  if (diffSec < 60) return `${diffSec}秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  return `${Math.floor(diffSec / 3600)}小时前`;
}

/**
 * 获取实例显示名称
 * 优先使用 instanceName，否则从 instanceId 中提取
 */
function getDisplayName(instance: HookInstance): string {
  if (instance.instanceName) {
    return instance.instanceName;
  }
  const atIndex = instance.instanceId.indexOf("@");
  if (atIndex !== -1) {
    return instance.instanceId.slice(0, atIndex);
  }
  const colonIndex = instance.instanceId.indexOf(":");
  if (colonIndex !== -1) {
    return instance.instanceId.slice(0, colonIndex);
  }
  return instance.instanceId.slice(0, 16);
}

/**
 * Hook 选择器属性
 */
export interface HookSelectorProps {
  selectedInstanceId: string | null;
  onSelect: (instanceId: string | null) => void;
}

/**
 * Hook 实例选择器组件
 */
export function HookSelector({ selectedInstanceId, onSelect }: HookSelectorProps): React.ReactElement {
  const [instances, setInstances] = useState<HookInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/heartbeat`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as HeartbeatResponse;
      setInstances(data.instances);
      setError(null);

      if (data.instances.length === 1 && !selectedInstanceId) {
        onSelect(data.instances[0]!.instanceId);
      }

      if (selectedInstanceId && !data.instances.some((i) => i.instanceId === selectedInstanceId)) {
        onSelect(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取失败");
    } finally {
      setLoading(false);
    }
  }, [selectedInstanceId, onSelect]);

  useEffect(() => {
    void fetchHeartbeat();
    const interval = setInterval(() => void fetchHeartbeat(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHeartbeat]);

  const selectedInstance = instances.find((i) => i.instanceId === selectedInstanceId);

  function handleSelect(instanceId: string | null): void {
    onSelect(instanceId);
    setIsOpen(false);
  }

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span>检测 Hook 实例...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 border-b border-gray-200 bg-red-50">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>连接错误: {error}</span>
          <button
            onClick={() => void fetchHeartbeat()}
            className="ml-auto text-xs text-red-700 hover:text-red-900 underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-gray-200 bg-yellow-50">
        <div className="flex items-center gap-2 text-sm text-yellow-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>未检测到 OpenClaw Hook 实例</span>
          <button
            onClick={() => void fetchHeartbeat()}
            className="ml-auto text-xs text-yellow-800 hover:text-yellow-900 underline"
          >
            刷新
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-4 py-3 border-b border-gray-200">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Hook 实例:</span>
        <div className="relative flex-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`
              w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm
              ${selectedInstance ? "bg-green-50 border-green-200 text-green-800" : "bg-gray-50 border-gray-200 text-gray-600"}
              hover:bg-gray-100 transition-colors
            `}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                {selectedInstance?.online && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${selectedInstance?.online ? "bg-green-500" : "bg-gray-400"}`}
                />
              </span>
              {selectedInstance ? (
                <span className="truncate">
                  {getDisplayName(selectedInstance)}
                  <span className="text-xs text-gray-400 ml-1">
                    (PID: {selectedInstance.pid})
                  </span>
                </span>
              ) : (
                <span className="text-gray-400">选择 Hook 实例...</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <button
                  onClick={() => handleSelect(null)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                    hover:bg-gray-50 transition-colors
                    ${!selectedInstanceId ? "bg-blue-50 text-blue-700" : "text-gray-600"}
                  `}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span>全部实例</span>
                </button>
                {instances.map((instance) => (
                  <button
                    key={instance.instanceId}
                    onClick={() => handleSelect(instance.instanceId)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                      hover:bg-gray-50 transition-colors
                      ${selectedInstanceId === instance.instanceId ? "bg-blue-50 text-blue-700" : "text-gray-700"}
                    `}
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      {instance.online && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${instance.online ? "bg-green-500" : "bg-gray-400"}`}
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{getDisplayName(instance)}</div>
                      <div className="text-xs text-gray-400">
                        {instance.hostname && <span>{instance.hostname} · </span>}
                        PID: {instance.pid} · {formatLastSeen(instance.lastSeen)}
                      </div>
                    </div>
                    {selectedInstanceId === instance.instanceId && (
                      <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
                {instances.length} 个实例在线
              </div>
            </div>
          )}
        </div>
        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
          {instances.length} 在线
        </span>
      </div>
    </div>
  );
}
