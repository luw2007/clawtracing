import React, { useMemo, useState } from "react";
import type { TracingEvent } from "../types";
import type { Span } from "../types/trace";
import { transformEventsToSpans } from "../utils/trace";

interface TraceViewProps {
  events: TracingEvent[];
}

interface SpanRowProps {
  span: Span;
  depth: number;
  traceStartTime: number;
  totalDuration: number;
  expandedSpans: Set<string>;
  onToggle: (spanId: string) => void;
}

const SpanRow: React.FC<SpanRowProps> = ({ 
  span, 
  depth, 
  traceStartTime, 
  totalDuration, 
  expandedSpans, 
  onToggle 
}) => {
  const startOffset = span.startTime - traceStartTime;
  const duration = span.duration || 0;
  
  // Guard against negative duration or offset
  const safeStartOffset = Math.max(0, startOffset);
  const safeDuration = Math.max(0, duration);
  
  const leftPercent = (safeStartOffset / totalDuration) * 100;
  const widthPercent = Math.max((safeDuration / totalDuration) * 100, 0.5); // Min width 0.5%

  const isExpanded = expandedSpans.has(span.id);
  const hasChildren = span.children && span.children.length > 0;
  const hasEvents = span.events && span.events.length > 0;
  const sortedEvents = hasEvents ? [...span.events].sort((a, b) => a.time - b.time) : [];

  const formatAttributes = (attributes?: Record<string, unknown>) => {
    if (!attributes) return "";
    const text = JSON.stringify(attributes);
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "error": return "bg-red-100 border-red-300 hover:bg-red-200";
      case "ok": return "bg-green-100 border-green-300 hover:bg-green-200";
      default: return "bg-blue-100 border-blue-300 hover:bg-blue-200";
    }
  };

  return (
    <div className="flex flex-col text-sm border-b border-gray-100 last:border-0">
      <div className="flex items-center hover:bg-gray-50 py-1.5 px-2 group">
        {/* Tree Column */}
        <div 
          className="w-64 flex-shrink-0 flex items-center pr-2 overflow-hidden" 
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {hasChildren ? (
            <button 
              onClick={() => onToggle(span.id)} 
              className="mr-1.5 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              <span className="text-[10px] transform transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </button>
          ) : (
            <span className="w-4 mr-1.5 inline-block"></span>
          )}
          <span className="truncate font-medium text-gray-700" title={span.name}>{span.name}</span>
        </div>

        {/* Timeline Column */}
        <div className="flex-1 relative h-6 mx-4">
          {/* Background grid lines could go here */}
          <div className="absolute inset-0 flex">
             {[0, 0.25, 0.5, 0.75, 1].map(p => (
               <div key={p} className="h-full border-l border-gray-100 first:border-0" style={{ left: `${p * 100}%`, position: 'absolute' }}></div>
             ))}
          </div>

          <div 
            className={`absolute h-4 top-1 rounded border shadow-sm transition-all cursor-pointer ${getStatusColor(span.status)}`}
            style={{ 
              left: `${leftPercent}%`, 
              width: `${widthPercent}%`,
              minWidth: '2px'
            }}
            title={`${span.name}: ${safeDuration.toFixed(2)}ms (${span.status})`}
          ></div>
        </div>
        
        {/* Duration Column */}
        <div className="w-20 text-right font-mono text-xs text-gray-500">
          {safeDuration.toFixed(0)}ms
        </div>
      </div>
      
      {isExpanded && (hasChildren || hasEvents) && (
        <div className="flex flex-col border-l border-gray-100 ml-4 pl-0">
          {hasEvents && (
            <div className="px-2 py-1">
              <div className="text-[11px] text-gray-500 mb-1">Events ({sortedEvents.length})</div>
              <div className="space-y-1">
                {sortedEvents.map((event) => {
                  const attrs = formatAttributes(event.attributes);
                  const offset = Math.max(0, event.time - traceStartTime);
                  return (
                    <div key={`${span.id}-${event.name}-${event.time}`} className="flex items-start gap-2 px-2 py-1 bg-gray-50 rounded text-xs text-gray-600">
                      <span className="w-14 text-right shrink-0 text-gray-400 font-mono">{offset.toFixed(0)}ms</span>
                      <span className="shrink-0 font-medium text-gray-700">{event.name}</span>
                      {attrs && <span className="text-gray-500 break-all">{attrs}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {hasChildren && (
            <div className="flex flex-col">
              {span.children!.map(child => (
                <SpanRow 
                  key={child.id} 
                  span={child} 
                  depth={depth + 1} 
                  traceStartTime={traceStartTime} 
                  totalDuration={totalDuration}
                  expandedSpans={expandedSpans}
                  onToggle={onToggle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TraceView: React.FC<TraceViewProps> = ({ events }) => {
  const spans = useMemo(() => transformEventsToSpans(events), [events]);
  
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(() => {
    // Initially expand all spans for better visibility
    const allIds = new Set<string>();
    const collectIds = (s: Span[]) => {
      s.forEach(span => {
        allIds.add(span.id);
        if (span.children) collectIds(span.children);
      });
    };
    collectIds(spans);
    return allIds;
  });

  const toggleSpan = (spanId: string) => {
    setExpandedSpans(prev => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="text-sm">No trace data available</span>
      </div>
    );
  }

  // Calculate total duration based on spans
  const startTime = spans.length > 0 ? Math.min(...spans.map(s => s.startTime)) : 0;
  // End time is max(startTime + duration) of all spans
  let maxEndTime = startTime;
  const traverse = (s: Span[]) => {
    s.forEach(span => {
      const end = span.startTime + (span.duration || 0);
      if (end > maxEndTime) maxEndTime = end;
      if (span.children) traverse(span.children);
    });
  };
  traverse(spans);
  
  const totalDuration = Math.max(maxEndTime - startTime, 100); // Min 100ms

  return (
    <div className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex-shrink-0">
        <div className="w-64">Operation</div>
        <div className="flex-1 text-center relative">
          Timeline ({totalDuration.toFixed(0)}ms)
        </div>
        <div className="w-20 text-right">Duration</div>
      </div>
      
      {/* Body */}
      <div className="overflow-auto flex-1 bg-white">
        {spans.map(span => (
          <SpanRow 
            key={span.id} 
            span={span} 
            depth={0} 
            traceStartTime={startTime} 
            totalDuration={totalDuration}
            expandedSpans={expandedSpans}
            onToggle={toggleSpan}
          />
        ))}
        {spans.length === 0 && (
           <div className="p-4 text-center text-gray-400 text-sm">
             No spans identified. Check if events have correlation IDs.
           </div>
        )}
      </div>
    </div>
  );
};
