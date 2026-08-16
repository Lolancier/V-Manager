import {
  listWorkspaceCodeFiles,
  readWorkspaceCode,
  writeWorkspaceCode
} from "../../src-agent/code-executor.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const CODE_WORKSPACE_HANDLE_CHANNELS = Object.freeze([
  "agent:get-code-workspace",
  "agent:read-code-file",
  "agent:write-code-file",
  "agent:select-code-workspace"
]);
export const CODE_WORKSPACE_IPC_MANIFEST = Object.freeze({
  handles: CODE_WORKSPACE_HANDLE_CHANNELS,
  listeners: []
});

const defaultDependencies = {
  fs,
  path,
  listWorkspaceCodeFiles,
  readWorkspaceCode,
  writeWorkspaceCode
};

export function createCodeWorkspaceService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  let workspaceDir = dependencies.path.resolve(options.initialWorkspaceDir || process.cwd());
  const operations = new Map(CODE_WORKSPACE_HANDLE_CHANNELS.map((channel) => [channel, 0]));
  let generation = 0;
  let serviceDisposed = false;
  let activeWorkspaceWrite = null;

  function workspaceStatePath() {
    return dependencies.path.join(options.getBaseDir(), "agent-data", "code-workspace.json");
  }

  function record(channel) {
    operations.set(channel, operations.get(channel) + 1);
  }

  async function getWorkspace() {
    const result = await dependencies.listWorkspaceCodeFiles({ workspaceDir });
    record("agent:get-code-workspace");
    return result;
  }

  async function readCodeFile(_event, relativePath) {
    const result = await dependencies.readWorkspaceCode(relativePath, { workspaceDir });
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
      { workspaceDir, codeAgentConfirmed: true }
    );
    record("agent:write-code-file");
    return result;
  }

  async function selectWorkspace() {
    const result = await options.showOpenDialog({
      title: "选择代码工作区",
      defaultPath: workspaceDir,
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    await setWorkspaceDir(result.filePaths[0]);
    const files = await dependencies.listWorkspaceCodeFiles({ workspaceDir });
    record("agent:select-code-workspace");
    return files;
  }

  async function setWorkspaceDir(nextWorkspaceDir) {
    if (serviceDisposed) throw new Error("代码工作区服务已经释放。");
    const writeGeneration = generation;
    workspaceDir = dependencies.path.resolve(nextWorkspaceDir || process.cwd());
    options.onWorkspaceChanged?.(workspaceDir);
    let writePromise;
    writePromise = (async () => {
      try {
        await dependencies.fs.mkdir(dependencies.path.dirname(workspaceStatePath()), { recursive: true });
        await dependencies.fs.writeFile(
          workspaceStatePath(),
          JSON.stringify({ path: workspaceDir }, null, 2),
          "utf-8"
        );
        return writeGeneration === generation ? workspaceDir : null;
      } finally {
        if (activeWorkspaceWrite === writePromise) activeWorkspaceWrite = null;
      }
    })();
    activeWorkspaceWrite = writePromise;
    return writePromise;
  }

  async function restoreWorkspaceState() {
    if (serviceDisposed) return workspaceDir;
    const restoreGeneration = generation;
    try {
      const saved = JSON.parse(await dependencies.fs.readFile(workspaceStatePath(), "utf-8"));
      if (!saved?.path) return workspaceDir;
      const stat = await dependencies.fs.stat(saved.path);
      if (!stat.isDirectory()) return workspaceDir;
      return await setWorkspaceDir(saved.path);
    } catch {
      return workspaceDir;
    }
  }

  const runtime = createTrustedDomainIpcService({
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
      workspaceDir
    })
  });

  return {
    ...runtime,
    async dispose() {
      generation += 1;
      serviceDisposed = true;
      await Promise.allSettled([activeWorkspaceWrite].filter(Boolean));
      return runtime.dispose();
    },
    getWorkspaceDir: () => workspaceDir,
    restoreWorkspaceState,
    setWorkspaceDir
  };
}
