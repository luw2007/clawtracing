import type { OpenClawPluginApi, TracingConfig, TracingEvent } from "./types.js";
import { hostname } from "os";
import { basename } from "path";

interface PerformanceStats {
  eventCount: number;
  flushCount: number;
  sampledOutCount: number;
  lastMemoryUsage: number;
}

// 心跳间隔：30 秒（服务端超时为 90 秒）
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * 生成实例名称
 * 优先级：配置的 instanceName > 工作目录名 > hostname
 */
function generateInstanceName(config: TracingConfig): string {
  if (config.instanceName) {
    return config.instanceName;
  }
  const cwd = process.cwd();
  const dirName = basename(cwd);
  if (dirName && dirName !== "/" && dirName !== ".") {
    return dirName;
  }
  return hostname();
}

export class TracingCollector {
  private eventBuffer: TracingEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private fastRetryTimer: NodeJS.Timeout | null = null;
  private config: TracingConfig;
  private api: OpenClawPluginApi;
  private currentBatchSize: number;
  private instanceId: string;
  private instanceName: string;
  private workingDir: string;
  private stats: PerformanceStats = {
    eventCount: 0,
    flushCount: 0,
    sampledOutCount: 0,
    lastMemoryUsage: 0,
  };

  constructor(api: OpenClawPluginApi, config: TracingConfig) {
    this.api = api;
    this.config = config;
    this.currentBatchSize = config.batchSize || 10;
    this.workingDir = process.cwd();
    this.instanceName = generateInstanceName(config);
    this.instanceId = `${this.instanceName}@${hostname()}:${process.pid}`;
    this.startFlushTimer();
    this.startStatsTimer();
    this.startHeartbeatTimer();
  }

  private startFlushTimer(): void {
    const interval = this.config.batchInterval || 1000;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, interval);
  }

  private startStatsTimer(): void {
    const interval = this.config.performance?.statsInterval ?? 60000;
    if (interval <= 0) return;
    this.statsTimer = setInterval(() => {
      this.outputStats();
    }, interval);
  }

  private startHeartbeatTimer(): void {
    // 立即发送首次心跳
    void this.sendHeartbeat();

    // 快速重试机制：在启动后的前 1 分钟内，每 5 秒发送一次心跳
    // 这有助于解决 Server 启动较慢导致长时间未检测到实例的问题
    const fastRetryCount = 12; // 12 * 5s = 60s
    let retryCount = 0;
    
    this.fastRetryTimer = setInterval(() => {
      if (retryCount >= fastRetryCount) {
        if (this.fastRetryTimer) {
          clearInterval(this.fastRetryTimer);
          this.fastRetryTimer = null;
        }
        return;
      }
      void this.sendHeartbeat();
      retryCount++;
    }, 5000);

    // 定期发送心跳（正常频率）
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: this.instanceId,
          instanceName: this.instanceName,
          workingDir: this.workingDir,
          hostname: hostname(),
          timestamp: new Date().toISOString(),
          pid: process.pid,
        }),
      });

      if (!response.ok) {
        this.api.logger.warn(`Heartbeat failed: ${response.statusText}`);
      } else if (this.config.debug) {
        this.api.logger.info(`Heartbeat sent: ${this.instanceId}`);
      }
    } catch (error) {
      if (this.config.debug) {
        this.api.logger.warn(`Heartbeat error: ${error}`);
      }
    }
  }

  private outputStats(): void {
    const memoryMB = this.getMemoryUsageMB();
    this.stats.lastMemoryUsage = memoryMB;
    this.api.logger.info(
      `[Tracing Stats] eventCount: ${this.stats.eventCount}, flushCount: ${this.stats.flushCount}, sampledOut: ${this.stats.sampledOutCount}, memoryUsage: ${memoryMB.toFixed(2)}MB, bufferSize: ${this.eventBuffer.length}`
    );
  }

  private getMemoryUsageMB(): number {
    return process.memoryUsage().heapUsed / (1024 * 1024);
  }

  private shouldSample(eventType: string): boolean {
    const samplingConfig = this.config.sampling;
    if (!samplingConfig) return true;
    const rate = samplingConfig[eventType];
    if (rate === undefined) return true;
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    return Math.random() < rate;
  }

  private checkMemoryAndDowngrade(): void {
    const perfConfig = this.config.performance;
    const autoDowngrade = perfConfig?.autoDowngrade ?? true;
    if (!autoDowngrade) return;

    const maxMemoryMB = perfConfig?.maxMemoryUsage ?? 500;
    const currentMemoryMB = this.getMemoryUsageMB();

    if (currentMemoryMB > maxMemoryMB) {
      // batchSize 已经是最小值 1，无法继续降级，直接强制 flush
      if (this.currentBatchSize <= 1) {
        if (this.config.debug) {
          this.api.logger.warn(
            `[Tracing] Memory usage ${currentMemoryMB.toFixed(2)}MB exceeds ${maxMemoryMB}MB, batchSize already at minimum, forcing flush`
          );
        }
        void this.flush();
        return;
      }
      const originalBatchSize = this.currentBatchSize;
      this.currentBatchSize = Math.max(1, Math.floor(this.currentBatchSize / 2));
      this.api.logger.warn(
        `[Tracing] Memory usage ${currentMemoryMB.toFixed(2)}MB exceeds ${maxMemoryMB}MB, downgrading batchSize from ${originalBatchSize} to ${this.currentBatchSize}`
      );
      void this.flush();
    }
  }

  private checkBufferLimit(): boolean {
    const maxBufferSize = this.config.performance?.maxBufferSize ?? 100;
    if (this.eventBuffer.length >= maxBufferSize) {
      this.api.logger.warn(
        `[Tracing] Buffer size ${this.eventBuffer.length} reached max ${maxBufferSize}, forcing flush`
      );
      void this.flush();
      return true;
    }
    return false;
  }

  async send(event: TracingEvent): Promise<void> {
    if (!this.shouldSample(event.type)) {
      this.stats.sampledOutCount++;
      return;
    }

    this.stats.eventCount++;
    const eventWithInstance: TracingEvent = {
      ...event,
      instance_id: this.instanceId,
    };
    this.eventBuffer.push(eventWithInstance);
    
    this.checkMemoryAndDowngrade();
    this.checkBufferLimit();

    if (this.eventBuffer.length >= this.currentBatchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;
    
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    this.stats.flushCount++;
    
    const requestBody = JSON.stringify({ events });
    
    try {
      const response = await fetch(`${this.config.serverUrl}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      
      if (!response.ok) {
        // 尝试读取响应体以获取详细错误信息
        let responseBody = "";
        try {
          responseBody = await response.text();
        } catch {
          responseBody = "(unable to read response body)";
        }
        this.api.logger.error(
          `Failed to send events: HTTP ${response.status} ${response.statusText}\n` +
          `Response: ${responseBody}\n` +
          `Request body: ${requestBody.substring(0, 2000)}${requestBody.length > 2000 ? "...(truncated)" : ""}`
        );
        this.eventBuffer.unshift(...events);
      } else if (this.config.debug) {
        this.api.logger.info(`Sent ${events.length} events to tracing server`);
      }
    } catch (error) {
      this.api.logger.error(
        `Failed to send events: ${error}\n` +
        `Request body: ${requestBody.substring(0, 2000)}${requestBody.length > 2000 ? "...(truncated)" : ""}`
      );
      this.eventBuffer.unshift(...events);
    }
  }

  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.fastRetryTimer) {
      clearInterval(this.fastRetryTimer);
    }
    this.outputStats();
    await this.flush();
  }
}
