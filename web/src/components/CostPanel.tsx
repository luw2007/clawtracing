import { useEffect, useMemo, useState } from "react";

import { useTracingStore } from "../stores/tracingStore";
import type { CostSessionRow, DailyCostRow, ToolCostRow, TurnCostRow } from "../types";

type CostViewTab = "overview" | "by-turn" | "by-tool";

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs < 0.0001) return `$${value.toExponential(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("zh-CN");
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function DailyTrend({ rows }: { rows: DailyCostRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  const ordered = [...rows].reverse();
  const maxCost = Math.max(...ordered.map((r) => (Number.isFinite(r.cost) ? r.cost : 0)), 0);

  return (
    <div className="space-y-2">
      {ordered.map((r) => {
        const widthPct = maxCost > 0 ? Math.max(0, Math.min(100, (r.cost / maxCost) * 100)) : 0;
        return (
          <div key={r.day} className="flex items-center gap-2">
            <div className="w-[88px] text-xs text-gray-600 whitespace-nowrap">{r.day}</div>
            <div className="flex-1">
              <div className="h-2 bg-gray-100 rounded">
                <div className="h-2 bg-emerald-400 rounded" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
            <div className="w-[84px] text-xs text-gray-700 text-right tabular-nums">{formatUsd(r.cost)}</div>
            <div className="w-[86px] text-xs text-gray-500 text-right tabular-nums">{formatTokens(r.token)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TopSessionsTable({
  rows,
  onSelectSession,
}: {
  rows: CostSessionRow[];
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
            <th className="py-2 pr-2 font-medium">成本</th>
            <th className="py-2 pr-2 font-medium">Tokens</th>
            <th className="py-2 pr-2 font-medium">耗时</th>
            <th className="py-2 pr-2 font-medium">模型</th>
            <th className="py-2 pr-2 font-medium">会话</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium tabular-nums">{formatUsd(r.cost)}</span>
                  {r.has_error ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">错误</span>
                  ) : null}
                </div>
              </td>
              <td className="py-2 pr-2 text-gray-700 tabular-nums">{formatTokens(r.token)}</td>
              <td className="py-2 pr-2 text-gray-700 tabular-nums">{formatMs(r.duration_ms)}</td>
              <td className="py-2 pr-2 text-gray-700 truncate max-w-[100px]">{r.model ?? "-"}</td>
              <td className="py-2 pr-2">
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 truncate max-w-[120px]"
                  onClick={() => onSelectSession(r.id)}
                >
                  {r.key ?? r.id}
                </button>
                <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{r.started_at}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ByTurnTable({ rows }: { rows: TurnCostRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  const maxCost = Math.max(...rows.map((r) => r.cost), 0);

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const widthPct = maxCost > 0 ? Math.max(0, Math.min(100, (r.cost / maxCost) * 100)) : 0;
        return (
          <div key={r.turn_id} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">回合 #{r.turn_number}</span>
                {r.has_error ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">错误</span>
                ) : null}
              </div>
              <span className="text-sm font-semibold text-emerald-600 tabular-nums">{formatUsd(r.cost)}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded mb-2">
              <div className="h-1.5 bg-emerald-400 rounded" style={{ width: `${widthPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>
                <span className="text-gray-400">Tokens:</span> {formatTokens(r.token)}
              </span>
              <span>
                <span className="text-gray-400">耗时:</span> {formatMs(r.duration_ms)}
              </span>
              <span>
                <span className="text-gray-400">工具调用:</span> {r.tool_call_count}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-gray-400">{r.started_at}</div>
          </div>
        );
      })}
    </div>
  );
}

