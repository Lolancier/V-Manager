import test from "node:test";
import assert from "node:assert/strict";
import { analyzeElectronArchitecture } from "../scripts/electron-architecture-audit.mjs";

const canonicalDeclaration = 'const PRELOAD_PATH = path.join(__dirname, "preload.cjs");';
const canonicalWindow = "new BrowserWindow({ webPreferences: { preload: PRELOAD_PATH, contextIsolation: true } });";
const utilityConfiguration = `
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UTILITY_ENTRY_PATH = resolveUtilityEntryPoint(__dirname);
const utilityTaskSupervisor = createUtilityTaskSupervisor({ fork: () => utilityProcess.fork(UTILITY_ENTRY_PATH) });
const ragTaskClient = createRagTaskClient({ supervisor: utilityTaskSupervisor });
await ensureDataFiles(baseDir, { ensureRag: false });
void ragTaskClient.ensure(baseDir);
registerMemoryServiceIpc({ ragClient: ragTaskClient });
const scheduleService = createScheduleService({ trustedIpc, scheduleClient: payload.scheduleClient });
scheduleService.start();
scheduleService.dispose();
const modelConversationService = createModelConversationService({ trustedIpc });
modelConversationService.registerIpc(handleChat);
modelConversationService.dispose();
const autonomousCreationService = createAutonomousCreationService({ trustedIpc });
autonomousCreationService.registerIpc();
autonomousCreationService.start();
autonomousCreationService.dispose();`;
const phase5dServices = `
const settingsService = createSettingsService({ trustedIpc });
settingsService.registerIpc();
settingsService.start();
settingsService.dispose();
const personaCardService = createPersonaCardService({ trustedIpc });
personaCardService.registerIpc();
personaCardService.start();
personaCardService.dispose();
const live2dModelService = createLive2DModelService({ trustedIpc });
live2dModelService.registerIpc();
live2dModelService.start();
live2dModelService.dispose();`;
const phase5eServiceConfigs = [
  {
    key: "systemResource",
    file: "electron/services/system-resource-service.js",
    variable: "systemResourceService",
    factory: "createSystemResourceService",
    channels: ["agent:get-auto-launch", "agent:set-auto-launch", "agent:search-files", "agent:get-app-registry", "agent:refresh-app-registry", "agent:get-system-resource-snapshot"]
  },
  {
    key: "fileManager",
    file: "electron/services/file-manager-service.js",
    variable: "fileManagerService",
    factory: "createFileManagerService",
    channels: ["agent:get-file-manager-snapshot", "agent:scan-managed-directory", "agent:preview-file-organization", "agent:execute-file-organization", "agent:list-file-operations", "agent:undo-file-operation"]
  },
  {
    key: "hostShell",
    file: "electron/services/host-shell-service.js",
    variable: "hostShellService",
    factory: "createHostShellService",
    channels: ["agent:open-external", "agent:get-data-path", "agent:open-data-folder", "agent:open-persona-folder"]
  },
  {
    key: "companionLife",
    file: "electron/services/companion-life-service.js",
    variable: "companionLifeService",
    factory: "createCompanionLifeService",
    channels: ["agent:pet-touch", "agent:get-life-state", "agent:pause-proactive-today", "agent:reset-work-session"]
  },
  {
    key: "windowIntent",
    file: "electron/services/window-intent-service.js",
    variable: "windowIntentService",
    factory: "createWindowIntentService",
    channels: ["agent:open-settings-window", "agent:open-composer-window", "agent:open-chat-window", "agent:open-code-window", "agent:open-scale-window", "agent:open-expression-window"]
  },
  {
    key: "codeWorkspace",
    file: "electron/services/code-workspace-service.js",
    variable: "codeWorkspaceService",
    factory: "createCodeWorkspaceService",
    channels: ["agent:get-code-workspace", "agent:read-code-file", "agent:write-code-file", "agent:select-code-workspace"]
  },
  {
    key: "expressionChatState",
    file: "electron/services/expression-chat-state-service.js",
    variable: "expressionChatStateService",
    factory: "createExpressionChatStateService",
    channels: ["agent:trigger-expression", "agent:clear-expressions", "agent:get-chat-state"]
  },
  {
    key: "petWindowLayout",
    file: "electron/services/pet-window-layout-service.js",
    variable: "petWindowLayoutService",
    factory: "createPetWindowLayoutService",
    channels: ["agent:get-pet-scale", "agent:get-position-lock", "agent:set-position-lock", "agent:get-pet-window-bounds", "agent:set-pet-window-position", "agent:update-pet-window-layout", "agent:update-bubble-window-size", "agent:set-pet-mouse-passthrough", "agent:show-pet-context-menu"]
  },
  {
    key: "rendererReady",
    file: "electron/services/renderer-ready-service.js",
    variable: "rendererReadyService",
    factory: "createRendererReadyService",
    channels: ["agent:renderer-ready"]
  }
];
const phase5eManifestNames = {
  systemResource: "SYSTEM_RESOURCE_IPC_MANIFEST",
  fileManager: "FILE_MANAGER_IPC_MANIFEST",
  hostShell: "HOST_SHELL_IPC_MANIFEST",
  companionLife: "COMPANION_LIFE_IPC_MANIFEST",
  windowIntent: "WINDOW_INTENT_IPC_MANIFEST",
  codeWorkspace: "CODE_WORKSPACE_IPC_MANIFEST",
  expressionChatState: "EXPRESSION_CHAT_STATE_IPC_MANIFEST",
  petWindowLayout: "PET_WINDOW_LAYOUT_IPC_MANIFEST",
  rendererReady: "RENDERER_READY_IPC_MANIFEST"
};
for (const config of phase5eServiceConfigs) {
  const listenerCount = config.key === "petWindowLayout" ? 2 : config.key === "rendererReady" ? 1 : 0;
  config.manifestExport = phase5eManifestNames[config.key];
  config.handles = listenerCount ? config.channels.slice(0, -listenerCount) : [...config.channels];
  config.listeners = listenerCount ? config.channels.slice(-listenerCount) : [];
}
const phase5eServices = Object.fromEntries(phase5eServiceConfigs.map((config) => [config.key, `
const channels = [${config.channels.map((channel) => JSON.stringify(channel)).join(", ")}];
export const ${config.manifestExport} = {
  handles: [${config.handles.map((channel) => JSON.stringify(channel)).join(", ")}],
  listeners: [${config.listeners.map((channel) => JSON.stringify(channel)).join(", ")}]
};
export function ${config.factory}(options) {
  return createTrustedDomainIpcService({ trustedIpc: options.trustedIpc });
}`]));
const phase5eContracts = phase5eServiceConfigs.map((config) => ({
  key: config.key,
  manifest: { handles: [...config.handles], listeners: [...config.listeners] },
  registrations: { handles: [...config.handles], listeners: [...config.listeners] }
}));
const phase5ePreload = phase5eServiceConfigs
  .flatMap((config) => [
    ...config.handles.map((channel) => `ipcRenderer.invoke(${JSON.stringify(channel)}, payload);`),
    ...config.listeners.map((channel) => `ipcRenderer.send(${JSON.stringify(channel)}, payload);`)
  ])
  .join("\n");
