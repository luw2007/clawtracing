#!/usr/bin/env node
/**
 * OpenClaw Tracing CLI 命令行工具
 * 提供服务启动、数据分析、导出和清理功能
 */

import { program } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import Database from "better-sqlite3";
import type { TracingEvent } from "../types/index.js";
import type {
  TokenStats,
  ToolUsageStats,
  StorageStats,
} from "../server/storage/index.js";

/** 默认数据库路径 */
const DEFAULT_DB_PATH = join(homedir(), ".openclaw", "tracing", "tracing.db");

/** 默认 JSONL 目录 */
const DEFAULT_JSONL_DIR = join(homedir(), ".openclaw", "tracing", "jsonl");

/** 会话行类型 */
interface SessionRow {
  id: string;
  key: string | null;
  started_at: string;
  message_count: number;
  total_tokens: number;
}

/** 事件行类型 */
interface EventRow {
  id: string;
  type: string;
  action: string | null;
  session_id: string;
  timestamp: string;
  data: string;
}

/**
 * 获取数据库连接
 * @param dbPath - 数据库路径
 * @returns 数据库实例或 null
 */
function getDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database | null {
  if (!existsSync(dbPath)) {
    return null;
  }
  return new Database(dbPath, { readonly: true });
}

/**
 * 获取可写数据库连接
 * @param dbPath - 数据库路径
 * @returns 数据库实例或 null
 */
function getWritableDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database | null {
  if (!existsSync(dbPath)) {
    return null;
  }
  return new Database(dbPath);
}

/**
 * 获取所有事件
 * @param db - 数据库实例
 * @returns 事件列表
 */
function getAllEvents(db: Database.Database): TracingEvent[] {
  const stmt = db.prepare(`SELECT data FROM events ORDER BY timestamp ASC`);
  const rows = stmt.all() as EventRow[];
  return rows.map((row) => JSON.parse(row.data) as TracingEvent);
}

/**
 * 获取统计信息
 * @param db - 数据库实例
 * @returns 统计数据
 */
function getStats(db: Database.Database): StorageStats {
  const events = getAllEvents(db);

  let totalInput = 0;
  let totalOutput = 0;
  for (const event of events) {
    const usage = event.metadata?.usage;
    if (usage && typeof usage === "object") {
      totalInput += (usage as { input_tokens?: number }).input_tokens ?? 0;
      totalOutput += (usage as { output_tokens?: number }).output_tokens ?? 0;
    }
  }

  const sessionCount = (
    db.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number }
  ).count;
  const eventCount = (
    db.prepare(`SELECT COUNT(*) as count FROM events`).get() as { count: number }
  ).count;

  const tokens: TokenStats = {
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_tokens: totalInput + totalOutput,
    session_count: sessionCount,
  };

  const toolStmt = db.prepare(`
    SELECT action as tool_name, COUNT(*) as call_count
    FROM events
    WHERE type = 'tool_call' AND action IS NOT NULL
    GROUP BY action
    ORDER BY call_count DESC
  `);
  const toolRows = toolStmt.all() as Array<{ tool_name: string; call_count: number }>;

  const tools: ToolUsageStats[] = toolRows.map((row) => ({
    tool_name: row.tool_name,
    call_count: row.call_count,
    error_count: 0,
  }));

  return {
    tokens,
    tools,
    event_count: eventCount,
    session_count: sessionCount,
  };
}

/**
 * 提取系统提示词
 * @param events - 事件列表
 * @returns 系统提示词列表
 */
function extractSystemPrompts(events: TracingEvent[]): string[] {
  const prompts: string[] = [];

  for (const event of events) {
    if (event.type === "user_message" || event.type === "system") {
      for (const block of event.content) {
        if (block.type === "text" && block.text) {
          if (
            block.text.includes("system") ||
            block.text.includes("You are") ||
            block.text.length > 500
          ) {
            prompts.push(block.text.slice(0, 500) + (block.text.length > 500 ? "..." : ""));
          }
        }
      }
    }
  }

  return prompts.slice(0, 5);
}

/**
 * 格式化 token 数量
 * @param tokens - token 数量
 * @returns 格式化字符串
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * 打印分隔线
 * @param title - 标题
 */
function printSection(title: string): void {
  console.log("");
  console.log(`━━━ ${title} ━━━`);
}

program
  .name("openclaw-tracing")
  .description("OpenClaw Tracing CLI - 追踪数据收集与分析工具")
  .version("1.0.0");

program
  .command("start")
  .description("启动 tracing 服务器")
  .option("-p, --port <port>", "HTTP API 端口", "3456")
  .option("-w, --web-port <port>", "Web 界面端口（预留）", "3457")
  .option("-q, --quiet", "静默模式，减少输出")
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const webPort = parseInt(options.webPort, 10);

    if (!options.quiet) {
      console.log("🚀 正在启动 OpenClaw Tracing 服务器...");
      console.log("");
    }

    try {
      const { startServer } = await import("../server/index.js");

      await startServer({ port });

      if (!options.quiet) {
        console.log("");
        console.log("📡 服务地址:");
        console.log(`   HTTP API:    http://localhost:${port}/api`);
        console.log(`   WebSocket:   ws://localhost:${port}`);
        console.log(`   Health:      http://localhost:${port}/health`);
        console.log(`   Web UI:      http://localhost:${webPort} (即将支持)`);
        console.log("");
        console.log("💡 提示: 使用 Ctrl+C 停止服务器");
      }
    } catch (error) {
      console.error("❌ 启动失败:", error);
      process.exit(1);
    }
  });

