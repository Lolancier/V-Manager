import { ensureRagIndexFresh, rebuildRagIndex } from "../../src-agent/rag.js";

export const UTILITY_TASK_HANDLERS = Object.freeze({
  "rag:ensure": ({ baseDir }) => ensureRagIndexFresh(baseDir),
  "rag:rebuild": ({ baseDir }) => rebuildRagIndex(baseDir)
});

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : ""
  };
}

export function createUtilityMessageHandler(options) {
  const active = new Set();
  const cancelled = new Set();
  const handlers = options.handlers || UTILITY_TASK_HANDLERS;
  const postMessage = (message) => {
    try { options.postMessage(message); }
    catch { /* the parent process will reject through exit or timeout */ }
  };
  return async (message) => {
    if (message?.kind === "cancel") {
      if (active.has(message.taskId)) cancelled.add(message.taskId);
      return;
    }
    if (message?.kind !== "run" || !message.taskId) return;
    const handler = handlers[message.type];
    if (!handler) {
      postMessage({ taskId: message.taskId, ok: false, error: { message: `不支持的后台任务：${message.type}` } });
      return;
    }
    active.add(message.taskId);
    try {
      const result = await handler(message.payload || {});
      if (cancelled.has(message.taskId)) postMessage({ taskId: message.taskId, cancelled: true });
      else postMessage({ taskId: message.taskId, ok: true, result });
    } catch (error) {
      if (cancelled.has(message.taskId)) postMessage({ taskId: message.taskId, cancelled: true });
      else postMessage({ taskId: message.taskId, ok: false, error: serializeError(error) });
    } finally {
      active.delete(message.taskId);
      cancelled.delete(message.taskId);
    }
  };
}

if (process.parentPort) {
  const handleMessage = createUtilityMessageHandler({ postMessage: (message) => process.parentPort.postMessage(message) });
  process.parentPort.on("message", (event) => void handleMessage(event.data));
}
