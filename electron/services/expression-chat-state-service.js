import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const EXPRESSION_CHAT_STATE_HANDLE_CHANNELS = Object.freeze([
  "agent:trigger-expression",
  "agent:clear-expressions",
  "agent:get-chat-state"
]);

export function createExpressionChatStateService(options) {
  const persistentShapeExpressions = new Set(options.persistentShapeExpressions || []);

  async function triggerExpression(_event, expressionName) {
    const name = String(expressionName || "");
    if (!name) return false;

    const manualExpressions = new Set(options.getManualExpressions());
    if (manualExpressions.has(name)) {
      manualExpressions.delete(name);
    } else {
      if (name === "expression20") manualExpressions.delete("expression21");
      if (name === "expression21") manualExpressions.delete("expression20");
      manualExpressions.add(name);
    }
    options.setManualExpressions(manualExpressions);
    options.broadcastActiveExpressions();
    return true;
  }

  async function clearExpressions() {
    options.setManualExpressions(new Set());
    options.broadcastActiveExpressions();
    return true;
  }

  return createTrustedDomainIpcService({
    serviceName: "表情与聊天状态服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:trigger-expression", listener: triggerExpression },
      { channel: "agent:clear-expressions", listener: clearExpressions },
      { channel: "agent:get-chat-state", listener: () => options.getChatState() }
    ],
    snapshot: () => ({
      manualExpressions: [...options.getManualExpressions()],
      persistentShapeExpressions: [...persistentShapeExpressions]
    })
  });
}
