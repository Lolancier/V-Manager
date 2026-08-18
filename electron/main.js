import { app, BrowserWindow, dialog, ipcMain, net, Notification, protocol, screen, session, shell, Tray, utilityProcess } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearConversationHistory,
  defaultConfig,
  ensureDataFiles,
  getRagStatus,
  loadConfig,
  saveConfig,
  setActiveWorkspaceDir,
  testEmbeddingConnection
} from "../src-agent/core.js";
import { loadRelationshipProfile } from "../src-agent/relationship-engine.js";
import {
  clearCompanionMemory,
  loadCompanionMemory,
  resolveCommitmentsByText
} from "../src-agent/companion-memory.js";
import { normalizeInterestConfig } from "../src-agent/interest-sandbox.js";
import { runGamePlaytest } from "../src-agent/game-playtest.js";
import { createIsolatedGameDriver } from "./game-playtest-runtime.js";
import { getMemoryDatabaseStats } from "../src-agent/local-database.js";
import { configureDesktopShell } from "../src-agent/platform/desktop-shell.js";
import { registerMemoryServiceIpc } from "./services/memory-service.js";
import { registerSpeechServiceIpc } from "./services/speech-service.js";
import { createScheduleService } from "./services/schedule-service.js";
import { createGamePlaytestService } from "./services/game-playtest-service.js";
import { createModelConversationService } from "./services/model-conversation-service.js";
import { createAutonomousCreationService, interestStatusLabel } from "./services/autonomous-creation-service.js";
import { createLive2DModelService } from "./services/live2d-model-service.js";
import { createPersonaCardService } from "./services/persona-card-service.js";
import { createSettingsService } from "./services/settings-service.js";
import { createFileManagerService } from "./services/file-manager-service.js";
import { createHostShellService } from "./services/host-shell-service.js";
import { createSystemResourceService } from "./services/system-resource-service.js";
import { createChatStateStore } from "./services/chat-state-store.js";
import { createChatFlowService } from "./services/chat-flow-service.js";
import { createCompanionLifeService } from "./services/companion-life-service.js";
import { createWindowIntentService } from "./services/window-intent-service.js";
import { createCodeWorkspaceService } from "./services/code-workspace-service.js";
import { createExpressionChatStateService } from "./services/expression-chat-state-service.js";
import { createPetWindowLayoutService } from "./services/pet-window-layout-service.js";
import { createRendererReadyService } from "./services/renderer-ready-service.js";
import { createRagTaskClient } from "./services/rag-task-client.js";
import { createUtilityTaskSupervisor, resolveUtilityEntryPoint } from "./services/utility-task-supervisor.js";
import { createTrustedIpcRegistrar } from "./ipc-security.js";
import {
  createViewLoader,
  getBubbleWindowBounds as computeBubbleWindowBounds,
  getChatWindowBounds as computeChatWindowBounds,
  getComposerWindowBounds as computeComposerWindowBounds,
  getModelContentType,
  getPetWindowSize as computePetWindowSize,
  getTitleBarOverlay,
  mergeAgentConfig
} from "./main-helpers.js";
import {
  buildPetContextMenu as createPetContextMenu,
  buildTrayContextMenu as createTrayContextMenu,
  createTrayIcon
} from "./main-menus.js";
import {
  createBubbleWindow as createSecondaryBubbleWindow,
  createChatWindow as createSecondaryChatWindow,
  createCodeWindow as createSecondaryCodeWindow,
  createComposerWindow as createSecondaryComposerWindow,
  createExpressionWindow as createSecondaryExpressionWindow,
  createScaleWindow as createSecondaryScaleWindow,
  createSettingsWindow as createSecondarySettingsWindow,
  ensureWindow
} from "./main-secondary-windows.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");
const UTILITY_ENTRY_PATH = resolveUtilityEntryPoint(__dirname);
const utilityTaskSupervisor = createUtilityTaskSupervisor({
  entryPoint: UTILITY_ENTRY_PATH,
  fork: (entryPoint, args, options) => utilityProcess.fork(entryPoint, args, options),
  serviceName: "Vivi Background Tasks",
  timeoutMs: 10 * 60 * 1000
});
const ragTaskClient = createRagTaskClient({ supervisor: utilityTaskSupervisor });
const gamePlaytestService = createGamePlaytestService({
  runPlaytest: runGamePlaytest,
  createDriver: createIsolatedGameDriver
});

configureDesktopShell({
  openExternal: (...args) => shell.openExternal(...args),
  openPath: (...args) => shell.openPath(...args),
  trashItem: (...args) => shell.trashItem(...args)
});

