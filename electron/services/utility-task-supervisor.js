import { randomUUID } from "node:crypto";

function toError(payload, fallback = "后台任务失败。") {
  const error = new Error(String(payload?.message || fallback));
  if (payload?.name) error.name = String(payload.name);
  if (payload?.stack) error.stack = String(payload.stack);
  return error;
}

export function createUtilityTaskSupervisor(options) {
  const pending = new Map();
  let child = null;
  let closing = false;

  const rejectPending = (error) => {
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(error);
    }
    pending.clear();
  };

  const handleMessage = (message) => {
    const task = pending.get(message?.taskId);
    if (!task) return;
    pending.delete(message.taskId);
    clearTimeout(task.timer);
    if (message.ok) task.resolve(message.result);
    else task.reject(toError(message.error));
  };

  const ensureChild = () => {
    if (child) return child;
    closing = false;
    child = options.fork(options.entryPoint, [], {
      cwd: options.cwd,
      serviceName: options.serviceName || "Vivi Background Tasks",
      stdio: "pipe"
    });
    child.on("message", handleMessage);
    child.on("exit", (code) => {
      child = null;
      if (!closing) rejectPending(new Error(`后台任务进程意外退出（${code ?? "unknown"}）。`));
    });
    return child;
  };

  return {
    run(type, payload = {}, runOptions = {}) {
      const taskId = randomUUID();
      const timeoutMs = Math.max(1_000, Number(runOptions.timeoutMs) || Number(options.timeoutMs) || 120_000);
      const process = ensureChild();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(taskId);
          process.postMessage({ kind: "cancel", taskId });
          reject(new Error(`后台任务 ${type} 超时。`));
        }, timeoutMs);
        pending.set(taskId, { resolve, reject, timer, type });
        process.postMessage({ kind: "run", taskId, type, payload });
      });
    },
    close() {
      closing = true;
      rejectPending(new Error("后台任务服务正在关闭。"));
      const process = child;
      child = null;
      return process?.kill() ?? false;
    },
    snapshot() {
      return {
        running: Boolean(child),
        pending: [...pending.values()].map((task) => task.type)
      };
    }
  };
}
