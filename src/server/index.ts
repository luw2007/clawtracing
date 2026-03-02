/**
 * OpenClaw Tracing 服务器入口
 * 整合 Express HTTP 服务、WebSocket 服务和存储管理
 */

import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import cors from "cors";
import { StorageManager } from "./storage/index.js";
import { WebSocketServer } from "./websocket.js";
import { createApiRouter, getOnlineHookCount } from "./api.js";
import { createLogger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger({ name: "server" });

export interface ServerOptions {
  port?: number;
  jsonlDir?: string;
  sqlitePath?: string;
}

export interface ServerInstance {
  close: () => void;
  storage: StorageManager;
  wsServer: WebSocketServer;
}

export async function startServer(
  options: ServerOptions = {}
): Promise<ServerInstance> {
  const { port = 3456, jsonlDir, sqlitePath } = options;

  const storage = new StorageManager({
    jsonl: jsonlDir ? { baseDir: jsonlDir } : undefined,
    sqlite: sqlitePath ? { dbPath: sqlitePath } : undefined,
  });

  await storage.initialize();

  const wsServer = new WebSocketServer({
    getSessions: () => storage.getSessions(),
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  const apiRouter = createApiRouter({ storage, wsServer });
  app.use("/api", apiRouter);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      connections: getOnlineHookCount(),
      ws_clients: wsServer.getClientCount(),
      timestamp: new Date().toISOString(),
    });
  });

  const webDir = join(__dirname, "..", "web");
  app.use(express.static(webDir));
  app.get("*", (_req, res, next) => {
    if (_req.path.startsWith("/api") || _req.path === "/health") {
      return next();
    }
    res.sendFile(join(webDir, "index.html"));
  });

  const server = createServer(app);
  wsServer.attach(server);

  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info({
        http: `http://localhost:${port}/api`,
        websocket: `ws://localhost:${port}`,
        health: `http://localhost:${port}/health`,
      }, "OpenClaw Tracing 服务已启动");

      resolve({
        close: () => {
          wsServer.close();
          storage.close();
          server.close();
        },
        storage,
        wsServer,
      });
    });
  });
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  startServer().catch((error) => {
    logger.error({ err: error }, "启动失败");
    process.exit(1);
  });
}
