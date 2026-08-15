import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, screen, session, shell, Tray, utilityProcess } from "electron";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentReply,
  clearConversationHistory,
  defaultConfig,
  ensureDataFiles,
  getAppRegistrySnapshot,
  getActiveWorkspaceDir,
  getConfigPath,
  getFileManagerSnapshot,
  getRagStatus,
  getSystemResourceSnapshot,
  listKnowledgeFiles,
  loadConfig,
  rebuildAppRegistry,
  saveConfig,
  setActiveWorkspaceDir,
  searchLocalFiles,
  testDeepSeekConnection,
  testEmbeddingConnection
} from "../src-agent/core.js";
import { listWorkspaceCodeFiles, readWorkspaceCode, writeWorkspaceCode } from "../src-agent/code-executor.js";
import { classifyDiaryRequest, diaryOpenReply, diaryStatusReply } from "../src-agent/diary-privacy.js";
import { loadRelationshipProfile, recordPetTouch, resetRelationshipProfile } from "../src-agent/relationship-engine.js";
import { resolveAgentRoute } from "../src-agent/router.js";
import { testAstrBotConnection } from "../src-agent/astrbot-client.js";
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
import {
  cleanupInterestSandbox,
  generatePlaytestReflection,
  getInterestActivity,
  getInterestSandboxSnapshot,
  initializeInterestSession,
  isSafeInterestArtifact,
  saveInterestLocation,
  normalizeInterestConfig,
  recordInterestPlaytest,
  recordDelegatedAutonomousActivity,
  repairInterestGame,
  reviseInterestGame,
  runAutonomousLifeActivity,
  runInterestActivity,
  selectInterestActivity,
  updateInterestSession
} from "../src-agent/interest-sandbox.js";
import { runGamePlaytest } from "../src-agent/game-playtest.js";
import { createIsolatedGameDriver } from "./game-playtest-runtime.js";
import { getMemoryDatabaseStats, getRecentConversationMessages } from "../src-agent/local-database.js";
import {
  activatePersonaCard,
  applyPersonaCardToConfig,
  archivePersonaCard,
  createPersonaCard,
  getActivePersonaCard,
  listPersonaCards,
  restorePersonaCard,
  updatePersonaCard
} from "../src-agent/persona-cards.js";
import { generatePersonaCardDraft } from "../src-agent/persona-generator.js";
import { generateStartupGreeting } from "../src-agent/startup-greeting.js";
import { configureDesktopShell } from "../src-agent/platform/desktop-shell.js";
import { attachWindowLifecycle, WINDOW_LIFECYCLE } from "./window-lifecycle.js";
import { registerMemoryServiceIpc } from "./services/memory-service.js";
import { registerSpeechServiceIpc } from "./services/speech-service.js";
import { createScheduleService } from "./services/schedule-service.js";
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
  serviceName: "Vivi RAG Index",
  timeoutMs: 10 * 60 * 1000
});
const ragTaskClient = createRagTaskClient({ supervisor: utilityTaskSupervisor });

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
const builtInLive2DModels = [
  { id: "qianqian", label: "芊芊", detail: "完整表情、形态与动作适配", builtIn: true, capabilities: { expressionCount: 32, motionGroupCount: 2, hasLipSync: true, hasEyeBlink: true, hasDisplayInfo: true } },
  { id: "hiyori", label: "Hiyori", detail: "通用参数适配 · 动作 2 组", builtIn: true, capabilities: { expressionCount: 0, motionGroupCount: 2, hasLipSync: true, hasEyeBlink: true, hasDisplayInfo: true } },
  { id: "epsilon", label: "Epsilon", detail: "通用参数 + 8 个原生表情", builtIn: true, capabilities: { expressionCount: 8, motionGroupCount: 6, hasLipSync: true, hasEyeBlink: true, hasDisplayInfo: true } }
];
let live2dModelOptions = [...builtInLive2DModels];
let customModelRoots = new Map();
let modelDirectoryWatcher = null;
let modelScanTimer = null;
let cursorTrackingTimer = null;
let proactiveTimer = null;
let currentLifeState = null;
let proactiveTickRunning = false;
let ownerInteractionRevision = 0;
let ownerInteractionUpdateRunning = false;
let interestTimer = null;
let interestTickRunning = false;
let currentInterestActivity = null;
let agentTaskRunning = false;
const cursorDeliveryState = new Map();
let startupReleaseTimer = null;
let startupRendererModelStatus = null;
let shutdownCleanupDone = false;
let gptSovitsShutdownStarted = false;
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

function getLive2DModelsDirectory() {
  return path.join(app.getPath("userData"), "agent-data", "models");
}

async function findModelFiles(root, directory = root, depth = 0) {
  if (depth > 4) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findModelFiles(root, target, depth + 1));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".model3.json")) files.push(target);
  }
  return files;
}

async function readCustomModelOption(modelsDirectory, modelFile) {
  try {
    const definition = JSON.parse(await fs.readFile(modelFile, "utf8"));
    const modelRoot = path.dirname(modelFile);
    const requiredFiles = [definition?.FileReferences?.Moc, ...(definition?.FileReferences?.Textures ?? [])]
      .filter(Boolean)
      .map((file) => path.resolve(modelRoot, file));
    if (!definition?.FileReferences?.Moc || requiredFiles.some((file) => {
      const relative = path.relative(modelRoot, file);
      return relative.startsWith("..") || path.isAbsolute(relative);
    })) return null;
    for (const file of requiredFiles) await fs.access(file);

    const relativeModelFile = path.relative(modelsDirectory, modelFile).replaceAll("\\", "/");
    const id = `custom-${Buffer.from(relativeModelFile).toString("base64url")}`;
    const baseName = path.basename(modelFile).replace(/\.model3\.json$/i, "");
    const parentName = path.basename(modelRoot);
    const expressions = definition?.FileReferences?.Expressions ?? [];
    const motions = definition?.FileReferences?.Motions ?? {};
    const groups = definition?.Groups ?? [];
    const hasGroup = (name) => groups.some((group) => String(group?.Name || "").toLowerCase() === name.toLowerCase() && (group?.Ids?.length ?? 0) > 0);
    const capabilities = {
      expressionCount: expressions.length,
      motionGroupCount: Object.keys(motions).length,
      hasLipSync: hasGroup("LipSync"),
      hasEyeBlink: hasGroup("EyeBlink"),
      hasDisplayInfo: Boolean(definition?.FileReferences?.DisplayInfo)
    };
    const abilityLabels = [
      expressions.length ? `${expressions.length} 个原生表情` : "通用参数",
      capabilities.hasLipSync ? "口型" : null,
      capabilities.hasEyeBlink ? "眨眼" : null
    ].filter(Boolean);
    return {
      id,
      label: baseName || parentName,
      detail: `用户模型 · ${abilityLabels.join(" + ")} · ${path.relative(modelsDirectory, modelRoot) || parentName}`,
      directory: `vivi-model://local/${encodeURIComponent(id)}/`,
      fileName: path.basename(modelFile),
      builtIn: false,
      capabilities,
      root: modelRoot
    };
  } catch {
    return null;
  }
}