const phase5eServicesMain = phase5eServiceConfigs.map((config) => `
const ${config.variable} = ${config.factory}({ trustedIpc });
${config.variable}.registerIpc().start();
${config.variable}.dispose();`).join("");
const phase5eElectronFiles = phase5eServiceConfigs.map((config) => config.file);
const trustedDomainIpcService = `
function registerIpc() { const listenerDisposers = new Map(); const registeredHandlers = new Set(); }
function start() {}
function stop() {}
function dispose() {}
function snapshot() {}`;
const baseMain = `${canonicalDeclaration}\n${utilityConfiguration}\n${phase5dServices}\n${phase5eServicesMain}\n${Array.from({ length: 9 }, () => canonicalWindow).join("\n")}`;
const basePackage = {
  main: "electron/main.js",
  devDependencies: { electron: "^32.3.0" },
  build: { files: ["dist/**/*", "electron/**/*"] }
};

const baseRagSources = {
  memoryService: "options.ragClient.rebuild(baseDir())",
  core: "ragClient: payload.ragClient, scheduleClient: payload.scheduleClient, signal: payload.signal",
  appExecutor: "context.ragClient ? context.ragClient.rebuild(baseDir) : fallback()",
  toolExecutor: "context.ragClient ? context.ragClient.rebuild(baseDir) : fallback()"
};
const baseScheduleService = `
const channels = ["agent:list-schedules", "agent:cancel-schedule"];
for (const channel of channels) trustedIpc.handle(channel, handler);
function tick() {}
function start() { setIntervalImpl(tick, 10_000); }
function stop() {}
function snapshot() {}`;
const baseModelService = `
const channels = ["agent:chat", "agent:test-deepseek", "agent:generate-persona-card-draft"];
for (const channel of channels) trustedIpc.handle(channel, handler);`;
const baseAutonomousService = `
const channels = ["agent:get-interest-sandbox", "agent:run-interest-activity", "agent:get-interest-state", "agent:cleanup-interest-sandbox", "agent:play-interest-game", "agent:interrupt-interest-activity", "agent:update-interest-location", "agent:open-interest-sandbox", "agent:open-interest-artifact", "agent:open-interest-category"];
for (const channel of channels) trustedIpc.handle(channel, handler);
let currentTask = null;
const config = snapshotConfig(options.getConfig());
const persona = personaFor(config);`;
function phase5dServiceSource(channels) {
  return `
const channelList = [${channels.map((channel) => JSON.stringify(channel)).join(", ")}];
for (const channel of channelList) trustedIpc.handle(channel, handler);
function start() {}
function stop() {}
function dispose() {}
function snapshot() {}`;
}
const baseSettingsService = phase5dServiceSource([
  "agent:get-bootstrap",
  "agent:get-startup-status",
  "agent:save-config",
  "agent:test-astrbot",
  "agent:get-relationship-profile",
  "agent:reset-relationship-profile"
]);
const basePersonaCardService = phase5dServiceSource([
  "agent:list-persona-cards",
  "agent:create-persona-card",
  "agent:update-persona-card",
  "agent:activate-persona-card",
  "agent:archive-persona-card",
  "agent:restore-persona-card"
]);
const baseLive2DModelService = phase5dServiceSource([
  "agent:get-live2d-models",
  "agent:refresh-live2d-models",
  "agent:open-live2d-models-folder"
]);

