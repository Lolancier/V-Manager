import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const RENDERER_READY_LISTENER_CHANNELS = Object.freeze([
  "agent:renderer-ready"
]);
export const RENDERER_READY_IPC_MANIFEST = Object.freeze({
  handles: [],
  listeners: RENDERER_READY_LISTENER_CHANNELS
});

export function createRendererReadyService(options) {
  let petRendererReadyCount = 0;
  let lastModelStatus = null;

  function rendererReady(_event, payload) {
    if (payload?.view !== "pet") return;
    const modelStatus = payload?.modelStatus === "error" ? "error" : "ready";
    petRendererReadyCount += 1;
    lastModelStatus = modelStatus;
    if (options.getStartupStatus().phase === "renderer") options.releaseStartup(modelStatus);
  }

  const runtime = createTrustedDomainIpcService({
    serviceName: "渲染就绪服务",
    trustedIpc: options.trustedIpc,
    listeners: RENDERER_READY_LISTENER_CHANNELS.map((channel) => ({
      channel,
      listener: rendererReady
    })),
    snapshot: () => ({
      petRendererReadyCount,
      lastModelStatus
    })
  });

  return {
    ...runtime,
    getModelStatus: () => lastModelStatus
  };
}