async function refreshLive2DModels({ broadcast = true } = {}) {
  const modelsDirectory = getLive2DModelsDirectory();
  await fs.mkdir(modelsDirectory, { recursive: true });
  const customModels = (await Promise.all(
    (await findModelFiles(modelsDirectory)).map((file) => readCustomModelOption(modelsDirectory, file))
  )).filter(Boolean);

  customModelRoots = new Map(customModels.map((model) => [model.id, model.root]));
  live2dModelOptions = [
    ...builtInLive2DModels,
    ...customModels.map(({ root: _root, ...model }) => model)
  ];

  if (!live2dModelOptions.some((model) => model.id === currentAgentConfig.appearance?.live2dModel)) {
    currentAgentConfig = mergeAgentConfig({
      ...currentAgentConfig,
      appearance: { ...currentAgentConfig.appearance, live2dModel: "qianqian" }
    });
    await saveConfig(app.getPath("userData"), currentAgentConfig);
    broadcastConfigUpdated(currentAgentConfig);
  }

  if (broadcast) broadcastLive2DModels();
  return live2dModelOptions;
}

function startLive2DModelWatcher() {
  const modelsDirectory = getLive2DModelsDirectory();
  modelDirectoryWatcher?.close();
  modelDirectoryWatcher = watch(modelsDirectory, { recursive: true }, () => {
    if (modelScanTimer) clearTimeout(modelScanTimer);
    modelScanTimer = setTimeout(() => { void refreshLive2DModels(); }, 500);
  });
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
  const activeCard = await getActivePersonaCard(baseDir, currentAgentConfig);
  currentAgentConfig = applyPersonaCardToConfig(currentAgentConfig, activeCard);
  const history = await getRecentConversationMessages(baseDir, { limit: 40, personaCardId: activeCard?.id || "" });
  const memory = await loadCompanionMemory(baseDir);
  const greeting = await generateStartupGreeting(currentAgentConfig, {
    history,
    memory,
    userAddress: activeCard?.payload?.userAddress || "你"
  }, { modelFetch: net.fetch.bind(net) });
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
  broadcastGptSovitsProgress: (progress) => broadcastToWindows([settingsWindow, chatWindow, composerWindow], "agent:gpt-sovits-progress", progress)
});

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

async function tickInterestSandbox() {
  if (interestTickRunning || currentInterestActivity || agentTaskRunning || scheduleService.snapshot().tickRunning || proactiveTickRunning || !app.isReady()) return;
  interestTickRunning = true;
  try {
    const settings = currentInterestSettings();
    if (!settings.enabled || !settings.autonomousLifeEnabled) return;
    const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), settings);
    const diaryDue = Boolean(snapshot.session?.diaryDueAt)
      && new Date(snapshot.session.diaryDueAt).getTime() <= Date.now()
      && !snapshot.today.diaryWritten;
    const idleEnough = ownerInteractionIdleSeconds(currentLifeState) >= settings.idleMinutes * 60;
    if (!idleEnough) return;
    const completedAfterLaunch = Boolean(snapshot.session?.lastTaskCompletedAt)
      && new Date(snapshot.session.lastTaskCompletedAt) >= new Date(snapshot.session.launchedAt);
    const pendingType = !diaryDue && idleEnough ? snapshot.session?.pendingActivity : null;
    const decision = selectInterestActivity(settings, snapshot, new Date(), {
      manualType: pendingType || undefined,
      automaticDiaryDue: diaryDue,
      hasCompletedOwnerTask: completedAfterLaunch
    });
    if (!decision.allowed) {
      if (decision.budgetExhausted && !snapshot.session?.budgetRequestNotified) {
        await updateInterestSession(app.getPath("userData"), { budgetRequestNotified: true });
        publishProactiveEvent({
          kind: "autonomous_budget_request",
          message: `我今天分到的自主生活 Token 已经用完了，所以先停下来了。如果你希望我继续活动，可以在私密空间提高每日总预算。`,
          mood: "sad"
        });
      }
      return;
    }
    await executeInterestActivity(decision.type, {
      manual: Boolean(pendingType),
      routineId: decision.routineId || "",
      category: decision.category || "creative",
      automaticDiaryDue: diaryDue,
      hasCompletedOwnerTask: completedAfterLaunch,
      localOnly: decision.localOnly
    });
  } catch (error) {
    console.error("[interest-sandbox] tick failed:", error);
  } finally {
    interestTickRunning = false;
  }
}

function interestStatusLabel(type) {
  const labels = {
    diary: "整理今天的日记", drawing: "在笔记本上写写画画", mini_game: "制作并试玩离线小游戏",
    collect_diary_materials: "收集今天的日记素材", browse_information: "看看天气和允许读取的资讯",
    organize_memory: "整理记忆和近期话题", play_existing_game: "玩一个以前做的小游戏",
    improve_existing_game: "改进以前制作的小游戏", review_drawing: "回顾以前画过的画",
    plan_creation: "规划下一次创作", rest: "安静休息和发呆", prepare_chat_topics: "准备以后想和你聊的话题"
  };
  return labels[type] || "进行自己的沙盒活动";
}

