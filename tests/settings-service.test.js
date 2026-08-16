import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsService, SETTINGS_HANDLE_CHANNELS } from "../electron/services/settings-service.js";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";

function ipcDouble() {
  const handlers = new Map();
  return {
    handlers,
    raw: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel)
    }
  };
}

function trustedEvent(url = "http://localhost:5173") {
  const mainFrame = { url };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

function makeHarness(overrides = {}) {
  const ipc = ipcDouble();
  const trustedIpc = createTrustedIpcRegistrar(ipc.raw, {
    isDev: true, devServerUrl: "http://localhost:5173", rendererRoot: "dist"
  });
  const calls = [];
  let config = { appearance: { mouseFollow: true, hoverAutoHide: false } };
  const dependencies = {
    getConfigPath: () => "CONFIG_PATH",
    getMemoryDatabaseStats: async () => ({ messages: 2 }),
    listKnowledgeFiles: async () => ["knowledge.md"],
    listPersonaCards: async () => [{ id: "persona", isActive: true }],
    loadConfig: async () => ({ source: "stored" }),
    loadRelationshipProfile: async () => ({ emotion: "calm" }),
    resetStoredRelationshipProfile: async () => ({ emotion: "reset" }),
    saveConfig: async (_baseDir, value) => { calls.push(["save", value]); },
    testAstrBotConnection: async () => ({ bots: [{ id: "bot" }] }),
    ...overrides.dependencies
  };
  const service = createSettingsService({
    trustedIpc,
    getBaseDir: () => "base",
    getConfig: () => config,
    mergeConfig: (value) => ({ ...value, merged: true }),
    loadRuntimePersona: async (storedConfig) => {
      const nextConfig = { ...storedConfig, activePersona: true };
      config = nextConfig;
      return { card: { id: "persona" }, cards: dependencies ? await dependencies.listPersonaCards("base") : [], config: nextConfig };
    },
    getLive2DModels: () => [{ id: "qianqian" }],
    getStartupStatus: () => ({ phase: "renderer" }),
    getStartupDiagnostics: () => ({ rag: { ok: true } }),
    beforeConfigApplied: (previous, next) => { calls.push(["before", previous, next]); },
    afterConfigApplied: async (next) => { calls.push(["after", next]); },
    broadcastRelationshipProfile: (profile) => { calls.push(["relationship", profile]); },
    dependencies
  });
  return { calls, config: () => config, ipc, service, setConfig: (next) => { config = next; } };
}

test("settings service owns bootstrap, startup, config, AstrBot, and relationship IPC", async () => {
  const harness = makeHarness();
  harness.service.registerIpc();
  assert.deepEqual([...harness.ipc.handlers.keys()], [...SETTINGS_HANDLE_CHANNELS]);

  const bootstrap = await harness.ipc.handlers.get("agent:get-bootstrap")(trustedEvent());
  assert.equal(bootstrap.config.activePersona, true);
  assert.equal(bootstrap.activePersonaCard.id, "persona");
  assert.deepEqual(bootstrap.personaCards, [{ id: "persona", isActive: true }]);
  assert.deepEqual(bootstrap.memoryDatabase, { messages: 2 });
  assert.deepEqual(bootstrap.startupDiagnostics, { rag: { ok: true } });
  assert.deepEqual(bootstrap.relationshipProfile, { emotion: "calm" });
  assert.deepEqual(bootstrap.live2dModels, [{ id: "qianqian" }]);
  assert.deepEqual(bootstrap.knowledgeFiles, ["knowledge.md"]);
  assert.deepEqual(bootstrap.runtime, { mode: "desktop", configPath: "CONFIG_PATH" });
  assert.equal(bootstrap.abilities.length, 12);

  assert.deepEqual(await harness.ipc.handlers.get("agent:get-startup-status")(trustedEvent()), { phase: "renderer" });
  assert.deepEqual(await harness.ipc.handlers.get("agent:test-astrbot")(trustedEvent(), { baseUrl: "override" }), {
    ok: true,
    message: "AstrBot 已连接，发现 1 个可用机器人/平台。",
    bots: [{ id: "bot" }]
  });
  assert.deepEqual(await harness.ipc.handlers.get("agent:reset-relationship-profile")(trustedEvent()), { emotion: "reset" });
  assert.deepEqual(harness.calls.at(-1), ["relationship", { emotion: "reset" }]);

  const mainFrame = { url: "http://localhost:5173" };
  assert.throws(() => harness.ipc.handlers.get("agent:get-bootstrap")({ senderFrame: { url: mainFrame.url, id: 2 }, sender: { mainFrame } }), /拒绝/);
  assert.throws(() => harness.ipc.handlers.get("agent:get-bootstrap")(trustedEvent("https://example.com")), /拒绝/);
  await harness.service.dispose();
  assert.equal(harness.ipc.handlers.size, 0);
  await harness.service.dispose();
});

test("settings save preserves the old side-effect ordering and return shape", async () => {
  const harness = makeHarness();
  harness.service.registerIpc();
  const result = await harness.ipc.handlers.get("agent:save-config")(trustedEvent(), { source: "next" });
  assert.equal(result.merged, true);
  assert.equal(result.activePersona, true);
  assert.equal(harness.calls[0][0], "save");
  assert.equal(harness.calls[1][0], "before");
  assert.equal(harness.calls[2][0], "after");
});

test("settings service reports lifecycle and rolls back partial registration", async () => {
  const harness = makeHarness();
  await harness.service.start();
  assert.equal(harness.service.snapshot().started, true);
  harness.service.stop();
  assert.equal(harness.service.snapshot().started, false);
  harness.service.dispose();

  const handlers = new Map();
  const service = createSettingsService({
    trustedIpc: {
      handle(channel) {
        if (channel === "agent:get-startup-status") throw new Error("register failed");
        handlers.set(channel, () => {});
      },
      removeHandler: (channel) => handlers.delete(channel)
    },
    getBaseDir: () => "base",
    getConfig: () => ({}),
    mergeConfig: (value) => value,
    loadRuntimePersona: async (config) => ({ card: null, cards: [], config }),
    getLive2DModels: () => [],
    getStartupStatus: () => ({}),
    getStartupDiagnostics: () => ({}),
    dependencies: {}
  });
  assert.throws(() => service.registerIpc(), /register failed/);
  assert.equal(handlers.size, 0);
});
