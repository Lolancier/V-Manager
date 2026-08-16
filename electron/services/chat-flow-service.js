import { classifyFastReaction } from "../../src-agent/fast-reaction.js";
import {
  detectProactiveFeedback,
  loadCompanionMemory,
  recordProactiveFeedback
} from "../../src-agent/companion-memory.js";
import { getRecentConversationMessages } from "../../src-agent/local-database.js";
import { resolveAgentRoute } from "../../src-agent/router.js";

function getReplySourceLabel(meta = {}) {
  if (!meta) return "尚未发送对话";
  if (meta.responseMode === "deepseek_chat") {
    return meta.model ? `快速对话 · ${meta.model}` : "快速对话";
  }
  if (meta.responseMode === "deepseek" || meta.responseMode === "deepseek_tool") {
    if (meta.codeMode) {
      const labels = { auto: "自动", read: "问答", plan: "规划", agent: "Agent", review: "审查" };
      const toolSuffix = meta.toolUseCount ? ` · ${meta.toolUseCount} 次工具` : "";
      return `Vivi Code · ${labels[meta.codeMode] || meta.codeMode}${toolSuffix}`;
    }
    return meta.model ? `DeepSeek · ${meta.model}` : "DeepSeek";
  }
  if (meta.responseMode === "local_tool") return "本地检测";
  return "本地回退";
}