function audit(main = baseMain, packageJson = basePackage, ragSources = baseRagSources, overrides = {}) {
  return analyzeElectronArchitecture({
    main,
    electronFiles: overrides.electronFiles || ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js", "electron/services/schedule-service.js", "electron/services/model-conversation-service.js", "electron/services/autonomous-creation-service.js", "electron/services/settings-service.js", "electron/services/persona-card-service.js", "electron/services/live2d-model-service.js", "electron/services/trusted-domain-ipc-service.js", ...phase5eElectronFiles],
    packageJson,
    indexHtml: '<script type="module" src="/src/main.tsx"></script>',
    ragSources,
    scheduleService: baseScheduleService,
    modelConversationService: baseModelService,
    autonomousCreationService: baseAutonomousService,
    settingsService: baseSettingsService,
    personaCardService: basePersonaCardService,
    live2DModelService: baseLive2DModelService,
    trustedDomainIpcService: overrides.trustedDomainIpcService || trustedDomainIpcService,
    phase5eServices: overrides.phase5eServices || phase5eServices,
    preload: overrides.preload ?? phase5ePreload,
    phase5eContracts: overrides.phase5eContracts ?? phase5eContracts
  });
}

test("architecture audit accepts canonical single-line BrowserWindow calls", () => {
  const result = audit();
  assert.equal(result.metrics.browserWindowConstructors, 9);
  assert.equal(result.metrics.browserWindowsUsingCanonicalPreload, 9);
  assert.deepEqual(result.critical, []);
});

