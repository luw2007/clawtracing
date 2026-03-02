import { useMemo } from "react";

import { useTracingStore } from "../stores/tracingStore";
import type { QuantileStats, ToolDurationRow, TurnDurationRow } from "../types";

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs < 0.0001) return `$${value.toExponential(2)}`;
  return `$${value.toFixed(4)}`;
}

function QuantileCard({ title, stats }: { title: string; stats: QuantileStats | null | undefined }): React.ReactElement {
  if (!stats) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        <div className="text-sm text-gray-400 mt-2">暂无数据</div>
      </div>
    );
  }

  const rows: Array<{ k: string; v: string }> = [
    { k: "样本数", v: `${stats.count}` },
    { k: "最小", v: formatMs(stats.min) },
    { k: "均值", v: formatMs(stats.avg) },
    { k: "P50", v: formatMs(stats.p50) },
    { k: "P90", v: formatMs(stats.p90) },
    { k: "P95", v: formatMs(stats.p95) },
    { k: "P99", v: formatMs(stats.p99) },
    { k: "最大", v: formatMs(stats.max) },
  ];

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="text-sm font-medium text-gray-700">{title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-2">
            <span className="text-gray-500">{r.k}</span>
            <span className="text-gray-800 font-medium">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlowToolsTable({
  rows,
  onSelectSession,
}: {
  rows: ToolDurationRow[];
  onSelectSession: (sessionId: string) => void;
}): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-2 font-medium">工具</th>
            <th className="py-2 pr-2 font-medium">耗时</th>
            <th className="py-2 pr-2 font-medium">成本</th>
            <th className="py-2 pr-2 font-medium">模型</th>
            <th className="py-2 pr-2 font-medium">会话</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tool_call_id} className="border-b border-gray-100 last:border-b-0">
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium truncate max-w-[110px]">{r.tool_name}</span>
                  {r.has_error ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">错误</span>
                  ) : null}
                </div>
              </td>
              <td className="py-2 pr-2 text-gray-700">{formatMs(r.duration_ms)}</td>
              <td className="py-2 pr-2 text-gray-700">{formatUsd(r.cost)}</td>
              <td className="py-2 pr-2 text-gray-700 truncate max-w-[90px]">{r.model ?? "-"}</td>
              <td className="py-2 pr-2">
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 truncate max-w-[90px]"
                  onClick={() => onSelectSession(r.session_id)}
                >
                  {r.session_id}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlowTurnsTable({
  rows,
  onSelectSession,
}: {
  rows: TurnDurationRow[];
  onSelectSession: (sessionId: string) => void;
}): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-2 font-medium">耗时</th>
            <th className="py-2 pr-2 font-medium">用户时间</th>
            <th className="py-2 pr-2 font-medium">助手时间</th>
            <th className="py-2 pr-2 font-medium">会话</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.session_id}:${r.user_event_id}:${r.assistant_event_id}`} className="border-b border-gray-100 last:border-b-0">
              <td className="py-2 pr-2 text-gray-700">{formatMs(r.duration_ms)}</td>
              <td className="py-2 pr-2 text-gray-700 whitespace-nowrap">{r.user_timestamp}</td>
              <td className="py-2 pr-2 text-gray-700 whitespace-nowrap">{r.assistant_timestamp}</td>
              <td className="py-2 pr-2">
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 truncate max-w-[110px]"
                  onClick={() => onSelectSession(r.session_id)}
                >
                  {r.session_id}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerformancePanel(): React.ReactElement {
  const { selectedSessionId, perf, perfLoading, perfError, fetchPerf, setSelectedSessionId } = useTracingStore();

  const toolQuantiles = perf?.tool_duration_quantiles;
  const turnQuantiles = perf?.turn_duration_quantiles;

  const slowTools = useMemo(() => (Array.isArray(perf?.slow_tools) ? perf!.slow_tools : []), [perf]);
  const slowTurns = useMemo(() => (Array.isArray(perf?.slow_turns) ? perf!.slow_turns : []), [perf]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Performance</h3>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={!selectedSessionId || perfLoading}
          onClick={() => {
            if (!selectedSessionId) return;
            void fetchPerf({ sessionId: selectedSessionId, limit: 20 });
          }}
        >
          {perfLoading ? "加载中..." : "刷新"}
        </button>
      </div>

      {perfError ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{perfError}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <QuantileCard title="工具耗时分位数" stats={toolQuantiles} />
        <QuantileCard title="回合耗时分位数" stats={turnQuantiles} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">慢工具榜单</div>
          <div className="text-xs text-gray-500">{slowTools.length} 条</div>
        </div>
        <div className="mt-2">
          <SlowToolsTable rows={slowTools} onSelectSession={(id) => setSelectedSessionId(id)} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">慢回合榜单</div>
          <div className="text-xs text-gray-500">{slowTurns.length} 条</div>
        </div>
        <div className="mt-2">
          <SlowTurnsTable rows={slowTurns} onSelectSession={(id) => setSelectedSessionId(id)} />
        </div>
      </div>
    </div>
  );
}
