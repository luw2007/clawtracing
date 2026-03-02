/**
 * 存储管理器
 * 协调 JSONL 和 SQLite 存储，实现双写和实时广播
 */

import type { TracingEvent } from "../../types/index.js";
import { JsonlStorage, type JsonlStorageOptions } from "./jsonl.js";
import {
  SqliteStorage,
  type SqliteStorageOptions,
  type StorageStats,
} from "./sqlite.js";

/** 广播回调函数类型 */
export type BroadcastCallback = (event: TracingEvent) => void;

/** 存储管理器配置选项 */
export interface StorageManagerOptions {
  /** JSONL 存储配置 */
  jsonl?: JsonlStorageOptions;
  /** SQLite 存储配置 */
  sqlite?: SqliteStorageOptions;
  /** 广播回调函数，用于实时推送事件 */
  onBroadcast?: BroadcastCallback;
}

/**
 * 存储管理器类
 * 统一管理 JSONL 和 SQLite 存储，实现双写策略
 */
export class StorageManager {
  private readonly jsonlStorage: JsonlStorage;
  private readonly sqliteStorage: SqliteStorage;
  private broadcastCallback: BroadcastCallback | null;
  private initialized = false;

  constructor(options: StorageManagerOptions = {}) {
    this.jsonlStorage = new JsonlStorage(options.jsonl);
    this.sqliteStorage = new SqliteStorage(options.sqlite);
    this.broadcastCallback = options.onBroadcast ?? null;
  }

  /**
   * 初始化所有存储后端
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await Promise.all([
      this.jsonlStorage.initialize(),
      this.sqliteStorage.initialize(),
    ]);

    this.initialized = true;
  }

  /**
   * 写入事件（双写）
   * 同时写入 JSONL 和 SQLite 存储，并触发广播
   * @param event - 追踪事件对象
   */
  async writeEvent(event: TracingEvent): Promise<void> {
    await this.ensureInitialized();

    await this.jsonlStorage.appendEvent(event);
    this.sqliteStorage.insertEvent(event);

    if (this.broadcastCallback) {
      this.broadcastCallback(event);
    }
  }

  /**
   * 获取事件列表
   * 从 SQLite 存储读取，性能更好
   * @param sessionId - 可选，按会话 ID 过滤
   * @returns 事件列表
   */
  getEvents(sessionId?: string): TracingEvent[] {
    this.ensureInitializedSync();
    return this.sqliteStorage.getEvents(sessionId);
  }

  /**
   * 获取会话列表
   */
  getSessions(): ReturnType<SqliteStorage["getSessions"]> {
    this.ensureInitializedSync();
    return this.sqliteStorage.getSessions();
  }

  /**
   * 获取统计信息
   */
  getStats(): StorageStats {
    this.ensureInitializedSync();
    return this.sqliteStorage.getStats();
  }

  /**
   * 清除 JSONL 文件
   */
  async clearJsonl(): Promise<void> {
    await this.jsonlStorage.clear();
  }

  /**
   * 设置广播回调
   * @param callback - 广播回调函数
   */
  setBroadcastCallback(callback: BroadcastCallback | null): void {
    this.broadcastCallback = callback;
  }

  /**
   * 关闭所有存储连接
   */
  close(): void {
    this.sqliteStorage.close();
    this.initialized = false;
  }

  /**
   * 获取 JSONL 存储实例
   */
  getJsonlStorage(): JsonlStorage {
    return this.jsonlStorage;
  }

  /**
   * 获取 SQLite 存储实例
   */
  getSqliteStorage(): SqliteStorage {
    return this.sqliteStorage;
  }

  /**
   * 确保存储已初始化（异步）
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 确保存储已初始化（同步检查）
   */
  private ensureInitializedSync(): void {
    if (!this.initialized) {
      throw new Error("StorageManager 未初始化，请先调用 initialize()");
    }
  }
}