test("architecture audit rejects a BrowserWindow created from variable options", () => {
  const result = audit(`${baseMain}\nconst options = { webPreferences: { preload: PRELOAD_PATH } };\nnew BrowserWindow(options);`);
  assert.equal(result.metrics.browserWindowConstructors, 10);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit rejects a single-line noncanonical preload", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ title: "preload: PRELOAD_PATH", webPreferences: { preload: otherPreload } });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit rejects an unconfigured tenth BrowserWindow", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ show: false });`);
  assert.equal(result.metrics.browserWindowConstructors, 10);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit ignores top-level preload when webPreferences uses another path", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ preload: PRELOAD_PATH, webPreferences: { preload: otherPreload } });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit ignores metadata preload decoys", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow({ metadata: { preload: PRELOAD_PATH }, webPreferences: { preload: otherPreload } });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit only analyzes the first BrowserWindow argument", () => {
  const result = audit(`${baseMain}\nnew BrowserWindow(options, { preload: PRELOAD_PATH });`);
  assert.match(result.critical.join("\n"), /1 个 BrowserWindow 无法确认/);
});

test("architecture audit does not count BrowserWindow text in top-level comments or strings", () => {
  const result = audit(`${baseMain}\n// new BrowserWindow({ webPreferences: { preload: otherPreload } });\nconst example = "new BrowserWindow(options)";`);
  assert.equal(result.metrics.browserWindowConstructors, 9);
  assert.deepEqual(result.critical, []);
});

test("architecture audit rejects explicit canonical preload exclusions", () => {
  const packageJson = {
    ...basePackage,
    build: { files: ["dist/**/*", "electron/**/*", "!electron/preload.cjs"] }
  };
  const result = audit(baseMain, packageJson);
  assert.equal(result.metrics.canonicalPreloadExplicitlyExcluded, true);
  assert.match(result.critical.join("\n"), /显式排除了 electron\/preload\.cjs/);
});

test("architecture audit applies FileSet from/to/filter context", () => {
  const packageJson = {
    ...basePackage,
    build: {
      files: [
        "dist/**/*",
        { from: "electron", to: "electron", filter: ["**/*", "!preload.cjs"] }
      ]
    }
  };
  const result = audit(baseMain, packageJson);
  assert.equal(result.metrics.canonicalPreloadExplicitlyExcluded, true);
  assert.match(result.critical.join("\n"), /显式排除了 electron\/preload\.cjs/);
});

test("architecture audit reports direct main-process RAG index writes", () => {
  const result = audit(`${baseMain}\nawait rebuildKnowledgeIndex(baseDir);`);
  assert.equal(result.metrics.directMainRagIndexWrites, 1);
  assert.match(result.critical.join("\n"), /主进程仍直接执行 1 个 RAG 写索引调用/);
});

test("architecture audit requires all four Electron RAG write routes", () => {
  const result = audit(baseMain, basePackage, { ...baseRagSources, toolExecutor: "fallback()" });
  assert.equal(result.metrics.ragWriteRoutesMigrated, 3);
  assert.match(result.critical.join("\n"), /仅迁移 3\/4/);
});

test("architecture audit rejects an excluded utility worker entry", () => {
  const packageJson = {
    ...basePackage,
    build: { files: ["dist/**/*", "electron/**/*", "!electron/workers/utility-entry.js"] }
  };
  const result = audit(baseMain, packageJson);
  assert.equal(result.metrics.utilityWorkerPackaged, false);
  assert.match(result.critical.join("\n"), /utilityProcess 生产入口/);
});