function ByToolTable({ rows }: { rows: ToolCostRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-2 font-medium">工具名称</th>
            <th className="py-2 pr-2 font-medium text-right">调用次数</th>
            <th className="py-2 pr-2 font-medium text-right">总成本</th>
            <th className="py-2 pr-2 font-medium text-right">平均耗时</th>
            <th className="py-2 pr-2 font-medium text-right">错误次数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tool_name} className="border-b border-gray-100 last:border-b-0">
              <td className="py-2 pr-2">
                <span className="font-mono text-gray-800">{r.tool_name}</span>
              </td>
              <td className="py-2 pr-2 text-gray-700 tabular-nums text-right">{r.call_count}</td>
              <td className="py-2 pr-2 text-right">
                <span className="text-gray-900 font-medium tabular-nums">{formatUsd(r.total_cost)}</span>
              </td>
              <td className="py-2 pr-2 text-gray-700 tabular-nums text-right">{formatMs(r.avg_duration_ms)}</td>
              <td className="py-2 pr-2 text-right">
                {r.error_count > 0 ? (
                  <span className="text-red-600 tabular-nums">{r.error_count}</span>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        active
          ? "bg-gray-800 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CostPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<CostViewTab>("overview");

  const {
    cost,
    costLoading,
    costError,
    fetchCost,
    setSelectedSessionId,
    selectedSessionId,
    toolCost,
    toolCostLoading,
    toolCostError,
    fetchToolCost,
    turnCost,
    turnCostLoading,
    turnCostError,
    fetchTurnCost,
  } = useTracingStore();

  const daily = useMemo(() => (Array.isArray(cost?.daily) ? cost!.daily : []), [cost]);
  const topSessions = useMemo(() => (Array.isArray(cost?.top_sessions) ? cost!.top_sessions : []), [cost]);
  const toolRows = useMemo(() => (Array.isArray(toolCost?.tools) ? toolCost!.tools : []), [toolCost]);
  const turnRows = useMemo(() => (Array.isArray(turnCost?.turns) ? turnCost!.turns : []), [turnCost]);

  const totalCost = useMemo(() => daily.reduce((sum, r) => sum + (Number.isFinite(r.cost) ? r.cost : 0), 0), [daily]);
  const totalTokens = useMemo(
    () => daily.reduce((sum, r) => sum + (Number.isFinite(r.token) ? r.token : 0), 0),
    [daily]
  );

  useEffect(() => {
    if (activeTab === "by-tool") {
      void fetchToolCost({ sessionId: selectedSessionId, limit: 50 });
    } else if (activeTab === "by-turn" && selectedSessionId) {
      void fetchTurnCost(selectedSessionId);
    }
  }, [activeTab, selectedSessionId, fetchToolCost, fetchTurnCost]);

  const isLoading = costLoading || toolCostLoading || turnCostLoading;
  const currentError = activeTab === "overview" ? costError : activeTab === "by-tool" ? toolCostError : turnCostError;

  const handleRefresh = () => {
    if (activeTab === "overview") {
      void fetchCost({ limit: 20, dailyLimit: 14 });
    } else if (activeTab === "by-tool") {
      void fetchToolCost({ sessionId: selectedSessionId, limit: 50 });
    } else if (activeTab === "by-turn" && selectedSessionId) {
      void fetchTurnCost(selectedSessionId);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Cost</h3>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={isLoading}
          onClick={handleRefresh}
        >
          {isLoading ? "加载中..." : "刷新"}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          总览
        </TabButton>
        <TabButton active={activeTab === "by-turn"} onClick={() => setActiveTab("by-turn")}>
          按回合
        </TabButton>
        <TabButton active={activeTab === "by-tool"} onClick={() => setActiveTab("by-tool")}>
          按工具
        </TabButton>
      </div>

      {currentError ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mb-4">{currentError}</div>
      ) : null}

      {activeTab === "overview" && (
        <>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">按日趋势</div>
              <div className="text-xs text-gray-500">
                {formatUsd(totalCost)} · {formatTokens(totalTokens)} tokens
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
                <div className="w-[88px]">日期</div>
                <div className="flex-1">趋势</div>
                <div className="w-[84px] text-right">成本</div>
                <div className="w-[86px] text-right">Tokens</div>
              </div>
              <DailyTrend rows={daily} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">Top 会话</div>
              <div className="text-xs text-gray-500">{topSessions.length} 条</div>
            </div>
            <div className="mt-2">
              <TopSessionsTable rows={topSessions} onSelectSession={(id) => setSelectedSessionId(id)} />
            </div>
          </div>
        </>
      )}

      {activeTab === "by-turn" && (
        <div>
          {!selectedSessionId ? (
            <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              请先选择一个会话以查看按回合的成本分布
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-gray-700">回合成本分布</div>
                <div className="text-xs text-gray-500">{turnRows.length} 个回合</div>
              </div>
              <ByTurnTable rows={turnRows} />
            </>
          )}
        </div>
      )}

      {activeTab === "by-tool" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-700">工具成本统计</div>
            <div className="text-xs text-gray-500">
              {selectedSessionId ? "当前会话" : "全部会话"} · {toolRows.length} 个工具
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <ByToolTable rows={toolRows} />
          </div>
        </div>
      )}
    </div>
  );
}
