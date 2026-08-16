import fs from "node:fs/promises";
import path from "node:path";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const HOST_SHELL_HANDLE_CHANNELS = Object.freeze([
  "agent:open-external",
  "agent:get-data-path",
  "agent:open-data-folder",
  "agent:open-persona-folder"
]);
export const HOST_SHELL_IPC_MANIFEST = Object.freeze({
  handles: HOST_SHELL_HANDLE_CHANNELS,
  listeners: []
});

export function createHostShellService(options) {
  const dependencies = { fs, path, ...(options.dependencies || {}) };

  return createTrustedDomainIpcService({
    serviceName: "宿主 Shell 服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      {
        channel: "agent:open-external",
        listener: async (_event, url) => {
          const target = new URL(String(url || ""));
          if (!["http:", "https:"].includes(target.protocol)) throw new Error("只能打开 HTTP 或 HTTPS 网页。");
          await options.openExternal(target.toString());
          return true;
        }
      },
      {
        channel: "agent:get-data-path",
        listener: () => {
          const baseDir = options.getBaseDir();
          const dataDir = dependencies.path.join(baseDir, "agent-data");
          return {
            baseDir,
            dataDir,
            configPath: dependencies.path.join(dataDir, "config.json"),
            memoryPath: dependencies.path.join(dataDir, "memory", "conversation.jsonl"),
            knowledgeDir: dependencies.path.join(dataDir, "knowledge"),
            personaKnowledgePath: dependencies.path.join(dataDir, "knowledge", "persona.md"),
            personaDatabasePath: dependencies.path.join(dataDir, "storage", "vivi.sqlite"),
            ragDir: dependencies.path.join(dataDir, "rag"),
            registryDir: dependencies.path.join(dataDir, "registry")
          };
        }
      },
      {
        channel: "agent:open-data-folder",
        listener: async () => {
          const dataDir = dependencies.path.join(options.getBaseDir(), "agent-data");
          await options.openPath(dataDir);
          return true;
        }
      },
      {
        channel: "agent:open-persona-folder",
        listener: async () => {
          const personaDatabasePath = dependencies.path.join(options.getBaseDir(), "agent-data", "storage", "vivi.sqlite");
          await dependencies.fs.mkdir(dependencies.path.dirname(personaDatabasePath), { recursive: true });
          if (await dependencies.fs.stat(personaDatabasePath).then(() => true).catch(() => false)) {
            options.showItemInFolder(personaDatabasePath);
          } else {
            await options.openPath(dependencies.path.dirname(personaDatabasePath));
          }
          return personaDatabasePath;
        }
      }
    ]
  });
}
