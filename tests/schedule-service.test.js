import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";
import { createScheduleService, SCHEDULE_HANDLE_CHANNELS } from "../electron/services/schedule-service.js";

function serviceHarness(overrides = {}) {
  const handlers = new Map();
  const removed = [];
  const calls = [];
  const scheduled = [];
  const dependencies = {
    listSchedules: async () => [],
    listSchedulesForDay: async () => [],
    processDueSchedules: async () => [],
    cancelSchedule: async (_baseDir, id) => ({ id, status: "cancelled", wasExecuting: false }),
    abortWindowsPowerAction: async () => true,
    executeWindowsPowerAction: async () => true,
    markPowerResult: async () => ({}),
    updateScheduleIntegration: async () => ({}),
    buildScheduledLaunchSpec: (input) => input,
    registerWindowsScheduleTask: async () => ({ ok: true, taskName: "task" }),
    unregisterWindowsScheduleTask: async () => ({ ok: true, taskName: "task" }),
    ...(overrides.dependencies || {})
  };
  const service = createScheduleService({
    trustedIpc: overrides.trustedIpc || {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => { handlers.delete(channel); removed.push(channel); }
    },
    getBaseDir: () => "schedule-root",
    isHostReady: () => true,
    platform: overrides.platform || "linux",
    getExecutablePath: () => "electron.exe",
    getAppPath: () => "app-root",
    isPackaged: () => false,
    now: overrides.now || (() => new Date("2026-08-16T10:00:00.000Z")),
    setInterval: overrides.setInterval || ((callback, delay) => { scheduled.push(["interval", callback, delay]); return callback; }),
    clearInterval: overrides.clearInterval || ((timer) => calls.push(["clearInterval", timer])),
    setTimeout: overrides.setTimeout || ((callback, delay) => { scheduled.push(["timeout", callback, delay]); return callback; }),
    clearTimeout: overrides.clearTimeout || ((timer) => calls.push(["clearTimeout", timer])),
    resolveCommitmentsByText: overrides.resolveCommitmentsByText,
    loadCompanionMemory: overrides.loadCompanionMemory || (async () => ({ commitments: [] })),
    publishProactiveEvent: overrides.publishProactiveEvent || ((event) => calls.push(["event", event])),
    broadcastSchedules: overrides.broadcastSchedules || ((items) => calls.push(["broadcast", items])),
    onError: (scope, error) => calls.push(["error", scope, error.message]),
    dependencies
  });
  return { service, handlers, removed, calls, scheduled, dependencies };
}

test("schedule service owns two trusted handles and disposes idempotently", () => {
  const { service, handlers, removed } = serviceHarness();
  assert.deepEqual([...handlers.keys()], [...SCHEDULE_HANDLE_CHANNELS]);
  service.dispose();
  service.dispose();
  assert.deepEqual(removed, [...SCHEDULE_HANDLE_CHANNELS]);
  assert.equal(handlers.size, 0);
});

test("schedule service rolls back an incomplete IPC registration", () => {
  const removed = [];
  assert.throws(() => createScheduleService({
    trustedIpc: {
      handle: (channel) => { if (channel === SCHEDULE_HANDLE_CHANNELS[1]) throw new Error("duplicate"); },
      removeHandler: (channel) => removed.push(channel)
    },
    getBaseDir: () => "root",
    platform: "linux"
  }), /duplicate/);
  assert.deepEqual(removed, [SCHEDULE_HANDLE_CHANNELS[0]]);
});

test("concurrent ticks join and use one injected time for due processing and commitment sync", async () => {
  const clock = new Date("2026-08-16T12:34:56.000Z");
  let release;
  let processCalls = 0;
  const commitments = [];
  const harness = serviceHarness({
    now: () => clock,
    dependencies: {
      processDueSchedules: async (_baseDir, receivedNow) => {
        processCalls += 1;
        assert.equal(receivedNow, clock);
        await new Promise((resolve) => { release = resolve; });
        return [{ id: "reminder-1", type: "reminder", title: "喝水", message: "喝水", dueAt: clock.toISOString(), completedAt: clock.toISOString() }];
      }
    },
    resolveCommitmentsByText: async (_baseDir, text, receivedNow) => commitments.push([text, receivedNow])
  });
  const first = harness.service.tick();
  const second = harness.service.tick();
  assert.equal(first, second);
  release();
  await first;
  assert.equal(processCalls, 1);
  assert.deepEqual(commitments, [["喝水 喝水", clock]]);
  await harness.service.reconcileCompletedReminderCommitments();
  assert.equal(commitments.length, 1);
});

test("stop during an in-flight tick suppresses notifications, power actions and future scheduling", async () => {
  let release;
  let powerCalls = 0;
  const events = [];
  const harness = serviceHarness({
    dependencies: {
      processDueSchedules: async () => {
        await new Promise((resolve) => { release = resolve; });
        return [{ id: "power-1", type: "power", action: "shutdown" }];
      },
      executeWindowsPowerAction: async () => { powerCalls += 1; }
    },
    publishProactiveEvent: (event) => events.push(event)
  });
  const tick = harness.service.tick();
  harness.service.stop();
  release();
  await tick;
  assert.equal(powerCalls, 0);
  assert.deepEqual(events, []);
  assert.equal(harness.service.snapshot().started, false);
  await harness.service.tick();
  assert.equal(powerCalls, 0);
});

