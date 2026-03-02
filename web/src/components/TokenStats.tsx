import { useMemo } from "react";

import { useTracingStore } from "../stores/tracingStore";

/**
 * 统计卡片组件属性
 */
interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  colorClass: string;
  subValue?: string;
}

/**
 * 统计卡片组件
 */
function StatCard({ title, value, icon, colorClass, subValue }: StatCardProps): React.ReactElement {
  return (
    <div className={`${colorClass} rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
        </div>
        <div className="p-3 bg-white/50 rounded-lg">{icon}</div>
      </div>
    </div>
  );
}

/**
 * Token 统计组件
 * 显示当前会话或全局的 Token 使用统计
 */
export function TokenStats(): React.ReactElement {
  const { events, selectedSessionId, stats } = useTracingStore();

  const tokenStats = useMemo(() => {
    if (!selectedSessionId) {
      return {
        inputTokens: stats.totalInputTokens,
        outputTokens: stats.totalOutputTokens,
        cacheTokens: 0,
        totalTokens: stats.totalInputTokens + stats.totalOutputTokens,
      };
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheTokens = 0;

    for (const event of events) {
      if (event.metadata?.usage) {
        inputTokens += event.metadata.usage.input_tokens || 0;
        outputTokens += event.metadata.usage.output_tokens || 0;
      }
      if (event.metadata && "cache_read_input_tokens" in event.metadata) {
        cacheTokens += (event.metadata.cache_read_input_tokens as number) || 0;
      }
    }

    return {
      inputTokens,
      outputTokens,
      cacheTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }, [events, selectedSessionId, stats]);

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Token 统计
        {selectedSessionId && <span className="text-sm font-normal text-gray-500 ml-2">(当前会话)</span>}
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          title="输入 Tokens"
          value={tokenStats.inputTokens}
          colorClass="bg-blue-50"
          icon={
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          }
        />
        
        <StatCard
          title="输出 Tokens"
          value={tokenStats.outputTokens}
          colorClass="bg-green-50"
          icon={
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        
        <StatCard
          title="缓存 Tokens"
          value={tokenStats.cacheTokens}
          colorClass="bg-purple-50"
          icon={
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          }
          subValue="命中缓存"
        />
        
        <StatCard
          title="总计 Tokens"
          value={tokenStats.totalTokens}
          colorClass="bg-amber-50"
          icon={
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