protocol.registerSchemesAsPrivileged([
  { scheme: "vivi-model", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "vivi-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const isDev = !app.isPackaged;
const devServerUrl = "http://localhost:5173";
const { loadView } = createViewLoader({
  isDev,
  devServerUrl,
  getAppPath: () => app.getAppPath()
});
const trustedIpc = createTrustedIpcRegistrar(ipcMain, {
  isDev,
  devServerUrl,
  rendererRoot: path.join(app.getAppPath(), "dist")
});
const chatStateStore = createChatStateStore({
  onStateUpdated: (state) => broadcastChatState(state)
});
chatStateStore.start();
const scheduleService = createScheduleService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  isHostReady: () => app.isReady(),
  platform: process.platform,
  getExecutablePath: () => process.execPath,
  getAppPath: () => app.getAppPath(),
  isPackaged: () => app.isPackaged,
  resolveCommitmentsByText,
  loadCompanionMemory,
  publishProactiveEvent: (event) => companionLifeService.publishProactiveEvent(event),
  broadcastSchedules: (items) => {
    for (const win of [settingsWindow, chatWindow]) {
      if (win && !win.isDestroyed()) win.webContents.send("agent:schedules-updated", items);
    }
  },
  onError: (scope, error) => console.error(`[schedule] ${scope} failed:`, error)
});
const isBackgroundScheduleLaunch = process.argv.includes("--vivi-background-schedule");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
let petWindow = null;
let startupWindow = null;
let settingsWindow = null;
let scaleWindow = null;
let composerWindow = null;
let chatWindow = null;
let bubbleWindow = null;
let expressionWindow = null;
let codeWindow = null;
let tray = null;
let currentAppearanceTheme = "light";
let currentAgentConfig = defaultConfig;
let petHiddenForChat = false;
let petManuallyHidden = false;
let cursorTrackingTimer = null;
const cursorDeliveryState = new Map();
let startupReleaseTimer = null;
let shutdownCleanupDone = false;
let gptSovitsShutdownStarted = false;
let phase4cShutdownPromise = Promise.resolve();
let startupStatus = {
  phase: "booting",
  progress: 4,
  title: "正在唤醒 Vivi",
  detail: "准备本地运行环境…",
  warning: ""
};

function publishStartupStatus(next) {
  startupStatus = { ...startupStatus, ...next };
  if (startupWindow && !startupWindow.isDestroyed()) {
    startupWindow.webContents.send("agent:startup-progress", startupStatus);
  }
  return startupStatus;
}

function mergeRuntimeConfig(nextConfig = {}) {
  return mergeAgentConfig(nextConfig, { defaultConfig, normalizeInterestConfig });
}

function updateTitleBarOverlays() {
  const themedWindows = [settingsWindow, chatWindow, scaleWindow, expressionWindow];
  for (const win of themedWindows) {
    if (win && !win.isDestroyed()) win.setTitleBarOverlay(getTitleBarOverlay(currentAppearanceTheme));
  }
  if (codeWindow && !codeWindow.isDestroyed()) {
    codeWindow.setTitleBarOverlay(getTitleBarOverlay("dark", true));
  }
}

function getPetWindowSize(scale = petWindowLayoutService.getPetScale()) {
  return computePetWindowSize(scale);
}

function getChatWindowBounds() {
  return computeChatWindowBounds({ petWindow, screen });
}

function getComposerWindowBounds() {
  return computeComposerWindowBounds({ petWindow, screen });
}

function getBubbleWindowBounds() {
  return computeBubbleWindowBounds({
    petWindow,
    screen,
    getBubbleContentSize: () => petWindowLayoutService.getBubbleContentSize()
  });
}

function createStartupWindow() {
  if (isBackgroundScheduleLaunch) return null;
  if (startupWindow && !startupWindow.isDestroyed()) return startupWindow;
  const win = new BrowserWindow({
    width: 560,
    height: 360,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loadView(win, "startup");
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on("close", () => {
    if (startupStatus.phase !== "ready" && !app.isQuiting) {
      app.isQuiting = true;
      app.quit();
    }
  });
  win.on("closed", () => {
    if (startupWindow === win) startupWindow = null;
  });
  startupWindow = win;
  return win;
}

function releaseStartupToApplication(modelStatus = "ready") {
  if (startupStatus.phase === "ready") return;
  if (startupReleaseTimer) clearTimeout(startupReleaseTimer);
  startupReleaseTimer = null;
  publishStartupStatus({
    phase: "ready",
    progress: 100,
    title: modelStatus === "error" ? "已以兼容模式启动" : "准备完成",
    detail: modelStatus === "error" ? "Live2D 模型加载异常，其他功能仍可使用。" : "Vivi 已经醒来。"
  });
  setTimeout(() => {
    if (!isBackgroundScheduleLaunch) showPetWindow();
    if (startupWindow && !startupWindow.isDestroyed()) {
      startupWindow.setClosable(true);
      startupWindow.close();
    }
  }, 320);
}

function createPetWindow() {
  const initialSize = getPetWindowSize();
  const win = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    minWidth: 480,
    minHeight: 720,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "pet");
  win.setAlwaysOnTop(true, "screen-saver");

  win.on("move", () => {
    updateBubbleWindowLayout();
  });

  win.on("resize", () => {
    updateBubbleWindowLayout();
  });

  for (const eventName of ["show", "hide", "minimize", "restore"]) {
    win.on(eventName, syncGlobalCursorTracking);
  }

  win.webContents.on("context-menu", () => {
    buildPetContextMenu().popup({
      window: win
    });
  });

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
      bubbleWindow?.hide();
    }
  });

  win.on("closed", () => {
    if (petWindow === win) petWindow = null;
    syncGlobalCursorTracking();
  });

  petWindow = win;
  return win;
}

function createSettingsWindow() {
  const win = createSecondarySettingsWindow({
    PRELOAD_PATH,
    currentAppearanceTheme,
    getTitleBarOverlay,
    loadView,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
      if (settingsWindow === win) settingsWindow = null;
    }
  });
  settingsWindow = win;
  return win;
}

function createScaleWindow() {
  const win = createSecondaryScaleWindow({
    PRELOAD_PATH,
    currentAppearanceTheme,
    getTitleBarOverlay,
    loadView,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
      if (scaleWindow === win) scaleWindow = null;
    }
  });
  scaleWindow = win;
  return win;
}

function createComposerWindow() {
  const win = createSecondaryComposerWindow({
    PRELOAD_PATH,
    loadView,
    isQuitting: () => app.isQuiting,
    bounds: getComposerWindowBounds(),
    onDestroyed: () => {
      if (composerWindow === win) composerWindow = null;
    }
  });
  composerWindow = win;
  return win;
}

function createChatWindow() {
  const win = createSecondaryChatWindow({
    PRELOAD_PATH,
    currentAppearanceTheme,
    getTitleBarOverlay,
    loadView,
    isQuitting: () => app.isQuiting,
    bounds: getChatWindowBounds(),
    restorePetAfterChat,
    hidePetForChat,
    syncGlobalCursorTracking,
    onDestroyed: () => {
      if (chatWindow === win) chatWindow = null;
    }
  });
  chatWindow = win;
  return win;
}

