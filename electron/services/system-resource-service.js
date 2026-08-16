import {
  getAppRegistrySnapshot,
  getSystemResourceSnapshot,
  rebuildAppRegistry,
  searchLocalFiles
} from "../../src-agent/core.js";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const SYSTEM_RESOURCE_HANDLE_CHANNELS = Object.freeze([
  "agent:get-auto-launch",
  "agent:set-auto-launch",
  "agent:search-files",
  "agent:get-app-registry",
  "agent:refresh-app-registry",
  "agent:get-system-resource-snapshot"
]);
export const SYSTEM_RESOURCE_IPC_MANIFEST = Object.freeze({
  handles: SYSTEM_RESOURCE_HANDLE_CHANNELS,
  listeners: []
});

const defaultDependencies = {
  getAppRegistrySnapshot,
  getSystemResourceSnapshot,
  rebuildAppRegistry,
  searchLocalFiles
};

export function createSystemResourceService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  let cachedAutoLaunchEnabled = null;

  function isAutoLaunchEnabled({ refresh = false } = {}) {
    if (!refresh && cachedAutoLaunchEnabled !== null) return cachedAutoLaunchEnabled;
    cachedAutoLaunchEnabled = Boolean(options.readLoginItemSettings?.().openAtLogin);
    return cachedAutoLaunchEnabled;
  }

  function setAutoLaunchEnabled(enabled) {
    options.writeLoginItemSettings?.(enabled);
    const applied = isAutoLaunchEnabled({ refresh: true });
    options.broadcastAutoLaunchUpdate?.(applied);
    return applied;
  }

  const runtime = createTrustedDomainIpcService({
    serviceName: "系统资源服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:get-auto-launch", listener: () => isAutoLaunchEnabled() },
      { channel: "agent:set-auto-launch", listener: (_event, enabled) => setAutoLaunchEnabled(enabled) },
      { channel: "agent:search-files", listener: (_event, query) => dependencies.searchLocalFiles(query) },
      { channel: "agent:get-app-registry", listener: () => dependencies.getAppRegistrySnapshot(options.getBaseDir()) },
      { channel: "agent:refresh-app-registry", listener: () => dependencies.rebuildAppRegistry(options.getBaseDir()) },
      { channel: "agent:get-system-resource-snapshot", listener: () => dependencies.getSystemResourceSnapshot() }
    ],
    snapshot: () => ({ autoLaunchEnabled: cachedAutoLaunchEnabled })
  });

  return {
    ...runtime,
    isAutoLaunchEnabled,
    setAutoLaunchEnabled
  };
}