test("architecture audit rejects a utility entry resolved from the current working directory", () => {
  const main = baseMain.replace("resolveUtilityEntryPoint(__dirname)", 'path.resolve("electron/workers/utility-entry.js")');
  const result = audit(main);
  assert.equal(result.metrics.utilityEntryDerivedFromModuleUrl, false);
  assert.match(result.critical.join("\n"), /import\.meta\.url/);
});

test("architecture audit rejects schedule IPC and timer orchestration returning to main", () => {
  const result = audit(`${baseMain}\nipcMain.handle("agent:list-schedules", handler);\nlet scheduleTimer;\nfunction tickSchedules() {}`);
  assert.ok(result.metrics.directMainScheduleOrchestration >= 3);
  assert.match(result.critical.join("\n"), /主进程回流/);
});

test("architecture audit requires the schedule service source and lifecycle", () => {
  const result = analyzeElectronArchitecture({
    main: baseMain,
    electronFiles: ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js"],
    packageJson: basePackage,
    indexHtml: '<script type="module" src="/src/main.tsx"></script>',
    ragSources: baseRagSources,
    scheduleService: "",
    modelConversationService: baseModelService,
    autonomousCreationService: baseAutonomousService
  });
  assert.match(result.critical.join("\n"), /日程域服务/);
});

test("architecture audit rejects Phase 4C IPC or state orchestration returning to main", () => {
  const result = audit(`${baseMain}\nipcMain.handle("agent:chat", handler);\nlet currentInterestActivity = null;`);
  assert.equal(result.metrics.directMainPhase4cIpc, 1);
  assert.match(result.critical.join("\n"), /Phase 4C IPC/);
});

test("architecture audit requires Electron-free Phase 4C services and persona snapshots", () => {
  const result = analyzeElectronArchitecture({
    main: baseMain,
    electronFiles: ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js", "electron/services/schedule-service.js", "electron/services/model-conversation-service.js", "electron/services/autonomous-creation-service.js"],
    packageJson: basePackage,
    indexHtml: "",
    ragSources: baseRagSources,
    scheduleService: baseScheduleService,
    modelConversationService: `import { app } from "electron"; ${baseModelService}`,
    autonomousCreationService: baseAutonomousService.replace("const config = snapshotConfig(options.getConfig());", "const config = options.getConfig();")
  });
  assert.match(result.critical.join("\n"), /自主创作状态/);
  assert.match(result.critical.join("\n"), /不得直接导入 Electron/);
});

test("architecture audit accepts the complete Phase 5E migration", () => {
  const result = audit();
  assert.equal(result.metrics.phase5eServicesPresent, 9);
  assert.equal(result.metrics.phase5eServicesConfigured, 9);
  assert.equal(result.metrics.phase5eServicesOwningIpc, 9);
  assert.equal(result.metrics.phase5eOwnedChannels, 43);
  assert.equal(result.metrics.phase5eManifestsExported, 9);
  assert.equal(result.metrics.phase5eManifestsMatchingOwnership, 9);
  assert.equal(result.metrics.phase5eActualRegistrations, 43);
  assert.equal(result.metrics.phase5eContractsCaptured, 9);
  assert.equal(result.metrics.directMainIpcHandlers, 0);
  assert.equal(result.metrics.directMainIpcListeners, 0);
  assert.deepEqual(result.critical, []);
});

test("architecture audit rejects channel strings without real registrar registrations", () => {
  const contracts = phase5eContracts.map((contract) => (
    contract.key === "systemResource"
      ? { ...contract, registrations: { handles: [], listeners: [] } }
      : contract
  ));
  const result = audit(baseMain, basePackage, baseRagSources, { phase5eContracts: contracts });

  assert.equal(result.metrics.phase5eServicesOwningIpc, 8);
  assert.equal(result.metrics.phase5eActualRegistrations, 37);
  assert.ok(result.metrics.phase5eMissingRegistrations.includes("agent:get-auto-launch"));
  assert.match(result.critical.join("\n"), /实际注册 channel 为 37\/43/);
  assert.match(result.critical.join("\n"), /存在未注册 channel/);
});