function createCodeWindow() {
  const win = createSecondaryCodeWindow({
    PRELOAD_PATH,
    getTitleBarOverlay,
    loadView,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
      if (codeWindow === win) codeWindow = null;
    }
  });
  codeWindow = win;
  return win;
}

function createBubbleWindow() {
  const win = createSecondaryBubbleWindow({
    PRELOAD_PATH,
    loadView,
    bounds: getBubbleWindowBounds(),
    isBackgroundScheduleLaunch,
    updateBubbleWindowLayout,
    onDestroyed: () => {
      if (bubbleWindow === win) bubbleWindow = null;
    }
  });
  bubbleWindow = win;
  return win;
}

function ensureSettingsWindow() {
  return ensureWindow(settingsWindow, createSettingsWindow);
}

function ensureScaleWindow() {
  return ensureWindow(scaleWindow, createScaleWindow);
}

function ensureComposerWindow() {
  return ensureWindow(composerWindow, createComposerWindow);
}

function ensureChatWindow() {
  return ensureWindow(chatWindow, createChatWindow);
}

function ensureCodeWindow() {
  return ensureWindow(codeWindow, createCodeWindow);
}

function ensureBubbleWindow() {
  return ensureWindow(bubbleWindow, createBubbleWindow);
}

function createExpressionWindow() {
  const win = createSecondaryExpressionWindow({
    PRELOAD_PATH,
    currentAppearanceTheme,
    getTitleBarOverlay,
    loadView,
    isQuitting: () => app.isQuiting,
    getActiveExpressions: () => expressionChatStateService.getActiveExpressions(),
    onDestroyed: () => {
      if (expressionWindow === win) expressionWindow = null;
    }
  });
  expressionWindow = win;
  return win;
}

function ensureExpressionWindow() {
  return ensureWindow(expressionWindow, createExpressionWindow);
}

function openExpressionWindow() {
  const win = ensureExpressionWindow();
  win.show();
  win.focus();
  win.webContents.send("agent:expressions-updated", expressionChatStateService.getActiveExpressions());
  return true;
}

function openSettingsWindow() {
  const win = ensureSettingsWindow();
  win.show();
  win.focus();
  return true;
}

function openScaleWindow() {
  const win = ensureScaleWindow();
  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.send("agent:pet-scale-updated", petWindowLayoutService.getPetScale());
  return true;
}

function openComposerWindow() {
  const win = ensureComposerWindow();
  win.setBounds(getComposerWindowBounds());
  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.send("agent:chat-state-updated", chatStateStore.getState());
  return true;
}

function openChatWindow() {
  const win = ensureChatWindow();
  win.setBounds(getChatWindowBounds());
  win.setAlwaysOnTop(false);
  hidePetForChat();
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.send("agent:chat-state-updated", chatStateStore.getState());
  return true;
}

function hidePetForChat() {
  if (petManuallyHidden) return;
  petHiddenForChat = true;
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
  if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide();
  syncGlobalCursorTracking();
  refreshTrayMenu();
}

function restorePetAfterChat() {
  if (!petHiddenForChat || petManuallyHidden || app.isQuiting) return;
  petHiddenForChat = false;
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.showInactive();
  petWindow.moveTop();
  petWindow.webContents.invalidate();
  wakeBubbleWindow(true);
  syncGlobalCursorTracking();
  refreshTrayMenu();
}

function showPetWindow() {
  if (!isBackgroundScheduleLaunch && startupStatus.phase !== "ready") {
    if (startupWindow && !startupWindow.isDestroyed()) {
      startupWindow.show();
      startupWindow.focus();
    }
    return false;
  }
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
  petManuallyHidden = false;
  petHiddenForChat = false;
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.showInactive();
  petWindow.moveTop();
  petWindow.webContents.invalidate();
  wakeBubbleWindow(true);
  syncGlobalCursorTracking();
  refreshTrayMenu();
  return true;
}

function wakeBubbleWindow(replayLastReply = false) {
  if (petHiddenForChat || !petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return false;
  const bubble = ensureBubbleWindow();
  bubble.setAlwaysOnTop(true, "screen-saver");
  updateBubbleWindowLayout();
  if (replayLastReply) {
    const replay = () => bubble.webContents.send("agent:menu-action", "show-bubble");
    if (bubble.webContents.isLoadingMainFrame()) bubble.webContents.once("did-finish-load", replay);
    else replay();
  }
  bubble.showInactive();
  bubble.moveTop();
  return true;
}

function hidePetWindow() {
  petManuallyHidden = true;
  petHiddenForChat = false;
  petWindow?.hide();
  bubbleWindow?.hide();
  syncGlobalCursorTracking();
  refreshTrayMenu();
  return true;
}

function getLoginItemOptions(openAtLogin) {
  return {
    openAtLogin,
    path: process.execPath,
    args: isDev ? [app.getAppPath()] : []
  };
}

function buildTrayContextMenu() {
  const petVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  return createTrayContextMenu({
    petVisible,
    currentAgentConfig,
    isAutoLaunchEnabled: systemResourceService.isAutoLaunchEnabled(),
    onTogglePet: (visible) => visible ? hidePetWindow() : showPetWindow(),
    onOpenChat: () => openChatWindow(),
    onOpenComposer: () => openComposerWindow(),
    onOpenCode: () => openCodeWindow(),
    onOpenSettings: () => openSettingsWindow(),
    onToggleHoverAutoHide: (checked) => updateHoverAutoHide(checked),
    onToggleAutoLaunch: (checked) => systemResourceService.setAutoLaunchEnabled(checked),
    onQuit: () => {
      app.isQuiting = true;
      app.quit();
    }
  });
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayContextMenu());
}

