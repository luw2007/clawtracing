import { useEffect, useState } from "react";
import { formatDateTime } from "../utils/date";

interface HookInstance {
  instanceId: string;
  timestamp: string;
  pid: number;
  lastSeen: number;
  online: boolean;
}

interface HeartbeatResponse {
  total: number;
  online: number;
  instances: HookInstance[];
}

const API_BASE = "http://localhost:3456/api";
const POLL_INTERVAL_MS = 10000;

export function HookStatusIndicator(): React.ReactElement {
  const [data, setData] = useState<HeartbeatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchHeartbeat(): Promise<void> {
      try {
        const res = await fetch(`${API_BASE}/heartbeat`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HeartbeatResponse;
        if (mounted) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void fetchHeartbeat();
    const timer = setInterval(() => void fetchHeartbeat(), POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const onlineCount = data?.online ?? 0;
  const totalCount = data?.total ?? 0;

  const statusColor = error
    ? "bg-gray-400"
    : onlineCount > 0
      ? "bg-green-400"
      : "bg-red-400";

  const statusText = error
    ? "获取失败"
    : onlineCount > 0
      ? `${onlineCount} 在线`
      : "无连接";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 hover:bg-gray-50 px-2 py-1 rounded transition-colors"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-sm text-gray-600">{statusText}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Hook 连接状态</span>
              <span className="text-xs text-gray-500">
                {totalCount} 个实例
              </span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {error && (
              <div className="px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            {!error && totalCount === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                暂无 Hook 连接
              </div>
            )}

            {!error && data?.instances.map((instance) => (
              <div
                key={instance.instanceId}
                className="px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        instance.online ? "bg-green-400" : "bg-red-400"
                      }`}
                    />
                    <span className="text-sm font-mono text-gray-700 truncate max-w-[140px]">
                      {instance.instanceId}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      instance.online
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {instance.online ? "在线" : "离线"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>PID: {instance.pid}</span>
                  <span>
                    {formatDateTime(instance.lastSeen)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>每 10 秒刷新</span>
              <span>超时: 90 秒</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