export function createChatFlowService(options) {
  const dependencies = {
    classifyFastReaction,
    detectProactiveFeedback,
    getRecentConversationMessages,
    loadCompanionMemory,
    recordProactiveFeedback,
    resolveAgentRoute,
    ...(options.dependencies || {})
  };
  let agentTaskRunning = false;
  let started = false;
  let disposed = false;
  let generation = 0;
  let startupPromise = null;
  let activeChatPromise = null;
  let startupDiagnostics = options.initialStartupDiagnostics || {
    rag: null,
    deepseek: "unchecked",
    historyRestored: 0
  };

  function ensureActive() {
    if (disposed) throw new Error("聊天流服务已经释放。");
    if (!started) throw new Error("聊天流服务尚未启动。");
  }

  async function initializeStartupConversation(config, personaService) {
    ensureActive();
    if (startupPromise) return startupPromise;
    const startupGeneration = generation;
    startupPromise = (async () => {
      try {
        const runtimePersona = await personaService.applyRuntimePersona(config);
        const activeCard = runtimePersona.card;
        const history = await dependencies.getRecentConversationMessages(options.getBaseDir(), {
          limit: 40,
          personaCardId: activeCard?.id || ""
        });
        const memory = await dependencies.loadCompanionMemory(options.getBaseDir());
        const greeting = await options.modelService.generateGreeting(runtimePersona.config, {
          history,
          memory,
          userAddress: activeCard?.payload?.userAddress || "你"
        });
        if (startupGeneration !== generation) return options.chatStateStore.getState();
        options.chatStateStore.initializeStartup({
          messages: [...history.map(({ role, content }) => ({ role, content })), {
            role: "assistant",
            content: greeting.reply
          }],
          lastReplyMeta: {
            responseMode: greeting.mode === "model" ? "deepseek_chat" : "fallback_local",
            usedKnowledge: false,
            knowledgeCount: 0,
            knowledgeFiles: [],
            fallbackReason: greeting.mode === "model" ? "" : "启动问候使用人物卡本地回退",
            model: greeting.mode === "model"
              ? runtimePersona.config.deepseek.chatModel || runtimePersona.config.deepseek.model
              : "local-persona-greeting",
            sourceLabel: "本次见面"
          }
        });
        options.onRuntimePersona?.(runtimePersona);
        startupDiagnostics = {
          ...startupDiagnostics,
          deepseek: greeting.mode === "model"
            ? "ready"
            : runtimePersona.config.deepseek?.apiKey ? "unavailable" : "not_configured",
          historyRestored: history.length
        };
        return runtimePersona.config;
      } finally {
        startupPromise = null;
      }
    })();
    return startupPromise;
  }

  async function handleChat(payload) {
    ensureActive();
    if (activeChatPromise) return activeChatPromise;
    const chatGeneration = generation;
    activeChatPromise = (async () => {
      try {
        await options.companionLifeService.markOwnerInteraction();
        if (chatGeneration !== generation) return options.chatStateStore.getState();
    const interestReply = await options.autonomousService.handleChat(payload.message);
        if (chatGeneration !== generation) return options.chatStateStore.getState();
        if (interestReply) return interestReply;

        const chatState = options.chatStateStore.getState();
        if (String(chatState.lastReplyMeta?.localTool || "").startsWith("proactive_")) {
          const feedback = dependencies.detectProactiveFeedback(payload.message);
          if (feedback) await dependencies.recordProactiveFeedback(options.getBaseDir(), feedback);
        }

        const route = payload.codeContext ? { type: "workspace_code" } : dependencies.resolveAgentRoute(payload.message);
        const isAction = route.type !== "chat";
        const isQuery = /查询|查看|看看|检查|状态|多少|有没有|在运行吗|还在吗/.test(payload.message);
        const pendingText = isAction ? (isQuery ? "正在查询本机状态..." : "正在执行...") : "";
        options.chatStateStore.beginReply({
          message: payload.message,
          pendingText,
          responseMode: isAction ? "local_tool" : "deepseek_chat",
          sourceLabel: isAction ? pendingText : "生成中..."
        });
        options.wakeBubbleWindow();
        options.broadcastMood({
          phase: "anticipation",
          ...dependencies.classifyFastReaction(payload.message)
        });

        let result;
        agentTaskRunning = true;
        try {
          result = await options.modelService.generateReply(payload, {
            stream: true,
            onDelta: (partialReply) => {
              if (chatGeneration === generation) options.chatStateStore.updatePendingReply(partialReply);
            }
          });
          await options.autonomousService.markOwnerTaskCompleted();
        } finally {
          agentTaskRunning = false;
        }

        if (chatGeneration !== generation) return options.chatStateStore.getState();
        if (result.meta?.personaChanged) await options.personaService.refreshRuntimePersona();
        const nextState = options.chatStateStore.finalizeReply({
          reply: result.reply,
          knowledge: result.knowledge,
          lastReplyMeta: { ...result.meta, sourceLabel: getReplySourceLabel(result.meta) }
        });
        if (result.meta?.relationship) options.broadcastRelationshipProfile(result.meta.relationship);
        options.clearTransientExpressions();
        options.broadcastMood({
          phase: "final",
          mood: result.meta?.detectedMood || "happy",
          faceParams: result.meta?.faceParams || null,
          reply: result.reply
        });
        return nextState;
      } finally {
        activeChatPromise = null;
      }
    })();
    return activeChatPromise;
  }

  return {
    handleChat,
    initializeStartupConversation,
    isOwnerTaskRunning: () => agentTaskRunning,
    getStartupDiagnostics: () => startupDiagnostics,
    snapshot: () => ({
      agentTaskRunning,
      chatState: options.chatStateStore.getState(),
      disposed,
      started,
      startupDiagnostics,
      startupRunning: startupPromise !== null
    }),
    start() {
      if (disposed) throw new Error("聊天流服务已经释放。");
      started = true;
      return this.snapshot();
    },
    updateStartupDiagnostics(patch) {
      startupDiagnostics = { ...startupDiagnostics, ...patch };
      return startupDiagnostics;
    },
    async stop() {
      generation += 1;
      started = false;
      await Promise.allSettled([startupPromise, activeChatPromise].filter(Boolean));
      agentTaskRunning = false;
      return this.snapshot();
    },
    async dispose() {
      generation += 1;
      started = false;
      disposed = true;
      await Promise.allSettled([startupPromise, activeChatPromise].filter(Boolean));
      agentTaskRunning = false;
      return this.snapshot();
    }
  };
}
