import { randomUUID } from "node:crypto";
import path from "node:path";

export function resolveUtilityEntryPoint(electronDirectory) {
  return path.join(electronDirectory, "workers", "utility-entry.js");
}

function toError(payload, fallback = "后台任务失败。") {
  const error = new Error(String(payload?.message || fallback));
  if (payload?.name) error.name = String(payload.name);
  if (payload?.stack) error.stack = String(payload.stack);
  return error;
}

export function createUtilityTaskSupervisor(options) {
  const pending = new Map();
  let child = null;
  let closed = false;

  const rejectPending = (error, targetProcess) => {
    for (const [taskId, task] of pending) {
      if (targetProcess && task.process !== targetProcess) continue;
      clearTimeout(task.timer);
      task.reject(error);
      task.rejectCompletion(error);
      pending.delete(taskId);
    }
  };

  const handleMessage = (message) => {
    const task = pending.get(message?.taskId);
    if (!task) return;
    pending.delete(message.taskId);
    clearTimeout(task.timer);
    if (message?.cancelled) {
      task.resolveCompletion();
      return;
    }
    if (message.ok) {
      task.resolve(message.result);
      task.resolveCompletion(message.result);
    } else {
      const error = toError(message.error);
      task.reject(error);
      task.rejectCompletion(error);
    }
  };

  const ensureChild = () => {
    if (child) return child;
    if (closed) throw new Error("后台任务服务已经关闭。");
    const spawned = options.fork(options.entryPoint, [], {
      cwd: options.cwd,
      serviceName: options.serviceName || "Vivi Background Tasks",
      stdio: "pipe"
    });
    child = spawned;
    spawned.on("message", handleMessage);
    spawned.on("exit", (code) => {
      if (child === spawned) child = null;
      if (!closed) rejectPending(new Error(`后台任务进程意外退出（${code ?? "unknown"}）。`), spawned);
    });
    spawned.on("error", (error) => {
      if (child === spawned) child = null;
      rejectPending(error instanceof Error ? error : new Error(String(error)), spawned);
    });
    return spawned;
  };

  return {
    run(type, payload = {}, runOptions = {}) {
      if (closed) return Promise.reject(new Error("后台任务服务已经关闭。"));
      let process;
      try {
        process = ensureChild();
      } catch (error) {
        return Promise.reject(error);
      }
      let resolveCompletion;
      let rejectCompletion;
      const completion = new Promise((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
      });
      const result = new Promise((resolve, reject) => {
        const taskId = randomUUID();
        const timeoutMs = Math.max(1, Number(runOptions.timeoutMs) || Number(options.timeoutMs) || 120_000);
        const timer = setTimeout(() => {
          const task = pending.get(taskId);
          if (!task) return;
          task.timedOut = true;
          try {
            process.postMessage({ kind: "cancel", taskId });
          } catch (error) {
            pending.delete(taskId);
            clearTimeout(timer);
            if (child === process) child = null;
            try { process.kill(); } catch { /* clearing the task must not surface a second failure */ }
            rejectCompletion(error);
          }
          reject(new Error(`后台任务 ${type} 超时。`));
        }, timeoutMs);
        pending.set(taskId, { resolve, reject, resolveCompletion, rejectCompletion, timer, type, process, timedOut: false });
        try {
          process.postMessage({ kind: "run", taskId, type, payload });
        } catch (error) {
          pending.delete(taskId);
          clearTimeout(timer);
          reject(error);
          rejectCompletion(error);
        }
      });
      Object.defineProperty(result, "completion", { value: completion, enumerable: false });
      void completion.catch(() => {});
      return result;
    },
    close() {
      if (closed) return false;
      closed = true;
      rejectPending(new Error("后台任务服务正在关闭。"));
      const process = child;
      child = null;
      try { return process?.kill() ?? false; }
      catch { return false; }
    },
    snapshot() {
      return {
        running: Boolean(child),
        closed,
        pending: [...pending.values()].map((task) => task.type)
      };
    }
  };
}
