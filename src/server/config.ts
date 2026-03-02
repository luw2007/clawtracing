import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Config {
  log?: {
    level?: LogLevel;
  };
}

const CONFIG_DIR = path.join(os.homedir(), ".openclaw-tracing");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function getLogLevel(): LogLevel {
  if (process.env.LOG_LEVEL) {
    const envLevel = process.env.LOG_LEVEL.toLowerCase();
    if (["debug", "info", "warn", "error", "silent"].includes(envLevel)) {
      return envLevel as LogLevel;
    }
  }
  const config = loadConfig();
  return config?.log?.level || "info";
}

export function setLogLevel(level: LogLevel): void {
  const config = loadConfig() || {};
  config.log = { ...config.log, level };
  saveConfig(config);
}
