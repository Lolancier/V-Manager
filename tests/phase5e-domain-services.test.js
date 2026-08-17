import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";
import { createTrustedDomainIpcService } from "../electron/services/trusted-domain-ipc-service.js";
import { createChatStateStore } from "../electron/services/chat-state-store.js";
import { createChatFlowService } from "../electron/services/chat-flow-service.js";
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
import {
  WINDOW_INTENT_HANDLE_CHANNELS,
  createWindowIntentService
} from "../electron/services/window-intent-service.js";
import {
  CODE_WORKSPACE_HANDLE_CHANNELS,
  createCodeWorkspaceService
} from "../electron/services/code-workspace-service.js";
import {
  EXPRESSION_CHAT_STATE_HANDLE_CHANNELS,
  createExpressionChatStateService
} from "../electron/services/expression-chat-state-service.js";
import {
  PET_WINDOW_LAYOUT_HANDLE_CHANNELS,
  PET_WINDOW_LAYOUT_LISTENER_CHANNELS,
  createPetWindowLayoutService
} from "../electron/services/pet-window-layout-service.js";
import {
  RENDERER_READY_LISTENER_CHANNELS,
  createRendererReadyService
} from "../electron/services/renderer-ready-service.js";

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

function createTestChatStateStore(initialState, onStateUpdated) {
  const store = createChatStateStore({ initialState, onStateUpdated });
  store.start();
  return store;
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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

test("shared domain IPC runtime makes duplicate registration a no-op and rolls back only new listeners", () => {
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createTrustedDomainIpcService({
    serviceName: "重复注册服务",
    trustedIpc,
    listeners: [{ channel: "agent:one-event", listener: () => {} }],
    handlers: [{ channel: "agent:one", listener: () => "one" }]
  });
  service.registerIpc();
  const originalHandler = ipc.handlers.get("agent:one");
  const originalListener = ipc.listeners.get("agent:one-event")[0];
  service.registerIpc();
  assert.equal(ipc.handlers.get("agent:one"), originalHandler);
  assert.deepEqual(ipc.listeners.get("agent:one-event"), [originalListener]);

  const registeredListeners = [];
  const removedHandlers = [];
  let removalAttempts = 0;
  const failing = createTrustedDomainIpcService({
    serviceName: "失败注册服务",
    trustedIpc: {
      on(_channel, listener) {
        registeredListeners.push(listener);
        return () => {
          removalAttempts += 1;
          if (removalAttempts === 1) throw new Error("transient remove failure");
          registeredListeners.splice(registeredListeners.indexOf(listener), 1);
        };
      },
      handle(channel) {
        if (channel === "agent:second") throw new Error("registration failed");
      },
      removeHandler: (channel) => removedHandlers.push(channel)
    },
    listeners: [{ channel: "agent:failed-event", listener: () => {} }],
    handlers: [
      { channel: "agent:first", listener: () => "first" },
      { channel: "agent:second", listener: () => "second" }
    ]
  });
  assert.throws(() => failing.registerIpc(), /registration failed/);
  assert.deepEqual(registeredListeners, []);
  assert.equal(removalAttempts, 2);
  assert.deepEqual(removedHandlers, ["agent:first"]);
  assert.deepEqual(failing.snapshot().listeners, []);

  service.dispose();
});

test("system resource service preserves arguments, returns, and trust boundary", async () => {
  const calls = [];
  let autoLaunchEnabled = true;
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
    readLoginItemSettings: () => ({ openAtLogin: autoLaunchEnabled }),
    writeLoginItemSettings: (enabled) => {
      calls.push(["auto-launch", enabled]);
      autoLaunchEnabled = Boolean(enabled);
    },
    broadcastAutoLaunchUpdate: (enabled) => calls.push(["auto-launch-broadcast", enabled]),
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
  assert.equal(await ipc.handlers.get("agent:set-auto-launch")(trustedEvent(), 0), false);
  assert.deepEqual(await ipc.handlers.get("agent:search-files")(trustedEvent(), "报告"), [{ path: "报告" }]);
  assert.deepEqual(await ipc.handlers.get("agent:get-app-registry")(trustedEvent()), { entries: 1 });
  assert.deepEqual(await ipc.handlers.get("agent:refresh-app-registry")(trustedEvent()), { entries: 2 });
  assert.deepEqual(await ipc.handlers.get("agent:get-system-resource-snapshot")(trustedEvent()), { cpu: 0.2 });
  assert.throws(() => ipc.handlers.get("agent:search-files")(trustedEvent("https://example.com")), /拒绝/);
  assert.deepEqual(calls, [
    ["auto-launch", 0],
    ["auto-launch-broadcast", false],
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
  const broadcasts = [];
  const chatStateStore = createTestChatStateStore({
    messages: [{ role: "assistant", content: "旧触碰" }],
    lastReplyMeta: { sourceLabel: "触碰互动" }
  });
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
      recordOwnerInteraction: async () => { calls.push(["owner"]); return { paused: false }; },
      pauseProactiveForToday: async () => ({ paused: true }),
      resetWorkSession: async () => ({ workSession: null }),
      recordPetTouch: async (_baseDir, input) => { calls.push(["touch", input]); return reaction; }
    },
    chatStateStore,
    onLifeStateUpdated: (state) => broadcasts.push(state),
    isAutonomousBusy: () => false,
    getCaughtInterestReply: async () => ({}),
    isHostReady: () => true,
    getInterestSettings: () => ({ enabled: true, autonomousLifeEnabled: true }),
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
  assert.deepEqual(chatStateStore.getState().messages, [{ role: "assistant", content: "新触碰" }]);
  assert.equal(chatStateStore.getState().lastReplyMeta.model, "local-relationship-engine");
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
  const chatStateStore = createTestChatStateStore();
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createCompanionLifeService({
    trustedIpc,
    getBaseDir: () => "base",
    dependencies: {
      loadConfig: async () => ({}),
      loadLifeState: async () => ({}),
      recordOwnerInteraction: async () => ({}),
      pauseProactiveForToday: async () => ({}),
      resetWorkSession: async () => ({}),
      recordPetTouch: async () => ({})
    },
    chatStateStore,
    isAutonomousBusy: () => true,
    getCaughtInterestReply: async () => ({ message: "caught" }),
    onInterestInteraction: (message, mood) => {
      chatStateStore.appendAssistant(`${message}-${mood}`, { sourceLabel: "test" });
    },
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

test("companion pet-touch dispose waits and suppresses late domain writes", async () => {
  const broadcasts = [];
  const chatStateStore = createTestChatStateStore();
  const modelGate = createDeferred();
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createCompanionLifeService({
    trustedIpc,
    getBaseDir: () => "base",
    dependencies: {
      loadConfig: async () => ({}),
      loadLifeState: async () => ({}),
      recordOwnerInteraction: async () => ({}),
      recordPetTouch: async () => {
        await modelGate.promise;
        return {
          reply: "late touch",
          mood: "happy",
          faceParams: {},
          profile: { affection: 3 }
        };
      }
    },
    chatStateStore,
    isAutonomousBusy: () => false,
    getCaughtInterestReply: async () => ({}),
    broadcastRelationshipProfile: (profile) => broadcasts.push(["relationship", profile]),
    broadcastMoodUpdate: (payload) => broadcasts.push(["mood", payload]),
    mergeConfig: (config) => config,
    now: () => 0
  });
  service.registerIpc().start();

  const touch = ipc.handlers.get("agent:pet-touch")(trustedEvent());
  const disposing = service.dispose();
  modelGate.resolve();
  await Promise.all([touch, disposing]);
  const touchResult = await touch;

  assert.deepEqual(touchResult, { ok: false, busy: true });
  assert.deepEqual(chatStateStore.getState().messages, []);
  assert.deepEqual(broadcasts, []);
  assert.equal(ipc.handlers.size, 0);
});

test("companion owner interactions serialize commits and stay busy until every request settles", async () => {
  const firstGate = createDeferred();
  const secondGate = createDeferred();
  const secondStarted = createDeferred();
  const broadcasts = [];
  let calls = 0;
  const service = createCompanionLifeService({
    getBaseDir: () => "base",
    dependencies: {
      recordOwnerInteraction: async (_baseDir, previous, now) => {
        calls += 1;
        if (calls === 1) await firstGate.promise;
        else {
          secondStarted.resolve();
          await secondGate.promise;
        }
        return { previous: previous?.sequence || 0, sequence: calls, at: now.toISOString() };
      }
    },
    chatStateStore: createTestChatStateStore(),
    onLifeStateUpdated: (state) => broadcasts.push(state),
    now: () => 0
  });
  service.start();

  const first = service.markOwnerInteraction(new Date("2026-08-17T01:00:00.000Z"));
  const second = service.markOwnerInteraction(new Date("2026-08-17T02:00:00.000Z"));
  assert.equal(calls, 0);
  assert.equal(service.isProactiveBusy(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  firstGate.resolve();
  await first;
  await secondStarted.promise;
  assert.equal(service.isProactiveBusy(), true);
  secondGate.resolve();
  await second;

  assert.equal(service.isProactiveBusy(), false);
  assert.deepEqual(service.getLifeState(), {
    previous: 1,
    sequence: 2,
    at: "2026-08-17T02:00:00.000Z"
  });
  assert.deepEqual(broadcasts.map((state) => state.sequence), [1, 2]);
  await service.dispose();
});

test("companion dispose waits for a persisting tick and suppresses every late side effect", async () => {
  const saveStarted = createDeferred();
  const saveGate = createDeferred();
  const sideEffects = [];
  const service = createCompanionLifeService({
    getBaseDir: () => "base",
    isHostReady: () => true,
    setInterval: () => 1,
    clearInterval: () => {},
    mergeConfig: (config) => config,
    getInterestSettings: () => ({ enabled: false, autonomousLifeEnabled: false }),
    chatStateStore: {
      appendProactiveEvent: (event) => { sideEffects.push(["chat", event]); return {}; }
    },
    onLifeStateUpdated: (state) => sideEffects.push(["state", state]),
    onProactiveEvent: (event) => sideEffects.push(["event", event]),
    onError: (scope, error) => sideEffects.push([scope, error]),
    now: () => 0,
    dependencies: {
      loadLifeState: async () => ({ lastInteractionAt: "2026-08-16T00:00:00.000Z" }),
      getFollowUpCandidate: async () => ({ store: { feedback: { interruptionScore: 0 } }, candidate: { id: "commitment" } }),
      loadRelationshipProfile: async () => ({ affection: { stage: "close" } }),
      loadConfig: async () => ({ proactive: {} }),
      evaluateLifeTick: () => ({ state: { saved: true }, events: [{ kind: "commitment_followup", message: "late" }] }),
      saveLifeState: async () => {
        saveStarted.resolve();
        await saveGate.promise;
        return { saved: true };
      },
      markCommitmentFollowedUp: async () => sideEffects.push(["commitment"])
    }
  });
  await service.start();
  await saveStarted.promise;
  let disposed = false;
  const disposing = service.dispose().then(() => { disposed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposed, false);
  assert.equal(service.isProactiveBusy(), true);
  saveGate.resolve();
  await disposing;

  assert.equal(disposed, true);
  assert.deepEqual(sideEffects, []);
  assert.equal(service.isProactiveBusy(), false);
});

test("window intent service forwards open requests through the trust boundary", async () => {
  const calls = [];
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createWindowIntentService({
    trustedIpc,
    openSettingsWindow: async () => { calls.push("settings"); return true; },
    openComposerWindow: async () => { calls.push("composer"); return true; },
    openChatWindow: async () => { calls.push("chat"); return true; },
    openCodeWindow: async () => { calls.push("code"); return true; },
    openScaleWindow: async () => { calls.push("scale"); return true; },
    openExpressionWindow: async () => { calls.push("expression"); return true; }
  });
  service.registerIpc().start();

  for (const channel of WINDOW_INTENT_HANDLE_CHANNELS) {
    assert.equal(await ipc.handlers.get(channel)(trustedEvent()), true);
  }
  assert.throws(() => ipc.handlers.get("agent:open-settings-window")(trustedEvent("https://example.com")), /拒绝/);
  assert.deepEqual(calls, ["settings", "composer", "chat", "code", "scale", "expression"]);
  assert.deepEqual(service.snapshot().requests, {
    "agent:open-settings-window": 1,
    "agent:open-composer-window": 1,
    "agent:open-chat-window": 1,
    "agent:open-code-window": 1,
    "agent:open-scale-window": 1,
    "agent:open-expression-window": 1
  });
  service.stop();
  await assert.rejects(ipc.handlers.get("agent:open-settings-window")(trustedEvent()), /尚未启动/);
  service.start();
  service.dispose();
  assert.equal(ipc.handlers.has("agent:open-settings-window"), false);
});

test("code workspace service preserves file and workspace argument shapes", async () => {
  const calls = [];
  let workspaceDir = "D:/work";
  const dependencies = {
    fs: {
      mkdir: async (directory, options) => { calls.push(["mkdir", directory, options]); },
      writeFile: async (file, content) => { calls.push(["write-file", file, content]); }
    },
    path: {
      resolve: (value) => value,
      join: (...parts) => parts.join("/"),
      dirname: (value) => value.split("/").slice(0, -1).join("/")
    },
    listWorkspaceCodeFiles: async (options) => { calls.push(["list", options.workspaceDir]); return [{ path: "main.js" }]; },
    readWorkspaceCode: async (relativePath, options) => {
      calls.push(["read", relativePath, options]);
      return { content: "source" };
    },
    writeWorkspaceCode: async (payload, options) => {
      calls.push(["write", payload, options]);
      return { written: true };
    }
  };
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createCodeWorkspaceService({
    trustedIpc,
    getBaseDir: () => "audit-user-data",
    initialWorkspaceDir: workspaceDir,
    onWorkspaceChanged: (next) => { workspaceDir = next; },
    showOpenDialog: async (options) => {
      calls.push(["dialog", options]);
      return { canceled: false, filePaths: ["D:/repo"] };
    },
    dependencies
  });
  service.registerIpc().start();

  assert.deepEqual(await ipc.handlers.get("agent:get-code-workspace")(trustedEvent()), [{ path: "main.js" }]);
  assert.deepEqual(await ipc.handlers.get("agent:read-code-file")(trustedEvent(), "src/main.js"), { content: "source" });
  assert.deepEqual(await ipc.handlers.get("agent:write-code-file")(trustedEvent(), {
    path: "src/main.js",
    content: "next",
    expectedContent: "source"
  }), { written: true });
  assert.deepEqual(await ipc.handlers.get("agent:select-code-workspace")(trustedEvent()), [{ path: "main.js" }]);
  assert.throws(() => ipc.handlers.get("agent:get-code-workspace")(trustedEvent("https://example.com")), /拒绝/);
  assert.deepEqual(CODE_WORKSPACE_HANDLE_CHANNELS, [
    "agent:get-code-workspace",
    "agent:read-code-file",
    "agent:write-code-file",
    "agent:select-code-workspace"
  ]);
  assert.deepEqual(calls, [
    ["list", "D:/work"],
    ["read", "src/main.js", { workspaceDir: "D:/work" }],
    ["write", {
      path: "src/main.js",
      content: "next",
      expected_content: "source"
    }, { workspaceDir: "D:/work", codeAgentConfirmed: true }],
    ["dialog", {
      title: "选择代码工作区",
      defaultPath: "D:/work",
      properties: ["openDirectory"]
    }],
    ["mkdir", "audit-user-data/agent-data", { recursive: true }],
    ["write-file", "audit-user-data/agent-data/code-workspace.json", JSON.stringify({ path: "D:/repo" }, null, 2)],
    ["list", "D:/repo"]
  ]);
  assert.equal(service.snapshot().workspaceDir, "D:/repo");
  service.dispose();
});

test("code workspace dispose waits for pending persistence", async () => {
  const events = [];
  const writeGate = createDeferred();
  const service = createCodeWorkspaceService({
    getBaseDir: () => "audit-user-data",
    initialWorkspaceDir: "D:/old",
    onWorkspaceChanged: (workspaceDir) => events.push(["workspace", workspaceDir]),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    dependencies: {
      fs: {
        mkdir: async () => {},
        writeFile: async () => {
          await writeGate.promise;
          events.push(["write-complete"]);
        }
      },
      path: {
        resolve: (value) => value,
        join: (...parts) => parts.join("/"),
        dirname: (value) => value.split("/").slice(0, -1).join("/")
      },
      listWorkspaceCodeFiles: async () => []
    }
  });

  const write = service.setWorkspaceDir("D:/next");
  const disposing = service.dispose();
  writeGate.resolve();
  const savedDir = await write;
  await disposing;
  events.push(["dispose-complete"]);

  assert.equal(savedDir, null);
  assert.deepEqual(events, [
    ["workspace", "D:/next"],
    ["write-complete"],
    ["dispose-complete"]
  ]);
  assert.equal(service.snapshot().disposed, true);
});

test("code workspace dispose waits for every concurrent persistence and suppresses late results", async () => {
  const writeStarted = [createDeferred(), createDeferred()];
  const writeGates = [createDeferred(), createDeferred()];
  let writeIndex = 0;
  const service = createCodeWorkspaceService({
    getBaseDir: () => "audit-user-data",
    initialWorkspaceDir: "D:/old",
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    dependencies: {
      fs: {
        mkdir: async () => {},
        writeFile: async () => {
          const index = writeIndex;
          writeIndex += 1;
          writeStarted[index].resolve();
          await writeGates[index].promise;
        }
      },
      path: {
        resolve: (value) => value,
        join: (...parts) => parts.join("/"),
        dirname: (value) => value.split("/").slice(0, -1).join("/")
      },
      listWorkspaceCodeFiles: async () => []
    }
  });

  const first = service.setWorkspaceDir("D:/first");
  const second = service.setWorkspaceDir("D:/second");
  await Promise.all(writeStarted.map((item) => item.promise));
  let disposed = false;
  const disposing = service.dispose().then(() => { disposed = true; });
  writeGates[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposed, false);
  writeGates[1].resolve();
  assert.deepEqual(await Promise.all([first, second]), [null, null]);
  await disposing;
  assert.equal(disposed, true);
  assert.equal(service.snapshot().workspaceDir, "D:/second");
});

test("expression chat state service preserves toggle and state shapes", async () => {
  const broadcasts = [];
  const chatStateStore = createTestChatStateStore({
    messages: [{ role: "user", content: "hello" }],
    knowledge: [],
    lastReplyMeta: null
  });
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createExpressionChatStateService({
    trustedIpc,
    persistentShapeExpressions: ["expression20", "expression21"],
    initialManualExpressions: ["expression21"],
    chatStateStore,
    broadcastActiveExpressions: (expressions) => broadcasts.push(expressions)
  });
  service.registerIpc().start();

  assert.equal(await ipc.handlers.get("agent:trigger-expression")(trustedEvent(), ""), false);
  assert.equal(await ipc.handlers.get("agent:trigger-expression")(trustedEvent(), "expression20"), true);
  assert.deepEqual(service.snapshot().manualExpressions, ["expression20"]);
  assert.equal(await ipc.handlers.get("agent:trigger-expression")(trustedEvent(), "expression20"), true);
  assert.deepEqual(service.snapshot().manualExpressions, []);
  assert.deepEqual(await ipc.handlers.get("agent:get-chat-state")(trustedEvent()), chatStateStore.getState());
  assert.equal(await ipc.handlers.get("agent:clear-expressions")(trustedEvent()), true);
  assert.deepEqual(broadcasts, [["expression20"], [], []]);
  assert.throws(() => ipc.handlers.get("agent:get-chat-state")(trustedEvent("https://example.com")), /拒绝/);
  assert.deepEqual(EXPRESSION_CHAT_STATE_HANDLE_CHANNELS, [
    "agent:trigger-expression",
    "agent:clear-expressions",
    "agent:get-chat-state"
  ]);
  assert.deepEqual(service.snapshot().manualExpressions, []);
  service.stop();
  await assert.rejects(ipc.handlers.get("agent:get-chat-state")(trustedEvent()), /尚未启动/);
  service.dispose();
});

test("expression service unions manual and interest-owned state", async () => {
  const broadcasts = [];
  const service = createExpressionChatStateService({
    persistentShapeExpressions: ["expression20"],
    initialManualExpressions: ["expression21"],
    chatStateStore: createTestChatStateStore(),
    broadcastActiveExpressions: (expressions) => broadcasts.push(expressions)
  });
  service.start();

  service.setInterestExpression("mini_game");
  assert.deepEqual(service.getActiveExpressions(), ["expression21", "expression27"]);
  assert.deepEqual(service.clearTransientExpressions(), ["expression27"]);
  service.setInterestExpression("diary");
  assert.deepEqual(service.getActiveExpressions(), ["expression25", "expression26"]);

  assert.deepEqual(broadcasts, [
    ["expression21", "expression27"],
    ["expression27"],
    ["expression25", "expression26"]
  ]);
  service.dispose();
});

test("pet window layout service preserves bounds, sender checks, and listeners", async () => {
  const calls = [];
  const petSender = { id: "pet", mainFrame: { url: "http://localhost:5173" } };
  const bubbleSender = { id: "bubble", mainFrame: { url: "http://localhost:5173" } };
  const eventFor = (sender) => ({ senderFrame: sender.mainFrame, sender });
  let petBounds = { x: 100, y: 100, width: 640, height: 960 };
  let nextBounds = null;
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createPetWindowLayoutService({
    trustedIpc,
    initialPetScale: 1.25,
    initialPositionLocked: false,
    initialBubbleContentSize: { width: 330, height: 180 },
    broadcastPositionLock: (locked) => calls.push(["lock-broadcast", locked]),
    isPetWindowActive: () => true,
    getPetWindowBounds: () => petBounds,
    setPetWindowBounds: (bounds) => { nextBounds = bounds; petBounds = bounds; },
    setPetWindowPosition: (x, y) => calls.push(["position", x, y]),
    updateBubbleWindowLayout: () => calls.push(["bubble-layout"]),
    getPetWindowSize: (scale) => ({
      width: Math.round(640 * scale),
      height: Math.round(960 * scale)
    }),
    getWorkAreaForBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    broadcastPetScale: (scale) => calls.push(["scale-broadcast", scale]),
    isBubbleWindowActive: () => true,
    isSenderBubbleWindow: (event) => event.sender === bubbleSender,
    getBubbleWindowBounds: () => ({ width: 680, height: 100, placement: "right" }),
    isSenderPetWindow: (event) => event.sender === petSender,
    isHoverAutoHideEnabled: () => false,
    setPetMousePassthrough: (ignore) => calls.push(["passthrough", ignore]),
    showPetContextMenu: (event) => calls.push(["menu", event.sender.id])
  });
  service.registerIpc().start();

  assert.equal(await ipc.handlers.get("agent:get-pet-scale")(eventFor(petSender)), 1.25);
  assert.equal(await ipc.handlers.get("agent:get-position-lock")(eventFor(petSender)), false);
  assert.equal(await ipc.handlers.get("agent:set-position-lock")(eventFor(petSender), 1), true);
  assert.deepEqual(await ipc.handlers.get("agent:get-pet-window-bounds")(eventFor(petSender)), petBounds);
  assert.equal(await ipc.handlers.get("agent:set-pet-window-position")(eventFor(petSender), { x: 10.4, y: 20.6 }), true);
  assert.deepEqual(await ipc.handlers.get("agent:update-pet-window-layout")(eventFor(petSender), { scale: 2 }), {
    width: 960,
    height: 1440
  });
  assert.deepEqual(nextBounds, { x: 0, y: 0, width: 960, height: 1440 });
  assert.equal(await ipc.handlers.get("agent:update-bubble-window-size")(eventFor(petSender), { width: 700, height: 90 }), null);
  assert.deepEqual(await ipc.handlers.get("agent:update-bubble-window-size")(eventFor(bubbleSender), { width: 700, height: 90 }), {
    width: 680,
    height: 100,
    placement: "right"
  });
  ipc.listeners.get("agent:set-pet-mouse-passthrough").at(-1)(eventFor(bubbleSender), true);
  ipc.listeners.get("agent:set-pet-mouse-passthrough").at(-1)(eventFor(petSender), false);
  ipc.listeners.get("agent:set-pet-mouse-passthrough").at(-1)(eventFor(petSender), true);
  ipc.listeners.get("agent:show-pet-context-menu").at(-1)(eventFor(petSender));

  assert.throws(() => ipc.handlers.get("agent:get-pet-scale")(trustedEvent("https://example.com")), /拒绝/);
  ipc.listeners.get("agent:set-pet-mouse-passthrough").at(-1)(trustedEvent("https://example.com"), true);
  assert.deepEqual(calls, [
    ["lock-broadcast", true],
    ["position", 10, 21],
    ["bubble-layout"],
    ["scale-broadcast", 1.5],
    ["bubble-layout"],
    ["bubble-layout"],
    ["passthrough", false],
    ["passthrough", true],
    ["menu", "pet"]
  ]);
  assert.deepEqual(PET_WINDOW_LAYOUT_HANDLE_CHANNELS, [
    "agent:get-pet-scale",
    "agent:get-position-lock",
    "agent:set-position-lock",
    "agent:get-pet-window-bounds",
    "agent:set-pet-window-position",
    "agent:update-pet-window-layout",
    "agent:update-bubble-window-size"
  ]);
  assert.deepEqual(PET_WINDOW_LAYOUT_LISTENER_CHANNELS, [
    "agent:set-pet-mouse-passthrough",
    "agent:show-pet-context-menu"
  ]);
  service.stop();
  await assert.rejects(ipc.handlers.get("agent:get-pet-scale")(eventFor(petSender)), /尚未启动/);
  service.start();
  service.dispose();
  assert.deepEqual(ipc.listeners.get("agent:set-pet-mouse-passthrough"), []);
  assert.deepEqual(ipc.listeners.get("agent:show-pet-context-menu"), []);
});

test("pet window layout service owns interest bubble wake deduplication", () => {
  const service = createPetWindowLayoutService({
    isPetWindowActive: () => false,
    isBubbleWindowActive: () => false
  });
  const firstTask = {
    status: "working",
    type: "mini_game",
    startedAt: "2026-08-17T00:00:00.000Z",
    activityId: "task-1"
  };
  const secondTask = { ...firstTask, activityId: "task-2" };

  assert.equal(service.shouldWakeInterestBubble(firstTask), true);
  assert.equal(service.shouldWakeInterestBubble(firstTask), false);
  assert.equal(service.shouldWakeInterestBubble(secondTask), true);
  assert.equal(service.snapshot().interestBubbleWokenForTask, `${firstTask.startedAt}:${secondTask.activityId}`);
  assert.equal(service.shouldWakeInterestBubble({ ...firstTask, status: "idle" }), false);
  assert.equal(service.snapshot().interestBubbleWokenForTask, "");
  assert.equal(service.shouldWakeInterestBubble(firstTask), true);
});

test("renderer ready service filters pet payloads and cleans listeners", async () => {
  const calls = [];
  let startupStatus = { phase: "renderer" };
  const { ipc, trustedIpc } = makeRegistrar();
  const service = createRendererReadyService({
    trustedIpc,
    getStartupStatus: () => startupStatus,
    releaseStartup: (status) => calls.push(["release", status])
  });
  service.registerIpc().start();
  const listener = ipc.listeners.get("agent:renderer-ready").at(-1);

  listener(trustedEvent(), { view: "settings", modelStatus: "ready" });
  assert.equal(service.getModelStatus(), null);
  listener(trustedEvent(), { view: "pet", modelStatus: "error" });
  assert.equal(service.getModelStatus(), "error");
  assert.deepEqual(calls, [["release", "error"]]);
  startupStatus = { phase: "ready" };
  listener(trustedEvent(), { view: "pet" });
  assert.equal(service.getModelStatus(), "ready");
  assert.deepEqual(calls, [["release", "error"]]);
  listener(trustedEvent("https://example.com"), { view: "pet" });
  assert.deepEqual(service.snapshot(), {
    started: true,
    disposed: false,
    handles: [],
    listeners: ["agent:renderer-ready"],
    petRendererReadyCount: 2,
    lastModelStatus: "ready"
  });
  assert.deepEqual(RENDERER_READY_LISTENER_CHANNELS, ["agent:renderer-ready"]);
  service.stop();
  listener(trustedEvent(), { view: "pet" });
  assert.equal(service.snapshot().petRendererReadyCount, 2);
  service.dispose();
  assert.deepEqual(ipc.listeners.get("agent:renderer-ready"), []);
});

test("chat flow serializes concurrent owner chat commands", async () => {
  const chatStateStore = createTestChatStateStore();
  const modelStarted = createDeferred();
  const releaseModel = createDeferred();
  const modelCalls = [];
  const service = createChatFlowService({
    getBaseDir: () => "base",
    chatStateStore,
    companionLifeService: { markOwnerInteraction: async () => ({}) },
    modelService: {
      generateReply: async (payload) => {
        modelCalls.push(payload.message);
        await releaseModel.promise;
        return { reply: `reply:${payload.message}`, knowledge: [], meta: {} };
      }
    },
    autonomousService: {
      handleChat: async () => null,
      markOwnerTaskCompleted: async () => {}
    },
    personaService: {},
    wakeBubbleWindow: () => {},
    broadcastMood: () => {},
    broadcastRelationshipProfile: () => {},
    clearTransientExpressions: () => {},
    dependencies: {
      classifyFastReaction: () => ({ mood: "happy" }),
      resolveAgentRoute: () => ({ type: "chat" })
    }
  });
  service.start();

  const first = service.handleChat({ message: "first" });
  const second = service.handleChat({ message: "second" });
  releaseModel.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, secondResult);
  assert.deepEqual(modelCalls, ["first"]);
  assert.equal(chatStateStore.getState().messages.at(-1).content, "reply:first");
  await service.dispose();
});

test("chat flow dispose waits and suppresses late state writes and broadcasts", async () => {
  const broadcasts = [];
  const chatStateStore = createTestChatStateStore();
  const modelStarted = createDeferred();
  const releaseModel = createDeferred();
  const service = createChatFlowService({
    getBaseDir: () => "base",
    chatStateStore,
    companionLifeService: { markOwnerInteraction: async () => ({}) },
    modelService: {
      generateReply: async (_payload, options) => {
        modelStarted.resolve();
        await releaseModel.promise;
        options.onDelta("late delta");
        return { reply: "late reply", knowledge: [], meta: {} };
      }
    },
    autonomousService: {
      handleChat: async () => null,
      markOwnerTaskCompleted: async () => {}
    },
    personaService: {},
    wakeBubbleWindow: () => broadcasts.push(["wake"]),
    broadcastMood: (payload) => broadcasts.push(["mood", payload]),
    broadcastRelationshipProfile: (profile) => broadcasts.push(["relationship", profile]),
    clearTransientExpressions: () => broadcasts.push(["clear-expressions"]),
    dependencies: {
      classifyFastReaction: () => ({ mood: "happy" }),
      resolveAgentRoute: () => ({ type: "chat" })
    }
  });
  service.start();
  const chat = service.handleChat({ message: "dispose during chat" });
  await modelStarted.promise;
  const disposing = service.dispose();
  releaseModel.resolve();
  const result = await chat;
  await disposing;

  assert.equal(result.messages.at(-1).content, "");
  assert.deepEqual(broadcasts, [
    ["wake"],
    ["mood", { phase: "anticipation", mood: "happy" }]
  ]);
  assert.equal(service.snapshot().disposed, true);
});

test("chat flow owns startup diagnostics and startup conversation state", async () => {
  const broadcasts = [];
  const chatStateStore = createChatStateStore({ onStateUpdated: (state) => broadcasts.push(state) });
  chatStateStore.start();
  const runtimePersona = {
    config: {
      deepseek: { apiKey: "configured", chatModel: "deepseek-chat", model: "fallback-model" }
    },
    card: { id: "card-1", payload: { userAddress: "老板" } }
  };
  const service = createChatFlowService({
    getBaseDir: () => "base",
    chatStateStore,
    companionLifeService: {},
    modelService: {
      generateGreeting: async () => ({ mode: "model", reply: "greeting" })
    },
    autonomousService: {},
    personaService: {
      applyRuntimePersona: async () => runtimePersona
    },
    wakeBubbleWindow: () => {},
    broadcastMood: () => {},
    broadcastRelationshipProfile: () => {},
    clearTransientExpressions: () => {},
    dependencies: {
      getRecentConversationMessages: async () => [
        { role: "user", content: "old" },
        { role: "assistant", content: "history" }
      ],
      loadCompanionMemory: async () => ({ memories: [] })
    }
  });
  service.updateStartupDiagnostics({ rag: { ready: true } });
  service.start();

  const startupConfig = await service.initializeStartupConversation(runtimePersona.config, {
    applyRuntimePersona: async () => runtimePersona
  });

  assert.equal(startupConfig, runtimePersona.config);
  assert.deepEqual(chatStateStore.getState().messages, [
    { role: "user", content: "old" },
    { role: "assistant", content: "history" },
    { role: "assistant", content: "greeting" }
  ]);
  assert.equal(chatStateStore.getState().lastReplyMeta.sourceLabel, "本次见面");
  assert.deepEqual(service.getStartupDiagnostics(), {
    rag: { ready: true },
    deepseek: "ready",
    historyRestored: 2
  });
  assert.deepEqual(service.snapshot().startupDiagnostics, service.getStartupDiagnostics());
  assert.deepEqual(broadcasts, []);
});
