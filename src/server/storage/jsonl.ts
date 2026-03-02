/**
 * JSONL 存储实现
 * 将追踪事件以 JSONL 格式按日期分文件存储
 */

import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TracingEvent } from "../../types/index.js";

/** JSONL 存储配置选项 */
export interface JsonlStorageOptions {
  /** 存储根目录，默认 ~/.openclaw_tracing */
  baseDir?: string;
}

/**
 * JSONL 存储类
 * 按日期分文件存储追踪事件，格式为 events-YYYY-MM-DD.jsonl
 */
export class JsonlStorage {
  private readonly baseDir: string;

  constructor(options: JsonlStorageOptions = {}) {
    this.baseDir = options.baseDir ?? join(homedir(), ".openclaw_tracing");
  }

  /**
   * 初始化存储目录
   * 创建必要的目录结构
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  /**
   * 追加事件到 JSONL 文件
   * 根据事件时间戳自动选择对应日期的文件
   * @param event - 追踪事件对象
   */
  async appendEvent(event: TracingEvent): Promise<void> {
    await this.initialize();
    const date = this.extractDate(event.timestamp);
    const filePath = this.getFilePath(date);

    const line = JSON.stringify(event) + "\n";
    await writeFile(filePath, line, { flag: "a", encoding: "utf-8" });
  }

  /**
   * 读取事件列表
   * @param sessionId - 可选，按会话 ID 过滤
   * @returns 事件列表
   */
  async getEvents(sessionId?: string): Promise<TracingEvent[]> {
    await this.initialize();
    const files = await this.listEventFiles();
    const events: TracingEvent[] = [];

    for (const file of files) {
      const filePath = join(this.baseDir, file);
      const content = await readFile(filePath, { encoding: "utf-8" });
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        const event = JSON.parse(line) as TracingEvent;
        if (!sessionId || event.session_id === sessionId) {
          events.push(event);
        }
      }
    }

    return events.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * 清除所有 JSONL 文件
   * 删除存储目录下的所有事件文件
   */
  async clear(): Promise<void> {
    const files = await this.listEventFiles();
    for (const file of files) {
      await rm(join(this.baseDir, file));
    }
  }

  /**
   * 获取存储目录路径
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * 从时间戳提取日期字符串
   * @param timestamp - ISO 8601 格式时间戳或 Date 对象
   * @returns YYYY-MM-DD 格式日期
   */
  private extractDate(timestamp: string | Date | number | undefined): string {
    if (!timestamp) {
      return new Date().toISOString().slice(0, 10);
    }
    if (typeof timestamp === "string") {
      return timestamp.slice(0, 10);
    }
    if (timestamp instanceof Date) {
      return timestamp.toISOString().slice(0, 10);
    }
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  /**
   * 获取指定日期的文件路径
   * @param date - YYYY-MM-DD 格式日期
   * @returns 完整文件路径
   */
  private getFilePath(date: string): string {
    return join(this.baseDir, `events-${date}.jsonl`);
  }

  /**
   * 列出所有事件文件
   * @returns 文件名列表，按日期排序
   */
  private async listEventFiles(): Promise<string[]> {
    if (!existsSync(this.baseDir)) {
      return [];
    }
    const entries = await readdir(this.baseDir);
    return entries
      .filter((name) => name.startsWith("events-") && name.endsWith(".jsonl"))
      .sort();
  }
}
