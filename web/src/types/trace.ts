export interface SpanEvent {
  name: string;
  time: number; // timestamp in ms
  attributes?: Record<string, any>;
}

export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  kind: "client" | "server" | "producer" | "consumer" | "internal";
  startTime: number; // timestamp in ms
  endTime?: number; // timestamp in ms
  duration?: number; // ms
  status: "ok" | "error" | "unset";
  attributes: Record<string, any>;
  events: SpanEvent[];
  children?: Span[];
  // Original event that started this span
  startEventId?: string;
  endEventId?: string;
}