test("start preserves sync, tick, agenda, timer order and degrades individual failures", async () => {
  const order = [];
  let historyReads = 0;
  const harness = serviceHarness({
    platform: "win32",
    dependencies: {
      listSchedules: async (_baseDir, options) => {
        if (options?.includeHistory) {
          historyReads += 1;
          order.push(historyReads === 1 ? "sync" : "recover");
          if (historyReads === 1) throw new Error("task scheduler offline");
        }
        return [];
      },
      processDueSchedules: async () => { order.push("tick"); return []; },
      listSchedulesForDay: async () => { order.push("agenda"); return []; }
    },
    setInterval: (callback, delay) => { order.push(`timer:${delay}`); return callback; }
  });
  await harness.service.start();
  assert.deepEqual(order, ["sync", "recover", "tick", "agenda", "timer:10000"]);
  assert.match(harness.service.snapshot().lastError, /task scheduler offline/);
  await harness.service.start();
  assert.equal(order.filter((item) => item.startsWith("timer")).length, 1);
});

test("background start skips today's agenda and one failing reminder does not block the next", async () => {
  const events = [];
  const commitments = [];
  const harness = serviceHarness({
    dependencies: {
      processDueSchedules: async () => [
        { id: "first", type: "reminder", title: "first", message: "first" },
        { id: "second", type: "reminder", title: "second", message: "second" }
      ],
      listSchedulesForDay: async () => { throw new Error("background agenda must not be read"); }
    },
    resolveCommitmentsByText: async (_baseDir, text) => commitments.push(text),
    publishProactiveEvent: (event) => {
      if (event.message.includes("first")) throw new Error("first notification failed");
      events.push(event);
    }
  });
  await harness.service.start({ publishAgenda: false });
  assert.deepEqual(commitments, ["first first", "second second"]);
  assert.equal(events.length, 1);
  assert.match(events[0].message, /second/);
});

test("Windows integration retries failed registrations and remove_failed cleanup without touching non-Windows", async () => {
  const states = [];
  const items = [
    { id: "register", status: "scheduled", dueAt: "2026-08-17T10:00:00.000Z", integration: { windows: { status: "failed" } } },
    { id: "remove", status: "cancelled", dueAt: "2026-08-15T10:00:00.000Z", integration: { windows: { status: "remove_failed" } } }
  ];
  const dependencies = {
    listSchedules: async () => items,
    registerWindowsScheduleTask: async (item) => ({ ok: true, taskName: item.id }),
    unregisterWindowsScheduleTask: async (id) => ({ ok: true, taskName: id }),
    updateScheduleIntegration: async (_baseDir, id, patch) => states.push([id, patch.windows.status])
  };
  const windows = serviceHarness({ platform: "win32", dependencies });
  const results = await windows.service.syncWindowsScheduleTasks();
  assert.deepEqual(results.map((item) => item.id), ["register", "remove"]);
  assert.deepEqual(states, [["register", "registered"], ["remove", "removed"]]);

  const nonWindows = serviceHarness({ platform: "linux", dependencies });
  assert.deepEqual(await nonWindows.service.syncWindowsScheduleTasks(), []);
  assert.equal(states.length, 2);
});

test("power completion timers are tracked, cleared, and cannot overwrite a cancelled result", async () => {
  const statuses = new Map([["power-1", "scheduled"]]);
  let timeoutCallback;
  const harness = serviceHarness({
    dependencies: {
      processDueSchedules: async () => {
        statuses.set("power-1", "executing");
        return [{ id: "power-1", type: "power", action: "shutdown" }];
      },
      markPowerResult: async (_baseDir, id) => {
        if (statuses.get(id) !== "cancelled") statuses.set(id, "completed");
      }
    },
    setTimeout: (callback) => { timeoutCallback = callback; return callback; }
  });
  await harness.service.tick();
  assert.equal(harness.service.snapshot().pendingPowerResults, 1);
  statuses.set("power-1", "cancelled");
  await timeoutCallback();
  assert.equal(statuses.get("power-1"), "cancelled");
  assert.equal(harness.service.snapshot().pendingPowerResults, 0);
});

test("stop clears a pending power-result timer", async () => {
  let timeoutToken;
  const cleared = [];
  const harness = serviceHarness({
    dependencies: {
      processDueSchedules: async () => [{ id: "power-1", type: "power", action: "shutdown" }]
    },
    setTimeout: () => { timeoutToken = { timer: true }; return timeoutToken; },
    clearTimeout: (token) => cleared.push(token)
  });
  await harness.service.tick();
  harness.service.stop();
  assert.deepEqual(cleared, [timeoutToken]);
  assert.equal(harness.service.snapshot().pendingPowerResults, 0);
});

test("schedule service composes with trusted IPC and rejects before business handlers", async () => {
  const handlers = new Map();
  const rawIpc = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel)
  };
  const trustedIpc = createTrustedIpcRegistrar(rawIpc, {
    isDev: true,
    devServerUrl: "http://localhost:5173",
    rendererRoot: path.resolve("dist")
  });
  let businessCalls = 0;
  const harness = serviceHarness({
    trustedIpc,
    dependencies: { listSchedules: async () => { businessCalls += 1; return ["ok"]; } }
  });
  const mainFrame = { url: "http://localhost:5173/?view=settings" };
  assert.deepEqual(await handlers.get("agent:list-schedules")({ senderFrame: mainFrame, sender: { mainFrame } }), ["ok"]);
  const foreign = { url: "https://example.com" };
  assert.throws(() => handlers.get("agent:list-schedules")({ senderFrame: foreign, sender: { mainFrame: foreign } }), /拒绝/);
  assert.equal(businessCalls, 1);
  harness.service.dispose();
});
