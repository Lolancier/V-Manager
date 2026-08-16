import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const WINDOW_INTENT_HANDLE_CHANNELS = Object.freeze([
  "agent:open-settings-window",
  "agent:open-composer-window",
  "agent:open-chat-window",
  "agent:open-code-window",
  "agent:open-scale-window",
  "agent:open-expression-window"
]);
export const WINDOW_INTENT_IPC_MANIFEST = Object.freeze({
  handles: WINDOW_INTENT_HANDLE_CHANNELS,
  listeners: []
});

export function createWindowIntentService(options) {
  const openCallbacks = new Map([
    ["agent:open-settings-window", options.openSettingsWindow],
    ["agent:open-composer-window", options.openComposerWindow],
    ["agent:open-chat-window", options.openChatWindow],
    ["agent:open-code-window", options.openCodeWindow],
    ["agent:open-scale-window", options.openScaleWindow],
    ["agent:open-expression-window", options.openExpressionWindow]
  ]);
  const requests = new Map(WINDOW_INTENT_HANDLE_CHANNELS.map((channel) => [channel, 0]));

  function open(channel) {
    return async () => {
      const result = await openCallbacks.get(channel)();
      requests.set(channel, requests.get(channel) + 1);
      return result;
    };
  }

  return createTrustedDomainIpcService({
    serviceName: "窗口意图服务",
    trustedIpc: options.trustedIpc,
    handlers: WINDOW_INTENT_HANDLE_CHANNELS.map((channel) => ({
      channel,
      listener: open(channel)
    })),
    snapshot: () => ({
      requests: Object.fromEntries(requests)
    })
  });
}
