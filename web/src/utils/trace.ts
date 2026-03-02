import type { TracingEvent } from "../types";
import type { Span } from "../types/trace";

export function transformEventsToSpans(events: TracingEvent[]): Span[] {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const spans: Span[] = [];
  const activeSpans = new Map<string, Span>();
  const turnSpans = new Map<string, Span>();
  let lastTurnSpan: Span | undefined;
  
  const getTime = (e: TracingEvent) => new Date(e.timestamp).getTime();

  const createSpan = (id: string, name: string, event: TracingEvent, parentId?: string): Span => {
    return {
      id,
      traceId: event.session_id,
      parentId,
      name,
      kind: "internal",
      startTime: getTime(event),
      status: "unset",
      attributes: {
        ...event.metadata,
        ...event.data,
      },
      events: [],
      children: [],
      startEventId: event.id,
    };
  };

  const instantSpanLabels: Record<string, string> = {
    before_message_write: "消息写入",
    message_received: "消息接收",
    message_sending: "消息发送中",
    message_sent: "消息已发送",
    before_prompt_build: "Prompt构建",
    before_model_resolve: "模型解析",
    before_compaction: "压缩前",
    after_compaction: "压缩后",
    before_reset: "重置前",
    tool_result_persist: "工具结果持久化",
  };
  
  const agentSpans = new Map<string, Span>();
  
  let lastUserMessageTurnId: string | undefined;
  let lastEventWasUserMessage = false;

  const getPreviewText = (event: TracingEvent): string | undefined => {
    for (const block of event.content) {
      if (block.type === "text" && block.text) {
        const text = block.text.trim();
        return text.length > 50 ? `${text.slice(0, 50)}...` : text;
      }
      if (block.type === "tool_use" && block.name) {
        return `调用 ${block.name}`;
      }
      if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        const preview = content.slice(0, 50);
        return block.is_error ? `错误: ${preview}` : `结果: ${preview}`;
      }
    }
    return undefined;
  };

  sortedEvents.forEach((event) => {
    const time = getTime(event);
    const turnId = event.correlation?.turnId || event.turnId;
    const runId = event.correlation?.runId;
    const toolCallId = event.correlation?.toolCallId || event.toolCallId;

    if (turnId && !turnSpans.has(turnId)) {
      const span = createSpan(turnId, `Turn ${turnId.slice(-4)}`, event);
      span.kind = "server";
      turnSpans.set(turnId, span);
      spans.push(span);
      lastTurnSpan = span;
    }
    
    const currentTurnSpan = turnId ? turnSpans.get(turnId) : lastTurnSpan;

    switch (event.type) {
      case "llm_input": {
        lastEventWasUserMessage = false;
        const effectiveTurnSpan = lastUserMessageTurnId 
          ? turnSpans.get(lastUserMessageTurnId) 
          : currentTurnSpan;
        if (runId) {
          const spanId = `llm-${runId}-${event.id}`;
          const span = createSpan(spanId, `LLM Generation (${event.data?.model || "unknown"})`, event, effectiveTurnSpan?.id);
          span.kind = "client";
          activeSpans.set(runId, span);
          if (effectiveTurnSpan) {
            effectiveTurnSpan.children?.push(span);
          } else {
            spans.push(span);
          }
        }
        break;
      }
      case "llm_output": {
        if (runId) {
          const span = activeSpans.get(runId);
          if (span) {
            span.endTime = time;
            span.duration = time - span.startTime;
            span.status = "ok";
            span.endEventId = event.id;
            // Merge attributes
            span.attributes = { ...span.attributes, ...event.data, ...event.metadata };
            activeSpans.delete(runId);
          }
        }
        break;
      }
      case "tool_call": 
      case "before_tool_call": {
        lastEventWasUserMessage = false;
        const effectiveTurnSpan = lastUserMessageTurnId 
          ? turnSpans.get(lastUserMessageTurnId) 
          : currentTurnSpan;
        if (toolCallId) {
          if (!activeSpans.has(toolCallId)) {
             const spanId = `tool-${toolCallId}`;
             const toolName = event.data?.tool_name || event.content.find(c => c.type === 'text')?.text || "Tool";
             const span = createSpan(spanId, `Tool: ${toolName}`, event, effectiveTurnSpan?.id);
             span.kind = "client";
             activeSpans.set(toolCallId, span);
             if (effectiveTurnSpan) {
               effectiveTurnSpan.children?.push(span);
             } else {
               spans.push(span);
             }
          }
        }
        break;
      }
      case "tool_result": {
        lastEventWasUserMessage = false;
        const effectiveTurnSpan = lastUserMessageTurnId 
          ? turnSpans.get(lastUserMessageTurnId) 
          : currentTurnSpan;
        if (toolCallId) {
          const toolSpan = activeSpans.get(toolCallId);
          if (toolSpan) {
            toolSpan.endTime = time;
            toolSpan.duration = time - toolSpan.startTime;
            toolSpan.status = event.error ? "error" : "ok";
            toolSpan.endEventId = event.id;
            toolSpan.attributes = { ...toolSpan.attributes, ...event.data, ...event.metadata };
            activeSpans.delete(toolCallId);
          }
        }
        const spanId = `tool-result-${event.id}`;
        const resultContent = event.content.find(c => c.type === "tool_result");
        const preview = resultContent 
          ? (typeof resultContent.content === "string" 
              ? resultContent.content.slice(0, 50) 
              : JSON.stringify(resultContent.content).slice(0, 50))
          : getPreviewText(event) || "结果";
        const span = createSpan(spanId, `工具结果: ${preview}${preview && preview.length >= 50 ? "..." : ""}`, event, effectiveTurnSpan?.id);
        span.kind = "internal";
        span.status = event.error ? "error" : "ok";
        span.endTime = time;
        span.duration = 0;
        span.attributes = { ...span.attributes, ...event.metadata, ...event.data, content: event.content };
        if (effectiveTurnSpan) {
          effectiveTurnSpan.children?.push(span);
        } else {
          spans.push(span);
        }
        break;
      }
      case "after_tool_call": {
        if (toolCallId) {
          const span = activeSpans.get(toolCallId);
          if (span) {
            span.endTime = time;
            span.duration = time - span.startTime;
            span.status = event.error ? "error" : "ok";
            span.endEventId = event.id;
            span.attributes = { ...span.attributes, ...event.data, ...event.metadata };
            activeSpans.delete(toolCallId);
          }
        }
        break;
      }
      case "user_message": {
        if (lastEventWasUserMessage && lastUserMessageTurnId) {
        } else {
          lastUserMessageTurnId = turnId || currentTurnSpan?.id;
        }
        lastEventWasUserMessage = true;
        
        const spanId = `msg-${event.id}`;
        const text = event.content.find(c => c.type === "text")?.text || "User Message";
        const preview = text.length > 50 ? text.slice(0, 50) + "..." : text;
        const effectiveTurnSpan = lastUserMessageTurnId ? turnSpans.get(lastUserMessageTurnId) : currentTurnSpan;
        const span = createSpan(spanId, `User: ${preview}`, event, effectiveTurnSpan?.id);
        span.kind = "producer";
        span.status = "ok";
        span.endTime = time;
        span.duration = 0; 
        
        if (effectiveTurnSpan) {
          effectiveTurnSpan.children?.push(span);
        } else {
          spans.push(span);
        }
        break;
      }
      case "assistant_message": {
        const spanId = `msg-${event.id}`;
        const text = event.content.find(c => c.type === "text")?.text || "Assistant Message";
        const preview = text.length > 50 ? text.slice(0, 50) + "..." : text;
        const span = createSpan(spanId, `Assistant: ${preview}`, event, currentTurnSpan?.id);
        span.kind = "consumer";
        span.status = "ok";
        span.endTime = time;
        span.duration = 0;

         if (currentTurnSpan) {
          currentTurnSpan.children?.push(span);
        } else {
          spans.push(span);
        }
        break;
      }
      case "error": {
          const spanId = `error-${event.id}`;
          const errorMsg = event.error ? String(event.error) : "Error";
          const span = createSpan(spanId, `Error: ${errorMsg}`, event, currentTurnSpan?.id);
          span.status = "error";
          span.kind = "internal";
          span.endTime = time;
          span.duration = 0;
          if (currentTurnSpan) {
              currentTurnSpan.children?.push(span);
          } else {
              spans.push(span);
          }
          break;
      }
      case "before_agent_start": {
        const agentKey = turnId || event.session_id;
        const spanId = `agent-${agentKey}-${event.id}`;
        const agentId = event.data?.agentId || "unknown";
        const span = createSpan(spanId, `Agent: ${agentId}`, event, currentTurnSpan?.id);
        span.kind = "internal";
        span.status = "unset";
        span.attributes = { ...span.attributes, ...event.metadata, ...event.data, content: event.content };
        agentSpans.set(agentKey, span);
        if (currentTurnSpan) {
          currentTurnSpan.children?.push(span);
        } else {
          spans.push(span);
        }
        break;
      }
      case "agent_end": {
        const agentKey = turnId || event.session_id;
        const span = agentSpans.get(agentKey);
        if (span) {
          span.endTime = time;
          span.duration = time - span.startTime;
          span.status = event.error ? "error" : "ok";
          span.endEventId = event.id;
          span.attributes = { ...span.attributes, ...event.data, ...event.metadata };
          agentSpans.delete(agentKey);
        }
        break;
      }
      case "before_message_write":
      case "message_received":
      case "message_sending":
      case "message_sent":
      case "before_prompt_build":
      case "before_model_resolve":
      case "before_compaction":
      case "after_compaction":
      case "before_reset":
      case "tool_result_persist": {
        lastEventWasUserMessage = false;
        const effectiveTurnSpan = lastUserMessageTurnId 
          ? turnSpans.get(lastUserMessageTurnId) 
          : currentTurnSpan;
        const label = instantSpanLabels[event.type] ?? event.type;
        const preview = getPreviewText(event);
        const spanId = `${event.type}-${event.id}`;
        const spanName = preview ? `${label}: ${preview}` : label;
        const span = createSpan(spanId, spanName, event, effectiveTurnSpan?.id);
        span.kind = "internal";
        span.status = event.error ? "error" : "ok";
        span.endTime = time;
        span.duration = 0;
        span.attributes = { ...span.attributes, ...event.metadata, ...event.data, content: event.content };
        if (effectiveTurnSpan) {
          effectiveTurnSpan.children?.push(span);
        } else {
          spans.push(span);
        }
        break;
      }
      default: {
        if (currentTurnSpan) {
           currentTurnSpan.events.push({
             name: event.type,
             time,
             attributes: {
               ...event.metadata,
               ...event.data,
               content: event.content,
               error: event.error,
               id: event.id,
             }
           });
        }
        break;
      }
    }
    
    if (currentTurnSpan) {
        currentTurnSpan.endTime = time;
        currentTurnSpan.duration = time - currentTurnSpan.startTime;
        lastTurnSpan = currentTurnSpan;
    }
  });

  return spans;
}
