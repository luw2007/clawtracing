/**
 * WebSocket 服务器
 * 管理客户端连接并广播追踪事件
 */

import { WebSocketServer as WSServer, WebSocket } from "ws";
import type { Server } from "http";
import type { TracingEvent } from "../types/index.js";

//#region debug-point: ws-debug-reporter
async function reportDebug(eventName: string, data: Record<string, unknown>): Promise<void> {
  try {
    await fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "server",
        event: eventName,
        ts: new Date().toISOString(),
        data,
      }),
    });
  } catch {
    // ignore
  }
}
//#endregion debug-point: ws-debug-reporter

/** 会话记录行类型（与 SQLite 存储一致） */
interface SessionRow {
  id: string;
  key: string | null;
  started_at: string;
  message_count: number;
  total_tokens: number;
}

/** WebSocket 消息类型（与 Web 前端类型定义一致） */
interface SessionSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: "active" | "completed" | "error" | "archived";
  event_count: number;
  preview?: string;
}

interface SessionsListMessage {
  type: "sessions_list";
  sessions: SessionSummary[];
}

interface EventAddedMessage {
  type: "event_added";
  event: TracingEvent;
}

type WebSocketMessage = SessionsListMessage | EventAddedMessage;

/** 心跳配置常量 */
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10000;

/** 扩展 WebSocket 类型，添加心跳状态 */
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

/** WebSocket 服务器配置 */
export interface WebSocketServerOptions {
  /** 获取会话列表的回调函数 */
  getSessions?: () => SessionRow[];
  /** 心跳间隔（毫秒），默认 30000 */
  heartbeatInterval?: number;
}

/**
 * WebSocket 服务器类
 * 管理客户端连接列表，支持事件广播和心跳检测
 */
export class WebSocketServer {
  private wss: WSServer | null = null;
  private clients: Set<ExtendedWebSocket> = new Set();
  private getSessions: () => SessionRow[];
  private heartbeatInterval: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(options: WebSocketServerOptions = {}) {
    this.getSessions = options.getSessions ?? (() => []);
    this.heartbeatInterval = options.heartbeatInterval ?? HEARTBEAT_INTERVAL_MS;
  }

  /**
   * 附加到 HTTP 服务器
   * @param server - HTTP 服务器实例
   */
  attach(server: Server): void {
    this.wss = new WSServer({ server });

    this.wss.on("connection", (ws) => {
      this.handleConnection(ws as ExtendedWebSocket);
    });

    this.startHeartbeat();
  }

  /**
   * 启动心跳检测定时器
   * 定期向所有客户端发送 ping，清理无响应的连接
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          void reportDebug("ws_heartbeat_timeout", { clientCount: this.clients.size });
          client.terminate();
          this.clients.delete(client);
          continue;
        }

        client.isAlive = false;
        client.ping();
      }

      void reportDebug("ws_heartbeat_sent", {
        clientCount: this.clients.size,
        timestamp: new Date().toISOString(),
      });
    }, this.heartbeatInterval);
  }

  /**
   * 停止心跳检测定时器
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 处理新的 WebSocket 连接
   * @param ws - WebSocket 连接实例
   */
  private handleConnection(ws: ExtendedWebSocket): void {
    ws.isAlive = true;
    this.clients.add(ws);

    const sessions = this.getSessions().map((row): SessionSummary => {
      const createdAt = row.started_at;
      const name = row.key ?? "";

      return {
        id: row.id,
        name,
        created_at: createdAt,
        updated_at: createdAt,
        status: "active",
        event_count: row.message_count,
      };
    });

    const sessionsListMessage: SessionsListMessage = {
      type: "sessions_list",
      sessions,
    };
    ws.send(JSON.stringify(sessionsListMessage));
    void reportDebug("ws_client_connected", {
      clientCount: this.clients.size,
      initType: sessionsListMessage.type,
      sessionsCount: sessionsListMessage.sessions.length,
    });

    ws.on("pong", () => {
      ws.isAlive = true;
      void reportDebug("ws_pong_received", { clientCount: this.clients.size });
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      void reportDebug("ws_client_closed", { clientCount: this.clients.size });
    });

    ws.on("error", (error) => {
      this.clients.delete(ws);
      void reportDebug("ws_client_error", {
        error: error instanceof Error ? error.message : String(error),
        clientCount: this.clients.size,
      });
    });
  }

  /**
   * 广播事件到所有连接的客户端
   * @param event - 要广播的追踪事件
   */
  broadcast(event: TracingEvent): void {
    const message: EventAddedMessage = {
      type: "event_added",
      event,
    };
    const data = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }

    const sessions = this.getSessions().map((row): SessionSummary => {
      const createdAt = row.started_at;
      const name = row.key ?? "";

      return {
        id: row.id,
        name,
        created_at: createdAt,
        updated_at: createdAt,
        status: "active",
        event_count: row.message_count,
      };
    });

    const sessionsListMessage: SessionsListMessage = {
      type: "sessions_list",
      sessions,
    };
    const sessionsData = JSON.stringify(sessionsListMessage);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(sessionsData);
      }
    }

    void reportDebug("ws_broadcast", {
      clientCount: this.clients.size,
      messageType: message.type,
      sessionsCount: sessions.length,
    });
  }

  /**
   * 获取当前连接的客户端数量
   * @returns 客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 关闭 WebSocket 服务器
   */
  close(): void {
    this.stopHeartbeat();

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

export type { WebSocketMessage, SessionsListMessage, EventAddedMessage, SessionSummary };
