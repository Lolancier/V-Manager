import { getFileManagerSnapshot } from "../../src-agent/core.js";
import {
  createOrganizationPreview,
  executeOrganizationPreview,
  listFileOperations,
  scanManagedDirectory,
  undoFileOperation
} from "../../src-agent/safe-file-manager.js";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const FILE_MANAGER_HANDLE_CHANNELS = Object.freeze([
  "agent:get-file-manager-snapshot",
  "agent:scan-managed-directory",
  "agent:preview-file-organization",
  "agent:execute-file-organization",
  "agent:list-file-operations",
  "agent:undo-file-operation"
]);
export const FILE_MANAGER_IPC_MANIFEST = Object.freeze({
  handles: FILE_MANAGER_HANDLE_CHANNELS,
  listeners: []
});

const defaultDependencies = {
  createOrganizationPreview,
  executeOrganizationPreview,
  getFileManagerSnapshot,
  listFileOperations,
  scanManagedDirectory,
  undoFileOperation
};

export function createFileManagerService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };

  return createTrustedDomainIpcService({
    serviceName: "文件管家服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:get-file-manager-snapshot", listener: () => dependencies.getFileManagerSnapshot() },
      { channel: "agent:scan-managed-directory", listener: (_event, target) => dependencies.scanManagedDirectory(target) },
      {
        channel: "agent:preview-file-organization",
        listener: (_event, target, mode, quarantine) => dependencies.createOrganizationPreview(
          options.getBaseDir(),
          target,
          { mode, quarantine: Boolean(quarantine) }
        )
      },
      {
        channel: "agent:execute-file-organization",
        listener: (_event, previewId) => dependencies.executeOrganizationPreview(options.getBaseDir(), previewId)
      },
      { channel: "agent:list-file-operations", listener: () => dependencies.listFileOperations(options.getBaseDir()) },
      {
        channel: "agent:undo-file-operation",
        listener: (_event, operationId) => dependencies.undoFileOperation(options.getBaseDir(), operationId)
      }
    ]
  });
}
