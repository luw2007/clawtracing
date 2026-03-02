import { useMemo } from "react";

import { useTracingStore } from "../stores/tracingStore";
import type { ErrorRateRow, TopErrorMessageRow, TopErrorToolRow } from "../types";

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function ErrorRateCard({ row }: { row: ErrorRateRow | null | undefined }): React.ReactElement {
  if (!row) {
    return <div className="text-sm text-gray-400">暂无数据</div>;
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
        <div className="text-[11px] text-gray-500">总事件</div>
        <div className="text-xl font-semibold text-gray-900 tabular-nums">{row.total}</div>
      </div>
      <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
        <div className="text-[11px] text-gray-500">错误事件</div>
        <div className="text-xl font-semibold text-red-600 tabular-nums">{row.error}</div>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
        <div className="text-[11px] text-gray-500">错误率</div>
        <div className="text-xl font-semibold text-amber-700 tabular-nums">{formatPercent(row.error_rate)}</div>
      </div>
    </div>
  );
}

function TopToolsTable({ rows }: { rows: TopErrorToolRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-2 font-medium">工具</th>
            <th className="py-2 pr-2 font-medium text-right">错误数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tool_name} className="border-b border-gray-100 last:border-b-0">
              <td className="py-2 pr-2 text-gray-800 truncate max-w-[190px]" title={r.tool_name}>
                {r.tool_name}
              </td>
              <td className="py-2 pr-2 text-gray-800 text-right tabular-nums">{r.error_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopMessagesTable({ rows }: { rows: TopErrorMessageRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-2 font-medium">类型</th>
            <th className="py-2 pr-2 font-medium">消息</th>
            <th className="py-2 pr-2 font-medium text-right">次数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.error_type ?? "unknown"}:${idx}`} className="border-b border-gray-100 last:border-b-0">
              <td className="py-2 pr-2 text-gray-700 whitespace-nowrap">{r.error_type ?? "-"}</td>
              <td className="py-2 pr-2 text-gray-800 truncate max-w-[210px]" title={r.error_message}>
                {r.error_message}
              </td>
              <td className="py-2 pr-2 text-gray-800 text-right tabular-nums">{r.error_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorsPanel(): React.ReactElement {
  const { selectedSessionId, errors, errorsLoading, errorsError, fetchErrors } = useTracingStore();

  const topTools = useMemo(() => (Array.isArray(errors?.top_error_tools) ? errors!.top_error_tools : []), [errors]);
  const topMessages = useMemo(
    () => (Array.isArray(errors?.top_error_messages) ? errors!.top_error_messages : []),
    [errors]
  );

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Errors</h3>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={!selectedSessionId || errorsLoading}
          onClick={() => {
            if (!selectedSessionId) return;
            void fetchErrors({ sessionId: selectedSessionId, topN: 10 });
          }}
        >
          {errorsLoading ? "加载中..." : "刷新"}
        </button>
      </div>

      {!selectedSessionId ? (
        <div className="text-center text-gray-400 py-6">
          <p>选择会话查看错误聚合</p>
        </div>
      ) : null}

      {errorsError ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mb-3">{errorsError}</div>
      ) : null}

      {selectedSessionId ? (
        <div className="space-y-4">
          <ErrorRateCard row={errors?.error_rate} />

          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">Top 错误工具</div>
              <div className="text-xs text-gray-500">{topTools.length} 条</div>
            </div>
            <div className="mt-2">
              <TopToolsTable rows={topTools} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">Top 错误消息</div>
              <div className="text-xs text-gray-500">{topMessages.length} 条</div>
            </div>
            <div className="mt-2">
              <TopMessagesTable rows={topMessages} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

