import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, screen, session, shell, Tray, utilityProcess } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearConversationHistory,
  defaultConfig,
  ensureDataFiles,
  getAppRegistrySnapshot,
  getActiveWorkspaceDir,
  getFileManagerSnapshot,
  getRagStatus,
  getSystemResourceSnapshot,
  loadConfig,
  rebuildAppRegistry,
  saveConfig,
  setActiveWorkspaceDir,
  searchLocalFiles,
  testEmbeddingConnection
} from "../src-agent/core.js";
import { listWorkspaceCodeFiles, readWorkspaceCode, writeWorkspaceCode } from "../src-agent/code-executor.js";
import { loadRelationshipProfile, recordPetTouch } from "../src-agent/relationship-engine.js";
import { resolveAgentRoute } from "../src-agent/router.js";
import { classifyFastReaction } from "../src-agent/fast-reaction.js";
import {
  createOrganizationPreview,
  executeOrganizationPreview,
  listFileOperations,
  scanManagedDirectory,
  undoFileOperation
} from "../src-agent/safe-file-manager.js";
import {
  clearCompanionMemory,
  detectProactiveFeedback,
  getFollowUpCandidate,
  loadCompanionMemory,
  markCommitmentFollowedUp,
  resolveCommitmentsByText,
  recordProactiveFeedback
} from "../src-agent/companion-memory.js";
import {
  evaluateLifeTick,
  loadLifeState,
  pauseProactiveForToday,
  recordOwnerInteraction,
  resetWorkSession,
  saveLifeState
} from "../src-agent/proactive-engine.js";
import { normalizeInterestConfig } from "../src-agent/interest-sandbox.js";
import { runGamePlaytest } from "../src-agent/game-playtest.js";
import { createIsolatedGameDriver } from "./game-playtest-runtime.js";
import { getMemoryDatabaseStats, getRecentConversationMessages } from "../src-agent/local-database.js";
import { configureDesktopShell } from "../src-agent/platform/desktop-shell.js";
import { attachWindowLifecycle, WINDOW_LIFECYCLE } from "./window-lifecycle.js";
import { registerMemoryServiceIpc } from "./services/memory-service.js";
import { registerSpeechServiceIpc } from "./services/speech-service.js";
import { createScheduleService } from "./services/schedule-service.js";
import { createGamePlaytestService } from "./services/game-playtest-service.js";
import { createModelConversationService } from "./services/model-conversation-service.js";
import { createAutonomousCreationService, interestStatusLabel } from "./services/autonomous-creation-service.js";
import { createLive2DModelService } from "./services/live2d-model-service.js";
import { createPersonaCardService } from "./services/persona-card-service.js";
import { createSettingsService } from "./services/settings-service.js";
import { createRagTaskClient } from "./services/rag-task-client.js";
import { createUtilityTaskSupervisor, resolveUtilityEntryPoint } from "./services/utility-task-supervisor.js";
import { createTrustedIpcRegistrar } from "./ipc-security.js";

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
const trustedIpc = createTrustedIpcRegistrar(ipcMain, {
  isDev,
  devServerUrl,
  rendererRoot: path.join(app.getAppPath(), "dist")
});
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
  publishProactiveEvent: (event) => publishProactiveEvent(event),
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
let bubbleContentSize = { width: 330, height: 180 };
let expressionWindow = null;
let codeWindow = null;
let tray = null;
let currentAppearanceTheme = "light";
let currentAgentConfig = defaultConfig;
let petWindowScale = 1;
let positionLocked = false;
let petHiddenForChat = false;
let petManuallyHidden = false;
let activeManualExpressions = new Set();
let activeInterestExpressions = new Set();
const persistentShapeExpressions = new Set(["expression20", "expression21", "expression22", "expression24"]);
let cursorTrackingTimer = null;
let proactiveTimer = null;
let currentLifeState = null;
let proactiveTickRunning = false;
let ownerInteractionRevision = 0;
let ownerInteractionUpdateRunning = false;
let agentTaskRunning = false;
const cursorDeliveryState = new Map();
let startupReleaseTimer = null;
let startupRendererModelStatus = null;
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

function mergeAgentConfig(nextConfig = {}) {
  const { calendar: _removedCalendar, ...supportedConfig } = nextConfig;
  return {
    ...defaultConfig,
    ...supportedConfig,
    deepseek: { ...defaultConfig.deepseek, ...(nextConfig.deepseek ?? {}) },
    embedding: { ...defaultConfig.embedding, ...(nextConfig.embedding ?? {}) },
    astrbot: {
      ...defaultConfig.astrbot,
      ...(nextConfig.astrbot ?? {}),
      contactMap: { ...defaultConfig.astrbot.contactMap, ...(nextConfig.astrbot?.contactMap ?? {}) }
    },
    appearance: { ...defaultConfig.appearance, ...(nextConfig.appearance ?? {}) },
    voice: {
      ...defaultConfig.voice,
      ...(nextConfig.voice ?? {}),
      baseUrl: nextConfig.voice?.baseUrl || defaultConfig.voice.baseUrl,
      model: nextConfig.voice?.model || defaultConfig.voice.model,
      voice: nextConfig.voice?.voice || defaultConfig.voice.voice
    },
    speechInput: { ...defaultConfig.speechInput, ...(nextConfig.speechInput ?? {}) },
    relationship: { ...defaultConfig.relationship, ...(nextConfig.relationship ?? {}) },
    proactive: { ...defaultConfig.proactive, ...(nextConfig.proactive ?? {}) },
    interests: normalizeInterestConfig(nextConfig.interests),
    memory: { ...defaultConfig.memory, ...(nextConfig.memory ?? {}) }
  };
}

function getModelContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".js") return "application/javascript";
  if (extension === ".css") return "text/css";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

let chatState = {
  messages: [],
  knowledge: [],
  lastReplyMeta: null
};
let startupDiagnostics = { rag: null, deepseek: "unchecked", historyRestored: 0 };

