import { ensureRagIndexFresh, rebuildKnowledgeIndex } from "../../src-agent/core.js";

const cancelled = new Set();
const handlers = Object.freeze({
  "rag:ensure": ({ baseDir }) => ensureRagIndexFresh(baseDir),
  "rag:rebuild": ({ baseDir }) => rebuildKnowledgeIndex(baseDir)
});

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : ""
  };
}

process.parentPort?.on("message", async (event) => {
  const message = event.data;
  if (message?.kind === "cancel") {
    cancelled.add(message.taskId);
    return;
  }
  if (message?.kind !== "run" || !message.taskId) return;
  const handler = handlers[message.type];
  if (!handler) {
    process.parentPort.postMessage({ taskId: message.taskId, ok: false, error: { message: `不支持的后台任务：${message.type}` } });
    return;
  }
  try {
    const result = await handler(message.payload || {});
    if (!cancelled.has(message.taskId)) process.parentPort.postMessage({ taskId: message.taskId, ok: true, result });
  } catch (error) {
    if (!cancelled.has(message.taskId)) process.parentPort.postMessage({ taskId: message.taskId, ok: false, error: serializeError(error) });
  } finally {
    cancelled.delete(message.taskId);
  }
});
