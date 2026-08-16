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
const baseMain = `${canonicalDeclaration}\n${utilityConfiguration}\n${phase5dServices}\n${Array.from({ length: 9 }, () => canonicalWindow).join("\n")}`;
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

function audit(main = baseMain, packageJson = basePackage, ragSources = baseRagSources) {
  return analyzeElectronArchitecture({
    main,
    electronFiles: ["electron/main.js", "electron/preload.cjs", "electron/workers/utility-entry.js", "electron/services/schedule-service.js", "electron/services/model-conversation-service.js", "electron/services/autonomous-creation-service.js", "electron/services/settings-service.js", "electron/services/persona-card-service.js", "electron/services/live2d-model-service.js"],
    packageJson,
    indexHtml: '<script type="module" src="/src/main.tsx"></script>',
    ragSources,
    scheduleService: baseScheduleService,
    modelConversationService: baseModelService,
    autonomousCreationService: baseAutonomousService,
    settingsService: baseSettingsService,
    personaCardService: basePersonaCardService,
    live2DModelService: baseLive2DModelService
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
