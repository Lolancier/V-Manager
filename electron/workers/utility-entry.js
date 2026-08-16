import { ensureRagIndexFresh, rebuildRagIndex } from "../../src-agent/rag.js";
import { synthesizeElevenLabsSpeech } from "../../src-agent/elevenlabs.js";
import { synthesizeLocalSpeech } from "../../src-agent/local-tts.js";
import { synthesizeGptSovitsSpeech } from "../../src-agent/gpt-sovits.js";
import { transcribeLocalSpeech } from "../../src-agent/local-stt.js";

export const UTILITY_TASK_HANDLERS = Object.freeze({
  "rag:ensure": ({ baseDir }) => ensureRagIndexFresh(baseDir),
  "rag:rebuild": ({ baseDir }) => rebuildRagIndex(baseDir),
  "speech:local-synthesize": ({ baseDir, voiceConfig, text }) => synthesizeLocalSpeech(baseDir, voiceConfig || {}, text),
  "speech:gpt-synthesize": ({ baseDir, voiceConfig, text }) => synthesizeGptSovitsSpeech(baseDir, voiceConfig || {}, text),
  "speech:elevenlabs-synthesize": ({ voiceConfig, text, asmr }) => synthesizeElevenLabsSpeech(voiceConfig || {}, text, { asmr: Boolean(asmr) }),
  "speech:local-transcribe": ({ baseDir, audioBytes, speechInput }) => transcribeLocalSpeech(baseDir, audioBytes, speechInput || {})
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
  const terminal = new Map();
  const handlers = options.handlers || UTILITY_TASK_HANDLERS;
  const terminalTimeoutMs = Math.max(1_000, Number(options.terminalTimeoutMs) || 15 * 60 * 1000);
  const maxTerminalStates = Math.max(1, Number(options.maxTerminalStates) || 128);
  let protocolFailed = false;
  const failProtocol = (error) => {
    if (protocolFailed) return;
    protocolFailed = true;
    for (const state of terminal.values()) clearTimeout(state.timer);
    terminal.clear();
    options.onProtocolFailure?.(error instanceof Error ? error : new Error(String(error)));
  };
  const postMessage = (message) => {
    try {
      options.postMessage(message);
      return true;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  };
  const rememberTerminal = (taskId, error) => {
    if (terminal.size >= maxTerminalStates) {
      failProtocol(new Error("后台任务终态回传连续失败，worker 将退出以释放父进程锁。"));
      return;
    }
    const timer = setTimeout(() => {
      terminal.delete(taskId);
      failProtocol(error);
    }, terminalTimeoutMs);
    timer.unref?.();
    terminal.set(taskId, { timer });
  };
  const sendTerminal = (taskId, message, recoverOnCancel = true) => {
    const outcome = postMessage(message);
    if (outcome === true) return;
    if (recoverOnCancel) rememberTerminal(taskId, outcome);
    else failProtocol(outcome);
  };
  const handleMessage = async (message) => {
    if (protocolFailed) return;
    if (message?.kind === "cancel") {
      const terminalState = terminal.get(message.taskId);
      if (terminalState) {
        clearTimeout(terminalState.timer);
        terminal.delete(message.taskId);
        sendTerminal(message.taskId, { taskId: message.taskId, cancelled: true }, false);
      } else if (active.has(message.taskId)) {
        cancelled.add(message.taskId);
      }
      return;
    }
    if (message?.kind !== "run" || !message.taskId) return;
    const handler = handlers[message.type];
    if (!handler) {
      sendTerminal(message.taskId, { taskId: message.taskId, ok: false, error: { message: `不支持的后台任务：${message.type}` } });
      return;
    }
    active.add(message.taskId);
    try {
      const result = await handler(message.payload || {});
      if (cancelled.has(message.taskId)) sendTerminal(message.taskId, { taskId: message.taskId, cancelled: true }, false);
      else sendTerminal(message.taskId, { taskId: message.taskId, ok: true, result });
    } catch (error) {
      if (cancelled.has(message.taskId)) sendTerminal(message.taskId, { taskId: message.taskId, cancelled: true }, false);
      else sendTerminal(message.taskId, { taskId: message.taskId, ok: false, error: serializeError(error) });
    } finally {
      active.delete(message.taskId);
      cancelled.delete(message.taskId);
    }
  };
  handleMessage.snapshot = () => ({ active: active.size, terminal: terminal.size, protocolFailed });
  return handleMessage;
}

if (process.parentPort) {
  const handleMessage = createUtilityMessageHandler({
    postMessage: (message) => process.parentPort.postMessage(message),
    onProtocolFailure: () => process.exit(1)
  });
  process.parentPort.on("message", (event) => void handleMessage(event.data));
}
