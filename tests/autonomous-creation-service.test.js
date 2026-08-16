import test from "node:test";
import assert from "node:assert/strict";
import { createAutonomousCreationService, AUTONOMOUS_CREATION_HANDLE_CHANNELS } from "../electron/services/autonomous-creation-service.js";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function makeHarness(overrides = {}) {
  const handlers = new Map();
  const raw = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) };
  const trustedIpc = createTrustedIpcRegistrar(raw, { isDev: true, devServerUrl: "http://localhost:5173", rendererRoot: "dist" });
  let config = { personaName: "Alpha", activePersonaCard: { id: "alpha", version: 3, name: "Alpha" }, interests: {} };
  const states = [];
  const proactive = [];
  const dependencies = {
    normalizeInterestConfig: () => ({ enabled: true, autonomousLifeEnabled: true, activities: { miniGames: true }, selfPlayGames: false, permissionLevel: "preview", autoOpenPreview: false }),
    initializeInterestSession: async () => {},
    getInterestSandboxSnapshot: async () => ({ root: "sandbox", activities: [], today: {}, session: {} }),
    runInterestActivity: async (_base, _config, type) => ({ activity: { id: type, type, title: type, status: "completed" }, tokens: 1 }),
    runAutonomousLifeActivity: async () => ({ ok: true }),
    updateInterestSession: async () => {},
    isSafeInterestArtifact: () => false,
    cleanupInterestSandbox: async () => ({}),
    getInterestActivity: async () => null,
    saveInterestLocation: async () => {},
    selectInterestActivity: () => ({ allowed: false }),
    recordInterestPlaytest: async (_base, _id, playtest) => ({ id: "game", type: "mini_game", playtest }),
    generatePlaytestReflection: async () => ({ reflection: "ok", tokens: 1 }),
    repairInterestGame: async () => ({ tokens: 0 }),
    reviseInterestGame: async () => ({}),
    recordDelegatedAutonomousActivity: async () => ({}),
    ...overrides.dependencies
  };
  const service = createAutonomousCreationService({
    trustedIpc,
    getBaseDir: () => "base",
    getConfig: () => config,
    getRelationshipProfile: async () => ({ emotion: {} }),
    gamePlaytestService: overrides.gamePlaytestService || { run: async () => ({ ok: true, cancelled: false, actions: 1, highestScore: 1, state: { protocolDetected: true }, errors: [] }) },
    modelService: { caughtInterestReply: async (_activity, snapshot) => snapshot.personaName },
    isHostReady: () => true,
    isOwnerTaskRunning: () => false,
    isScheduleBusy: () => false,
    isProactiveBusy: () => false,
    ownerInteractionIdleSeconds: () => 99999,
    publishInteraction: (message) => message,
    publishProactiveEvent: (event) => proactive.push(event),
    broadcastState: (state) => states.push(structuredClone(state)),
    resolveLocationLabel: async () => ({}),
    openPath: async () => "",
    isFile: async () => true,
    setInterval: () => 1,
    clearInterval: () => {},
    now: () => new Date("2026-01-02T03:04:05.000Z"),
    dependencies
  });
  return { handlers, service, states, proactive, setConfig: (next) => { config = next; } };
}

test("creation tasks are mutually exclusive and retain the starting persona snapshot", async () => {
  const gate = deferred();
  let received;
  const harness = makeHarness({ dependencies: {
    runInterestActivity: async (_base, config, type, options) => {
      received = { config, type, persona: options.persona };
      await gate.promise;
      return { activity: { id: "one", type, title: "one", status: "completed" } };
    }
  } });
  const first = harness.service.executeInterestActivity("drawing", { manual: true });
  harness.setConfig({ personaName: "Beta", activePersonaCard: { id: "beta", version: 9 }, interests: {} });
  assert.throws(() => harness.service.executeInterestActivity("diary"), /另一项创作/);
  gate.resolve();
  await first;
  assert.equal(received.config.personaName, "Alpha");
  assert.deepEqual(received.persona, { cardId: "alpha", version: 3, name: "Alpha" });
});

