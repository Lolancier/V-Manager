import {
  abortWindowsPowerAction,
  cancelSchedule,
  executeWindowsPowerAction,
  listSchedules,
  listSchedulesForDay,
  markPowerResult,
  processDueSchedules,
  updateScheduleIntegration
} from "../../src-agent/schedule-engine.js";
import {
  buildScheduledLaunchSpec,
  registerWindowsScheduleTask,
  unregisterWindowsScheduleTask
} from "../../src-agent/windows-task-scheduler.js";

export const SCHEDULE_HANDLE_CHANNELS = Object.freeze([
  "agent:list-schedules",
  "agent:cancel-schedule"
]);

const defaultDependencies = {
  abortWindowsPowerAction,
  cancelSchedule,
  executeWindowsPowerAction,
  listSchedules,
  listSchedulesForDay,
  markPowerResult,
  processDueSchedules,
  updateScheduleIntegration,
  buildScheduledLaunchSpec,
  registerWindowsScheduleTask,
  unregisterWindowsScheduleTask
};

function errorMessage(error) {
  return String(error?.message || error);
}

export function createScheduleService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const now = options.now || (() => new Date());
  const setIntervalImpl = options.setInterval || globalThis.setInterval;
  const clearIntervalImpl = options.clearInterval || globalThis.clearInterval;
  const setTimeoutImpl = options.setTimeout || globalThis.setTimeout;
  const clearTimeoutImpl = options.clearTimeout || globalThis.clearTimeout;
  const tickIntervalMs = options.tickIntervalMs ?? 10_000;
  const powerResultDelayMs = options.powerResultDelayMs ?? 65_000;
  const registeredChannels = new Set();
  const powerResultTimers = new Map();
  const reconciledReminderIds = new Set();
  let timer = null;
  let tickPromise = null;
  let reconciliationPromise = null;
  let startPromise = null;
  let started = false;
  let acceptTicks = true;
  let disposed = false;
  let lifecycleGeneration = 0;
  let lastError = "";

  const baseDir = () => options.getBaseDir();
  const reportError = (scope, error) => {
    lastError = errorMessage(error);
    options.onError?.(scope, error);
  };

  async function broadcastSchedules() {
    const items = await dependencies.listSchedules(baseDir());
    await options.broadcastSchedules?.(items);
    return items;
  }

  async function reconcileReminder(item, resolvedAt = new Date(item.completedAt || item.dueAt)) {
    if (reconciledReminderIds.has(item.id)) return;
    await options.resolveCommitmentsByText?.(
      baseDir(),
      `${item.title || ""} ${item.message || ""}`,
      resolvedAt
    );
    reconciledReminderIds.add(item.id);
  }

  function reconcileCompletedReminderCommitments() {
    if (reconciliationPromise) return reconciliationPromise;
    reconciliationPromise = (async () => {
      const completed = (await dependencies.listSchedules(baseDir(), { includeHistory: true }))
        .filter((item) => item.type === "reminder" && item.status === "completed")
        .slice(-100);
      for (const item of completed) {
        try {
          await reconcileReminder(item);
        } catch (error) {
          reportError("commitment-reconciliation", error);
        }
      }
      return options.loadCompanionMemory?.(baseDir());
    })().finally(() => { reconciliationPromise = null; });
    return reconciliationPromise;
  }

  function launchSpecFor(id) {
    return dependencies.buildScheduledLaunchSpec({
      executablePath: options.getExecutablePath(),
      appPath: options.getAppPath(),
      isPackaged: options.isPackaged(),
      scheduleId: id
    });
  }

  async function syncWindowsScheduleTasks() {
    if (options.platform !== "win32") return [];
    const currentTime = now();
    const items = await dependencies.listSchedules(baseDir(), { includeHistory: true });
    const results = [];
    for (const item of items) {
      const windowsState = item.integration?.windows || {};
      const shouldRegister = item.status === "scheduled" && new Date(item.dueAt) > currentTime;
      if (shouldRegister) {
        if (windowsState.status === "registered" && windowsState.dueAt === item.dueAt) continue;
        let result;
        try {
          result = await dependencies.registerWindowsScheduleTask(item, launchSpecFor(item.id), { now: currentTime });
        } catch (error) {
          result = { ok: false, error: errorMessage(error) };
        }
        try {
          await dependencies.updateScheduleIntegration(baseDir(), item.id, {
            windows: {
              status: result.ok ? "registered" : "failed",
              taskName: result.taskName || "",
              dueAt: item.dueAt,
              error: result.error || ""
            }
          }, currentTime);
        } catch (error) {
          reportError("windows-integration-state", error);
          result = { ...result, integrationError: errorMessage(error) };
        }
        results.push({ id: item.id, ...result });
        continue;
      }
      if (!["registered", "remove_failed"].includes(windowsState.status)) continue;
      let result;
      try {
        result = await dependencies.unregisterWindowsScheduleTask(item.id);
      } catch (error) {
        result = { ok: false, error: errorMessage(error) };
      }
      try {
        await dependencies.updateScheduleIntegration(baseDir(), item.id, {
          windows: { ...windowsState, status: result.ok ? "removed" : "remove_failed", error: result.error || "" }
        }, currentTime);
      } catch (error) {
        reportError("windows-integration-state", error);
        result = { ...result, integrationError: errorMessage(error) };
      }
      results.push({ id: item.id, ...result });
    }
    return results;
  }

  async function afterMutation() {
    let integrationResults = [];
    try {
      integrationResults = await syncWindowsScheduleTasks();
    } catch (error) {
      reportError("windows-integration", error);
    }
    const items = await broadcastSchedules();
    return { items, integrationResults };
  }

  function schedulePowerResult(item, generation) {
    if (disposed || generation !== lifecycleGeneration) return;
    const existing = powerResultTimers.get(item.id);
    if (existing !== undefined) clearTimeoutImpl(existing);
    const timeout = setTimeoutImpl(() => {
      powerResultTimers.delete(item.id);
      if (disposed || generation !== lifecycleGeneration) return;
      void dependencies.markPowerResult(baseDir(), item.id, true, "", now())
        .then(() => broadcastSchedules())
        .catch((error) => reportError("power-result", error));
    }, powerResultDelayMs);
    powerResultTimers.set(item.id, timeout);
  }

  async function processReminder(item, generation, tickTime) {
    try {
      await reconcileReminder(item, tickTime);
    } catch (error) {
      reportError("reminder-commitment", error);
    }
    if (disposed || generation !== lifecycleGeneration) return;
    await options.publishProactiveEvent?.({
      kind: "reminder",
      message: `提醒时间到了：${item.message}`,
      mood: "surprised"
    });
  }

  async function processPower(item, generation) {
    if (disposed || generation !== lifecycleGeneration) return;
    try {
      await dependencies.executeWindowsPowerAction(item.action);
    } catch (error) {
      await dependencies.markPowerResult(baseDir(), item.id, false, errorMessage(error), now());
      if (disposed || generation !== lifecycleGeneration) return;
      await options.publishProactiveEvent?.({
        kind: "power_failed",
        message: `定时电源操作没有执行成功：${errorMessage(error)}`,
        mood: "sad"
      });
      return;
    }
    if (disposed || generation !== lifecycleGeneration) return;
    try {
      await options.publishProactiveEvent?.({
        kind: `power_${item.action}`,
        message: `定时${item.action === "restart" ? "重启" : "关机"}将在 60 秒后执行。需要取消的话，请马上说“取消定时${item.action === "restart" ? "重启" : "关机"}”。`,
        mood: "surprised"
      });
    } catch (error) {
      reportError("power-notification", error);
    }
    if (disposed || generation !== lifecycleGeneration) return;
    try {
      schedulePowerResult(item, generation);
    } catch (error) {
      reportError("power-result-timer", error);
    }
  }

  function tick() {
    if (disposed) return Promise.reject(new Error("日程服务已经关闭。"));
    if (!acceptTicks) return Promise.resolve([]);
    if (tickPromise) return tickPromise;
    const generation = lifecycleGeneration;
    tickPromise = (async () => {
      if (options.isHostReady && !options.isHostReady()) return [];
      const tickTime = now();
      const due = await dependencies.processDueSchedules(baseDir(), tickTime);
      for (const item of due) {
        if (disposed || generation !== lifecycleGeneration) break;
        try {
          if (item.type === "reminder") await processReminder(item, generation, tickTime);
          else await processPower(item, generation);
        } catch (error) {
          reportError(`schedule-${item.type || "unknown"}`, error);
        }
      }
      if (due.length && !disposed && generation === lifecycleGeneration) await afterMutation();
      return due;
    })().catch((error) => {
      reportError("tick", error);
      return [];
    }).finally(() => { tickPromise = null; });
    return tickPromise;
  }

  async function publishTodayAgenda() {
    const items = (await dependencies.listSchedulesForDay(baseDir(), now()))
      .filter((item) => item.status === "scheduled")
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    if (!items.length) return [];
    const lines = items.slice(0, 5).map((item) => {
      const time = new Date(item.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      return `${time} ${item.title}`;
    });
    const remaining = items.length > 5 ? `，另外还有 ${items.length - 5} 项` : "";
    await options.publishProactiveEvent?.({
      kind: "today_agenda",
      message: `今天有 ${items.length} 项安排：${lines.join("；")}${remaining}。我会按时通过 Windows 通知提醒你。`,
      mood: "happy"
    });
    return items;
  }

  function start(startOptions = {}) {
    if (disposed) return Promise.reject(new Error("日程服务已经关闭。"));
    if (started) return startPromise || Promise.resolve(snapshot());
    started = true;
    acceptTicks = true;
    const generation = ++lifecycleGeneration;
    startPromise = (async () => {
      try { await syncWindowsScheduleTasks(); } catch (error) { reportError("startup-windows-integration", error); }
      if (generation === lifecycleGeneration && started) {
        try {
          const legacyExecuting = (await dependencies.listSchedules(baseDir(), { includeHistory: true }))
            .filter((item) => item.type === "power" && item.status === "executing");
          for (const item of legacyExecuting) schedulePowerResult(item, generation);
        } catch (error) {
          reportError("executing-power-recovery", error);
        }
      }
      if (generation === lifecycleGeneration && started) await tick();
      if (startOptions.publishAgenda !== false && generation === lifecycleGeneration && started) {
        try { await publishTodayAgenda(); } catch (error) { reportError("startup-agenda", error); }
      }
      if (generation === lifecycleGeneration && started && timer === null) {
        try {
          timer = setIntervalImpl(() => {
            if (!started) return;
            void tick().catch((error) => reportError("timer-tick", error));
          }, tickIntervalMs);
        } catch (error) {
          reportError("timer-start", error);
        }
      }
      return snapshot();
    })().finally(() => { startPromise = null; });
    return startPromise;
  }

  function stop() {
    if (!started && timer === null && powerResultTimers.size === 0 && !tickPromise) return snapshot();
    started = false;
    acceptTicks = false;
    lifecycleGeneration += 1;
    if (timer !== null) clearIntervalImpl(timer);
    timer = null;
    for (const timeout of powerResultTimers.values()) clearTimeoutImpl(timeout);
    powerResultTimers.clear();
    return snapshot();
  }

  function snapshot() {
    return {
      started,
      disposed,
      tickRunning: Boolean(tickPromise),
      pendingPowerResults: powerResultTimers.size,
      lastError
    };
  }

  const handlers = new Map([
    ["agent:list-schedules", async () => dependencies.listSchedules(baseDir())],
    ["agent:cancel-schedule", async (_event, id) => {
      const item = await dependencies.cancelSchedule(baseDir(), id, now(), {
        beforeCancel: () => dependencies.abortWindowsPowerAction()
      });
      const powerTimer = powerResultTimers.get(item.id);
      if (powerTimer !== undefined) {
        clearTimeoutImpl(powerTimer);
        powerResultTimers.delete(item.id);
      }
      await afterMutation();
      return item;
    }]
  ]);

  try {
    for (const [channel, handler] of handlers) {
      options.trustedIpc.handle(channel, handler);
      registeredChannels.add(channel);
    }
  } catch (error) {
    for (const channel of registeredChannels) {
      try { options.trustedIpc.removeHandler(channel); } catch {}
    }
    registeredChannels.clear();
    throw error;
  }

  function dispose() {
    if (disposed) return;
    stop();
    for (const channel of [...registeredChannels]) {
      options.trustedIpc.removeHandler(channel);
      registeredChannels.delete(channel);
    }
    disposed = true;
  }

  return {
    start,
    stop,
    tick,
    snapshot,
    afterMutation,
    broadcastSchedules,
    syncWindowsScheduleTasks,
    abortPowerAction: () => dependencies.abortWindowsPowerAction(),
    reconcileCompletedReminderCommitments,
    dispose
  };
}