function publishInterestInteraction(message, mood = "thinking", userText = "") {
  const interactionMessages = userText ? [{ role: "user", content: userText }, { role: "assistant", content: message }] : [{ role: "assistant", content: message }];
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
  if (currentInterestActivity) setInterestExpression(currentInterestActivity.type);
  return chatState;
}

function broadcastInterestState() {
  const payload = currentInterestActivity
    ? { status: "working", type: currentInterestActivity.type, label: currentInterestActivity.label || interestStatusLabel(currentInterestActivity.type), startedAt: currentInterestActivity.startedAt, activityId: currentInterestActivity.activityId || null, title: currentInterestActivity.title || "", phase: currentInterestActivity.phase || "working", progress: currentInterestActivity.progress || null, logs: (currentInterestActivity.logs || []).slice(-12) }
    : { status: "idle", type: null, label: "当前没有进行创作", startedAt: null };
  for (const win of [petWindow, settingsWindow, composerWindow, chatWindow, bubbleWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:interest-state-updated", payload);
  }
  if (payload.status === "working" && payload.type === "mini_game" && !currentInterestActivity.bubbleWoken && petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    currentInterestActivity.bubbleWoken = true;
    wakeBubbleWindow();
  }
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

async function playtestInterestGame(activity, options = {}) {
  if (!activity || activity.type !== "mini_game" || !isSafeInterestArtifact(app.getPath("userData"), activity.artifactPath)) {
    throw new Error("只能试玩兴趣沙盒中的 HTML 小游戏。");
  }
  const settings = currentInterestSettings();
  let repairAttempts = 0;
  let extraTokens = 0;
  let playtest;
  const onProgress = (entry) => {
    if (currentInterestActivity) {
      currentInterestActivity.phase = entry.stage;
      currentInterestActivity.progress = entry;
      currentInterestActivity.label = entry.label;
      currentInterestActivity.logs = [...(currentInterestActivity.logs || []), entry].slice(-24);
      broadcastInterestState();
    }
    options.onProgress?.(entry);
  };
  while (true) {
    playtest = await runGamePlaytest({
      artifactPath: activity.artifactPath,
      screenshotPath: path.join(path.dirname(activity.artifactPath), "playtest.png"),
      maxSeconds: settings.selfPlayMaxSeconds,
      maxActions: settings.selfPlayMaxActions,
      signal: options.signal,
      onProgress,
      createDriver: createIsolatedGameDriver
    });
    if (playtest.cancelled || options.signal?.aborted) {
      const completed = {
        ...playtest,
        cancelled: true,
        outcome: "cancelled",
        reflection: `我已经停下《${activity.title}》的试玩，刚才完成了 ${playtest.actions} 次操作。当前进度和终止记录已经保存。`,
        repairAttempts
      };
      const recordedTokens = options.separateActivityRecord ? 0 : extraTokens;
      const updated = await recordInterestPlaytest(app.getPath("userData"), activity.id, completed, recordedTokens);
      return { activity: updated, playtest: completed, tokensUsed: extraTokens };
    }
    const needsRepair = !playtest.ok || !playtest.state.protocolDetected || playtest.errors.some((item) => ["console-error", "page-error", "render-gone", "load-failed", "unresponsive", "playtest-error"].includes(item.type));
    if (!needsRepair || repairAttempts >= settings.selfRepairAttempts) break;
    try {
      onProgress({ stage: "repairing", label: `发现运行问题，正在第 ${repairAttempts + 1} 次修复`, actions: playtest.actions, highestScore: playtest.highestScore, at: new Date().toISOString() });
      const repaired = await repairInterestGame(app.getPath("userData"), currentAgentConfig, activity, playtest, { signal: options.signal });
      extraTokens += repaired.tokens;
      repairAttempts += 1;
    } catch (error) {
      playtest.errors.push({ type: "repair-error", message: String(error?.message || error).slice(0, 500) });
      break;
    }
  }
  if (options.signal?.aborted) {
    const completed = {
      ...playtest, cancelled: true, outcome: "cancelled",
      reflection: `我已经停下《${activity.title}》的试玩和修复，终止前完成了 ${playtest.actions} 次操作。`, repairAttempts
    };
    const recordedTokens = options.separateActivityRecord ? 0 : extraTokens;
    const updated = await recordInterestPlaytest(app.getPath("userData"), activity.id, completed, recordedTokens);
    return { activity: updated, playtest: completed, tokensUsed: extraTokens };
  }
  onProgress({ stage: "reflecting", label: "试玩结束，正在整理分数和感想", actions: playtest.actions, highestScore: playtest.highestScore, at: new Date().toISOString() });
  const reflected = await generatePlaytestReflection(currentAgentConfig, activity, playtest, { signal: options.signal });
  extraTokens += reflected.tokens;
  const completed = {
    ...playtest,
    reflection: reflected.reflection,
    repairAttempts
  };
  const recordedTokens = options.separateActivityRecord ? 0 : extraTokens;
  const updated = await recordInterestPlaytest(app.getPath("userData"), activity.id, completed, recordedTokens);
  return { activity: updated, playtest: completed, tokensUsed: extraTokens };
}

async function caughtInterestReply(activity = currentInterestActivity) {
  const title = activity?.title ? `《${activity.title}》` : "这个小游戏";
  const fallback = activity?.type === "mini_game"
    ? `诶……你什么时候过来的？我刚玩到${title}这里，差一点就想装作什么都没发生了。你要看我继续，还是先把位置让给你？`
    : `诶，你回来啦。我刚才在${activity?.label || interestStatusLabel(activity?.type)}，本来还想等整理好以后再悄悄给你看的。`;
  if (!currentAgentConfig.deepseek?.apiKey) return fallback;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const endpoint = `${String(currentAgentConfig.deepseek.baseUrl).replace(/\/$/, "")}/chat/completions`;
    const response = await net.fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${currentAgentConfig.deepseek.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: currentAgentConfig.deepseek.chatModel || currentAgentConfig.deepseek.model,
        temperature: 0.9,
        max_tokens: 260,
        messages: [
          {
            role: "system",
            content: [
              currentAgentConfig.personaPrompt || `你是 ${currentAgentConfig.personaName || "Vivi"}。`,
              "请严格保持当前人物卡的身份、措辞、亲密程度和表达习惯。",
              "你正在自己的隔离沙盒里进行私人休闲活动，使用的是主人明确分配给你的沙盒预算。现在主人突然触碰你、发现了这件事。",
              "表现应是私人小动作被撞见后的短暂慌张、遮掩、窘迫或转而邀请，而不是认错、机械道歉或声称自己越权。",
              "只说一到两句自然口语。不要写舞台动作、括号描写、标签或固定客服话术；不要照抄用户给过的任何示例句。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({ activity: activity?.label || "沙盒活动", gameTitle: activity?.type === "mini_game" ? title : "", canStopOrContinue: true })
          }
        ]
      })
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const generated = String(payload.choices?.[0]?.message?.content || "").trim()
      .replace(/^```[\s\S]*?\n|```$/g, "")
      .slice(0, 500);
    return generated || fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeExistingGamePlaytest(activity) {
  if (currentInterestActivity) throw new Error("当前还有创作或试玩正在进行，请稍后再试。");
  if (!activity) throw new Error("没有找到要试玩的小游戏。");
  currentInterestActivity = {
    type: "mini_game", label: `正在玩《${activity.title}》`, title: activity.title,
    activityId: activity.id, startedAt: new Date().toISOString(), controller: new AbortController(), phase: "starting", logs: []
  };
  setInterestExpression("mini_game");
  broadcastInterestState();
  broadcastMoodUpdate({ phase: "final", mood: "thinking", reply: `我正在玩《${activity.title}》。` });
  try {
    const result = await playtestInterestGame(activity, { signal: currentInterestActivity.controller.signal });
    const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings());
    publishProactiveEvent({
      kind: "interest_playtest",
      message: `${result.playtest.reflection}${result.playtest.repairAttempts ? ` 我还自己修了 ${result.playtest.repairAttempts} 次。` : ""}`,
      mood: result.playtest.cancelled ? "idle" : result.playtest.ok ? "happy" : "sad"
    });
    return { ...result, snapshot };
  } finally {
    currentInterestActivity = null;
    setInterestExpression(null);
    broadcastInterestState();
  }
}

function matchingInterestGames(snapshot, message) {
  const games = snapshot.activities.filter((item) => item.type === "mini_game" && item.status === "completed" && item.artifactPath);
  const text = String(message || "").toLocaleLowerCase();
  const named = games.filter((item) => text.includes(String(item.title || "").toLocaleLowerCase()));
  return { games, matches: named.length ? named : [] };
}

async function tryHandleVirtualLifeChat(message) {
  const text = String(message || "").trim();
  if (!/(?:你(?:现在)?在(?:做|忙|干)什么|你在干嘛|虚拟日程|你今天有什么安排|接下来做什么)/.test(text)) return null;
  const settings = currentInterestSettings();
  if (!settings.enabled) return publishInterestInteraction("我现在就是安静陪着你。自主生活还没有开启，所以不会背着你安排沙盒活动。", "idle", text);
  const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), settings);
  const next = snapshot.routine?.find((item) => item.status !== "completed");
  const latest = snapshot.activities.find((item) => item.status === "completed");
  const typeName = (type) => type === "drawing" ? "画点东西" : type === "mini_game" ? "做一个文字小游戏，再自己试玩" : "整理日记";
  if (next) {
    const due = new Date(next.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    return publishInterestInteraction(`我现在闲着，在整理今天可以写进日记的素材。下一项虚拟日程是 ${due} ${typeName(next.type)}${settings.networkAccess === "weather_news" ? "；到时候也会看看你允许读取的资讯标题" : ""}。你随时可以提前叫我开始。`, "idle", text);
  }
  if (latest) return publishInterestInteraction(`我现在闲着陪你。今天最近完成的是《${latest.title}》，暂时没有下一项虚拟日程；你也可以叫我画画、写游戏或者再玩一次。`, "happy", text);
  return publishInterestInteraction("我现在没在忙，只是在自己的沙盒里整理想法，等一个适合写日记或做点小作品的时间。", "idle", text);
}

async function tryHandleInterestGameChat(message) {
  const text = String(message || "").trim();
  const wantsRevision = /(?:修改|改改|调整|优化|修复).{0,18}(?:小游戏|游戏)|(?:小游戏|游戏).{0,18}(?:修改|调整|优化|修复)/.test(text);
  const wantsPlay = /(?:你|自己).{0,5}(?:玩|试玩).{0,12}(?:小游戏|游戏)?|(?:试玩|再玩一次).{0,12}(?:小游戏|游戏)/.test(text);
  const wantsCreate = /(?:做|写|制作|生成|设计).{0,10}(?:小游戏|文字游戏).{0,10}(?:给我玩|你自己玩|试玩|玩玩)?/.test(text);
  if (!wantsRevision && !wantsPlay && !wantsCreate) return null;
  const settings = currentInterestSettings();
  if (!settings.enabled || !settings.activities.miniGames) {
    return publishInterestInteraction("小游戏沙盒目前没有开启。请先在“私密空间”里启用小游戏创作，我才会在隔离空间里制作和试玩。", "sad", text);
  }
  if (wantsCreate && !wantsRevision) {
    const result = await executeInterestActivity("mini_game", { manual: true });
    return publishInterestInteraction(result.playtest
      ? `做好啦，是《${result.activity.title}》。我也自己试玩过了：${result.playtest.reflection}`
      : `我做好了《${result.activity.title}》，你可以去私密空间打开它。`, "happy", text);
  }
  const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), settings);
  const { games, matches } = matchingInterestGames(snapshot, text);
  if (!games.length) return publishInterestInteraction("我的沙盒里还没有能玩的小游戏。你可以先让我做一个文字小游戏。", "thinking", text);
  if (wantsRevision) {
    if (games.length > 1 && matches.length !== 1) {
      return publishInterestInteraction(`你想改哪一个？现在有：${games.slice(0, 6).map((item) => `《${item.title}》`).join("、")}。请带上名字告诉我。`, "thinking", text);
    }
    const activity = matches[0] || games[0];
    currentInterestActivity = { type: "mini_game", label: `修改《${activity.title}》`, title: activity.title, activityId: activity.id, startedAt: new Date().toISOString(), controller: new AbortController() };
    setInterestExpression("mini_game");
    broadcastInterestState();
    try {
      const revised = await reviseInterestGame(app.getPath("userData"), currentAgentConfig, activity, text, { signal: currentInterestActivity.controller.signal });
      const result = settings.selfPlayGames ? await playtestInterestGame(revised.activity, { signal: currentInterestActivity.controller.signal }) : null;
      return publishInterestInteraction(result ? `《${revised.activity.title}》已经按你的要求改好，我也重新试玩了：${result.playtest.reflection}` : `《${revised.activity.title}》已经按你的要求改好。`, "happy", text);
    } finally {
      currentInterestActivity = null;
      setInterestExpression(null);
      broadcastInterestState();
    }
  }
  return publishInterestInteraction((await executeExistingGamePlaytest(matches[0] || games[0])).playtest.reflection, "happy", text);
}