test("cancellation prevents completion publication and service recovers after failure", async () => {
  let calls = 0;
  const harness = makeHarness({ dependencies: {
    runInterestActivity: async (_base, _config, type, options) => {
      calls += 1;
      if (calls === 1) await new Promise((_resolve, reject) => {
        if (options.signal.aborted) reject(options.signal.reason);
        else options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
      if (calls === 2) throw new Error("creation failed");
      return { activity: { id: type, type, title: type, status: "completed" } };
    }
  } });
  const cancelled = harness.service.executeInterestActivity("drawing");
  harness.service.interrupt();
  await assert.rejects(cancelled, /终止|停止/);
  assert.equal(harness.proactive.length, 0);
  await assert.rejects(harness.service.executeInterestActivity("drawing"), /creation failed/);
  await harness.service.executeInterestActivity("drawing");
  assert.equal(harness.proactive.length, 1);
});

test("cancelled playtest is recorded once without duplicate token deduction or completed publication", async () => {
  let recordCalls = 0;
  const recordedTokens = [];
  const harness = makeHarness({
    gamePlaytestService: { run: async (options) => new Promise((resolve) => {
      const finish = () => resolve({ ok: false, cancelled: true, actions: 2, highestScore: 0, state: { protocolDetected: true }, errors: [] });
      if (options.signal.aborted) finish();
      else options.signal.addEventListener("abort", finish, { once: true });
    }) },
    dependencies: {
      normalizeInterestConfig: () => ({ enabled: true, activities: { miniGames: true }, selfPlayGames: true, selfPlayMaxSeconds: 1, selfPlayMaxActions: 2, selfRepairAttempts: 0, permissionLevel: "preview", autoOpenPreview: false }),
      runInterestActivity: async () => ({ activity: { id: "game", type: "mini_game", title: "Game", status: "completed", artifactPath: "game.html" } }),
      isSafeInterestArtifact: () => true,
      recordInterestPlaytest: async (_base, _id, playtest, tokens) => {
        recordCalls += 1;
        recordedTokens.push(tokens);
        return { id: "game", type: "mini_game", title: "Game", artifactPath: "game.html", playtest };
      }
    }
  });
  const running = harness.service.executeInterestActivity("mini_game");
  await new Promise((resolve) => setImmediate(resolve));
  harness.service.interrupt();
  await assert.rejects(running, /终止|停止/);
  assert.equal(recordCalls, 1);
  assert.deepEqual(recordedTokens, [0]);
  assert.equal(harness.proactive.length, 0);
});

test("stale playtest progress cannot overwrite a newer task state", async () => {
  let staleProgress;
  const second = deferred();
  let runCount = 0;
  const harness = makeHarness({
    gamePlaytestService: { run: async (options) => {
      runCount += 1;
      if (runCount === 1) staleProgress = options.onProgress;
      else await second.promise;
      return { ok: true, cancelled: false, actions: 1, highestScore: 1, state: { protocolDetected: true }, errors: [] };
    } },
    dependencies: {
      getInterestActivity: async () => ({ id: "game", type: "mini_game", title: "Game", artifactPath: "game.html" }),
      isSafeInterestArtifact: () => true
    }
  });
  await harness.service.executeExistingGamePlaytest({ id: "old", type: "mini_game", title: "Old", artifactPath: "old.html" });
  const current = harness.service.executeExistingGamePlaytest({ id: "new", type: "mini_game", title: "New", artifactPath: "new.html" });
  await new Promise((resolve) => setImmediate(resolve));
  staleProgress({ stage: "stale", label: "stale" });
  assert.notEqual(harness.service.snapshot().phase, "stale");
  second.resolve();
  await current;
});

test("stop aborts in-flight work, waits for exit, and rejects later tasks", async () => {
  const harness = makeHarness({ dependencies: {
    runInterestActivity: async (_base, _config, _type, options) => new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(options.signal.reason);
      else options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    })
  } });
  const running = harness.service.executeInterestActivity("drawing");
  const stopping = harness.service.stop();
  await assert.rejects(running, /停止/);
  await stopping;
  assert.throws(() => harness.service.executeInterestActivity("drawing"), /停止/);
});

test("creation IPC registration is trusted, complete, disposable, and rollback-safe", async () => {
  const harness = makeHarness();
  harness.service.registerIpc();
  assert.deepEqual([...harness.handlers.keys()], [...AUTONOMOUS_CREATION_HANDLE_CHANNELS]);
  const mainFrame = { url: "http://localhost:5173" };
  const trusted = { senderFrame: mainFrame, sender: { mainFrame } };
  assert.equal((await harness.handlers.get("agent:get-interest-state")(trusted)).status, "idle");
  assert.throws(() => harness.handlers.get("agent:get-interest-state")({ senderFrame: { url: mainFrame.url }, sender: { mainFrame } }), /拒绝/);
  assert.throws(() => harness.handlers.get("agent:get-interest-state")({ senderFrame: { url: "https://example.com" }, sender: { mainFrame: { url: "https://example.com" } } }), /拒绝/);
  await harness.service.dispose();
  assert.equal(harness.handlers.size, 0);
  await harness.service.dispose();

  const registered = new Set();
  const rollback = createAutonomousCreationService({
    trustedIpc: {
      handle(channel) { if (channel === "agent:get-interest-state") throw new Error("failed"); registered.add(channel); },
      removeHandler: (channel) => registered.delete(channel)
    },
    getBaseDir: () => "base", getConfig: () => ({ interests: {} }), dependencies: {}
  });
  assert.throws(() => rollback.registerIpc(), /failed/);
  assert.equal(registered.size, 0);
});
