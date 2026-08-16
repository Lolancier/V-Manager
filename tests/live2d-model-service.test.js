import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLive2DModelService, LIVE2D_MODEL_HANDLE_CHANNELS } from "../electron/services/live2d-model-service.js";
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

function makeHarness(baseDir) {
  const ipc = ipcDouble();
  const trustedIpc = createTrustedIpcRegistrar(ipc.raw, {
    isDev: true, devServerUrl: "http://localhost:5173", rendererRoot: "dist"
  });
  const watchers = [];
  const timers = new Map();
  const broadcasts = [];
  const saved = [];
  const opened = [];
  let timerId = 0;
  let config = { appearance: { live2dModel: "missing" } };
  const service = createLive2DModelService({
    trustedIpc,
    getBaseDir: () => baseDir,
    getConfig: () => config,
    setConfig: (next) => { config = next; },
    mergeConfig: (value) => ({ ...value, appearance: { ...value.appearance } }),
    saveConfig: async (_baseDir, value) => { saved.push(value); },
    broadcastConfigUpdated: (value) => broadcasts.push({ type: "config", value }),
    broadcastModels: (models) => broadcasts.push({ type: "models", value: models }),
    openPath: async (target) => { opened.push(target); return "opened"; },
    setTimeout: (callback) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    dependencies: {
      watch: (target, options, callback) => {
        const watcher = { target, options, callback, closed: false, close() { this.closed = true; } };
        watchers.push(watcher);
        return watcher;
      }
    }
  });
  return { broadcasts, config: () => config, ipc, opened, saved, service, timers, watchers };
}

async function writeCustomModel(baseDir) {
  const root = path.join(baseDir, "agent-data", "models", "custom");
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "model.moc3"), "moc");
  await fs.writeFile(path.join(root, "texture.png"), "texture");
  await fs.writeFile(path.join(root, "model.model3.json"), JSON.stringify({
    FileReferences: {
      Moc: "model.moc3",
      Textures: ["texture.png"],
      Expressions: [{ Name: "smile" }],
      DisplayInfo: "display.json"
    },
    Motions: { Idle: [] },
    Groups: [{ Name: "LipSync", Ids: ["ParamMouthOpenY"] }]
  }));
  return root;
}

test("Live2D service scans custom models, maps private roots, and repairs invalid selections", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-live2d-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  const customRoot = await writeCustomModel(baseDir);
  const harness = makeHarness(baseDir);
  harness.service.registerIpc();

  const models = await harness.ipc.handlers.get("agent:refresh-live2d-models")(trustedEvent());
  const custom = models.find((model) => !model.builtIn);
  assert.equal(custom.label, "model");
  assert.equal(custom.capabilities.expressionCount, 1);
  assert.equal(custom.capabilities.hasLipSync, true);
  assert.equal(custom.directory, `vivi-model://local/${encodeURIComponent(custom.id)}/`);
  assert.equal("root" in custom, false);
  assert.equal(path.resolve(harness.service.getModelRoot(custom.id)), path.resolve(customRoot));
  assert.equal(harness.config().appearance.live2dModel, "qianqian");
  assert.equal(harness.saved.length, 1);
  assert.deepEqual(harness.broadcasts[0], { type: "config", value: harness.config() });
  assert.deepEqual(harness.broadcasts[1], { type: "models", value: models });
  assert.deepEqual(await harness.ipc.handlers.get("agent:get-live2d-models")(trustedEvent()), models);

  assert.equal(await harness.ipc.handlers.get("agent:open-live2d-models-folder")(trustedEvent()), "opened");
  assert.deepEqual(harness.opened, [path.join(baseDir, "agent-data", "models")]);
  assert.throws(() => harness.ipc.handlers.get("agent:get-live2d-models")({ senderFrame: { url: "http://localhost:5173" }, sender: { mainFrame: { url: "http://localhost:5173" } } }), /拒绝/);
  assert.throws(() => harness.ipc.handlers.get("agent:get-live2d-models")(trustedEvent("https://example.com")), /拒绝/);
  await harness.service.dispose();
  assert.equal(harness.ipc.handlers.size, 0);
  await harness.service.dispose();
});

test("Live2D service owns watcher and timer cleanup through start, stop, and dispose", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-live2d-watch-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  await writeCustomModel(baseDir);
  const harness = makeHarness(baseDir);
  harness.service.registerIpc();
  await harness.service.start({ broadcast: false });

  assert.equal(harness.watchers.length, 1);
  assert.equal(harness.service.snapshot().started, true);
  harness.watchers[0].callback("rename", "model.model3.json");
  assert.equal(harness.timers.size, 1);
  harness.service.stop();
  assert.equal(harness.watchers[0].closed, true);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.service.snapshot().started, false);
  harness.service.dispose();
  assert.equal(harness.ipc.handlers.size, 0);
});

test("Live2D service rolls back partial IPC registration", () => {
  const handlers = new Set();
  const service = createLive2DModelService({
    trustedIpc: {
      handle(channel) {
        if (channel === "agent:refresh-live2d-models") throw new Error("failed");
        handlers.add(channel);
      },
      removeHandler: (channel) => handlers.delete(channel)
    },
    getBaseDir: () => "base",
    getConfig: () => ({}),
    setConfig: () => {},
    mergeConfig: (value) => value,
    saveConfig: async () => {},
    dependencies: { watch: () => ({ close: () => {} }) }
  });
  assert.deepEqual(LIVE2D_MODEL_HANDLE_CHANNELS, [
    "agent:get-live2d-models",
    "agent:refresh-live2d-models",
    "agent:open-live2d-models-folder"
  ]);
  assert.throws(() => service.registerIpc(), /failed/);
  assert.equal(handlers.size, 0);
});
