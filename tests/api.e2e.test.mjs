import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import cors from "cors";
import { StorageManager } from "../dist/server/storage/index.js";
import { WebSocketServer } from "../dist/server/websocket.js";
import { createApiRouter } from "../dist/server/api.js";

async function startTestServer() {
  const baseDir = await mkdtemp(join(tmpdir(), "openclaw-tracing-test-"));
  const sqlitePath = join(baseDir, "tracing.db");

  const storage = new StorageManager({
    jsonl: { baseDir },
    sqlite: { dbPath: sqlitePath },
  });
  await storage.initialize();

  const wsServer = new WebSocketServer({ getSessions: () => storage.getSessions() });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", createApiRouter({ storage, wsServer }));

  const server = createServer(app);
  wsServer.attach(server);

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("无法获取监听端口"));
        return;
      }
      resolve(address.port);
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    async close() {
      wsServer.close();
      storage.close();
      await new Promise((resolve) => server.close(resolve));
      await rm(baseDir, { recursive: true, force: true });
    },
  };
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  if (text.length > 0) json = JSON.parse(text);
  return { status: res.status, json };
}

async function postEvent(baseUrl, body) {
  const { status, json } = await fetchJson(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(status, 201);
  assert.ok(json && typeof json.id === "string" && json.id.length > 0);
}

function buildUrl(baseUrl, path, params) {
  const url = new URL(`${baseUrl}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

test("cost：写入含 model+usage 的事件后可估算成本，并且 from/to/model 过滤生效", async () => {
  const server = await startTestServer();
  try {
    const t0 = "2026-01-01T00:00:00.000Z";
    const t1 = "2026-01-01T00:02:00.000Z";
    const t2 = "2026-01-01T00:04:00.000Z";
    const t3 = "2026-01-01T00:06:00.000Z";

    await postEvent(server.baseUrl, {
      session_id: "s-cost-a",
      type: "assistant_message",
      timestamp: t1,
      content: "a",
      data: { model: "gpt-4o-mini", usage: { input_tokens: 1000, output_tokens: 2000 } },
    });

    await postEvent(server.baseUrl, {
      session_id: "s-cost-b",
      type: "assistant_message",
      timestamp: t3,
      content: "b",
      data: { model: "gpt-4o", usage: { input_tokens: 1000, output_tokens: 2000 } },
    });

    const all = await fetchJson(buildUrl(server.baseUrl, "/api/cost", { from: t0, to: t2 }), {
      method: "GET",
    });
    assert.equal(all.status, 200);
    assert.equal(all.json.top_sessions.length, 1);
    assert.equal(all.json.top_sessions[0].id, "s-cost-a");
    assert.ok(all.json.top_sessions[0].cost > 0);
    assert.equal(all.json.top_sessions[0].token, 3000);
    assert.equal(all.json.daily.length, 1);
    assert.equal(all.json.daily[0].token, 3000);
    assert.ok(all.json.daily[0].cost > 0);

    const onlyMini = await fetchJson(
      buildUrl(server.baseUrl, "/api/cost", { from: t0, to: t2, model: "gpt-4o-mini" }),
      { method: "GET" }
    );
    assert.equal(onlyMini.status, 200);
    assert.equal(onlyMini.json.top_sessions.length, 1);
    assert.equal(onlyMini.json.top_sessions[0].id, "s-cost-a");

    const onlyGpt4o = await fetchJson(
      buildUrl(server.baseUrl, "/api/cost", { from: t2, to: "2026-01-01T00:10:00.000Z", model: "gpt-4o" }),
      { method: "GET" }
    );
    assert.equal(onlyGpt4o.status, 200);
    assert.equal(onlyGpt4o.json.top_sessions.length, 1);
    assert.equal(onlyGpt4o.json.top_sessions[0].id, "s-cost-b");
  } finally {
    await server.close();
  }
});

test("perf：写入 tool_call/tool_result 后返回分位与慢榜，并且 tool_name/has_error/min_duration_ms/model/from/to 过滤生效", async () => {
  const server = await startTestServer();
  try {
    const t0 = "2026-01-01T00:00:00.000Z";
    const t1 = "2026-01-01T00:00:01.000Z";
    const t2 = "2026-01-01T00:00:02.000Z";
    const t3 = "2026-01-01T00:00:03.000Z";
    const t4 = "2026-01-01T00:00:04.000Z";
    const t5 = "2026-01-01T00:00:05.000Z";
    const t6 = "2026-01-01T00:00:06.000Z";

    await postEvent(server.baseUrl, {
      session_id: "s-perf",
      type: "tool_call",
      timestamp: t1,
      content: [{ type: "tool_use", id: "tc-slow", name: "slowTool", input: {} }],
      data: { model: "gpt-4o-mini" },
    });
    await postEvent(server.baseUrl, {
      session_id: "s-perf",
      type: "tool_result",
      timestamp: t2,
      duration_ms: 500,
      content: [{ type: "tool_result", id: "tc-slow", content: "ok", is_error: false }],
      data: { model: "gpt-4o-mini" },
    });

    await postEvent(server.baseUrl, {
      session_id: "s-perf",
      type: "tool_call",
      timestamp: t3,
      content: [{ type: "tool_use", id: "tc-fast", name: "fastTool", input: {} }],
      data: { model: "gpt-4o-mini" },
    });
    await postEvent(server.baseUrl, {
      session_id: "s-perf",
      type: "tool_result",
      timestamp: t4,
      duration_ms: 50,
      content: [{ type: "tool_result", id: "tc-fast", content: "ok", is_error: false }],
      data: { model: "gpt-4o-mini" },
    });

    await postEvent(server.baseUrl, {
      session_id: "s-perf",
      type: "tool_call",
      timestamp: t5,
      content: [{ type: "tool_use", id: "tc-err", name: "errTool", input: {} }],
      data: { model: "gpt-4o-mini" },
    });
    await postEvent(server.baseUrl, {
      session_id: "s-perf",
      type: "tool_result",
      timestamp: t6,
      duration_ms: 400,
      content: [{ type: "tool_result", id: "tc-err", content: "boom", is_error: true }],
      data: { model: "gpt-4o-mini" },
    });

    const all = await fetchJson(buildUrl(server.baseUrl, "/api/perf", { from: t0, to: "2026-01-01T00:00:10.000Z" }), {
      method: "GET",
    });
    assert.equal(all.status, 200);
    assert.equal(all.json.tool_duration_quantiles.count, 3);
    assert.equal(all.json.slow_tools.length, 3);
    assert.equal(all.json.slow_tools[0].tool_name, "slowTool");
    assert.equal(all.json.slow_tools[0].duration_ms, 500);

    const onlyFast = await fetchJson(buildUrl(server.baseUrl, "/api/perf", { from: t0, to: "2026-01-01T00:00:10.000Z", tool_name: "fastTool" }), {
      method: "GET",
    });
    assert.equal(onlyFast.status, 200);
    assert.equal(onlyFast.json.tool_duration_quantiles.count, 1);
    assert.equal(onlyFast.json.slow_tools.length, 1);
    assert.equal(onlyFast.json.slow_tools[0].tool_name, "fastTool");
    assert.equal(onlyFast.json.slow_tools[0].duration_ms, 50);

    const minDuration = await fetchJson(buildUrl(server.baseUrl, "/api/perf", { from: t0, to: "2026-01-01T00:00:10.000Z", min_duration_ms: 100 }), {
      method: "GET",
    });
    assert.equal(minDuration.status, 200);
    assert.equal(minDuration.json.tool_duration_quantiles.count, 2);
    assert.equal(minDuration.json.slow_tools.length, 2);
    assert.ok(minDuration.json.slow_tools.every((r) => r.duration_ms >= 100));

    const onlyError = await fetchJson(buildUrl(server.baseUrl, "/api/perf", { from: t0, to: "2026-01-01T00:00:10.000Z", has_error: 1 }), {
      method: "GET",
    });
    assert.equal(onlyError.status, 200);
    assert.equal(onlyError.json.tool_duration_quantiles.count, 1);
    assert.equal(onlyError.json.slow_tools.length, 1);
    assert.equal(onlyError.json.slow_tools[0].tool_name, "errTool");
    assert.equal(onlyError.json.slow_tools[0].has_error, 1);

    const noneByModel = await fetchJson(buildUrl(server.baseUrl, "/api/perf", { from: t0, to: "2026-01-01T00:00:10.000Z", model: "gpt-4o" }), {
      method: "GET",
    });
    assert.equal(noneByModel.status, 200);
    assert.equal(noneByModel.json.tool_duration_quantiles.count, 0);
    assert.equal(noneByModel.json.slow_tools.length, 0);
  } finally {
    await server.close();
  }
});

test("errors：写入错误后返回聚合，并且 tool_name/has_error/min_duration_ms/model/from/to 过滤生效", async () => {
  const server = await startTestServer();
  try {
    const t0 = "2026-01-01T00:00:00.000Z";
    const t1 = "2026-01-01T00:00:01.000Z";
    const t2 = "2026-01-01T00:00:02.000Z";
    const t3 = "2026-01-01T00:00:03.000Z";
    const t4 = "2026-01-01T00:00:04.000Z";
    const t5 = "2026-01-01T00:00:05.000Z";
    const t6 = "2026-01-01T00:00:06.000Z";
    const t7 = "2026-01-01T00:00:07.000Z";

    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "assistant_message",
      timestamp: t1,
      content: "ok",
      data: { model: "gpt-4o-mini" },
    });

    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "tool_call",
      timestamp: t2,
      content: [{ type: "tool_use", id: "tc-bad-1", name: "badTool", input: {} }],
      data: { model: "gpt-4o-mini" },
    });
    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "tool_result",
      timestamp: t3,
      duration_ms: 200,
      content: [{ type: "tool_result", id: "tc-bad-1", content: "boom", is_error: true }],
      data: { model: "gpt-4o-mini" },
    });

    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "tool_call",
      timestamp: t4,
      content: [{ type: "tool_use", id: "tc-bad-2", name: "badTool", input: {} }],
      data: { model: "gpt-4o-mini" },
    });
    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "tool_result",
      timestamp: t5,
      duration_ms: 210,
      content: [{ type: "tool_result", id: "tc-bad-2", content: "boom", is_error: true }],
      data: { model: "gpt-4o-mini" },
    });

    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "tool_call",
      timestamp: t6,
      content: [{ type: "tool_use", id: "tc-other-1", name: "otherTool", input: {} }],
      data: { model: "gpt-4o" },
    });
    await postEvent(server.baseUrl, {
      session_id: "s-errors",
      type: "tool_result",
      timestamp: t7,
      duration_ms: 220,
      content: [{ type: "tool_result", id: "tc-other-1", content: "oops", is_error: true }],
      data: { model: "gpt-4o" },
    });

    const all = await fetchJson(buildUrl(server.baseUrl, "/api/errors", { from: t0, to: "2026-01-01T00:00:10.000Z" }), { method: "GET" });
    assert.equal(all.status, 200);
    assert.equal(all.json.top_error_tools[0].tool_name, "badTool");
    assert.equal(all.json.top_error_tools[0].error_count, 2);
    assert.ok(all.json.top_error_messages.some((r) => r.error_message === "boom" && r.error_count === 2));

    const onlyOtherTool = await fetchJson(buildUrl(server.baseUrl, "/api/errors", { from: t0, to: "2026-01-01T00:00:10.000Z", tool_name: "otherTool" }), { method: "GET" });
    assert.equal(onlyOtherTool.status, 200);
    assert.equal(onlyOtherTool.json.top_error_tools.length, 1);
    assert.equal(onlyOtherTool.json.top_error_tools[0].tool_name, "otherTool");
    assert.equal(onlyOtherTool.json.top_error_tools[0].error_count, 1);
    assert.ok(onlyOtherTool.json.top_error_messages.some((r) => r.error_message === "oops" && r.error_count === 1));

    const onlyGpt4o = await fetchJson(buildUrl(server.baseUrl, "/api/errors", { from: t0, to: "2026-01-01T00:00:10.000Z", model: "gpt-4o" }), { method: "GET" });
    assert.equal(onlyGpt4o.status, 200);
    assert.equal(onlyGpt4o.json.top_error_tools.length, 1);
    assert.equal(onlyGpt4o.json.top_error_tools[0].tool_name, "otherTool");

    const minDuration = await fetchJson(buildUrl(server.baseUrl, "/api/errors", { from: t0, to: "2026-01-01T00:00:10.000Z", min_duration_ms: 215 }), { method: "GET" });
    assert.equal(minDuration.status, 200);
    assert.equal(minDuration.json.top_error_tools.length, 1);
    assert.equal(minDuration.json.top_error_tools[0].tool_name, "otherTool");

    const onlyOkEvents = await fetchJson(buildUrl(server.baseUrl, "/api/errors", { from: t0, to: "2026-01-01T00:00:10.000Z", has_error: 0 }), { method: "GET" });
    assert.equal(onlyOkEvents.status, 200);
    assert.ok(onlyOkEvents.json.error_rate.total >= 1);
    assert.equal(onlyOkEvents.json.error_rate.error, 0);
    assert.equal(onlyOkEvents.json.error_rate.error_rate, 0);

    const onlyErrorEvents = await fetchJson(buildUrl(server.baseUrl, "/api/errors", { from: t0, to: "2026-01-01T00:00:10.000Z", has_error: 1 }), { method: "GET" });
    assert.equal(onlyErrorEvents.status, 200);
    assert.ok(onlyErrorEvents.json.error_rate.total >= 1);
    assert.equal(onlyErrorEvents.json.error_rate.error, onlyErrorEvents.json.error_rate.total);
  } finally {
    await server.close();
  }
});

