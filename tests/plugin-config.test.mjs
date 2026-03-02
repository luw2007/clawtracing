import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;

function createApi(pluginConfig) {
  const hooks = new Map();
  const logs = [];

  return {
    api: {
      config: {},
      pluginConfig,
      logger: {
        info(message) {
          logs.push({ level: "info", message });
        },
        warn(message) {
          logs.push({ level: "warn", message });
        },
        error(message) {
          logs.push({ level: "error", message });
        },
      },
      on(hookName, handler) {
        hooks.set(hookName, handler);
      },
    },
    hooks,
    logs,
  };
}

test("pluginConfig 支持 config 包裹层", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    statusText: "OK",
    text: async () => "",
  });

  const { default: tracingPlugin } = await import("../dist/plugin/index.js");
  const { api, hooks, logs } = createApi({
    config: { serverUrl: "http://example.com:9999", debug: true },
  });

  tracingPlugin.activate(api);

  const log = logs.find((l) => l.level === "info" && l.message.includes("plugin activated"));
  assert.ok(log);
  assert.ok(log.message.includes("http://example.com:9999"));

  const stop = hooks.get("gateway_stop");
  assert.equal(typeof stop, "function");
  await stop({ reason: "test" }, {});
});

test("pluginConfig 兼容无 config 的旧结构", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    statusText: "OK",
    text: async () => "",
  });

  const { default: tracingPlugin } = await import("../dist/plugin/index.js");
  const { api, hooks, logs } = createApi({
    serverUrl: "http://example.com:7777",
    debug: false,
  });

  tracingPlugin.activate(api);

  const log = logs.find((l) => l.level === "info" && l.message.includes("plugin activated"));
  assert.ok(log);
  assert.ok(log.message.includes("http://example.com:7777"));

  const stop = hooks.get("gateway_stop");
  assert.equal(typeof stop, "function");
  await stop({ reason: "test" }, {});
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