function createSystemTray() {
  if (tray && !tray.isDestroyed()) return tray;
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Vivi · V-Manager");
  tray.setContextMenu(buildTrayContextMenu());
  tray.on("click", () => showPetWindow());
  tray.on("double-click", () => openChatWindow());
  return tray;
}

function openCodeWindow() {
  const win = ensureCodeWindow();
  win.show();
  win.focus();
  win.webContents.send("agent:chat-state-updated", chatStateStore.getState());
  return true;
}

function sendPetAction(action) {
  petWindow?.webContents.send("agent:menu-action", action);
  bubbleWindow?.webContents.send("agent:menu-action", action);
}

function sendComposerAction(action) {
  openComposerWindow();
  composerWindow?.webContents.send("agent:menu-action", action);
}

function sendChatAction(action) {
  openChatWindow();
  chatWindow?.webContents.send("agent:menu-action", action);
}

function broadcastPetScale(scale) {
  petWindow?.webContents.send("agent:pet-scale-updated", scale);
  scaleWindow?.webContents.send("agent:pet-scale-updated", scale);
}

function broadcastChatState(state = chatStateStore.getState()) {
  petWindow?.webContents.send("agent:chat-state-updated", state);
  composerWindow?.webContents.send("agent:chat-state-updated", state);
  chatWindow?.webContents.send("agent:chat-state-updated", state);
  bubbleWindow?.webContents.send("agent:chat-state-updated", state);
  codeWindow?.webContents.send("agent:chat-state-updated", state);
}

function broadcastMoodUpdate(payload) {
  petWindow?.webContents.send("agent:mood-updated", payload);
  chatWindow?.webContents.send("agent:mood-updated", payload);
}

function broadcastToWindows(windows, channel, payload) {
  for (const win of windows) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

const speechService = registerSpeechServiceIpc({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getCurrentConfig: () => currentAgentConfig,
  getGptSovitsSourceRoot: () => app.getAppPath(),
  getGptSovitsRuntimeRoot: () => currentAgentConfig.voice?.gptSovitsRuntimeRoot,
  getGptSovitsRuntimeCandidates: () => {
    const candidates = [];
    const appPath = app.getAppPath();
    if (currentAgentConfig.voice?.gptSovitsRuntimeRoot) candidates.push(currentAgentConfig.voice.gptSovitsRuntimeRoot);
    const envRoot = process.env.V_MANAGER_PROJECT_ROOT;
    if (envRoot) candidates.push(envRoot);
    // In dev, app.getAppPath() is the project root itself; in a packaged build it
    // points inside app.asar, which can never contain the runtime, so skip it.
    if (appPath && !appPath.includes("app.asar")) candidates.push(appPath);
    // The folder that typically holds a project checkout / the runtime root.
    const parent = appPath ? path.dirname(appPath) : null;
    if (parent && !parent.includes("app.asar")) candidates.push(parent);
    return candidates;
  },
  loadConfig,
  mergeConfig: mergeRuntimeConfig,
  saveConfig,
  showOpenDialog: (options) => dialog.showOpenDialog(settingsWindow ?? undefined, options),
  openPath: (target) => shell.openPath(target),
  fetch: (url, options) => net.fetch(url, options),
  broadcastSpeechSignal: (payload) => broadcastToWindows([petWindow, chatWindow], "agent:speech-signal-updated", payload),
  broadcastSttProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:local-stt-progress", progress),
  broadcastLocalTtsProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:local-tts-progress", progress),
  broadcastGptSovitsProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:gpt-sovits-progress", progress),
  broadcastGptSovitsInstallProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow], "agent:gpt-sovits-install-progress", progress),
  runBackgroundTask: (type, payload, runOptions) => utilityTaskSupervisor.run(type, payload, runOptions)
});
const live2dModelService = createLive2DModelService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  setConfig: (config) => { currentAgentConfig = config; },
  mergeConfig: mergeRuntimeConfig,
  saveConfig,
  broadcastConfigUpdated: (config) => broadcastConfigUpdated(config),
  broadcastModels: (models) => broadcastLive2DModels(models),
  openPath: (target) => shell.openPath(target),
  onError: (scope, error) => console.error(`[live2d] ${scope} failed:`, error)
});

const personaCardService = createPersonaCardService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  setConfig: (config) => { currentAgentConfig = config; },
  mergeConfig: mergeRuntimeConfig,
  broadcastConfigUpdated: (config) => broadcastConfigUpdated(config)
});

const settingsService = createSettingsService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  mergeConfig: mergeRuntimeConfig,
  loadRuntimePersona: async (storedConfig) => {
    const runtimePersona = await personaCardService.applyRuntimePersona(storedConfig);
    currentAgentConfig = runtimePersona.config;
    return runtimePersona;
  },
  getLive2DModels: () => live2dModelService.getModels(),
  getStartupStatus: () => startupStatus,
  getStartupDiagnostics: () => chatFlowService.getStartupDiagnostics(),
  beforeConfigApplied: (previousConfig, nextConfig) => {
    if (previousConfig.appearance?.mouseFollow !== nextConfig.appearance?.mouseFollow) {
      cursorDeliveryState.clear();
    }
    if (previousConfig.appearance?.hoverAutoHide === true && nextConfig.appearance?.hoverAutoHide !== true
      && petWindow && !petWindow.isDestroyed()) {
      petWindow.setIgnoreMouseEvents(false);
    }
  },
  afterConfigApplied: async (config) => {
    syncGlobalCursorTracking();
    currentAppearanceTheme = config.appearance?.theme === "dark" ? "dark" : "light";
    updateTitleBarOverlays();
    broadcastConfigUpdated(config);
    refreshTrayMenu();
    await scheduleService.afterMutation();
  },
  broadcastRelationshipProfile: (profile) => broadcastRelationshipProfile(profile)
});

