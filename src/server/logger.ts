import pino, { type Logger as PinoLogger } from "pino";
import { getLogLevel, type LogLevel } from "./config.js";

export type { LogLevel };

export interface LoggerOptions {
  name: string;
}

export type Logger = PinoLogger;

const pinoLevelMap: Record<LogLevel, string> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  silent: "silent",
};

function createTransport() {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }
  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname",
    },
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const level = getLogLevel();
  const transport = createTransport();

  return pino({
    name: options.name,
    level: pinoLevelMap[level],
    ...(transport && { transport }),
  });
}
