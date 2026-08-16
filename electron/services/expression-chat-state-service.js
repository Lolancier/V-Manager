import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const EXPRESSION_CHAT_STATE_HANDLE_CHANNELS = Object.freeze([
  "agent:trigger-expression",
  "agent:clear-expressions",
  "agent:get-chat-state"
]);
export const EXPRESSION_CHAT_STATE_IPC_MANIFEST = Object.freeze({
  handles: EXPRESSION_CHAT_STATE_HANDLE_CHANNELS,
  listeners: []
});

export function createExpressionChatStateService(options) {
  const persistentShapeExpressions = new Set(options.persistentShapeExpressions || [
    "expression20",
    "expression21",
    "expression22",
    "expression24"
  ]);
  let manualExpressions = new Set(options.initialManualExpressions || []);
  let interestExpressions = new Set(options.initialInterestExpressions || []);

  function getActiveExpressions() {
    return [...new Set([...manualExpressions, ...interestExpressions])];
  }

  function broadcastExpressions() {
    options.broadcastActiveExpressions(getActiveExpressions());
  }

  async function triggerExpression(_event, expressionName) {
    const name = String(expressionName || "");
    if (!name) return false;

    const nextExpressions = new Set(manualExpressions);
    if (nextExpressions.has(name)) {
      nextExpressions.delete(name);
    } else {
      if (name === "expression20") nextExpressions.delete("expression21");
      if (name === "expression21") nextExpressions.delete("expression20");
      nextExpressions.add(name);
    }
    manualExpressions = nextExpressions;
    broadcastExpressions();
    return true;
  }

  async function clearExpressions() {
    manualExpressions = new Set();
    broadcastExpressions();
    return true;
  }

  function clearTransientExpressions() {
    manualExpressions = new Set([...manualExpressions].filter((name) => persistentShapeExpressions.has(name)));
    broadcastExpressions();
    return getActiveExpressions();
  }

  const runtime = createTrustedDomainIpcService({
    serviceName: "表情与聊天状态服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:trigger-expression", listener: triggerExpression },
      { channel: "agent:clear-expressions", listener: clearExpressions },
      { channel: "agent:get-chat-state", listener: () => options.chatStateStore.getState() }
    ],
    snapshot: () => ({
      activeExpressions: getActiveExpressions(),
      interestExpressions: [...interestExpressions],
      manualExpressions: [...manualExpressions],
      persistentShapeExpressions: [...persistentShapeExpressions]
    })
  });

  return {
    ...runtime,
    clearTransientExpressions,
    getActiveExpressions,
    getManualExpressions: () => new Set(manualExpressions),
    setInterestExpression: (type) => {
      interestExpressions = type === "mini_game" || type === "play_existing_game" || type === "improve_existing_game"
        ? new Set(["expression27"])
        : ["diary", "drawing", "collect_diary_materials", "browse_information", "organize_memory", "review_drawing", "plan_creation", "prepare_chat_topics"].includes(type)
          ? new Set(["expression25", "expression26"])
          : new Set();
      broadcastExpressions();
    }
  };
}