async function executeInterestActivity(type, options = {}) {
  if (agentTaskRunning || scheduleService.snapshot().tickRunning) throw new Error("当前还有主人交代的任务正在执行，请稍后再开始创作。");
  if (currentInterestActivity) throw new Error("Vivi 正在进行另一项创作。");
  const controller = new AbortController();
  currentInterestActivity = { type, startedAt: new Date().toISOString(), controller };
  broadcastInterestState();
  broadcastMoodUpdate({ phase: "final", mood: "thinking", reply: `我正在${interestStatusLabel(type)}。` });
  setInterestExpression(type);
  try {
    const activePersona = await getActivePersonaCard(app.getPath("userData"), currentAgentConfig);
    const persona = activePersona ? { cardId: activePersona.id, version: activePersona.version, name: activePersona.payload.identityName || activePersona.name } : null;
    if (!["diary", "drawing", "mini_game"].includes(type)) {
      const lifeResult = await runAutonomousLifeActivity(app.getPath("userData"), currentAgentConfig, type, {
        ...options, persona, signal: controller.signal
      });
      if (lifeResult.delegated === "play_existing_game") {
        currentInterestActivity.label = `正在玩《${lifeResult.target.title}》`;
        currentInterestActivity.title = lifeResult.target.title;
        currentInterestActivity.activityId = lifeResult.target.id;
        broadcastInterestState();
        const played = await playtestInterestGame(lifeResult.target, { signal: controller.signal, separateActivityRecord: true });
        const record = await recordDelegatedAutonomousActivity(app.getPath("userData"), type, lifeResult.target, played.playtest, { routineId: options.routineId, tokens: played.tokensUsed });
        await updateInterestSession(app.getPath("userData"), { pendingActivity: null });
        return { activity: record, playtest: played.playtest, snapshot: await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings()) };
      }
      if (lifeResult.delegated === "improve_existing_game") {
        currentInterestActivity.label = `正在改进《${lifeResult.target.title}》`;
        broadcastInterestState();
        const revised = await reviseInterestGame(app.getPath("userData"), currentAgentConfig, lifeResult.target, "根据最近一次试玩感想和运行状态，小幅改进玩法、反馈或平衡，保持原主题。", { signal: controller.signal, separateActivityRecord: true });
        const played = currentInterestSettings().selfPlayGames ? await playtestInterestGame(revised.activity, { signal: controller.signal, separateActivityRecord: true }) : null;
        const record = await recordDelegatedAutonomousActivity(app.getPath("userData"), type, lifeResult.target, played?.playtest || { summary: "完成了一次小幅改进。" }, { routineId: options.routineId, tokens: revised.tokens + (played?.tokensUsed || 0) });
        await updateInterestSession(app.getPath("userData"), { pendingActivity: null });
        return { activity: record, playtest: played?.playtest, snapshot: await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings()) };
      }
      await updateInterestSession(app.getPath("userData"), { pendingActivity: null });
      return lifeResult;
    }
    const result = await runInterestActivity(app.getPath("userData"), currentAgentConfig, type, {
      ...options,
      persona,
      signal: controller.signal
    });
    if (type === "mini_game" && currentInterestSettings().selfPlayGames) {
      currentInterestActivity.label = `正在玩《${result.activity.title}》`;
      currentInterestActivity.title = result.activity.title;
      currentInterestActivity.activityId = result.activity.id;
      broadcastInterestState();
      broadcastMoodUpdate({ phase: "final", mood: "thinking", reply: "游戏做好了，我先自己试玩一下。" });
      const played = await playtestInterestGame(result.activity, { signal: controller.signal });
      result.activity = played.activity;
      result.playtest = played.playtest;
      result.snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings());
    }
    await updateInterestSession(app.getPath("userData"), { pendingActivity: null });
    if (type !== "diary") {
      publishProactiveEvent({
        kind: "interest_creation",
        message: `${currentAgentConfig.personaName || "Vivi"} 在私密空间里${result.activity.action === "updated" ? "更新" : "完成"}了《${result.activity.title}》。你有空时可以去活动记录里看看。`,
        mood: "happy"
      });
    }
    const settings = currentInterestSettings();
    if (type !== "diary" && settings.permissionLevel === "preview" && settings.autoOpenPreview && isSafeInterestArtifact(app.getPath("userData"), result.activity.artifactPath)) {
      await shell.openPath(result.activity.artifactPath);
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      await updateInterestSession(app.getPath("userData"), { pendingActivity: type });
    }
    throw error;
  } finally {
    currentInterestActivity = null;
    setInterestExpression(null);
    broadcastInterestState();
  }
}

