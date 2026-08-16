import test from "node:test";
import assert from "node:assert/strict";
import { createModelConversationService, MODEL_CONVERSATION_HANDLE_CHANNELS } from "../electron/services/model-conversation-service.js";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";

function ipcDouble() {
  const handlers = new Map();
  return {
    handlers,
    raw: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) }
  };
}

function trustedEvent(url = "http://localhost:5173") {
  const mainFrame = { url };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

function createService(overrides = {}) {
  const ipc = ipcDouble();
  const trustedIpc = createTrustedIpcRegistrar(ipc.raw, {
    isDev: true, devServerUrl: "http://localhost:5173", rendererRoot: "dist"
  });
  const dependencies = {
    buildAgentReply: async (_baseDir, payload) => ({ reply: payload.message, knowledge: [], meta: {} }),
    testDeepSeekConnection: async () => ({ ok: true }),
    generatePersonaCardDraft: async () => ({ name: "draft" }),
    generateStartupGreeting: async () => "hello",
    ...overrides.dependencies
  };
  const service = createModelConversationService({
    trustedIpc, getBaseDir: () => "base", getConfig: () => ({}), loadConfig: async () => ({}),
    mergeConfig: (value) => value, fetch: overrides.fetch || (async () => {}), dependencies
  });
  return { ipc, service };
}

test("model service owns its trusted IPC surface and rejects foreign or child frames", async () => {
  const { ipc, service } = createService();
  service.registerIpc((payload) => service.generateReply(payload));
  assert.deepEqual([...ipc.handlers.keys()], [...MODEL_CONVERSATION_HANDLE_CHANNELS]);
  assert.equal((await ipc.handlers.get("agent:chat")(trustedEvent(), { message: "hi" })).reply, "hi");
  assert.throws(() => ipc.handlers.get("agent:chat")(trustedEvent("https://example.com"), { message: "x" }), /拒绝/);
  const mainFrame = { url: "http://localhost:5173" };
  assert.throws(() => ipc.handlers.get("agent:chat")({ senderFrame: { url: mainFrame.url }, sender: { mainFrame } }, { message: "x" }), /拒绝/);
  await service.dispose();
  assert.equal(ipc.handlers.size, 0);
  await service.dispose();
});

test("model service forwards streaming, fetch, and cancellation to the model pipeline", async () => {
  const sentinelFetch = async () => {};
  let received;
  let release;
  const { service } = createService({
    fetch: sentinelFetch,
    dependencies: {
      buildAgentReply: async (_baseDir, payload) => {
        received = payload;
        await new Promise((resolve, reject) => {
          release = resolve;
          payload.signal.addEventListener("abort", () => reject(payload.signal.reason), { once: true });
        });
      }
    }
  });
  const running = service.generateReply({ message: "hi" }, { onDelta: () => {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received.fetchImpl, sentinelFetch);
  assert.equal(received.stream, true);
  const stopping = service.stop();
  await assert.rejects(running, /停止/);
  await stopping;
  release?.();
});

test("model IPC registration rolls back when a later channel fails", () => {
  const handlers = new Map();
  const trustedIpc = {
    handle(channel, handler) {
      if (channel === "agent:test-deepseek") throw new Error("register failed");
      handlers.set(channel, handler);
    },
    removeHandler: (channel) => handlers.delete(channel)
  };
  const service = createModelConversationService({
    trustedIpc, getBaseDir: () => "base", getConfig: () => ({}), loadConfig: async () => ({}),
    mergeConfig: (value) => value, fetch: async () => {}, dependencies: {}
  });
  assert.throws(() => service.registerIpc(() => {}), /register failed/);
  assert.equal(handlers.size, 0);
});