test("architecture audit rejects duplicate and extra real registrar registrations", () => {
  const duplicateContracts = phase5eContracts.map((contract) => (
    contract.key === "fileManager"
      ? {
          ...contract,
          registrations: {
            ...contract.registrations,
            handles: [...contract.registrations.handles, contract.registrations.handles[0]]
          }
        }
      : contract
  ));
  const duplicateResult = audit(baseMain, basePackage, baseRagSources, {
    phase5eContracts: duplicateContracts
  });
  assert.deepEqual(duplicateResult.metrics.phase5eDuplicateRegistrations, ["agent:get-file-manager-snapshot"]);
  assert.match(duplicateResult.critical.join("\n"), /重复注册 channel/);

  const extraContracts = phase5eContracts.map((contract) => (
    contract.key === "hostShell"
      ? {
          ...contract,
          registrations: {
            ...contract.registrations,
            handles: [...contract.registrations.handles, "agent:not-owned"]
          }
        }
      : contract
  ));
  const extraResult = audit(baseMain, basePackage, baseRagSources, {
    phase5eContracts: extraContracts
  });
  assert.deepEqual(extraResult.metrics.phase5eExtraRegistrations, ["agent:not-owned"]);
  assert.match(extraResult.critical.join("\n"), /ownership 基准之外的注册 channel/);
});

test("architecture audit cross-validates preload inbound channels and main assembly", () => {
  const missingPreload = phase5ePreload.replace('ipcRenderer.invoke("agent:pet-touch", payload);\n', "");
  const missingResult = audit(baseMain, basePackage, baseRagSources, { preload: missingPreload });
  assert.deepEqual(missingResult.metrics.phase5eChannelsMissingFromPreload, ["agent:pet-touch"]);
  assert.match(missingResult.critical.join("\n"), /缺少 preload 入站 channel/);

  const duplicatePreload = `${phase5ePreload}\nipcRenderer.invoke("agent:pet-touch", payload);`;
  const duplicateResult = audit(baseMain, basePackage, baseRagSources, { preload: duplicatePreload });
  assert.deepEqual(duplicateResult.metrics.phase5eDuplicatePreloadChannels, ["agent:pet-touch"]);
  assert.match(duplicateResult.critical.join("\n"), /preload 入站 channel 重复/);

  const duplicatedMain = `${baseMain}\nsystemResourceService.registerIpc().start();`;
  const assemblyResult = audit(duplicatedMain);
  assert.deepEqual(assemblyResult.metrics.phase5eMainAssemblyDuplicates, ["systemResource"]);
  assert.match(assemblyResult.critical.join("\n"), /main 装配缺失或重复/);
});

test("architecture audit rejects Phase 5E domain state returning to main", () => {
  const result = audit(`${baseMain}\nlet chatState = { messages: [] };\nlet proactiveTimer = null;`);

  assert.equal(result.metrics.phase5eDomainStateInMain, 2);
  assert.match(result.critical.join("\n"), /主进程仍持有 2 处 Phase 5E 领域状态/);
});

test("architecture audit requires complete Phase 5D service files and lifecycle", () => {
  const result = analyzeElectronArchitecture({
    main: baseMain,
    electronFiles: ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js", "electron/services/schedule-service.js", "electron/services/model-conversation-service.js", "electron/services/autonomous-creation-service.js"],
    packageJson: basePackage,
    indexHtml: "",
    ragSources: baseRagSources,
    scheduleService: baseScheduleService,
    modelConversationService: baseModelService,
    autonomousCreationService: baseAutonomousService,
    settingsService: baseSettingsService.replace("function dispose() {}", ""),
    personaCardService: basePersonaCardService,
    live2DModelService: baseLive2DModelService
  });
  assert.equal(result.metrics.settingsServicePresent, false);
  assert.equal(result.metrics.settingsLifecycleOwnedByService, false);
  assert.match(result.critical.join("\n"), /Phase 5D 设置服务/);
});