async function tryHandleDiaryChat(message) {
  const intent = classifyDiaryRequest(message);
  if (!intent) return null;
  const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings());
  const profile = await loadRelationshipProfile(app.getPath("userData"));
  const diary = snapshot.activities.find((item) => item.type === "diary" && item.day === snapshot.today.date && item.status === "completed" && item.artifactPath);
  const written = Boolean(diary || snapshot.today.diaryWritten);

  if (intent === "status") {
    return publishInterestInteraction(diaryStatusReply({
      written,
      profile,
      personaName: currentAgentConfig.personaName || "Vivi"
    }), profile.emotion.suggestedMood || "idle", message);
  }

  const decision = diaryOpenReply({ written, profile });
  if (decision.allowed && diary && isSafeInterestArtifact(app.getPath("userData"), diary.artifactPath)) {
    const error = await shell.openPath(path.resolve(diary.artifactPath));
    if (error) return publishInterestInteraction(`我想打开，但 Windows 没有成功：${error}`, "sad", message);
  }
  return publishInterestInteraction(decision.reply, profile.emotion.suggestedMood || "idle", message);
}

function startInterestSandbox() {
  if (interestTimer) return;
  void initializeInterestSession(app.getPath("userData"), new Date(), currentInterestSettings());
  interestTimer = setInterval(() => { void tickInterestSandbox(); }, 5 * 60_000);
}