const systemResourceService = createSystemResourceService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  readLoginItemSettings: () => app.getLoginItemSettings(getLoginItemOptions(false)),
  writeLoginItemSettings: (enabled) => app.setLoginItemSettings(getLoginItemOptions(Boolean(enabled))),
  broadcastAutoLaunchUpdate: (enabled) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("agent:auto-launch-updated", enabled);
    }
  }
});

const fileManagerService = createFileManagerService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData")
});

const hostShellService = createHostShellService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  openExternal: (target) => shell.openExternal(target),
  openPath: (target) => shell.openPath(target),
  showItemInFolder: (target) => shell.showItemInFolder(target)
});

const companionLifeService = createCompanionLifeService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  onLifeStateUpdated: (state) => broadcastLifeState(state),
  isHostReady: () => app.isReady(),
  reconcileCompletedReminders: () => scheduleService.reconcileCompletedReminderCommitments(),
  getInterestSettings: (config) => currentInterestSettings(config),
  isAutonomousBusy: () => autonomousCreationService.isBusy(),
  getCaughtInterestReply: () => autonomousCreationService.caughtReply(),
  chatStateStore,
  onProactiveEvent: (event) => publishProactivePresentation(event),
  onInterestInteraction: (message, mood) => {
    wakeBubbleWindow();
    broadcastMoodUpdate({ phase: "final", mood, reply: message });
  },
  broadcastRelationshipProfile,
  broadcastMoodUpdate,
  mergeConfig: mergeRuntimeConfig,
  setInterval: (listener, intervalMs) => setInterval(listener, intervalMs),
  clearInterval: (timer) => clearInterval(timer),
  onError: (scope, error) => console.error(`[proactive] ${scope} failed:`, error),
  now: () => Date.now()
});

const windowIntentService = createWindowIntentService({
  trustedIpc,
  openSettingsWindow: () => openSettingsWindow(),
  openComposerWindow: () => openComposerWindow(),
  openChatWindow: () => openChatWindow(),
  openCodeWindow: () => openCodeWindow(),
  openScaleWindow: () => openScaleWindow(),
  openExpressionWindow: () => openExpressionWindow()
});

const codeWorkspaceService = createCodeWorkspaceService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  initialWorkspaceDir: process.cwd(),
  onWorkspaceChanged: (workspaceDir) => setActiveWorkspaceDir(workspaceDir),
  showOpenDialog: (options) => {
    const owner = codeWindow && !codeWindow.isDestroyed() ? codeWindow : undefined;
    return owner
      ? dialog.showOpenDialog(owner, options)
      : dialog.showOpenDialog(options);
  }
});

const expressionChatStateService = createExpressionChatStateService({
  trustedIpc,
  chatStateStore,
  broadcastActiveExpressions: (expressions) => broadcastActiveExpressions(expressions)
});

const petWindowLayoutService = createPetWindowLayoutService({
  trustedIpc,
  broadcastPositionLock: (locked) => petWindow?.webContents.send("agent:position-lock-updated", locked),
  isPetWindowActive: () => Boolean(petWindow && !petWindow.isDestroyed()),
  getPetWindowBounds: () => petWindow.getBounds(),
  setPetWindowBounds: (bounds) => petWindow.setBounds(bounds),
  setPetWindowPosition: (x, y) => petWindow.setPosition(x, y),
  updateBubbleWindowLayout,
  getPetWindowSize,
  getWorkAreaForBounds: (bounds) => screen.getDisplayMatching(bounds).workArea,
  broadcastPetScale,
  isBubbleWindowActive: () => Boolean(bubbleWindow && !bubbleWindow.isDestroyed()),
  isSenderBubbleWindow: (event) => event.sender === bubbleWindow?.webContents,
  getBubbleWindowBounds,
  isSenderPetWindow: (event) => event.sender === petWindow?.webContents,
  isHoverAutoHideEnabled: () => currentAgentConfig.appearance?.hoverAutoHide === true,
  setPetMousePassthrough: (ignore) => {
    if (ignore) petWindow.setIgnoreMouseEvents(true, { forward: true });
    else petWindow.setIgnoreMouseEvents(false);
  },
  showPetContextMenu: (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? petWindow;
    buildPetContextMenu().popup({
      window: targetWindow ?? undefined
    });
  }
});

const rendererReadyService = createRendererReadyService({
  trustedIpc,
  getStartupStatus: () => startupStatus,
  releaseStartup: (status) => releaseStartupToApplication(status)
});

const modelConversationService = createModelConversationService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  loadConfig,
  mergeConfig: mergeAgentConfig,
  fetch: net.fetch.bind(net),
  ragClient: ragTaskClient,
  scheduleClient: {
    afterMutation: () => scheduleService.afterMutation(),
    abortPowerAction: () => scheduleService.abortPowerAction()
  },
  interestStatusLabel
});

const autonomousCreationService = createAutonomousCreationService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  getRelationshipProfile: () => loadRelationshipProfile(app.getPath("userData")),
  gamePlaytestService,
  modelService: modelConversationService,
  isHostReady: () => app.isReady(),
  isOwnerTaskRunning: () => chatFlowService.isOwnerTaskRunning(),
  isScheduleBusy: () => scheduleService.snapshot().tickRunning,
  isProactiveBusy: () => companionLifeService.isProactiveBusy(),
  ownerInteractionIdleSeconds: () => companionLifeService.ownerInteractionIdleSeconds(),
  publishInteraction: (message, mood, userText) => companionLifeService.publishInterestInteraction(message, mood, userText),
  publishProactiveEvent: (event) => companionLifeService.publishProactiveEvent(event),
  broadcastMood: (payload) => broadcastMoodUpdate(payload),
  broadcastState: (payload) => broadcastInterestState(payload),
  setExpression: (type) => expressionChatStateService.setInterestExpression(type),
  resolveLocationLabel: (location) => resolveLocationLabel(location),
  openPath: (target) => shell.openPath(target),
  isFile: (target) => fs.stat(target).then((stat) => stat.isFile()).catch(() => false),
  onError: (scope, error) => console.error(`[interest-sandbox] ${scope} failed:`, error)
});