async function initializeStartupConversation(baseDir) {
  const runtimePersona = await personaCardService.applyRuntimePersona(currentAgentConfig);
  const activeCard = runtimePersona.card;
  currentAgentConfig = runtimePersona.config;
  const history = await getRecentConversationMessages(baseDir, { limit: 40, personaCardId: activeCard?.id || "" });
  const memory = await loadCompanionMemory(baseDir);
  const greeting = await modelConversationService.generateGreeting(currentAgentConfig, {
    history,
    memory,
    userAddress: activeCard?.payload?.userAddress || "你"
  });
  chatState = {
    messages: [...history.map(({ role, content }) => ({ role, content })), { role: "assistant", content: greeting.reply }].slice(-80),
    knowledge: [],
    lastReplyMeta: {
      responseMode: greeting.mode === "model" ? "deepseek_chat" : "fallback_local",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: greeting.mode === "model" ? "" : "启动问候使用人物卡本地回退",
      model: greeting.mode === "model" ? currentAgentConfig.deepseek.chatModel || currentAgentConfig.deepseek.model : "local-persona-greeting",
      sourceLabel: "本次见面"
    }
  };
  startupDiagnostics.deepseek = greeting.mode === "model" ? "ready" : currentAgentConfig.deepseek?.apiKey ? "unavailable" : "not_configured";
  startupDiagnostics.historyRestored = history.length;
}
let lastPetTouchAt = 0;

function getTitleBarOverlay(theme = currentAppearanceTheme, forceDark = false) {
  const dark = forceDark || theme === "dark";
  return {
    color: dark ? "#111417" : "#ffffff",
    symbolColor: dark ? "#dce3e6" : "#31383c",
    height: 36
  };
}

function updateTitleBarOverlays() {
  const themedWindows = [settingsWindow, chatWindow, scaleWindow, expressionWindow];
  for (const win of themedWindows) {
    if (win && !win.isDestroyed()) win.setTitleBarOverlay(getTitleBarOverlay());
  }
  if (codeWindow && !codeWindow.isDestroyed()) {
    codeWindow.setTitleBarOverlay(getTitleBarOverlay("dark", true));
  }
}

function getCodeWorkspaceStatePath() {
  return path.join(app.getPath("userData"), "agent-data", "code-workspace.json");
}

async function restoreCodeWorkspace() {
  try {
    const saved = JSON.parse(await fs.readFile(getCodeWorkspaceStatePath(), "utf-8"));
    const stat = await fs.stat(saved.path);
    if (stat.isDirectory()) setActiveWorkspaceDir(saved.path);
  } catch {
    // First launch or a removed folder: keep the process working directory.
  }
}

async function persistCodeWorkspace() {
  await fs.mkdir(path.dirname(getCodeWorkspaceStatePath()), { recursive: true });
  await fs.writeFile(
    getCodeWorkspaceStatePath(),
    JSON.stringify({ path: getActiveWorkspaceDir() }, null, 2),
    "utf-8"
  );
}

function getReplySourceLabel(meta) {
  if (!meta) {
    return "尚未发送对话";
  }

  if (meta.responseMode === "deepseek_chat") {
    return meta.model ? `快速对话 · ${meta.model}` : "快速对话";
  }

  if (meta.responseMode === "deepseek" || meta.responseMode === "deepseek_tool") {
    if (meta.codeMode) {
      const labels = { auto: "自动", read: "问答", plan: "规划", agent: "Agent", review: "审查" };
      const toolSuffix = meta.toolUseCount ? ` · ${meta.toolUseCount} 次工具` : "";
      return `Vivi Code · ${labels[meta.codeMode] || meta.codeMode}${toolSuffix}`;
    }
    return meta.model ? `DeepSeek · ${meta.model}` : "DeepSeek";
  }

  if (meta.responseMode === "local_tool") {
    return "本地检测";
  }

  return "本地回退";
}

function getPetWindowSize(scale = petWindowScale) {
  const normalized = Math.max(0.8, Math.min(1.5, scale));
  return {
    width: Math.round(640 * normalized),
    height: Math.round(960 * normalized)
  };
}

function loadView(win, view) {
  if (isDev) {
    win.loadURL(`${devServerUrl}/?view=${view}`);
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"), {
      search: `view=${view}`
    });
  }
}

function getWindowBoundsNearPet(width, height, verticalOffset) {
  if (!petWindow || petWindow.isDestroyed()) return { width, height };

  const petBounds = petWindow.getBounds();
  const workArea = screen.getDisplayMatching(petBounds).workArea;
  const gap = 18;
  const spaceRight = workArea.x + workArea.width - (petBounds.x + petBounds.width);
  const spaceLeft = petBounds.x - workArea.x;
  const placeRight = spaceRight >= width + gap || spaceRight >= spaceLeft;
  const desiredX = placeRight
    ? petBounds.x + petBounds.width + gap
    : petBounds.x - width - gap;
  const desiredY = petBounds.y + verticalOffset;

  return {
    x: Math.round(Math.max(workArea.x, Math.min(desiredX, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(desiredY, workArea.y + workArea.height - height))),
    width,
    height
  };
}

function getChatWindowBounds() {
  return getWindowBoundsNearPet(1120, 720, 48);
}

function getComposerWindowBounds() {
  return getWindowBoundsNearPet(430, 310, 180);
}

function getBubbleWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) {
    return {
      width: bubbleContentSize.width,
      height: bubbleContentSize.height,
      placement: "right"
    };
  }

  const bounds = petWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bubbleContentSize.width, workArea.width - 24);
  const height = Math.min(bubbleContentSize.height, workArea.height - 24);
  const petCenterX = bounds.x + bounds.width / 2;
  const placement = petCenterX < workArea.x + workArea.width / 2 ? "right" : "left";
  const desiredX = placement === "right"
    ? bounds.x + bounds.width * 0.62
    : bounds.x + bounds.width * 0.38 - width;
  const desiredY = bounds.y + bounds.height * 0.08;
  return {
    x: Math.round(Math.max(workArea.x + 12, Math.min(desiredX, workArea.x + workArea.width - width - 12))),
    y: Math.round(Math.max(workArea.y + 12, Math.min(desiredY, workArea.y + workArea.height - height - 12))),
    width: Math.round(width),
    height: Math.round(height),
    placement
  };
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
  const win = new BrowserWindow({
    width: 940,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#f3f5f6",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(),
    autoHideMenuBar: true,
    show: false,
    title: "V-Manager 设置",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "settings");

  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
    if (settingsWindow === win) {
      settingsWindow = null;
    }
    }
  });

  settingsWindow = win;
  return win;
}

function createScaleWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 380,
    minWidth: 420,
    minHeight: 380,
    maxWidth: 420,
    maxHeight: 380,
    backgroundColor: "#0f1118",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(),
    autoHideMenuBar: true,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    title: "模型大小",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "scale");

  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
    if (scaleWindow === win) {
      scaleWindow = null;
    }
    }
  });

  scaleWindow = win;
  return win;
}

function createComposerWindow() {
  const bounds = getComposerWindowBounds();
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 380,
    minHeight: 240,
    maxWidth: 520,
    maxHeight: 360,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    show: false,
    title: "对话窗口",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "composer");

  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
    if (composerWindow === win) {
      composerWindow = null;
    }
    }
  });

  composerWindow = win;
  return win;
}

function createChatWindow() {
  const bounds = getChatWindowBounds();
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 920,
    minHeight: 620,
    alwaysOnTop: false,
    backgroundColor: "#f8eee7",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(),
    autoHideMenuBar: true,
    show: false,
    title: "聊天栏",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "chat");

  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    isQuitting: () => app.isQuiting,
    onBeforeDestroy: restorePetAfterChat,
    onDestroyed: () => {
      if (chatWindow === win) chatWindow = null;
      syncGlobalCursorTracking();
    }
  });

  win.on("minimize", restorePetAfterChat);
  win.on("hide", restorePetAfterChat);
  win.on("restore", hidePetForChat);
  for (const eventName of ["show", "hide", "minimize", "restore"]) {
    win.on(eventName, syncGlobalCursorTracking);
  }

  chatWindow = win;
  return win;
}

function createCodeWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#0b0d10",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay("dark", true),
    autoHideMenuBar: true,
    show: false,
    title: "Vivi Code",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "code");

  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
      if (codeWindow === win) codeWindow = null;
    }
  });

  codeWindow = win;
  return win;
}

function createBubbleWindow() {
  const bounds = getBubbleWindowBounds();
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: !isBackgroundScheduleLaunch,
    focusable: true,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "bubble");
  win.setAlwaysOnTop(true, "screen-saver");

  win.webContents.on("did-finish-load", () => {
    updateBubbleWindowLayout();
  });

  win.on("closed", () => {
    if (bubbleWindow === win) {
      bubbleWindow = null;
    }
  });

  bubbleWindow = win;
  return win;
}

function ensureSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return createSettingsWindow();
  }

  return settingsWindow;
}

function ensureScaleWindow() {
  if (!scaleWindow || scaleWindow.isDestroyed()) {
    return createScaleWindow();
  }

  return scaleWindow;
}

function ensureComposerWindow() {
  if (!composerWindow || composerWindow.isDestroyed()) {
    return createComposerWindow();
  }

  return composerWindow;
}

function ensureChatWindow() {
  if (!chatWindow || chatWindow.isDestroyed()) {
    return createChatWindow();
  }

  return chatWindow;
}

function ensureCodeWindow() {
  if (!codeWindow || codeWindow.isDestroyed()) return createCodeWindow();
  return codeWindow;
}

function ensureBubbleWindow() {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    return createBubbleWindow();
  }

  return bubbleWindow;
}

function createExpressionWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 440,
    backgroundColor: "#0f1118",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(),
    autoHideMenuBar: true,
    show: false,
    resizable: true,
    title: "表情与动作",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "expressions");

  win.webContents.on("did-finish-load", () => {
    win.webContents.send("agent:expressions-updated", getActiveExpressions());
  });

  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    isQuitting: () => app.isQuiting,
    onDestroyed: () => {
    if (expressionWindow === win) {
      expressionWindow = null;
    }
    }
  });

  expressionWindow = win;
  return win;
}

function ensureExpressionWindow() {
  if (!expressionWindow || expressionWindow.isDestroyed()) {
    return createExpressionWindow();
  }
  return expressionWindow;
}

function openExpressionWindow() {
  const win = ensureExpressionWindow();
  win.show();
  win.focus();
  win.webContents.send("agent:expressions-updated", getActiveExpressions());
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
  win.webContents.send("agent:pet-scale-updated", petWindowScale);
  return true;
}

function openComposerWindow() {
  const win = ensureComposerWindow();
  win.setBounds(getComposerWindowBounds());
  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.send("agent:chat-state-updated", chatState);
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
  win.webContents.send("agent:chat-state-updated", chatState);
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

function isAutoLaunchEnabled() {
  return app.getLoginItemSettings(getLoginItemOptions(false)).openAtLogin;
}

function setAutoLaunchEnabled(enabled) {
  app.setLoginItemSettings(getLoginItemOptions(Boolean(enabled)));
  const applied = isAutoLaunchEnabled();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("agent:auto-launch-updated", applied);
  }
  return applied;
}

