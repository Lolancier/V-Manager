import {
  buildAgentReply,
  listDeepSeekModels,
  testDeepSeekConnection,
  testDeepSeekRelayConnection
} from "../../src-agent/core.js";
import { resolveDeepSeekEndpoint } from "../../src-agent/deepseek-endpoint.js";
import { generatePersonaCardDraft } from "../../src-agent/persona-generator.js";
import { generateStartupGreeting } from "../../src-agent/startup-greeting.js";

export const MODEL_CONVERSATION_HANDLE_CHANNELS = Object.freeze([
  "agent:chat",
  "agent:test-deepseek",
  "agent:test-deepseek-relay",
  "agent:list-deepseek-models",
  "agent:generate-persona-card-draft"
]);

function abortError(message = "模型服务正在停止。") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function createModelConversationService(options) {
  const dependencies = {
    buildAgentReply,
    testDeepSeekConnection,
    testDeepSeekRelayConnection,
    listDeepSeekModels,
    generatePersonaCardDraft,
    generateStartupGreeting,
    ...(options.dependencies || {})
  };
  const registeredChannels = new Set();
  const activeTasks = new Set();
  let accepting = true;
  let stopPromise = null;
  let disposed = false;

  function register(channel, listener) {
    options.trustedIpc.handle(channel, listener);
    registeredChannels.add(channel);
  }

  function runTask(operation) {
    if (!accepting) return Promise.reject(abortError());
    const controller = new AbortController();
    const task = Promise.resolve().then(() => operation(controller.signal)).finally(() => {
      activeTasks.delete(record);
    });
    const record = { controller, task };
    activeTasks.add(record);
    return task;
  }

  function generateReply(payload, callbacks = {}) {
    return runTask((signal) => dependencies.buildAgentReply(options.getBaseDir(), {
      ...payload,
      signal,
      fetchImpl: options.fetch,
      ragClient: options.ragClient,
      scheduleClient: options.scheduleClient,
      stream: callbacks.stream !== false,
      onDelta: callbacks.onDelta
    }));
  }

  function generateGreeting(config, context) {
    return runTask((signal) => dependencies.generateStartupGreeting(config, context, {
      modelFetch: options.fetch,
      signal
    }));
  }

  function generatePersonaDraft(input) {
    return runTask(async () => {
      const config = options.mergeConfig(await options.loadConfig(options.getBaseDir()));
      return dependencies.generatePersonaCardDraft(config, input, options.fetch);
    });
  }

  function testConnection() {
    return runTask((signal) => dependencies.testDeepSeekConnection(options.getBaseDir(), options.fetch, signal));
  }

  function listModels(relay) {
    return runTask((signal) => dependencies.listDeepSeekModels(relay, options.fetch, signal));
  }

  function testRelay(relay) {
    return runTask((signal) => dependencies.testDeepSeekRelayConnection(relay, options.fetch, signal));
  }

  function caughtInterestReply(activity, configSnapshot = options.getConfig()) {
    return runTask(async (signal) => {
      const title = activity?.title ? `《${activity.title}》` : "这个小游戏";
      const fallback = activity?.type === "mini_game"
        ? `诶……你什么时候过来的？我刚玩到${title}这里，差一点就想装作什么都没发生了。你要看我继续，还是先把位置让给你？`
        : `诶，你回来啦。我刚才在${activity?.label || options.interestStatusLabel(activity?.type)}，本来还想等整理好以后再悄悄给你看的。`;
      const chatEp = resolveDeepSeekEndpoint(configSnapshot, "chat");
      if (!chatEp.apiKey) return fallback;
      const timeout = AbortSignal.timeout(6_000);
      const combinedSignal = typeof AbortSignal.any === "function"
        ? AbortSignal.any([signal, timeout])
        : timeout;
      try {
        const endpoint = `${String(chatEp.baseUrl).replace(/\/$/, "")}/chat/completions`;
        const response = await options.fetch(endpoint, {
          method: "POST",
          signal: combinedSignal,
          headers: {
            authorization: `Bearer ${chatEp.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: chatEp.model,
            temperature: 0.9,
            max_tokens: 260,
            messages: [
              {
                role: "system",
                content: [
                  configSnapshot.personaPrompt || `你是 ${configSnapshot.personaName || "Vivi"}。`,
                  "请严格保持任务启动时人物卡的身份、措辞、亲密程度和表达习惯。",
                  "你正在自己的隔离沙盒里进行私人休闲活动，使用的是主人明确分配给你的沙盒预算。现在主人突然触碰你、发现了这件事。",
                  "表现应是私人小动作被撞见后的短暂慌张、遮掩、窘迫或转而邀请，而不是认错、机械道歉或声称自己越权。",
                  "只说一到两句自然口语。不要写舞台动作、括号描写、标签或固定客服话术；不要照抄用户给过的任何示例句。"
                ].join("\n")
              },
              {
                role: "user",
                content: JSON.stringify({
                  activity: activity?.label || "沙盒活动",
                  gameTitle: activity?.type === "mini_game" ? title : "",
                  canStopOrContinue: true
                })
              }
            ]
          })
        });
        if (!response.ok) return fallback;
        const payload = await response.json();
        const generated = String(payload.choices?.[0]?.message?.content || "").trim()
          .replace(/^\`\`\`[\s\S]*?\n|\`\`\`$/g, "")
          .slice(0, 500);
        return generated || fallback;
      } catch {
        return fallback;
      }
    });
  }

  function registerIpc(chatHandler) {
    if (disposed) throw new Error("模型会话服务已经释放。");
    try {
      register("agent:chat", (_event, payload) => chatHandler(payload));
      register("agent:test-deepseek", () => testConnection());
      register("agent:test-deepseek-relay", (_event, relay) => testRelay(relay));
      register("agent:list-deepseek-models", (_event, relay) => listModels(relay));
      register("agent:generate-persona-card-draft", (_event, input) => generatePersonaDraft(input));
    } catch (error) {
      for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
      registeredChannels.clear();
      throw error;
    }
    return service;
  }

  function stop() {
    if (stopPromise) return stopPromise;
    accepting = false;
    for (const task of activeTasks) task.controller.abort(abortError());
    stopPromise = Promise.allSettled([...activeTasks].map((item) => item.task)).then(() => undefined);
    return stopPromise;
  }

  function dispose() {
    if (disposed) return stop();
    disposed = true;
    const pending = stop();
    for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
    registeredChannels.clear();
    return pending;
  }

  const service = {
    caughtInterestReply,
    dispose,
    generateGreeting,
    generatePersonaDraft,
    generateReply,
    listModels,
    registerIpc,
    snapshot: () => ({ accepting, active: activeTasks.size, channels: [...registeredChannels] }),
    stop,
    testConnection,
    testRelay
  };
  return service;
}