program
  .command("analyze")
  .description("分析追踪数据")
  .option("--system-prompt", "分析系统提示词")
  .option("--tokens", "显示 token 统计")
  .option("--tools", "显示工具使用统计")
  .option("--all", "显示所有分析（默认）")
  .action((options) => {
    const db = getDatabase();
    if (!db) {
      console.log("⚠️  没有找到追踪数据");
      console.log(`   数据库路径: ${DEFAULT_DB_PATH}`);
      return;
    }

    try {
      const showAll =
        options.all || (!options.systemPrompt && !options.tokens && !options.tools);
      const stats = getStats(db);

      console.log("📊 OpenClaw Tracing 数据分析");
      console.log(`   数据库: ${DEFAULT_DB_PATH}`);

      if (showAll || options.tokens) {
        printSection("Token 统计");
        console.log(`   总 Token 数:    ${formatTokens(stats.tokens.total_tokens)}`);
        console.log(`   输入 Token:     ${formatTokens(stats.tokens.total_input_tokens)}`);
        console.log(`   输出 Token:     ${formatTokens(stats.tokens.total_output_tokens)}`);
        console.log(`   会话数:         ${stats.session_count}`);
        console.log(`   事件数:         ${stats.event_count}`);
      }

      if (showAll || options.tools) {
        printSection("工具使用统计");
        if (stats.tools.length === 0) {
          console.log("   暂无工具调用记录");
        } else {
          const maxNameLen = Math.max(...stats.tools.map((t) => t.tool_name.length), 10);
          console.log(`   ${"工具名称".padEnd(maxNameLen)}  调用次数`);
          console.log(`   ${"-".repeat(maxNameLen)}  --------`);
          for (const tool of stats.tools.slice(0, 20)) {
            console.log(
              `   ${tool.tool_name.padEnd(maxNameLen)}  ${String(tool.call_count).padStart(8)}`
            );
          }
          if (stats.tools.length > 20) {
            console.log(`   ... 还有 ${stats.tools.length - 20} 个工具`);
          }
        }
      }

      if (showAll || options.systemPrompt) {
        printSection("系统提示词分析");
        const events = getAllEvents(db);
        const prompts = extractSystemPrompts(events);
        if (prompts.length === 0) {
          console.log("   未检测到系统提示词");
        } else {
          for (let i = 0; i < prompts.length; i++) {
            console.log(`   [${i + 1}] ${prompts[i].slice(0, 100)}...`);
          }
        }
      }

      console.log("");
    } finally {
      db.close();
    }
  });

program
  .command("export")
  .description("导出追踪数据")
  .option("-f, --format <fmt>", "输出格式 (json, jsonl)", "jsonl")
  .option("-o, --output <file>", "输出文件路径")
  .action(async (options) => {
    const db = getDatabase();
    if (!db) {
      console.log("⚠️  没有找到追踪数据");
      console.log(`   数据库路径: ${DEFAULT_DB_PATH}`);
      return;
    }

    try {
      const events = getAllEvents(db);

      if (events.length === 0) {
        console.log("⚠️  没有可导出的事件数据");
        return;
      }

      const format = options.format.toLowerCase();
      let content: string;
      let defaultExt: string;

      if (format === "json") {
        content = JSON.stringify(events, null, 2);
        defaultExt = ".json";
      } else if (format === "jsonl") {
        content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
        defaultExt = ".jsonl";
      } else {
        console.error(`❌ 不支持的格式: ${format}`);
        console.log("   支持的格式: json, jsonl");
        process.exit(1);
      }

      const outputPath =
        options.output ?? `openclaw-tracing-export-${Date.now()}${defaultExt}`;
      await writeFile(outputPath, content, "utf-8");

      console.log(`✅ 导出成功`);
      console.log(`   文件: ${outputPath}`);
      console.log(`   格式: ${format}`);
      console.log(`   事件数: ${events.length}`);
    } finally {
      db.close();
    }
  });

program
  .command("clear")
  .description("清除所有追踪数据")
  .option("--yes", "跳过确认提示")
  .action(async (options) => {
    if (!options.yes) {
      console.log("⚠️  此操作将删除所有追踪数据，包括:");
      console.log(`   - SQLite 数据库: ${DEFAULT_DB_PATH}`);
      console.log(`   - JSONL 文件: ${DEFAULT_JSONL_DIR}`);
      console.log("");
      console.log("如果确认要清除，请添加 --yes 参数:");
      console.log("   openclaw-tracing clear --yes");
      return;
    }

    let clearedSqlite = false;
    let clearedJsonl = false;

    const db = getWritableDatabase();
    if (db) {
      try {
        db.exec(`DELETE FROM events`);
        db.exec(`DELETE FROM sessions`);
        db.exec(`VACUUM`);
        clearedSqlite = true;
      } finally {
        db.close();
      }
    }

    const { rm } = await import("node:fs/promises");
    const { readdirSync } = await import("node:fs");

    if (existsSync(DEFAULT_JSONL_DIR)) {
      try {
        const files = readdirSync(DEFAULT_JSONL_DIR).filter((f) => f.endsWith(".jsonl"));
        for (const file of files) {
          await rm(join(DEFAULT_JSONL_DIR, file));
        }
        clearedJsonl = files.length > 0;
      } catch {
        // 忽略清理错误
      }
    }

    if (clearedSqlite || clearedJsonl) {
      console.log("✅ 追踪数据已清除");
      if (clearedSqlite) {
        console.log("   - SQLite 数据库已清空");
      }
      if (clearedJsonl) {
        console.log("   - JSONL 文件已删除");
      }
    } else {
      console.log("ℹ️  没有需要清除的数据");
    }
  });

program.parse();
