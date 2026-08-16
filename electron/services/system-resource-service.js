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

const defaultDependencies = {
  getAppRegistrySnapshot,
  getSystemResourceSnapshot,
  rebuildAppRegistry,
  searchLocalFiles
};

export function createSystemResourceService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };

  return createTrustedDomainIpcService({
    serviceName: "系统资源服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:get-auto-launch", listener: () => options.isAutoLaunchEnabled() },
      { channel: "agent:set-auto-launch", listener: (_event, enabled) => options.setAutoLaunchEnabled(enabled) },
      { channel: "agent:search-files", listener: (_event, query) => dependencies.searchLocalFiles(query) },
      { channel: "agent:get-app-registry", listener: () => dependencies.getAppRegistrySnapshot(options.getBaseDir()) },
      { channel: "agent:refresh-app-registry", listener: () => dependencies.rebuildAppRegistry(options.getBaseDir()) },
      { channel: "agent:get-system-resource-snapshot", listener: () => dependencies.getSystemResourceSnapshot() }
    ]
  });
}