function createTrayIcon() {
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, red, green, blue, alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    bitmap[offset] = blue;
    bitmap[offset + 1] = green;
    bitmap[offset + 2] = red;
    bitmap[offset + 3] = alpha;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - 15.5;
      const dy = y - 15.5;
      if (dx * dx + dy * dy <= 14 * 14) setPixel(x, y, 31, 174, 161);
    }
  }
  for (let y = 8; y <= 22; y += 1) {
    const progress = (y - 8) / 14;
    const leftX = Math.round(9 + progress * 6);
    const rightX = Math.round(22 - progress * 6);
    for (let width = -1; width <= 1; width += 1) {
      setPixel(leftX + width, y, 255, 255, 255);
      setPixel(rightX + width, y, 255, 255, 255);
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 }).resize({ width: 16, height: 16 });
}

function buildTrayContextMenu() {
  const petVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  return Menu.buildFromTemplate([
    { label: "Vivi 正在后台运行", enabled: false },
    { type: "separator" },
    { label: petVisible ? "隐藏桌宠" : "显示桌宠", click: () => petVisible ? hidePetWindow() : showPetWindow() },
    { label: "打开聊天栏", click: () => openChatWindow() },
    { label: "快速输入", click: () => openComposerWindow() },
    { label: "代码工作台", click: () => openCodeWindow() },
    { label: "设置", click: () => openSettingsWindow() },
    {
      label: "鼠标移入时隐藏并穿透",
      type: "checkbox",
      checked: currentAgentConfig.appearance?.hoverAutoHide === true,
      click: (menuItem) => { void updateHoverAutoHide(menuItem.checked); }
    },
    { type: "separator" },
    {
      label: "开机自动启动",
      type: "checkbox",
      checked: isAutoLaunchEnabled(),
      click: (menuItem) => setAutoLaunchEnabled(menuItem.checked)
    },
    { type: "separator" },
    {
      label: "退出 V-Manager",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
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
  win.webContents.send("agent:chat-state-updated", chatState);
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

function broadcastChatState() {
  petWindow?.webContents.send("agent:chat-state-updated", chatState);
  composerWindow?.webContents.send("agent:chat-state-updated", chatState);
  chatWindow?.webContents.send("agent:chat-state-updated", chatState);
  bubbleWindow?.webContents.send("agent:chat-state-updated", chatState);
  codeWindow?.webContents.send("agent:chat-state-updated", chatState);
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
  loadConfig,
  mergeConfig: mergeAgentConfig,
  showOpenDialog: (options) => dialog.showOpenDialog(settingsWindow ?? undefined, options),
  openPath: (target) => shell.openPath(target),
  fetch: (url, options) => net.fetch(url, options),
  broadcastSpeechSignal: (payload) => broadcastToWindows([petWindow, chatWindow], "agent:speech-signal-updated", payload),
  broadcastSttProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:local-stt-progress", progress),
  broadcastLocalTtsProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:local-tts-progress", progress),
  broadcastGptSovitsProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:gpt-sovits-progress", progress),
  runBackgroundTask: (type, payload, runOptions) => utilityTaskSupervisor.run(type, payload, runOptions)
});

const live2dModelService = createLive2DModelService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  setConfig: (config) => { currentAgentConfig = config; },
  mergeConfig: mergeAgentConfig,
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
  mergeConfig: mergeAgentConfig,
  broadcastConfigUpdated: (config) => broadcastConfigUpdated(config)
});

const settingsService = createSettingsService({
  trustedIpc,
  getBaseDir: () => app.getPath("userData"),
  getConfig: () => currentAgentConfig,
  mergeConfig: mergeAgentConfig,
  loadRuntimePersona: async (storedConfig) => {
    const runtimePersona = await personaCardService.applyRuntimePersona(storedConfig);
    currentAgentConfig = runtimePersona.config;
    return runtimePersona;
  },
  getLive2DModels: () => live2dModelService.getModels(),
  getStartupStatus: () => startupStatus,
  getStartupDiagnostics: () => startupDiagnostics,
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
  isOwnerTaskRunning: () => agentTaskRunning,
  isScheduleBusy: () => scheduleService.snapshot().tickRunning,
  isProactiveBusy: () => proactiveTickRunning,
  ownerInteractionIdleSeconds: () => ownerInteractionIdleSeconds(currentLifeState),
  publishInteraction: (message, mood, userText) => publishInterestInteraction(message, mood, userText),
  publishProactiveEvent: (event) => publishProactiveEvent(event),
  broadcastMood: (payload) => broadcastMoodUpdate(payload),
  broadcastState: (payload) => broadcastInterestState(payload),
  setExpression: (type) => setInterestExpression(type),
  resolveLocationLabel: (location) => resolveLocationLabel(location),
  openPath: (target) => shell.openPath(target),
  isFile: (target) => fs.stat(target).then((stat) => stat.isFile()).catch(() => false),
  onError: (scope, error) => console.error(`[interest-sandbox] ${scope} failed:`, error)
});

modelConversationService.registerIpc(handleChat);
autonomousCreationService.registerIpc();
live2dModelService.registerIpc();
personaCardService.registerIpc();
settingsService.registerIpc();

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

function currentInterestSettings() {
  return normalizeInterestConfig({
    ...currentAgentConfig.interests,
    personaCardId: currentAgentConfig.activePersonaCard?.id || ""
  });
}

function publishProactiveEvent(event) {
  chatState = {
    ...chatState,
    messages: [...chatState.messages, { role: "assistant", content: event.message }].slice(-80),
    lastReplyMeta: {
      responseMode: "local_tool",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      localTool: `proactive_${event.kind}`,
      model: "local-life-engine",
      sourceLabel: "Vivi 主动陪伴"
    }
  };
  broadcastChatState();
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

async function tickProactiveLife() {
  if (proactiveTickRunning || ownerInteractionUpdateRunning || !app.isReady()) return;
  proactiveTickRunning = true;
  try {
    const interactionRevisionAtStart = ownerInteractionRevision;
    const now = new Date();
    const previous = currentLifeState ?? await loadLifeState(app.getPath("userData"), now);
    await scheduleService.reconcileCompletedReminderCommitments();
    const companion = await getFollowUpCandidate(app.getPath("userData"), now);
    const relationship = await loadRelationshipProfile(app.getPath("userData"));
    const interestSettings = currentInterestSettings();
    const result = evaluateLifeTick(previous, currentAgentConfig.proactive, {
      now,
      interactionIdleSeconds: ownerInteractionIdleSeconds(previous, now),
      interruptionScore: companion.store.feedback.interruptionScore,
      followUpCandidate: companion.candidate,
      relationshipStage: relationship.affection.stage,
      autonomousLifeEnabled: interestSettings.enabled && interestSettings.autonomousLifeEnabled
    });
    if (interactionRevisionAtStart !== ownerInteractionRevision) return;
    currentLifeState = await saveLifeState(app.getPath("userData"), result.state);
    broadcastLifeState(currentLifeState);
    for (const event of result.events) {
      publishProactiveEvent(event);
      if (event.kind === "commitment_followup" && companion.candidate) {
        await markCommitmentFollowedUp(app.getPath("userData"), companion.candidate.id, now);
      }
    }
  } catch (error) {
    console.error("[proactive] life tick failed:", error);
  } finally {
    proactiveTickRunning = false;
  }
}

function startProactiveLifeEngine() {
  if (proactiveTimer) return;
  void tickProactiveLife();
  proactiveTimer = setInterval(() => { void tickProactiveLife(); }, 30_000);
}

function stopProactiveLifeEngine() {
  if (proactiveTimer) clearInterval(proactiveTimer);
  proactiveTimer = null;
}

function ownerInteractionIdleSeconds(state, now = new Date()) {
  const lastInteraction = Date.parse(state?.lastInteractionAt || state?.updatedAt || "");
  return Number.isFinite(lastInteraction)
    ? Math.max(0, (now.getTime() - lastInteraction) / 1000)
    : 0;
}

async function markOwnerInteraction(now = new Date()) {
  ownerInteractionRevision += 1;
  ownerInteractionUpdateRunning = true;
  try {
    currentLifeState = await recordOwnerInteraction(app.getPath("userData"), currentLifeState, now);
    broadcastLifeState(currentLifeState);
    return currentLifeState;
  } finally {
    ownerInteractionUpdateRunning = false;
  }
}

function publishInterestInteraction(message, mood = "thinking", userText = "") {
  const interactionMessages = userText
    ? [{ role: "user", content: userText }, { role: "assistant", content: message }]
    : [{ role: "assistant", content: message }];
  chatState = {
    ...chatState,
    messages: [...chatState.messages, ...interactionMessages],
    lastReplyMeta: {
      responseMode: "local_tool", usedKnowledge: false, knowledgeCount: 0, knowledgeFiles: [],
      fallbackReason: "", model: "local-interest-state", detectedMood: mood, sourceLabel: "私密空间创作状态"
    }
  };
  broadcastChatState();
  wakeBubbleWindow();
  broadcastMoodUpdate({ phase: "final", mood, reply: message });
  return chatState;
}

let interestBubbleWokenForTask = "";
function broadcastInterestState(payload) {
  for (const win of [petWindow, settingsWindow, composerWindow, chatWindow, bubbleWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:interest-state-updated", payload);
  }
  const taskKey = payload.status === "working" ? `${payload.startedAt || ""}:${payload.activityId || ""}` : "";
  if (taskKey && taskKey !== interestBubbleWokenForTask && payload.type === "mini_game"
    && petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    interestBubbleWokenForTask = taskKey;
    wakeBubbleWindow();
  }
  if (!taskKey) interestBubbleWokenForTask = "";
  return payload;
}

function setInterestExpression(type) {
  activeInterestExpressions = type === "mini_game" || type === "play_existing_game" || type === "improve_existing_game"
    ? new Set(["expression27"])
    : ["diary", "drawing", "collect_diary_materials", "browse_information", "organize_memory", "review_drawing", "plan_creation", "prepare_chat_topics"].includes(type)
      ? new Set(["expression25", "expression26"])
      : new Set();
  broadcastActiveExpressions();
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
  currentAgentConfig = mergeAgentConfig({
    ...currentAgentConfig,
    appearance: { ...currentAgentConfig.appearance, live2dModel: modelId }
  });
  await saveConfig(app.getPath("userData"), currentAgentConfig);
  broadcastConfigUpdated(currentAgentConfig);
  return true;
}

async function updateMouseFollow(enabled) {
  currentAgentConfig = mergeAgentConfig({
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
  currentAgentConfig = mergeAgentConfig({
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

function broadcastActiveExpressions() {
  const expressions = getActiveExpressions();
  petWindow?.webContents.send("agent:expressions-updated", expressions);
  expressionWindow?.webContents.send("agent:expressions-updated", expressions);
}

function getActiveExpressions() {
  return [...new Set([...activeManualExpressions, ...activeInterestExpressions])];
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
  return Menu.buildFromTemplate([
    {
      label: "对话",
      submenu: [
        {
          label: "打开对话窗口",
          click: () => sendComposerAction("focus-composer")
        },
        {
          label: "清空气泡",
          click: () => sendPetAction("clear-bubble")
        },
        {
          label: "打开聊天栏",
          click: () => sendChatAction("open-history-panel")
        }
      ]
    },
    {
      label: "角色",
      submenu: [
        {
          label: "表情与动作",
          submenu: [
            {
              label: "打开表情面板",
              click: () => openExpressionWindow()
            },
            { type: "separator" },
            {
              label: "待机",
              click: () => sendPetAction("pet-idle")
            },
            {
              label: "开心",
              click: () => sendPetAction("pet-happy")
            },
            {
              label: "思考",
              click: () => sendPetAction("pet-thinking")
            }
          ]
        },
        {
          label: "切换模型",
          submenu: live2dModelService.getModels().map((model) => ({
            label: model.label,
            type: "radio",
            checked: currentAgentConfig.appearance?.live2dModel === model.id,
            click: () => { void updateLive2DModel(model.id); }
          }))
        },
        {
          label: "调整模型大小",
          click: () => openScaleWindow()
        }
      ]
    },
    {
      label: "开发",
      submenu: [
        {
          label: "打开代码工作台",
          click: () => openCodeWindow()
        }
      ]
    },
    {
      label: "设置",
      click: () => openSettingsWindow()
    },
    {
      label: "窗口",
      submenu: [
        {
          label: "固定位置",
          type: "checkbox",
          checked: positionLocked,
          click: () => {
            positionLocked = !positionLocked;
            petWindow?.webContents.send("agent:position-lock-updated", positionLocked);
          }
        },
        { type: "separator" },
        {
          label: petWindow?.isAlwaysOnTop() ? "取消置顶" : "保持置顶",
          click: () => {
            if (!petWindow) {
              return;
            }

            const nextState = !petWindow.isAlwaysOnTop();
            petWindow.setAlwaysOnTop(nextState, nextState ? "screen-saver" : "normal");
          }
        },
        {
          label: "鼠标移入时隐藏并穿透",
          type: "checkbox",
          checked: currentAgentConfig.appearance?.hoverAutoHide === true,
          click: (menuItem) => { void updateHoverAutoHide(menuItem.checked); }
        },
        {
          label: "重置位置",
          click: () => petWindow?.center()
        }
      ]
    },
    {
      type: "separator"
    },
    {
      label: "隐藏桌宠",
      click: () => hidePetWindow()
    },
    {
      label: "退出",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
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
  currentAgentConfig = mergeAgentConfig(startupConfig);
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
      return new Response(content, { headers: {
        "content-type": getModelContentType(filePath),
        "access-control-allow-origin": "*"
      } });
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
      return new Response(content, { headers: {
        "content-type": getModelContentType(filePath),
        "access-control-allow-origin": "*"
      } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  publishStartupStatus({ phase: "data", progress: 72, title: "正在整理本地状态", detail: "恢复工作区、日程与陪伴记忆…" });
  try {
    startupDiagnostics.rag = await ragTaskClient.ensure(app.getPath("userData"));
  } catch (error) {
    startupDiagnostics.rag = { error: String(error?.message || error) };
  }
  await initializeStartupConversation(app.getPath("userData"));
  await restoreCodeWorkspace();
  createPetWindow();
  createBubbleWindow();
  createSystemTray();
  updateBubbleWindowLayout();
  syncGlobalCursorTracking();
  currentLifeState = await loadLifeState(app.getPath("userData"));
  startProactiveLifeEngine();
  await scheduleService.start({ publishAgenda: !isBackgroundScheduleLaunch });
  await autonomousCreationService.start().catch((error) => {
    console.error("[interest-sandbox] startup failed:", error);
  });
  if (!isBackgroundScheduleLaunch) {
    publishStartupStatus({ phase: "renderer", progress: 90, title: "正在加载 Vivi", detail: "等待 Live2D 模型完成渲染…" });
    if (startupRendererModelStatus) releaseStartupToApplication(startupRendererModelStatus);
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

ipcMain.on("agent:renderer-ready", (_event, payload) => {
  if (payload?.view !== "pet") return;
  startupRendererModelStatus = payload?.modelStatus === "error" ? "error" : "ready";
  if (startupStatus.phase === "renderer") releaseStartupToApplication(startupRendererModelStatus);
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
    chatState = { messages: [], knowledge: [], lastReplyMeta: null };
    broadcastChatState();
    return true;
  }
});

async function handleChat(payload) {
  await markOwnerInteraction();
  const interestReply = await autonomousCreationService.handleChat(payload.message);
  if (interestReply) return interestReply;
  if (String(chatState.lastReplyMeta?.localTool || "").startsWith("proactive_")) {
    const feedback = detectProactiveFeedback(payload.message);
    if (feedback) await recordProactiveFeedback(app.getPath("userData"), feedback);
  }
  const userMessage = { role: "user", content: payload.message };
  const route = payload.codeContext ? { type: "workspace_code" } : resolveAgentRoute(payload.message);
  const isAction = route.type !== "chat";
  const isQuery = /查询|查看|看看|检查|状态|多少|有没有|在运行吗|还在吗/.test(payload.message);
  const pendingText = isAction ? (isQuery ? "正在查询本机状态..." : "正在执行...") : "";
  chatState = {
    ...chatState,
    messages: [...chatState.messages, userMessage, { role: "assistant", content: pendingText }],
    lastReplyMeta: {
      responseMode: isAction ? "local_tool" : "deepseek_chat",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      model: "",
      sourceLabel: isAction ? pendingText : "生成中..."
    }
  };
  broadcastChatState();
  wakeBubbleWindow();
  broadcastMoodUpdate({ phase: "anticipation", ...classifyFastReaction(payload.message) });

  let result;
  agentTaskRunning = true;
  try {
    result = await modelConversationService.generateReply(payload, {
      stream: true,
      onDelta: (partialReply) => {
        const nextMessages = [...chatState.messages];
        nextMessages[nextMessages.length - 1] = { role: "assistant", content: partialReply };
        chatState = { ...chatState, messages: nextMessages };
        broadcastChatState();
      }
    });
    await autonomousCreationService.markOwnerTaskCompleted();
  } finally {
    agentTaskRunning = false;
  }

  if (result.meta?.personaChanged) await personaCardService.refreshRuntimePersona();
  chatState = {
    messages: [...chatState.messages.slice(0, -1), { role: "assistant", content: result.reply }],
    knowledge: result.knowledge,
    lastReplyMeta: { ...result.meta, sourceLabel: getReplySourceLabel(result.meta) }
  };
  broadcastChatState();
  if (result.meta?.relationship) broadcastRelationshipProfile(result.meta.relationship);
  activeManualExpressions = new Set(
    [...activeManualExpressions].filter((name) => persistentShapeExpressions.has(name))
  );
  broadcastActiveExpressions();
  broadcastMoodUpdate({
    phase: "final",
    mood: result.meta?.detectedMood || "happy",
    faceParams: result.meta?.faceParams || null,
    reply: result.reply
  });
  return chatState;
}

ipcMain.handle("agent:pet-touch", async () => {
  await markOwnerInteraction();
  if (autonomousCreationService.isBusy()) {
    const reply = await autonomousCreationService.caughtReply();
    return {
      ok: true,
      busy: true,
      interestBusy: true,
      reply: publishInterestInteraction(reply, "surprised").messages.at(-1).content,
      mood: "surprised"
    };
  }
  if (/^(生成中|正在执行|正在查询)/.test(chatState.lastReplyMeta?.sourceLabel || "")) {
    return { ok: false, busy: true };
  }
  const now = Date.now();
  const cooldownMs = 1400;
  if (now - lastPetTouchAt < cooldownMs) {
    return { ok: false, cooldownMs: cooldownMs - (now - lastPetTouchAt) };
  }
  lastPetTouchAt = now;

  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  const reaction = await recordPetTouch(app.getPath("userData"), {
    grow: config.relationship?.enabled !== false
  });
  const replacePreviousTouch = chatState.lastReplyMeta?.sourceLabel === "触碰互动"
    && chatState.messages.at(-1)?.role === "assistant";
  const nextMessages = replacePreviousTouch
    ? [...chatState.messages.slice(0, -1), { role: "assistant", content: reaction.reply }]
    : [...chatState.messages, { role: "assistant", content: reaction.reply }];
  chatState = {
    ...chatState,
    messages: nextMessages,
    lastReplyMeta: {
      responseMode: "local_tool",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      model: "local-relationship-engine",
      detectedMood: reaction.mood,
      relationship: reaction.profile,
      sourceLabel: "触碰互动"
    }
  };
  broadcastChatState();
  broadcastRelationshipProfile(reaction.profile);
  broadcastMoodUpdate({
    phase: "final",
    mood: reaction.mood,
    faceParams: reaction.faceParams,
    reply: reaction.reply
  });
  return { ok: true, ...reaction };
});

app.on("before-quit", (event) => {
  app.isQuiting = true;
  if (!shutdownCleanupDone) {
    shutdownCleanupDone = true;
    stopProactiveLifeEngine();
    const scheduleShutdown = scheduleService.dispose();
    phase4cShutdownPromise = Promise.allSettled([
      scheduleShutdown,
      autonomousCreationService.dispose(),
      modelConversationService.dispose(),
      settingsService.dispose(),
      personaCardService.dispose(),
      live2dModelService.dispose()
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

ipcMain.handle("agent:get-auto-launch", () => isAutoLaunchEnabled());

ipcMain.handle("agent:set-auto-launch", (_event, enabled) => setAutoLaunchEnabled(enabled));

ipcMain.handle("agent:get-life-state", async () => {
  currentLifeState = currentLifeState ?? await loadLifeState(app.getPath("userData"));
  return currentLifeState;
});


ipcMain.handle("agent:pause-proactive-today", async () => {
  currentLifeState = await pauseProactiveForToday(app.getPath("userData"));
  broadcastLifeState(currentLifeState);
  return currentLifeState;
});

ipcMain.handle("agent:reset-work-session", async () => {
  currentLifeState = await resetWorkSession(app.getPath("userData"));
  broadcastLifeState(currentLifeState);
  return currentLifeState;
});

ipcMain.handle("agent:search-files", async (_event, query) => {
  return searchLocalFiles(query);
});

ipcMain.handle("agent:get-app-registry", async () => {
  return getAppRegistrySnapshot(app.getPath("userData"));
});

ipcMain.handle("agent:refresh-app-registry", async () => {
  return rebuildAppRegistry(app.getPath("userData"));
});

ipcMain.handle("agent:get-system-resource-snapshot", async () => {
  return getSystemResourceSnapshot();
});

ipcMain.handle("agent:get-file-manager-snapshot", async () => {
  return getFileManagerSnapshot();
});

ipcMain.handle("agent:scan-managed-directory", async (_event, target) => scanManagedDirectory(target));
ipcMain.handle("agent:preview-file-organization", async (_event, target, mode, quarantine) => {
  return createOrganizationPreview(app.getPath("userData"), target, { mode, quarantine: Boolean(quarantine) });
});
ipcMain.handle("agent:execute-file-organization", async (_event, previewId) => {
  return executeOrganizationPreview(app.getPath("userData"), previewId);
});
ipcMain.handle("agent:list-file-operations", async () => listFileOperations(app.getPath("userData")));
ipcMain.handle("agent:undo-file-operation", async (_event, operationId) => undoFileOperation(app.getPath("userData"), operationId));

ipcMain.handle("agent:open-external", async (_event, url) => {
  const target = new URL(String(url || ""));
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("只能打开 HTTP 或 HTTPS 网页。");
  await shell.openExternal(target.toString());
  return true;
});


ipcMain.handle("agent:open-settings-window", async () => {
  return openSettingsWindow();
});

ipcMain.handle("agent:open-composer-window", async () => {
  return openComposerWindow();
});

ipcMain.handle("agent:open-chat-window", async () => {
  return openChatWindow();
});

ipcMain.handle("agent:open-code-window", async () => {
  return openCodeWindow();
});

ipcMain.handle("agent:get-code-workspace", async () => {
  return listWorkspaceCodeFiles({ workspaceDir: getActiveWorkspaceDir() });
});

ipcMain.handle("agent:read-code-file", async (_event, relativePath) => {
  return readWorkspaceCode(relativePath, { workspaceDir: getActiveWorkspaceDir() });
});

ipcMain.handle("agent:write-code-file", async (_event, payload) => {
  return writeWorkspaceCode(
    {
      path: payload?.path,
      content: payload?.content,
      expected_content: payload?.expectedContent
    },
    { workspaceDir: getActiveWorkspaceDir(), codeAgentConfirmed: true }
  );
});

ipcMain.handle("agent:select-code-workspace", async () => {
  const owner = codeWindow && !codeWindow.isDestroyed() ? codeWindow : undefined;
  const options = {
    title: "选择代码工作区",
    defaultPath: getActiveWorkspaceDir(),
    properties: ["openDirectory"]
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  setActiveWorkspaceDir(result.filePaths[0]);
  await persistCodeWorkspace();
  return listWorkspaceCodeFiles({ workspaceDir: getActiveWorkspaceDir() });
});

ipcMain.handle("agent:open-scale-window", async () => {
  return openScaleWindow();
});

ipcMain.handle("agent:open-expression-window", async () => {
  return openExpressionWindow();
});

ipcMain.handle("agent:trigger-expression", async (_event, expressionName) => {
  const name = String(expressionName || "");
  if (!name) return false;

  if (activeManualExpressions.has(name)) {
    activeManualExpressions.delete(name);
  } else {
    if (name === "expression20") activeManualExpressions.delete("expression21");
    if (name === "expression21") activeManualExpressions.delete("expression20");
    activeManualExpressions.add(name);
  }
  broadcastActiveExpressions();
  return true;
});

ipcMain.handle("agent:clear-expressions", async () => {
  activeManualExpressions.clear();
  broadcastActiveExpressions();
  return true;
});

ipcMain.handle("agent:get-chat-state", async () => {
  return chatState;
});

ipcMain.handle("agent:get-pet-scale", async () => {
  return petWindowScale;
});

ipcMain.handle("agent:get-position-lock", async () => {
  return positionLocked;
});

ipcMain.handle("agent:set-position-lock", async (_event, locked) => {
  positionLocked = Boolean(locked);
  petWindow?.webContents.send("agent:position-lock-updated", positionLocked);
  return positionLocked;
});

ipcMain.handle("agent:get-pet-window-bounds", async () => {
  if (!petWindow || petWindow.isDestroyed()) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const bounds = petWindow.getBounds();
  return bounds;
});

ipcMain.handle("agent:set-pet-window-position", async (_event, { x, y }) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return false;
  }

  petWindow.setPosition(Math.round(x), Math.round(y));
  updateBubbleWindowLayout();
  return true;
});

ipcMain.on("agent:set-pet-mouse-passthrough", (event, ignore) => {
  if (!petWindow || petWindow.isDestroyed() || event.sender !== petWindow.webContents) return;
  const shouldIgnore = currentAgentConfig.appearance?.hoverAutoHide === true || Boolean(ignore);
  if (shouldIgnore) petWindow.setIgnoreMouseEvents(true, { forward: true });
  else petWindow.setIgnoreMouseEvents(false);
});

ipcMain.handle("agent:update-pet-window-layout", async (_event, { scale }) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }

  petWindowScale = Math.max(0.8, Math.min(1.5, Number(scale) || 1));
  const nextSize = getPetWindowSize(petWindowScale);
  const currentBounds = petWindow.getBounds();
  const workArea = screen.getDisplayMatching(currentBounds).workArea;
  const centeredX = Math.round(currentBounds.x - (nextSize.width - currentBounds.width) / 2);
  const bottomAnchoredY = Math.round(currentBounds.y - (nextSize.height - currentBounds.height));
  const nextX = Math.max(workArea.x, Math.min(centeredX, workArea.x + workArea.width - nextSize.width));
  const nextY = Math.max(workArea.y, bottomAnchoredY);

  petWindow.setBounds({
    x: nextX,
    y: nextY,
    width: nextSize.width,
    height: nextSize.height
  });

  broadcastPetScale(petWindowScale);
  updateBubbleWindowLayout();

  return nextSize;
});

ipcMain.handle("agent:update-bubble-window-size", async (event, size) => {
  if (!bubbleWindow || bubbleWindow.isDestroyed() || event.sender !== bubbleWindow.webContents) {
    return null;
  }

  bubbleContentSize = {
    width: Math.max(280, Math.min(680, Math.ceil(Number(size?.width) || 330))),
    height: Math.max(100, Math.ceil(Number(size?.height) || 180))
  };
  updateBubbleWindowLayout();
  return getBubbleWindowBounds();
});

ipcMain.on("agent:show-pet-context-menu", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? petWindow;
  buildPetContextMenu().popup({
    window: targetWindow ?? undefined
  });
});

// ---- Data path management ----

ipcMain.handle("agent:get-data-path", async () => {
  const baseDir = app.getPath("userData");
  const dataDir = path.join(baseDir, "agent-data");
  return {
    baseDir,
    dataDir,
    configPath: path.join(dataDir, "config.json"),
    memoryPath: path.join(dataDir, "memory", "conversation.jsonl"),
    knowledgeDir: path.join(dataDir, "knowledge"),
    personaKnowledgePath: path.join(dataDir, "knowledge", "persona.md"),
    personaDatabasePath: path.join(dataDir, "storage", "vivi.sqlite"),
    ragDir: path.join(dataDir, "rag"),
    registryDir: path.join(dataDir, "registry")
  };
});

ipcMain.handle("agent:open-data-folder", async () => {
  const dataDir = path.join(app.getPath("userData"), "agent-data");
  await shell.openPath(dataDir);
  return true;
});

ipcMain.handle("agent:open-persona-folder", async () => {
  const personaDatabasePath = path.join(app.getPath("userData"), "agent-data", "storage", "vivi.sqlite");
  await fs.mkdir(path.dirname(personaDatabasePath), { recursive: true });
  if (await fs.stat(personaDatabasePath).then(() => true).catch(() => false)) {
    shell.showItemInFolder(personaDatabasePath);
  } else {
    await shell.openPath(path.dirname(personaDatabasePath));
  }
  return personaDatabasePath;
});
