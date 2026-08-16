export function createChatStateStore(options = {}) {
  let state = options.initialState || {
    messages: [],
    knowledge: [],
    lastReplyMeta: null
  };
  let started = false;
  let disposed = false;
  let generation = 0;

  function ensureActive() {
    if (disposed) throw new Error("聊天状态服务已经释放。");
    if (!started) throw new Error("聊天状态服务尚未启动。");
  }

  function commit(next, { broadcast = true } = {}) {
    ensureActive();
    state = next;
    if (broadcast) options.onStateUpdated?.(state);
    return state;
  }

  function getState() {
    return state;
  }

  function reset({ broadcast = true } = {}) {
    return commit({
      messages: [],
      knowledge: [],
      lastReplyMeta: null
    }, { broadcast });
  }

  function initializeStartup({ messages, lastReplyMeta }) {
    return commit({
      messages: messages.slice(-80),
      knowledge: [],
      lastReplyMeta
    }, { broadcast: false });
  }

  function appendAssistant(content, lastReplyMeta, { replaceLastTouch = false, broadcast = true } = {}) {
    const previousMessages = replaceLastTouch
      && state.lastReplyMeta?.sourceLabel === "触碰互动"
      && state.messages.at(-1)?.role === "assistant"
      ? state.messages.slice(0, -1)
      : state.messages;
    return commit({
      ...state,
      messages: [...previousMessages, { role: "assistant", content }],
      lastReplyMeta
    }, { broadcast });
  }

  function appendLocalInteraction({ userText, message, lastReplyMeta }) {
    const interactionMessages = userText
      ? [{ role: "user", content: userText }, { role: "assistant", content: message }]
      : [{ role: "assistant", content: message }];
    return commit({
      ...state,
      messages: [...state.messages, ...interactionMessages],
      lastReplyMeta
    });
  }

  function appendProactiveEvent(event) {
    const commitGeneration = generation;
    const next = appendLocalInteraction({
      message: event.message,
      lastReplyMeta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        localTool: `proactive_${event.kind}`,
        model: "local-life-engine",
        sourceLabel: "Vivi 主动陪伴"
      }
    });
    return commitGeneration === generation ? next : state;
  }

  function beginReply({ message, pendingText, responseMode, sourceLabel }) {
    return commit({
      ...state,
      messages: [
        ...state.messages,
        { role: "user", content: message },
        { role: "assistant", content: pendingText }
      ],
      lastReplyMeta: {
        responseMode,
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        model: "",
        sourceLabel
      }
    });
  }

  function updatePendingReply(partialReply) {
    const messages = [...state.messages];
    messages[messages.length - 1] = { role: "assistant", content: partialReply };
    return commit({ ...state, messages });
  }

  function finalizeReply({ reply, knowledge, lastReplyMeta }) {
    return commit({
      messages: [...state.messages.slice(0, -1), { role: "assistant", content: reply }],
      knowledge,
      lastReplyMeta
    });
  }

  return {
    appendAssistant,
    appendLocalInteraction,
    appendProactiveEvent,
    beginReply,
    finalizeReply,
    getState,
    initializeStartup,
    reset,
    snapshot: getState,
    start() {
      if (disposed) throw new Error("聊天状态服务已经释放。");
      started = true;
      return getState();
    },
    stop() {
      started = false;
      return getState();
    },
    async dispose() {
      generation += 1;
      started = false;
      disposed = true;
      return getState();
    },
    updatePendingReply
  };
}