test("architecture audit rejects Electron imports in Phase 5D services", () => {
  const result = analyzeElectronArchitecture({
    main: baseMain,
    electronFiles: ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js", "electron/services/schedule-service.js", "electron/services/model-conversation-service.js", "electron/services/autonomous-creation-service.js", "electron/services/settings-service.js", "electron/services/persona-card-service.js", "electron/services/live2d-model-service.js"],
    packageJson: basePackage,
    indexHtml: "",
    ragSources: baseRagSources,
    scheduleService: baseScheduleService,
    modelConversationService: baseModelService,
    autonomousCreationService: baseAutonomousService,
    settingsService: baseSettingsService,
    personaCardService: `import { shell } from "electron"; ${basePersonaCardService}`,
    live2DModelService: baseLive2DModelService
  });
  assert.equal(result.metrics.phase5dServicesElectronFree, false);
  assert.match(result.critical.join("\n"), /Phase 5D 服务不得直接导入 Electron/);
});

test("architecture audit rejects Phase 5D IPC returning to main", () => {
  const result = audit(`${baseMain}\nipcMain.handle("agent:save-config", handler);\nipcMain.on("agent:get-live2d-models", listener);`);
  assert.equal(result.metrics.directMainPhase5dIpc, 2);
  assert.equal(result.metrics.directMainIpcHandlers, 1);
  assert.equal(result.metrics.directMainIpcListeners, 1);
  assert.match(result.critical.join("\n"), /主进程回流了 2 处 Phase 5D IPC/);
});

test("architecture audit rejects incomplete Phase 5E service ownership", () => {
  const defaultElectronFiles = ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js", "electron/services/schedule-service.js", "electron/services/model-conversation-service.js", "electron/services/autonomous-creation-service.js", "electron/services/settings-service.js", "electron/services/persona-card-service.js", "electron/services/live2d-model-service.js", "electron/services/trusted-domain-ipc-service.js", ...phase5eElectronFiles];
  const result = audit(baseMain, basePackage, baseRagSources, {
    electronFiles: defaultElectronFiles.filter((file) => file !== "electron/services/system-resource-service.js")
  });
  assert.equal(result.metrics.phase5eServicesPresent, 8);
  assert.equal(result.metrics.phase5eOwnedChannels, 37);
  assert.match(result.critical.join("\n"), /Phase 5E 服务文件、main 装配、可信 IPC 或共享生命周期\/回滚未完整迁移/);
});

test("architecture audit rejects Electron imports in Phase 5E services", () => {
  const result = audit(baseMain, basePackage, baseRagSources, {
    phase5eServices: {
      ...phase5eServices,
      companionLife: `import { BrowserWindow } from "electron"; ${phase5eServices.companionLife}`
    }
  });
  assert.equal(result.metrics.phase5eServicesElectronFree, false);
  assert.match(result.critical.join("\n"), /Phase 5E 服务不得直接导入 Electron/);
});

test("architecture audit rejects missing Phase 5E rollback runtime", () => {
  const result = audit(baseMain, basePackage, baseRagSources, {
    trustedDomainIpcService: "function registerIpc() {} function start() {} function stop() {} function dispose() {} function snapshot() {}"
  });
  assert.equal(result.metrics.phase5eTrustedDomainRuntimeOwnsLifecycleAndRollback, false);
  assert.match(result.critical.join("\n"), /共享生命周期\/回滚未完整迁移/);
});

test("architecture audit rejects Phase 5E IPC returning to main", () => {
  const result = audit(`${baseMain}\nipcMain.handle("agent:pet-touch", handler);\nipcMain.on("agent:renderer-ready", listener);`);
  assert.equal(result.metrics.directMainPhase5eIpc, 2);
  assert.equal(result.metrics.directMainIpcHandlers, 1);
  assert.equal(result.metrics.directMainIpcListeners, 1);
  assert.match(result.critical.join("\n"), /主进程回流了 2 处 Phase 5E IPC/);
});