function stopInterestSandbox() {
  if (interestTimer) clearInterval(interestTimer);
  interestTimer = null;
}

function broadcastLive2DModels() {
  for (const win of [petWindow, settingsWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:live2d-models-updated", live2dModelOptions);
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
  if (!live2dModelOptions.some((model) => model.id === modelId)) return false;
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
          submenu: live2dModelOptions.map((model) => ({
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
  await refreshLive2DModels({ broadcast: false });
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
      const modelRoot = customModelRoots.get(modelId);
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
  startLive2DModelWatcher();
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
  startInterestSandbox();
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

ipcMain.handle("agent:get-bootstrap", async () => {
  const baseDir = app.getPath("userData");
  const storedConfig = mergeAgentConfig(await loadConfig(baseDir));
  const activePersonaCard = await getActivePersonaCard(baseDir, storedConfig);
  const config = applyPersonaCardToConfig(storedConfig, activePersonaCard);
  currentAgentConfig = config;
  const knowledgeFiles = await listKnowledgeFiles(baseDir);
  const relationshipProfile = await loadRelationshipProfile(baseDir);
  const personaCards = await listPersonaCards(baseDir);
  const memoryDatabase = await getMemoryDatabaseStats(baseDir);

  return {
    config,
    activePersonaCard,
    personaCards,
    memoryDatabase,
    startupDiagnostics,
    relationshipProfile,
    live2dModels: live2dModelOptions,
    knowledgeFiles,
    runtime: {
      mode: "desktop",
      configPath: getConfigPath(app.getPath("userData"))
    },
    abilities: [
      { id: "chat", name: "自然对话", status: "ready", detail: "已接入人格设定和本地知识检索。" },
      { id: "relationship", name: "情绪与好感", status: "ready", detail: "本地计算情绪变化和关系阶段，并持续影响回复语气与 Live2D 神态。" },
      { id: "proactive", name: "主动陪伴", status: "ready", detail: "根据连续工作、空闲状态、安静时段和每日上限提供本地健康关怀，并管理 Vivi 的休息节奏。" },
      { id: "schedules", name: "提醒与电源计划", status: "ready", detail: "支持本地提醒，以及经二次确认的定时关机和重启；所有计划均可查看和取消。" },
      { id: "memory", name: "本地记忆/RAG", status: "ready", detail: "从本地知识库检索相关片段参与回答。" },
      { id: "resource", name: "资源查看", status: "ready", detail: "可查看 CPU、内存、运行进程和当前前台应用数量。" },
      { id: "launcher", name: "应用启动", status: "ready", detail: "已接入本地执行层，可直接启动常见应用，也支持传入本地 exe 路径。" },
      { id: "code-agent", name: "代码代理", status: "ready", detail: "可在当前工作区搜索和读取代码；文件修改与开发命令必须经用户明确确认后执行。" },
      { id: "browser", name: "浏览器搜索", status: "ready", detail: "可在系统默认浏览器中打开网址，并使用 Bing、Google 或百度搜索。" },
      { id: "vscode", name: "VS Code 适配", status: "ready", detail: "可用 VS Code 打开本地文件或工作区，并定位到指定文件行。" },
      { id: "filesystem", name: "安全文件管家", status: "ready", detail: "支持只读扫描、整理预览、按类型/日期归档、隔离、操作日志与撤销；删除仅进入 Windows 回收站。" },
      {
        id: "messenger",
        name: "消息联动",
        status: "planned",
        detail: "AstrBot、微信代发、消息读取与自动回复统一归入后续路线，本阶段不作为正式能力开放。"
      }
    ]
  };
});

ipcMain.handle("agent:get-startup-status", async () => startupStatus);

ipcMain.on("agent:renderer-ready", (_event, payload) => {
  if (payload?.view !== "pet") return;
  startupRendererModelStatus = payload?.modelStatus === "error" ? "error" : "ready";
  if (startupStatus.phase === "renderer") releaseStartupToApplication(startupRendererModelStatus);
});

ipcMain.handle("agent:save-config", async (_event, nextConfig) => {
  const merged = mergeAgentConfig(nextConfig);
  await saveConfig(app.getPath("userData"), merged);
  if (currentAgentConfig.appearance?.mouseFollow !== merged.appearance?.mouseFollow) {
    cursorDeliveryState.clear();
  }
  if (currentAgentConfig.appearance?.hoverAutoHide === true && merged.appearance?.hoverAutoHide !== true
    && petWindow && !petWindow.isDestroyed()) {
    petWindow.setIgnoreMouseEvents(false);
  }
  const activePersonaCard = await getActivePersonaCard(app.getPath("userData"), merged);
  currentAgentConfig = applyPersonaCardToConfig(merged, activePersonaCard);
  syncGlobalCursorTracking();
  currentAppearanceTheme = currentAgentConfig.appearance?.theme === "dark" ? "dark" : "light";
  updateTitleBarOverlays();
  broadcastConfigUpdated(currentAgentConfig);
  refreshTrayMenu();
  await scheduleService.afterMutation();
  return currentAgentConfig;
});

async function refreshRuntimePersona(card = null) {
  const baseDir = app.getPath("userData");
  const activeCard = card || await getActivePersonaCard(baseDir, currentAgentConfig);
  currentAgentConfig = applyPersonaCardToConfig(mergeAgentConfig(await loadConfig(baseDir)), activeCard);
  broadcastConfigUpdated(currentAgentConfig);
  return {
    card: activeCard,
    cards: await listPersonaCards(baseDir),
    config: currentAgentConfig
  };
}

ipcMain.handle("agent:list-persona-cards", async () => listPersonaCards(app.getPath("userData")));
ipcMain.handle("agent:create-persona-card", async (_event, input) => {
  const card = await createPersonaCard(app.getPath("userData"), input);
  return { card, cards: await listPersonaCards(app.getPath("userData")) };
});
ipcMain.handle("agent:generate-persona-card-draft", async (_event, input) => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  return generatePersonaCardDraft(config, input, net.fetch.bind(net));
});
ipcMain.handle("agent:update-persona-card", async (_event, cardId, input) => {
  const card = await updatePersonaCard(app.getPath("userData"), cardId, input);
  const active = (await listPersonaCards(app.getPath("userData"))).find((item) => item.id === cardId)?.isActive;
  return active ? refreshRuntimePersona(card) : { card, cards: await listPersonaCards(app.getPath("userData")) };
});
ipcMain.handle("agent:activate-persona-card", async (_event, cardId) => {
  const card = await activatePersonaCard(app.getPath("userData"), cardId);
  return refreshRuntimePersona(card);
});
ipcMain.handle("agent:archive-persona-card", async (_event, cardId) => {
  await archivePersonaCard(app.getPath("userData"), cardId);
  return listPersonaCards(app.getPath("userData"));
});
ipcMain.handle("agent:restore-persona-card", async (_event, cardId) => {
  await restorePersonaCard(app.getPath("userData"), cardId);
  return listPersonaCards(app.getPath("userData"));
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

ipcMain.handle("agent:test-astrbot", async (_event, astrbotOverride) => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  try {
    const result = await testAstrBotConnection({ ...config.astrbot, ...(astrbotOverride ?? {}) });
    return { ok: true, message: `AstrBot 已连接，发现 ${result.bots.length} 个可用机器人/平台。`, bots: result.bots };
  } catch (error) {
    return { ok: false, message: `AstrBot 连接失败：${error.message}`, bots: [] };
  }
});

ipcMain.handle("agent:get-relationship-profile", async () => {
  return loadRelationshipProfile(app.getPath("userData"));
});

ipcMain.handle("agent:reset-relationship-profile", async () => {
  const profile = await resetRelationshipProfile(app.getPath("userData"));
  broadcastRelationshipProfile(profile);
  return profile;
});

ipcMain.handle("agent:get-live2d-models", async () => live2dModelOptions);

ipcMain.handle("agent:refresh-live2d-models", async () => refreshLive2DModels());

ipcMain.handle("agent:open-live2d-models-folder", async () => {
  const modelsDirectory = getLive2DModelsDirectory();
  await fs.mkdir(modelsDirectory, { recursive: true });
  return shell.openPath(modelsDirectory);
});

ipcMain.handle("agent:chat", async (_event, payload) => {
  await markOwnerInteraction();
  if (currentInterestActivity) {
    const text = String(payload?.message || "").trim();
    if (/^(?:终止|停止|取消)(?:创作|当前创作|这个任务|吧)?$/.test(text)) {
      const label = currentInterestActivity.label || interestStatusLabel(currentInterestActivity.type);
      currentInterestActivity.controller.abort(new Error("用户终止创作"));
      return publishInterestInteraction(`好，我先停下${label}。这项内容会保留为待继续，等你一段时间没有和我互动、我也没有其他事务时，再接着完成。`, "idle", text);
    }
    if (/^(?:等待|继续|等你完成|你继续|继续完成)(?:吧)?$/.test(text)) {
      return publishInterestInteraction(`好，我继续${currentInterestActivity.label || interestStatusLabel(currentInterestActivity.type)}，完成后再告诉你。`, "thinking", text);
    }
    return publishInterestInteraction(await caughtInterestReply(), "surprised", text);
  }
  const interestGameReply = await tryHandleInterestGameChat(payload.message);
  if (interestGameReply) return interestGameReply;
  const virtualLifeReply = await tryHandleVirtualLifeChat(payload.message);
  if (virtualLifeReply) return virtualLifeReply;
  const diaryReply = await tryHandleDiaryChat(payload.message);
  if (diaryReply) return diaryReply;
  if (String(chatState.lastReplyMeta?.localTool || "").startsWith("proactive_")) {
    const feedback = detectProactiveFeedback(payload.message);
    if (feedback) await recordProactiveFeedback(app.getPath("userData"), feedback);
  }
  const userMessage = { role: "user", content: payload.message };
  const route = payload.codeContext ? { type: "workspace_code" } : resolveAgentRoute(payload.message);
  const isAction = route.type !== "chat";
  const isQuery = /查询|查看|看看|检查|状态|多少|有没有|在运行吗|还在吗/.test(payload.message);
  const pendingText = isAction ? (isQuery ? "正在查询本机状态..." : "正在执行...") : "";
  const assistantPlaceholder = { role: "assistant", content: pendingText };
  chatState = {
    ...chatState,
    messages: [...chatState.messages, userMessage, assistantPlaceholder],
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

  // Stage 1: react locally before any network/LLM work starts. This gives the
  // character an immediate, deliberately subtle acknowledgement of the user.
  const fastReaction = classifyFastReaction(payload.message);
  broadcastMoodUpdate({
    phase: "anticipation",
    ...fastReaction
  });

  let result;
  agentTaskRunning = true;
  try {
    result = await buildAgentReply(app.getPath("userData"), {
      ...payload,
      ragClient: ragTaskClient,
      scheduleClient: {
        afterMutation: () => scheduleService.afterMutation(),
        abortPowerAction: () => scheduleService.abortPowerAction()
      },
      stream: true,
      onDelta: (partialReply) => {
        const nextMessages = [...chatState.messages];
        nextMessages[nextMessages.length - 1] = {
          role: "assistant",
          content: partialReply
        };
        chatState = {
          ...chatState,
          messages: nextMessages
        };
        broadcastChatState();
      }
    });
    await updateInterestSession(app.getPath("userData"), { lastTaskCompletedAt: new Date().toISOString() });
  } finally {
    agentTaskRunning = false;
  }

  if (result.meta?.personaChanged) {
    await refreshRuntimePersona();
  }

  chatState = {
    messages: [
      ...chatState.messages.slice(0, -1),
      { role: "assistant", content: result.reply }
    ],
    knowledge: result.knowledge,
    lastReplyMeta: {
      ...result.meta,
      sourceLabel: getReplySourceLabel(result.meta)
    }
  };
  broadcastChatState();
  if (result.meta?.relationship) {
    broadcastRelationshipProfile(result.meta.relationship);
  }

  activeManualExpressions = new Set(
    [...activeManualExpressions].filter((name) => persistentShapeExpressions.has(name))
  );
  broadcastActiveExpressions();

  // Keep whichever Live2D surface is visible in sync. The chat model needs the
  // same finite speaking cue as the desktop pet or its mouth animation never ends.
  broadcastMoodUpdate({
    phase: "final",
    mood: result.meta?.detectedMood || "happy",
    faceParams: result.meta?.faceParams || null,
    reply: result.reply
  });

  return chatState;
});

ipcMain.handle("agent:pet-touch", async () => {
  await markOwnerInteraction();
  if (currentInterestActivity) {
    return {
      ok: true,
      busy: true,
      interestBusy: true,
      reply: publishInterestInteraction(await caughtInterestReply(), "surprised").messages.at(-1).content,
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
    scheduleService.dispose();
    stopInterestSandbox();
    stopGlobalCursorTracking();
    modelDirectoryWatcher?.close();
    modelDirectoryWatcher = null;
    utilityTaskSupervisor.close();
    speechService.dispose();
    tray?.destroy();
    tray = null;
  }
  if (gptSovitsShutdownStarted) return;
  event.preventDefault();
  gptSovitsShutdownStarted = true;
  void speechService.stopGptSovitsRuntime(currentAgentConfig.voice?.gptSovitsBaseUrl)
    .catch((error) => console.warn("[voice] GPT-SoVITS shutdown failed:", error))
    .finally(() => app.quit());
});

ipcMain.handle("agent:get-auto-launch", () => isAutoLaunchEnabled());

ipcMain.handle("agent:set-auto-launch", (_event, enabled) => setAutoLaunchEnabled(enabled));

ipcMain.handle("agent:get-life-state", async () => {
  currentLifeState = currentLifeState ?? await loadLifeState(app.getPath("userData"));
  return currentLifeState;
});

ipcMain.handle("agent:get-interest-sandbox", async () => getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings()));

ipcMain.handle("agent:run-interest-activity", async (_event, type) => {
  return executeInterestActivity(type, { manual: true });
});

ipcMain.handle("agent:get-interest-state", async () => broadcastInterestState());

ipcMain.handle("agent:cleanup-interest-sandbox", async (_event, mode) => {
  const result = await cleanupInterestSandbox(app.getPath("userData"), mode);
  return { result, snapshot: await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings()) };
});

ipcMain.handle("agent:play-interest-game", async (_event, activityId) => {
  const activity = await getInterestActivity(app.getPath("userData"), activityId);
  return executeExistingGamePlaytest(activity);
});

ipcMain.handle("agent:interrupt-interest-activity", async () => {
  if (!currentInterestActivity) return { interrupted: false, state: broadcastInterestState() };
  const label = currentInterestActivity.label || interestStatusLabel(currentInterestActivity.type);
  currentInterestActivity.phase = "stopping";
  currentInterestActivity.label = "正在停止试玩并保存当前记录";
  currentInterestActivity.logs = [...(currentInterestActivity.logs || []), { stage: "stopping", label: "收到停止请求，正在关闭隔离窗口", at: new Date().toISOString() }].slice(-24);
  currentInterestActivity.controller.abort(new Error("用户从桌面气泡终止活动"));
  broadcastInterestState();
  return { interrupted: true, label };
});

ipcMain.handle("agent:update-interest-location", async (_event, location) => {
  const label = await resolveLocationLabel(location);
  await saveInterestLocation(app.getPath("userData"), { ...location, ...label });
  return getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings());
});

ipcMain.handle("agent:open-interest-sandbox", async () => {
  const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings());
  await shell.openPath(snapshot.root);
  return snapshot.root;
});

ipcMain.handle("agent:open-interest-artifact", async (_event, artifactPath) => {
  if (!isSafeInterestArtifact(app.getPath("userData"), artifactPath)) throw new Error("只能打开兴趣沙盒内的作品。");
  const exists = await fs.stat(path.resolve(artifactPath)).then((stat) => stat.isFile()).catch(() => false);
  if (!exists) throw new Error("作品文件已经被移除。请在“空间管理”中清理游戏文件夹，以同步活动记录。");
  const error = await shell.openPath(path.resolve(artifactPath));
  if (error) throw new Error(error);
  return true;
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

ipcMain.handle("agent:test-deepseek", async () => {
  return testDeepSeekConnection(app.getPath("userData"));
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

ipcMain.handle("agent:open-interest-category", async (_event, category) => {
  const names = { diary: "diary", drawing: "drawings", mini_game: "games" };
  const directory = names[category];
  if (!directory) throw new Error("不支持的兴趣作品分类。");
  const snapshot = await getInterestSandboxSnapshot(app.getPath("userData"), new Date(), currentInterestSettings());
  const target = path.join(snapshot.root, directory);
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
  return target;
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