const chatFlowService = createChatFlowService({
  getBaseDir: () => app.getPath("userData"),
  chatStateStore,
  companionLifeService,
  modelService: modelConversationService,
  autonomousService: autonomousCreationService,
  personaService: personaCardService,
  wakeBubbleWindow,
  broadcastMood: (payload) => broadcastMoodUpdate(payload),
  broadcastRelationshipProfile,
  clearTransientExpressions: () => expressionChatStateService.clearTransientExpressions(),
  onRuntimePersona: (runtimePersona) => { currentAgentConfig = runtimePersona.config; },
  initialStartupDiagnostics: { rag: null, deepseek: "unchecked", historyRestored: 0 }
});
chatFlowService.start();

modelConversationService.registerIpc(chatFlowService.handleChat);
autonomousCreationService.registerIpc();
live2dModelService.registerIpc();
personaCardService.registerIpc();
settingsService.registerIpc();
systemResourceService.registerIpc().start();
fileManagerService.registerIpc().start();
hostShellService.registerIpc().start();
companionLifeService.registerIpc().start();
windowIntentService.registerIpc().start();
codeWorkspaceService.registerIpc().start();
expressionChatStateService.registerIpc().start();
petWindowLayoutService.registerIpc().start();
rendererReadyService.registerIpc().start();

