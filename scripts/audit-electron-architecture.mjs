import fs from "node:fs/promises";
import path from "node:path";
import { analyzeElectronArchitecture } from "./electron-architecture-audit.mjs";
import { collectPhase5eIpcRegistrations } from "./phase5e-ipc-registration-collector.mjs";

const root = process.cwd();
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

async function listFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(relative));
    else result.push(relative);
  }
  return result;
}

const [main, preload, electronFiles, packageJson, indexHtml, memoryService, scheduleService, modelConversationService, autonomousCreationService, settingsService, personaCardService, live2DModelService, core, appExecutor, toolExecutor] = await Promise.all([
  read("electron/main.js"),
  read("electron/preload.cjs"),
  listFiles("electron"),
  read("package.json").then(JSON.parse),
  read("index.html"),
  read("electron/services/memory-service.js"),
  read("electron/services/schedule-service.js"),
  read("electron/services/model-conversation-service.js"),
  read("electron/services/autonomous-creation-service.js"),
  read("electron/services/settings-service.js"),
  read("electron/services/persona-card-service.js"),
  read("electron/services/live2d-model-service.js"),
  read("src-agent/core.js"),
  read("src-agent/executors/app-executor.js"),
  read("src-agent/tool-executor.js")
]);
const phase5eServicePaths = {
  systemResource: "electron/services/system-resource-service.js",
  fileManager: "electron/services/file-manager-service.js",
  hostShell: "electron/services/host-shell-service.js",
  companionLife: "electron/services/companion-life-service.js",
  windowIntent: "electron/services/window-intent-service.js",
  codeWorkspace: "electron/services/code-workspace-service.js",
  expressionChatState: "electron/services/expression-chat-state-service.js",
  petWindowLayout: "electron/services/pet-window-layout-service.js",
  rendererReady: "electron/services/renderer-ready-service.js"
};
const [trustedDomainIpcService, phase5eServices] = await Promise.all([
  read("electron/services/trusted-domain-ipc-service.js"),
  Object.fromEntries(await Promise.all(Object.entries(phase5eServicePaths).map(async ([key, relativePath]) => [key, await read(relativePath)])))
]);
const agentFiles = (await listFiles("src-agent")).filter((file) => /\.(?:c?js|mjs)$/.test(file));
const directElectronImports = [];
for (const file of agentFiles) {
  const content = await read(file);
  if (/from\s+["']electron["']|require\(["']electron["']\)/.test(content)) directElectronImports.push(file);
}

const result = analyzeElectronArchitecture({
  main,
  electronFiles,
  packageJson,
  indexHtml,
  directElectronImports,
  ragSources: { memoryService, core, appExecutor, toolExecutor },
  scheduleService,
  modelConversationService,
  autonomousCreationService,
  settingsService,
  personaCardService,
  live2DModelService,
  trustedDomainIpcService,
  phase5eServices,
  preload,
  phase5eContracts: await collectPhase5eIpcRegistrations()
});
console.log(JSON.stringify(result, null, 2));
if (result.critical.length) process.exitCode = 1;
