import { useMemo } from "react";

import { useTracingStore } from "../stores/tracingStore";
import type { TracingEvent } from "../types";

/**
 * 工具使用统计数据
 */
interface ToolUsageStat {
  name: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  successRate: number;
}

/**
 * 从事件列表中提取工具使用统计
 */
function extractToolStats(events: TracingEvent[]): ToolUsageStat[] {
  const toolMap = new Map<string, { total: number; success: number; errors: number }>();
  const toolResultMap = new Map<string, boolean>();

  for (const event of events) {
    for (const block of event.content) {
      if (block.type === "tool_result" && block.id) {
        toolResultMap.set(block.id, block.is_error ?? false);
      }
    }
  }

  for (const event of events) {
    for (const block of event.content) {
      if (block.type === "tool_use" && block.name) {
        const existing = toolMap.get(block.name) ?? { total: 0, success: 0, errors: 0 };
        existing.total += 1;

        const hasError = block.id ? toolResultMap.get(block.id) : false;
        if (hasError) {
          existing.errors += 1;
        } else {
          existing.success += 1;
        }

        toolMap.set(block.name, existing);
      }
    }
  }

  return Array.from(toolMap.entries())
    .map(([name, stats]) => ({
      name,
      totalCalls: stats.total,
      successCalls: stats.success,
      errorCalls: stats.errors,
      successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls);
}

/**
 * 进度条组件
 */
interface ProgressBarProps {
  percentage: number;
  colorClass: string;
}

function ProgressBar({ percentage, colorClass }: ProgressBarProps): React.ReactElement {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-300 ${colorClass}`}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
    </div>
  );
}

/**
 * 工具使用项组件
 */
interface ToolUsageItemProps {
  stat: ToolUsageStat;
  maxCalls: number;
}

function ToolUsageItem({ stat, maxCalls }: ToolUsageItemProps): React.ReactElement {
  const relativeUsage = maxCalls > 0 ? (stat.totalCalls / maxCalls) * 100 : 0;
  
  const successRateColor = stat.successRate >= 90
    ? "text-green-600"
    : stat.successRate >= 70
    ? "text-yellow-600"
    : "text-red-600";

  const barColor = stat.successRate >= 90
    ? "bg-green-500"
    : stat.successRate >= 70
    ? "bg-yellow-500"
    : "bg-red-500";

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="font-medium text-gray-800">{stat.name}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{stat.totalCalls} 次调用</span>
          <span className={`font-medium ${successRateColor}`}>
            {stat.successRate.toFixed(0)}%
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ProgressBar percentage={relativeUsage} colorClass={barColor} />
        </div>
        <div className="text-xs text-gray-400 w-24 text-right">
          {stat.successCalls} 成功 / {stat.errorCalls} 失败
        </div>
      </div>
    </div>
  );
}

/**
 * 工具分析组件
 * 显示工具使用频率和成功率统计
 */
export function ToolAnalysis(): React.ReactElement {
  const { events, selectedSessionId } = useTracingStore();

  const toolStats = useMemo(() => extractToolStats(events), [events]);
  const maxCalls = useMemo(
    () => (toolStats.length > 0 ? Math.max(...toolStats.map((s) => s.totalCalls)) : 0),
    [toolStats]
  );

  const summaryStats = useMemo(() => {
    const total = toolStats.reduce((sum, s) => sum + s.totalCalls, 0);
    const success = toolStats.reduce((sum, s) => sum + s.successCalls, 0);
    const errors = toolStats.reduce((sum, s) => sum + s.errorCalls, 0);
    return {
      total,
      success,
      errors,
      rate: total > 0 ? (success / total) * 100 : 0,
    };
  }, [toolStats]);

  if (!selectedSessionId) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">工具分析</h3>
        <div className="text-center text-gray-400 py-8">
          <p>选择会话查看工具使用分析</p>
        </div>
      </div>
    );
  }

  if (toolStats.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">工具分析</h3>
        <div className="text-center text-gray-400 py-8">
          <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>暂无工具调用记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">工具分析</h3>
      
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{summaryStats.total}</p>
          <p className="text-xs text-gray-500">总调用</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{summaryStats.success}</p>
          <p className="text-xs text-gray-500">成功</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{summaryStats.errors}</p>
          <p className="text-xs text-gray-500">失败</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">整体成功率</span>
          <span className="font-semibold text-gray-900">{summaryStats.rate.toFixed(1)}%</span>
        </div>
        <ProgressBar
          percentage={summaryStats.rate}
          colorClass={
            summaryStats.rate >= 90
              ? "bg-green-500"
              : summaryStats.rate >= 70
              ? "bg-yellow-500"
              : "bg-red-500"
          }
        />
      </div>

      <h4 className="text-sm font-medium text-gray-600 mb-2">工具使用详情</h4>
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4">
          {toolStats.map((stat) => (
            <ToolUsageItem key={stat.name} stat={stat} maxCalls={maxCalls} />
          ))}
        </div>
      </div>
    </div>
  );
}
