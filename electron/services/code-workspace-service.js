import {
  listWorkspaceCodeFiles,
  readWorkspaceCode,
  writeWorkspaceCode
} from "../../src-agent/code-executor.js";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const CODE_WORKSPACE_HANDLE_CHANNELS = Object.freeze([
  "agent:get-code-workspace",
  "agent:read-code-file",
  "agent:write-code-file",
  "agent:select-code-workspace"
]);

const defaultDependencies = {
  listWorkspaceCodeFiles,
  readWorkspaceCode,
  writeWorkspaceCode
};

export function createCodeWorkspaceService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const operations = new Map(CODE_WORKSPACE_HANDLE_CHANNELS.map((channel) => [channel, 0]));

  function record(channel) {
    operations.set(channel, operations.get(channel) + 1);
  }

  async function getWorkspace() {
    const result = await dependencies.listWorkspaceCodeFiles({ workspaceDir: options.getActiveWorkspaceDir() });
    record("agent:get-code-workspace");
    return result;
  }

  async function readCodeFile(_event, relativePath) {
    const result = await dependencies.readWorkspaceCode(relativePath, { workspaceDir: options.getActiveWorkspaceDir() });
    record("agent:read-code-file");
    return result;
  }

  async function writeCodeFile(_event, payload) {
    const result = await dependencies.writeWorkspaceCode(
      {
        path: payload?.path,
        content: payload?.content,
        expected_content: payload?.expectedContent
      },
      { workspaceDir: options.getActiveWorkspaceDir(), codeAgentConfirmed: true }
    );
    record("agent:write-code-file");
    return result;
  }

  async function selectWorkspace() {
    const result = await options.showOpenDialog({
      title: "选择代码工作区",
      defaultPath: options.getActiveWorkspaceDir(),
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    options.setActiveWorkspaceDir(result.filePaths[0]);
    await options.persistCodeWorkspace();
    const files = await dependencies.listWorkspaceCodeFiles({ workspaceDir: options.getActiveWorkspaceDir() });
    record("agent:select-code-workspace");
    return files;
  }

  return createTrustedDomainIpcService({
    serviceName: "代码工作区服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:get-code-workspace", listener: getWorkspace },
      { channel: "agent:read-code-file", listener: readCodeFile },
      { channel: "agent:write-code-file", listener: writeCodeFile },
      { channel: "agent:select-code-workspace", listener: selectWorkspace }
    ],
    snapshot: () => ({
      operations: Object.fromEntries(operations),
      workspaceDir: options.getActiveWorkspaceDir()
    })
  });
}