async function resolveLocationLabel(location) {
  try {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    const endpoint = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    endpoint.searchParams.set("latitude", String(latitude));
    endpoint.searchParams.set("longitude", String(longitude));
    endpoint.searchParams.set("localityLanguage", "zh");
    const response = await net.fetch(endpoint.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return {};
    const result = await response.json();
    return {
      city: result.city || result.locality || result.principalSubdivision || "",
      region: result.principalSubdivision || "",
      country: result.countryName || ""
    };
  } catch (error) {
    console.warn("[interest-sandbox] reverse geocoding failed:", error);
    return {};
  }
}

function broadcastConfigUpdated(config) {
  for (const win of [petWindow, settingsWindow, scaleWindow, composerWindow, chatWindow, bubbleWindow, expressionWindow, codeWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:config-updated", config);
  }
}

function broadcastRelationshipProfile(profile) {
  for (const win of [petWindow, settingsWindow, composerWindow, chatWindow, bubbleWindow, codeWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:relationship-updated", profile);
  }
}

function broadcastLifeState(state) {
  for (const win of [petWindow, settingsWindow, chatWindow, bubbleWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:life-state-updated", state);
  }
}

function currentInterestSettings(config = currentAgentConfig) {
  return normalizeInterestConfig({
    ...config.interests,
    personaCardId: config.activePersonaCard?.id || ""
  });
}

function publishProactivePresentation(event) {
  broadcastMoodUpdate({ phase: "final", mood: event.mood, reply: event.message });

  if (petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    wakeBubbleWindow();
  }

  if (currentAgentConfig.proactive?.systemNotifications !== false && Notification.isSupported()) {
    const notification = new Notification({
      title: currentAgentConfig.personaName || "Vivi",
      body: event.message,
      silent: false
    });
    notification.on("click", () => showPetWindow());
    notification.show();
  }
}

function broadcastInterestState(payload) {
  for (const win of [petWindow, settingsWindow, composerWindow, chatWindow, bubbleWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:interest-state-updated", payload);
  }
  if (petWindowLayoutService.shouldWakeInterestBubble(payload)
    && petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    wakeBubbleWindow();
  }
  return payload;
}

function broadcastLive2DModels() {
  const models = live2dModelService.getModels();
  for (const win of [petWindow, settingsWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:live2d-models-updated", models);
  }
}

function deliverCursorPosition(win, point) {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const bounds = win.getContentBounds();
  const signature = `${point.x}:${point.y}:${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
  if (cursorDeliveryState.get(win.id) === signature) return;
  cursorDeliveryState.set(win.id, signature);
  win.webContents.send("agent:cursor-screen-position", {
    screenX: point.x,
    screenY: point.y,
    clientX: point.x - bounds.x,
    clientY: point.y - bounds.y
  });
}

function startGlobalCursorTracking() {
  if (cursorTrackingTimer || !shouldTrackGlobalCursor()) return;
  cursorTrackingTimer = setInterval(() => {
    if (!shouldTrackGlobalCursor()) {
      syncGlobalCursorTracking();
      return;
    }
    const point = screen.getCursorScreenPoint();
    deliverCursorPosition(petWindow, point);
    deliverCursorPosition(chatWindow, point);
  }, 33);
}

function isVisibleTrackingSurface(win) {
  return Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
}

function shouldTrackGlobalCursor() {
  return currentAgentConfig.appearance?.mouseFollow !== false
    && (isVisibleTrackingSurface(petWindow) || isVisibleTrackingSurface(chatWindow));
}

function syncGlobalCursorTracking() {
  if (shouldTrackGlobalCursor()) startGlobalCursorTracking();
  else stopGlobalCursorTracking();
}

function stopGlobalCursorTracking() {
  if (cursorTrackingTimer) clearInterval(cursorTrackingTimer);
  cursorTrackingTimer = null;
  cursorDeliveryState.clear();
}

async function updateLive2DModel(modelId) {
  if (!live2dModelService.getModels().some((model) => model.id === modelId)) return false;
  currentAgentConfig = mergeRuntimeConfig({
    ...currentAgentConfig,
    appearance: { ...currentAgentConfig.appearance, live2dModel: modelId }
  });
  await saveConfig(app.getPath("userData"), currentAgentConfig);
  broadcastConfigUpdated(currentAgentConfig);
  return true;
}

async function updateMouseFollow(enabled) {
  currentAgentConfig = mergeRuntimeConfig({
    ...currentAgentConfig,
    appearance: { ...currentAgentConfig.appearance, mouseFollow: Boolean(enabled) }
  });
  cursorDeliveryState.clear();
  syncGlobalCursorTracking();
  await saveConfig(app.getPath("userData"), currentAgentConfig);
  broadcastConfigUpdated(currentAgentConfig);
  return currentAgentConfig.appearance.mouseFollow;
}

async function updateHoverAutoHide(enabled) {
  currentAgentConfig = mergeRuntimeConfig({
    ...currentAgentConfig,
    appearance: { ...currentAgentConfig.appearance, hoverAutoHide: Boolean(enabled) }
  });
  if (petWindow && !petWindow.isDestroyed() && !enabled) {
    petWindow.setIgnoreMouseEvents(false);
  }
  await saveConfig(app.getPath("userData"), currentAgentConfig);
  broadcastConfigUpdated(currentAgentConfig);
  refreshTrayMenu();
  return currentAgentConfig.appearance.hoverAutoHide;
}

function broadcastActiveExpressions(expressions) {
  petWindow?.webContents.send("agent:expressions-updated", expressions);
  expressionWindow?.webContents.send("agent:expressions-updated", expressions);
}

function updateBubbleWindowLayout() {
  if (!bubbleWindow || bubbleWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) {
    return;
  }

  const bounds = getBubbleWindowBounds();
  const { placement, ...windowBounds } = bounds;
  bubbleWindow.setBounds(windowBounds);
  bubbleWindow.webContents.send("agent:bubble-placement-updated", placement);
}

function buildPetContextMenu() {
  return createPetContextMenu({
    live2dModels: live2dModelService.getModels(),
    selectedModelId: currentAgentConfig.appearance?.live2dModel,
    positionLocked: petWindowLayoutService.getPositionLocked(),
    isAlwaysOnTop: petWindow?.isAlwaysOnTop() === true,
    currentAgentConfig,
    onFocusComposer: () => sendComposerAction("focus-composer"),
    onClearBubble: () => sendPetAction("clear-bubble"),
    onOpenHistoryPanel: () => sendChatAction("open-history-panel"),
    onOpenExpressionWindow: () => openExpressionWindow(),
    onPetAction: (action) => sendPetAction(action),
    onSelectModel: (modelId) => updateLive2DModel(modelId),
    onOpenScaleWindow: () => openScaleWindow(),
    onOpenCodeWindow: () => openCodeWindow(),
    onOpenSettingsWindow: () => openSettingsWindow(),
    onTogglePositionLock: () => {
      const locked = petWindowLayoutService.setPositionLocked(!petWindowLayoutService.getPositionLocked());
      petWindow?.webContents.send("agent:position-lock-updated", locked);
    },
    onToggleAlwaysOnTop: () => {
      if (!petWindow) return;
      const nextState = !petWindow.isAlwaysOnTop();
      petWindow.setAlwaysOnTop(nextState, nextState ? "screen-saver" : "normal");
    },
    onToggleHoverAutoHide: (checked) => updateHoverAutoHide(checked),
    onCenterPet: () => petWindow?.center(),
    onHidePet: () => hidePetWindow(),
    onQuit: () => {
      app.isQuiting = true;
      app.quit();
    }
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  await ensureDataFiles(app.getPath("userData"), { ensureRag: false });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    if (permission === "geolocation") {
      return currentAgentConfig.interests?.enabled === true
        && currentAgentConfig.interests?.autoLocation !== false
        && currentAgentConfig.interests?.networkAccess !== "off";
    }
    return permission === "media" && details.mediaType !== "video";
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === "geolocation") {
      callback(currentAgentConfig.interests?.enabled === true
        && currentAgentConfig.interests?.autoLocation !== false
        && currentAgentConfig.interests?.networkAccess !== "off");
      return;
    }
    const audioOnly = permission === "media" && !details.mediaTypes?.includes("video");
    callback(audioOnly);
  });
  const startupConfig = await loadConfig(app.getPath("userData"));
  currentAgentConfig = mergeRuntimeConfig(startupConfig);
  await saveConfig(app.getPath("userData"), currentAgentConfig);
  await fs.rm(path.join(app.getPath("userData"), "agent-data", "outlook-token.bin"), { force: true }).catch(() => null);
  currentAppearanceTheme = currentAgentConfig.appearance?.theme === "dark" ? "dark" : "light";
  await Promise.all([settingsService.start(), personaCardService.start()]);

  createStartupWindow();
  publishStartupStatus({ phase: "booting", progress: 12, title: "正在读取配置", detail: "人物设定与本地权限已载入。" });
  if (!isBackgroundScheduleLaunch && currentAgentConfig.voice?.enabled && currentAgentConfig.voice?.provider === "gpt_sovits" && currentAgentConfig.voice?.gptSovitsAutoStart !== false) {
    publishStartupStatus({ phase: "voice", progress: 22, title: "正在准备声音", detail: "启动 GPT-SoVITS 本地语音服务，首次加载可能需要一会儿。" });
    try {
      const voiceRuntime = await speechService.ensureGptSovitsRuntime(currentAgentConfig.voice.gptSovitsBaseUrl);
      publishStartupStatus({
        phase: "voice",
        progress: 50,
        title: "声音已经准备好",
        detail: voiceRuntime.started ? "本地语音服务已同步启动。" : "本地语音服务正在运行。"
      });
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      publishStartupStatus({
        phase: "warning",
        progress: 50,
        title: "语音暂时不可用",
        detail: "将先以文字模式启动，稍后使用语音时会再次尝试恢复。",
        warning
      });
    }
  } else {
    const manualGptSovits = currentAgentConfig.voice?.enabled
      && currentAgentConfig.voice?.provider === "gpt_sovits"
      && currentAgentConfig.voice?.gptSovitsAutoStart === false;
    publishStartupStatus({
      phase: "voice",
      progress: 50,
      title: "语音配置已确认",
      detail: manualGptSovits
        ? "GPT-SoVITS 设置为手动启动，本次跳过模型加载。"
        : currentAgentConfig.voice?.enabled ? "当前语音方案不需要启动本地服务。" : "自动朗读目前未开启。"
    });
  }

  publishStartupStatus({ phase: "models", progress: 58, title: "正在检查形象资源", detail: "扫描 Live2D 模型与表情配置…" });
  await live2dModelService.start({ broadcast: false });
  protocol.handle("vivi-asset", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Not found", { status: 404 });
      const assetRoot = path.join(app.getAppPath(), isDev ? "public" : "dist");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (parts.length === 0) return new Response("Not found", { status: 404 });
      const filePath = path.resolve(assetRoot, ...parts);
      const relative = path.relative(assetRoot, filePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return new Response("Forbidden", { status: 403 });
      const content = await fs.readFile(filePath);
      return new Response(content, {
        headers: {
          "content-type": getModelContentType(filePath),
          "access-control-allow-origin": "*"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  protocol.handle("vivi-model", async (request) => {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const modelId = parts.shift();
      const modelRoot = live2dModelService.getModelRoot(modelId);
      if (!modelRoot || parts.length === 0) return new Response("Not found", { status: 404 });
      const filePath = path.resolve(modelRoot, ...parts);
      const relative = path.relative(modelRoot, filePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return new Response("Forbidden", { status: 403 });
      const content = await fs.readFile(filePath);
      return new Response(content, {
        headers: {
          "content-type": getModelContentType(filePath),
          "access-control-allow-origin": "*"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  publishStartupStatus({ phase: "data", progress: 72, title: "正在整理本地状态", detail: "恢复工作区、日程与陪伴记忆…" });
  try {
    chatFlowService.updateStartupDiagnostics({
      rag: await ragTaskClient.ensure(app.getPath("userData"))
    });
  } catch (error) {
    chatFlowService.updateStartupDiagnostics({
      rag: { error: String(error?.message || error) }
    });
  }
  currentAgentConfig = await chatFlowService.initializeStartupConversation(
    currentAgentConfig,
    personaCardService
  );
  await codeWorkspaceService.restoreWorkspaceState();
  createPetWindow();
  createBubbleWindow();
  createSystemTray();
  updateBubbleWindowLayout();
  syncGlobalCursorTracking();
  await companionLifeService.restoreLifeState();
  companionLifeService.startEngine();
  await scheduleService.start({ publishAgenda: !isBackgroundScheduleLaunch });
  await autonomousCreationService.start().catch((error) => {
    console.error("[interest-sandbox] startup failed:", error);
  });
  if (!isBackgroundScheduleLaunch) {
    publishStartupStatus({ phase: "renderer", progress: 90, title: "正在加载 Vivi", detail: "等待 Live2D 模型完成渲染…" });
    if (rendererReadyService.getModelStatus()) releaseStartupToApplication(rendererReadyService.getModelStatus());
    else startupReleaseTimer = setTimeout(() => releaseStartupToApplication("error"), 45_000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
      createBubbleWindow();
      updateBubbleWindowLayout();
    }
  });
});

app.on("window-all-closed", () => {
  // The tray keeps the desktop companion available in the background.
});

app.on("second-instance", (_event, argv) => {
  if (!app.isReady()) return;
  if (argv.includes("--vivi-background-schedule")) {
    void scheduleService.tick().catch((error) => console.error("[schedule] background tick failed:", error));
    return;
  }
  showPetWindow();
});

registerMemoryServiceIpc({
  ipcMain: trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getMemoryDatabaseStats,
  reconcileCompletedReminderCommitments: () => scheduleService.reconcileCompletedReminderCommitments(),
  getRagStatus,
  ragClient: ragTaskClient,
  testEmbeddingConnection,
  clearConversationHistory,
  clearCompanionMemory,
  onCleared: () => {
    chatStateStore.reset();
    return true;
  }
});

app.on("before-quit", (event) => {
  app.isQuiting = true;
  if (!shutdownCleanupDone) {
    shutdownCleanupDone = true;
    const scheduleShutdown = scheduleService.dispose();
    phase4cShutdownPromise = Promise.allSettled([
      scheduleShutdown,
      chatFlowService.dispose(),
      chatStateStore.dispose(),
      autonomousCreationService.dispose(),
      modelConversationService.dispose(),
      settingsService.dispose(),
      personaCardService.dispose(),
      live2dModelService.dispose(),
      systemResourceService.dispose(),
      fileManagerService.dispose(),
      hostShellService.dispose(),
      companionLifeService.dispose(),
      windowIntentService.dispose(),
      codeWorkspaceService.dispose(),
      expressionChatStateService.dispose(),
      petWindowLayoutService.dispose(),
      rendererReadyService.dispose()
    ]).then(() => undefined);
    stopGlobalCursorTracking();
    utilityTaskSupervisor.close();
    gamePlaytestService.dispose();
    speechService.dispose();
    tray?.destroy();
    tray = null;
  }
  if (gptSovitsShutdownStarted) return;
  event.preventDefault();
  gptSovitsShutdownStarted = true;
  void Promise.allSettled([
    phase4cShutdownPromise,
    speechService.stopGptSovitsRuntime(currentAgentConfig.voice?.gptSovitsBaseUrl)
  ])
    .finally(() => app.quit());
});
