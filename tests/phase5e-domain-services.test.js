import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";
import { createTrustedDomainIpcService } from "../electron/services/trusted-domain-ipc-service.js";
import {
  SYSTEM_RESOURCE_HANDLE_CHANNELS,
  createSystemResourceService
} from "../electron/services/system-resource-service.js";
import {
  FILE_MANAGER_HANDLE_CHANNELS,
  createFileManagerService
} from "../electron/services/file-manager-service.js";
import {
  HOST_SHELL_HANDLE_CHANNELS,
  createHostShellService
} from "../electron/services/host-shell-service.js";
import {
  COMPANION_LIFE_HANDLE_CHANNELS,
  createCompanionLifeService
} from "../electron/services/companion-life-service.js";

function ipcDouble() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    raw: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
      on: (channel, listener) => {
        const channelListeners = listeners.get(channel) || [];
        channelListeners.push(listener);
        listeners.set(channel, channelListeners);
        return () => {
          listeners.set(channel, (listeners.get(channel) || []).filter((item) => item !== listener));
        };
      },
      removeListener: (channel, listener) => {
        listeners.set(channel, (listeners.get(channel) || []).filter((item) => item !== listener));
      }
    }
  };
}

function trustedEvent(url = "http://localhost:5173") {
  const mainFrame = { url };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

function makeRegistrar(ipc = ipcDouble()) {
  return {
    ipc,
    trustedIpc: createTrustedIpcRegistrar(ipc.raw, {
      isDev: true,
      devServerUrl: "http://localhost:5173",
      rendererRoot: "dist"
    })
  };
}

test("shared domain IPC runtime is rollback-safe and lifecycle-idempotent", async () => {
  const { ipc, trustedIpc } = makeRegistrar();
  const removed = [];
  const service = createTrustedDomainIpcService({
    serviceName: "测试服务",
    trustedIpc,
    listeners: [{ channel: "agent:test-event", listener: () => {} }],
    handlers: [
      { channel: "agent:first", listener: () => "first" },
      { channel: "agent:second", listener: () => "second" }
    ]
  });

  const rollbackService = createTrustedDomainIpcService({
    serviceName: "测试服务",
    trustedIpc: {
      on: () => () => {},
      handle(channel) {
        if (channel === "agent:second") throw new Error("registration failed");
      },
      removeHandler: (channel) => removed.push(channel)
    },
    listeners: [{ channel: "agent:test-event", listener: () => {} }],
    handlers: [
      { channel: "agent:first", listener: () => "first" },
      { channel: "agent:second", listener: () => "second" }
    ]
  });
  assert.throws(() => rollbackService.registerIpc(), /registration failed/);
  assert.deepEqual(removed, ["agent:first"]);
  assert.deepEqual(rollbackService.snapshot().handles, []);

  service.registerIpc().start();
  assert.deepEqual(service.snapshot().handles, ["agent:first", "agent:second"]);
  service.stop();
  await assert.rejects(ipc.handlers.get("agent:first")(trustedEvent()), /尚未启动/);
  service.start();
  assert.equal(await ipc.handlers.get("agent:first")(trustedEvent()), "first");
  service.dispose();
  service.dispose();
  assert.equal(ipc.handlers.size, 0);
  assert.deepEqual(ipc.listeners.get("agent:test-event"), []);
  assert.equal(service.snapshot().disposed, true);
});

test("system resource service preserves arguments, returns, and trust boundary", async () => {
  const calls = [];
  const dependencies = {
    searchLocalFiles: async (query) => { calls.push(["search", query]); return [{ path: query }]; },
    getAppRegistrySnapshot: async (baseDir) => { calls.push(["registry", baseDir]); return { entries: 1 }; },
    rebuildAppRegistry: async (baseDir) => { calls.push(["rebuild", baseDir]); return { entries: 2 }; },
    getSystemResourceSnapshot: async () => ({ cpu: 0.2 })
  };
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createSystemResourceService({
    trustedIpc,
    getBaseDir: () => "user-data",
    isAutoLaunchEnabled: () => true,
    setAutoLaunchEnabled: (enabled) => { calls.push(["auto-launch", enabled]); return enabled; },
    dependencies
  });
  service.registerIpc().start();

  assert.deepEqual(SYSTEM_RESOURCE_HANDLE_CHANNELS, [
    "agent:get-auto-launch",
    "agent:set-auto-launch",
    "agent:search-files",
    "agent:get-app-registry",
    "agent:refresh-app-registry",
    "agent:get-system-resource-snapshot"
  ]);
  assert.equal(await ipc.handlers.get("agent:get-auto-launch")(trustedEvent()), true);
  assert.equal(await ipc.handlers.get("agent:set-auto-launch")(trustedEvent(), 0), 0);
  assert.deepEqual(await ipc.handlers.get("agent:search-files")(trustedEvent(), "报告"), [{ path: "报告" }]);
  assert.deepEqual(await ipc.handlers.get("agent:get-app-registry")(trustedEvent()), { entries: 1 });
  assert.deepEqual(await ipc.handlers.get("agent:refresh-app-registry")(trustedEvent()), { entries: 2 });
  assert.deepEqual(await ipc.handlers.get("agent:get-system-resource-snapshot")(trustedEvent()), { cpu: 0.2 });
  assert.throws(() => ipc.handlers.get("agent:search-files")(trustedEvent("https://example.com")), /拒绝/);
  assert.deepEqual(calls, [
    ["auto-launch", 0],
    ["search", "报告"],
    ["registry", "user-data"],
    ["rebuild", "user-data"]
  ]);
  service.dispose();
});

test("file manager service forwards paths and organization arguments unchanged", async () => {
  const calls = [];
  const dependencies = {
    getFileManagerSnapshot: async () => ({ roots: [] }),
    scanManagedDirectory: async (target) => { calls.push(["scan", target]); return { target }; },
    createOrganizationPreview: async (baseDir, target, options) => { calls.push(["preview", baseDir, target, options]); return { id: "preview" }; },
    executeOrganizationPreview: async (baseDir, previewId) => { calls.push(["execute", baseDir, previewId]); return { ok: true }; },
    listFileOperations: async (baseDir) => { calls.push(["list", baseDir]); return []; },
    undoFileOperation: async (baseDir, operationId) => { calls.push(["undo", baseDir, operationId]); return { undone: true }; }
  };
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createFileManagerService({ trustedIpc, getBaseDir: () => "base", dependencies });
  service.registerIpc().start();

  assert.equal(FILE_MANAGER_HANDLE_CHANNELS.length, 6);
  assert.deepEqual(await ipc.handlers.get("agent:scan-managed-directory")(trustedEvent(), "D:/docs"), { target: "D:/docs" });
  assert.deepEqual(await ipc.handlers.get("agent:preview-file-organization")(trustedEvent(), "D:/docs", "type", 1), { id: "preview" });
  assert.deepEqual(await ipc.handlers.get("agent:execute-file-organization")(trustedEvent(), "preview"), { ok: true });
  assert.deepEqual(await ipc.handlers.get("agent:list-file-operations")(trustedEvent()), []);
  assert.deepEqual(await ipc.handlers.get("agent:undo-file-operation")(trustedEvent(), "op"), { undone: true });
  assert.deepEqual(calls, [
    ["scan", "D:/docs"],
    ["preview", "base", "D:/docs", { mode: "type", quarantine: true }],
    ["execute", "base", "preview"],
    ["list", "base"],
    ["undo", "base", "op"]
  ]);
});

test("host shell service validates external URLs and owns data-path side effects", async () => {
  const calls = [];
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createHostShellService({
    trustedIpc,
    getBaseDir: () => "C:/userData",
    openExternal: async (target) => { calls.push(["external", target]); },
    openPath: async (target) => { calls.push(["open", target]); },
    showItemInFolder: (target) => { calls.push(["show", target]); },
    dependencies: {
      fs: {
        mkdir: async () => {},
        stat: async () => ({ isFile: () => true })
      }
    }
  });
  service.registerIpc().start();

  assert.equal(await ipc.handlers.get("agent:open-external")(trustedEvent(), "https://example.com/a?b=1"), true);
  await assert.rejects(ipc.handlers.get("agent:open-external")(trustedEvent(), "file:///C:/Windows/system32.dll"), /HTTP 或 HTTPS/);
  assert.equal((await ipc.handlers.get("agent:get-data-path")(trustedEvent())).dataDir, path.join("C:/userData", "agent-data"));
  assert.equal(await ipc.handlers.get("agent:open-data-folder")(trustedEvent()), true);
  assert.equal(await ipc.handlers.get("agent:open-persona-folder")(trustedEvent()), path.join("C:/userData", "agent-data", "storage", "vivi.sqlite"));
  assert.deepEqual(HOST_SHELL_HANDLE_CHANNELS, [
    "agent:open-external",
    "agent:get-data-path",
    "agent:open-data-folder",
    "agent:open-persona-folder"
  ]);
  assert.deepEqual(calls, [
    ["external", "https://example.com/a?b=1"],
    ["open", path.join("C:/userData", "agent-data")],
    ["show", path.join("C:/userData", "agent-data", "storage", "vivi.sqlite")]
  ]);
  service.dispose();
});

test("companion life service preserves pet-touch state transitions and cooldowns", async () => {
  const calls = [];
  let currentLifeState = null;
  let chatState = {
    messages: [{ role: "assistant", content: "旧触碰" }],
    lastReplyMeta: { sourceLabel: "触碰互动" }
  };
  const broadcasts = [];
  const reaction = {
    reply: "新触碰",
    mood: "happy",
    faceParams: { mouth: 1 },
    profile: { affection: 2 }
  };
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createCompanionLifeService({
    trustedIpc,
    getBaseDir: () => "base",
    dependencies: {
      loadConfig: async () => ({ relationship: { enabled: true } }),
      loadLifeState: async () => ({ paused: false }),
      pauseProactiveForToday: async () => ({ paused: true }),
      resetWorkSession: async () => ({ workSession: null }),
      recordPetTouch: async (_baseDir, input) => { calls.push(["touch", input]); return reaction; }
    },
    getLifeState: () => currentLifeState,
    setLifeState: (state) => { currentLifeState = state; },
    onLifeStateUpdated: (state) => broadcasts.push(state),
    markOwnerInteraction: async () => { calls.push(["owner"]); },
    isAutonomousBusy: () => false,
    getCaughtInterestReply: async () => ({}),
    publishInterestInteraction: (reply, mood) => { calls.push(["interest", reply, mood]); },
    getChatState: () => chatState,
    setChatState: (state) => { chatState = state; },
    broadcastChatState: () => broadcasts.push("chat"),
    broadcastRelationshipProfile: (profile) => broadcasts.push(profile),
    broadcastMoodUpdate: (payload) => broadcasts.push(payload),
    mergeConfig: (config) => config,
    now: (() => {
      let current = 2000;
      return () => {
        current += 600;
        return current;
      };
    })()
  });
  service.registerIpc().start();

  assert.deepEqual(await ipc.handlers.get("agent:get-life-state")(trustedEvent()), { paused: false });
  assert.deepEqual(await ipc.handlers.get("agent:pause-proactive-today")(trustedEvent()), { paused: true });
  assert.deepEqual(await ipc.handlers.get("agent:reset-work-session")(trustedEvent()), { workSession: null });

  const result = await ipc.handlers.get("agent:pet-touch")(trustedEvent());
  assert.equal(result.ok, true);
  assert.equal(result.reply, "新触碰");
  assert.deepEqual(chatState.messages, [{ role: "assistant", content: "新触碰" }]);
  assert.equal(chatState.lastReplyMeta.model, "local-relationship-engine");
  assert.deepEqual(await ipc.handlers.get("agent:pet-touch")(trustedEvent()), {
    ok: false,
    cooldownMs: 800
  });
  assert.deepEqual(COMPANION_LIFE_HANDLE_CHANNELS, [
    "agent:pet-touch",
    "agent:get-life-state",
    "agent:pause-proactive-today",
    "agent:reset-work-session"
  ]);
  assert.deepEqual(calls, [
    ["owner"],
    ["touch", { grow: true }],
    ["owner"]
  ]);
  assert.equal(service.snapshot().petTouchCooldownActive, true);
  service.dispose();
});

test("companion pet-touch preserves autonomous busy return shape", async () => {
  let chatState = { messages: [], lastReplyMeta: null };
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createCompanionLifeService({
    trustedIpc,
    getBaseDir: () => "base",
    dependencies: {
      loadConfig: async () => ({}),
      loadLifeState: async () => ({}),
      pauseProactiveForToday: async () => ({}),
      resetWorkSession: async () => ({}),
      recordPetTouch: async () => ({})
    },
    getLifeState: () => null,
    setLifeState: () => {},
    markOwnerInteraction: async () => {},
    isAutonomousBusy: () => true,
    getCaughtInterestReply: async () => ({ message: "caught" }),
    publishInterestInteraction: (reply, mood) => {
      chatState = {
        ...chatState,
        messages: [...chatState.messages, { role: "assistant", content: `${reply.message}-${mood}` }]
      };
    },
    getChatState: () => chatState,
    setChatState: (state) => { chatState = state; },
    broadcastChatState: () => {},
    broadcastRelationshipProfile: () => {},
    broadcastMoodUpdate: () => {},
    mergeConfig: (config) => config,
    now: () => 0
  });
  service.registerIpc().start();

  assert.deepEqual(await ipc.handlers.get("agent:pet-touch")(trustedEvent()), {
    ok: true,
    busy: true,
    interestBusy: true,
    reply: "caught-surprised",
    mood: "surprised"
  });
  assert.throws(() => ipc.handlers.get("agent:pet-touch")(trustedEvent("https://example.com")), /拒绝/);
});
