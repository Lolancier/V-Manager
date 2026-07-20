import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, session, shell } from "electron";
import { createHash } from "node:crypto";
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
  generateAsmrScript,
  listKnowledgeFiles,
  loadConfig,
  rebuildAppRegistry,
  rebuildKnowledgeIndex,
  saveConfig,
  setActiveWorkspaceDir,
  searchLocalFiles,
  testDeepSeekConnection,
  testEmbeddingConnection
} from "../src-agent/core.js";
import { listWorkspaceCodeFiles, readWorkspaceCode } from "../src-agent/code-executor.js";
import { listElevenLabsVoices, synthesizeElevenLabsSpeech } from "../src-agent/elevenlabs.js";
import { getLocalSttStatus, installLocalStt, transcribeLocalSpeech } from "../src-agent/local-stt.js";
import { loadRelationshipProfile, resetRelationshipProfile } from "../src-agent/relationship-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

protocol.registerSchemesAsPrivileged([
  { scheme: "vivi-model", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const isDev = !app.isPackaged;
const devServerUrl = "http://localhost:5173";
let petWindow = null;
let settingsWindow = null;
let scaleWindow = null;
let composerWindow = null;
let chatWindow = null;
let bubbleWindow = null;
let bubbleContentSize = { width: 330, height: 180 };
let expressionWindow = null;
let codeWindow = null;
let currentAppearanceTheme = "light";
let currentAgentConfig = defaultConfig;
let petWindowScale = 1;
let positionLocked = false;
let activeManualExpressions = new Set();
const persistentShapeExpressions = new Set(["expression20", "expression21", "expression22", "expression24"]);
const builtInLive2DModels = [
  { id: "qianqian", label: "芊芊", detail: "完整表情、形态与动作适配", builtIn: true },
  { id: "hiyori", label: "Hiyori", detail: "Cubism 官方示例模型", builtIn: true },
  { id: "epsilon", label: "Epsilon", detail: "轻量免费示例模型", builtIn: true }
];
let live2dModelOptions = [...builtInLive2DModels];
let customModelRoots = new Map();
let modelDirectoryWatcher = null;
let modelScanTimer = null;

function mergeAgentConfig(nextConfig = {}) {
  return {
    ...defaultConfig,
    ...nextConfig,
    deepseek: { ...defaultConfig.deepseek, ...(nextConfig.deepseek ?? {}) },
    embedding: { ...defaultConfig.embedding, ...(nextConfig.embedding ?? {}) },
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
    memory: { ...defaultConfig.memory, ...(nextConfig.memory ?? {}) }
  };
}

async function synthesizeSpeechWithCache(voiceConfig, text, asmr) {
  const cacheDir = path.join(app.getPath("userData"), "agent-data", "audio-cache");
  const cacheKey = createHash("sha256").update(JSON.stringify({
    text,
    asmr,
    baseUrl: voiceConfig.baseUrl,
    model: voiceConfig.model,
    voice: voiceConfig.voice,
    outputFormat: voiceConfig.outputFormat,
    speed: voiceConfig.speed,
    stability: voiceConfig.stability,
    similarityBoost: voiceConfig.similarityBoost
  })).digest("hex");
  const audioPath = path.join(cacheDir, `${cacheKey}.mp3`);
  const cached = await fs.readFile(audioPath).catch(() => null);
  if (cached) {
    return { audioBase64: cached.toString("base64"), mimeType: "audio/mpeg", requestId: "cache", characterCost: "0", cached: true };
  }

  const result = await synthesizeElevenLabsSpeech(voiceConfig, text, { asmr });
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(audioPath, Buffer.from(result.audioBase64, "base64"));
  return { ...result, cached: false };
}

function broadcastSttProgress(progress) {
  for (const win of [settingsWindow, chatWindow, composerWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:local-stt-progress", progress);
  }
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
    return {
      id,
      label: baseName || parentName,
      detail: `用户模型 · ${path.relative(modelsDirectory, modelRoot) || parentName}`,
      directory: `vivi-model://local/${encodeURIComponent(id)}/`,
      fileName: path.basename(modelFile),
      builtIn: false,
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
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
let chatState = {
  messages: [
    {
      role: "assistant",
      content: "你好，我是你的桌面 Agent。右键模型可以打开设置窗口。"
    }
  ],
  knowledge: [],
  lastReplyMeta: null
};

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

  if (meta.responseMode === "deepseek") {
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
  return getWindowBoundsNearPet(460, 640, 96);
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
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "pet");

  win.on("move", () => {
    updateBubbleWindowLayout();
  });

  win.on("resize", () => {
    updateBubbleWindowLayout();
  });

  win.webContents.on("context-menu", () => {
    buildPetContextMenu().popup({
      window: win
    });
  });

  win.on("closed", () => {
    if (petWindow === win) {
      petWindow = null;
    }

    if (!app.isQuiting) {
      app.isQuiting = true;
      app.quit();
    }
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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "settings");

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (settingsWindow === win) {
      settingsWindow = null;
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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "scale");

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (scaleWindow === win) {
      scaleWindow = null;
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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "composer");

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (composerWindow === win) {
      composerWindow = null;
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
    minWidth: 400,
    minHeight: 520,
    alwaysOnTop: true,
    backgroundColor: "#0f1118",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(),
    autoHideMenuBar: true,
    show: false,
    title: "聊天栏",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "chat");

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (chatWindow === win) {
      chatWindow = null;
    }
  });

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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "code");

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (codeWindow === win) codeWindow = null;
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
    focusable: true,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "bubble");

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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadView(win, "expressions");

  win.webContents.on("did-finish-load", () => {
    win.webContents.send("agent:expressions-updated", [...activeManualExpressions]);
  });

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (expressionWindow === win) {
      expressionWindow = null;
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
  win.webContents.send("agent:expressions-updated", [...activeManualExpressions]);
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
  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.send("agent:chat-state-updated", chatState);
  return true;
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

function broadcastLive2DModels() {
  for (const win of [petWindow, settingsWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("agent:live2d-models-updated", live2dModelOptions);
  }
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

function broadcastActiveExpressions() {
  const expressions = [...activeManualExpressions];
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
      submenu: [
        {
          label: "人设与模型",
          click: () => {
            openSettingsWindow();
            settingsWindow?.webContents.send("agent:menu-action", "open-settings-general");
          }
        },
        {
          label: "DeepSeek 与记忆",
          click: () => {
            openSettingsWindow();
            settingsWindow?.webContents.send("agent:menu-action", "open-settings-llm");
          }
        },
        {
          label: "DeepSeek 平台",
          click: () => shell.openExternal("https://platform.deepseek.com/")
        }
      ]
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
            petWindow.setAlwaysOnTop(nextState);
          }
        },
        {
          label: "重置位置",
          click: () => petWindow?.center()
        },
        {
          label: "打开设置窗口",
          click: () => openSettingsWindow()
        }
      ]
    },
    {
      type: "separator"
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
  await ensureDataFiles(app.getPath("userData"));
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    return permission === "media" && details.mediaType !== "video";
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const audioOnly = permission === "media" && !details.mediaTypes?.includes("video");
    callback(audioOnly);
  });
  const startupConfig = await loadConfig(app.getPath("userData"));
  currentAgentConfig = mergeAgentConfig(startupConfig);
  currentAppearanceTheme = currentAgentConfig.appearance?.theme === "dark" ? "dark" : "light";
  await refreshLive2DModels({ broadcast: false });
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
  await restoreCodeWorkspace();
  createPetWindow();
  createBubbleWindow();
  updateBubbleWindowLayout();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
      createBubbleWindow();
      updateBubbleWindowLayout();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("agent:get-bootstrap", async () => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  currentAgentConfig = config;
  const knowledgeFiles = await listKnowledgeFiles(app.getPath("userData"));
  const relationshipProfile = await loadRelationshipProfile(app.getPath("userData"));

  return {
    config,
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
      { id: "memory", name: "本地记忆/RAG", status: "ready", detail: "从本地知识库检索相关片段参与回答。" },
      { id: "resource", name: "资源查看", status: "ready", detail: "可查看 CPU、内存、运行进程和当前前台应用数量。" },
      { id: "launcher", name: "应用启动", status: "ready", detail: "已接入本地执行层，可直接启动常见应用，也支持传入本地 exe 路径。" },
      { id: "code-agent", name: "代码代理", status: "ready", detail: "可在当前工作区搜索和读取代码；文件修改与开发命令必须经用户明确确认后执行。" },
      { id: "browser", name: "浏览器搜索", status: "planned", detail: "预留插件位，后续接浏览器自动化或联网搜索。" },
      { id: "filesystem", name: "文件管理", status: "ready", detail: "当前支持打开文件/文件夹、列目录、读取文本、创建文件夹/文本文件、追加内容与显式删除。" },
      { id: "messenger", name: "QQ/微信消息发送", status: "planned", detail: "后续通过 UI 自动化/系统脚本接入，现阶段仅做能力规划。" }
    ]
  };
});

ipcMain.handle("agent:save-config", async (_event, nextConfig) => {
  const merged = mergeAgentConfig(nextConfig);
  await saveConfig(app.getPath("userData"), merged);
  currentAgentConfig = merged;
  currentAppearanceTheme = merged.appearance?.theme === "dark" ? "dark" : "light";
  updateTitleBarOverlays();
  broadcastConfigUpdated(merged);
  return merged;
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

ipcMain.handle("agent:select-asmr-text-file", async () => {
  const result = await dialog.showOpenDialog(settingsWindow ?? undefined, {
    title: "导入 ASMR 文本",
    properties: ["openFile"],
    filters: [{ name: "文本", extensions: ["txt", "md"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const content = await fs.readFile(result.filePaths[0], "utf8");
  return { path: result.filePaths[0], content: content.slice(0, 200000) };
});

ipcMain.handle("agent:generate-asmr-script", async (_event, payload) => {
  return generateAsmrScript(app.getPath("userData"), payload ?? {});
});

ipcMain.handle("agent:list-elevenlabs-voices", async (_event, voiceOverride) => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  return listElevenLabsVoices({ ...config.voice, ...(voiceOverride ?? {}) });
});

ipcMain.handle("agent:synthesize-speech", async (_event, payload) => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  const voiceConfig = { ...config.voice, ...(payload?.voiceConfig ?? {}) };
  return synthesizeSpeechWithCache(voiceConfig, payload?.text, Boolean(payload?.asmr));
});

ipcMain.handle("agent:get-local-stt-status", async (_event, modelId) => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  return getLocalSttStatus(app.getPath("userData"), modelId || config.speechInput.model);
});

ipcMain.handle("agent:install-local-stt", async (_event, modelId) => {
  return installLocalStt(
    app.getPath("userData"),
    modelId,
    broadcastSttProgress,
    (url, options) => net.fetch(url, options)
  );
});

ipcMain.handle("agent:transcribe-local-speech", async (_event, audioBytes) => {
  const config = mergeAgentConfig(await loadConfig(app.getPath("userData")));
  return transcribeLocalSpeech(app.getPath("userData"), audioBytes, config.speechInput);
});

ipcMain.handle("agent:open-local-stt-folder", async () => {
  const status = await getLocalSttStatus(app.getPath("userData"), currentAgentConfig.speechInput.model);
  await fs.mkdir(status.root, { recursive: true });
  return shell.openPath(status.root);
});

ipcMain.handle("agent:chat", async (_event, payload) => {
  const userMessage = { role: "user", content: payload.message };
  const assistantPlaceholder = { role: "assistant", content: "" };
  chatState = {
    ...chatState,
    messages: [...chatState.messages, userMessage, assistantPlaceholder],
    lastReplyMeta: {
      responseMode: "deepseek",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      model: "",
      sourceLabel: "生成中..."
    }
  };
  broadcastChatState();

  const result = await buildAgentReply(app.getPath("userData"), {
    ...payload,
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

  // Push reply performance cues to the pet window model. If the LLM skips
  // set_mood, the renderer still derives lightweight mood beats from text.
  petWindow?.webContents.send("agent:mood-updated", {
    mood: result.meta?.detectedMood || "happy",
    faceParams: result.meta?.faceParams || null,
    reply: result.reply
  });

  return chatState;
});

app.on("before-quit", () => {
  modelDirectoryWatcher?.close();
  modelDirectoryWatcher = null;
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

ipcMain.handle("agent:get-rag-status", async () => {
  return getRagStatus(app.getPath("userData"));
});

ipcMain.handle("agent:rebuild-rag-index", async () => {
  return rebuildKnowledgeIndex(app.getPath("userData"));
});

ipcMain.handle("agent:test-embedding", async () => {
  return testEmbeddingConnection(app.getPath("userData"));
});

ipcMain.handle("agent:get-system-resource-snapshot", async () => {
  return getSystemResourceSnapshot();
});

ipcMain.handle("agent:get-file-manager-snapshot", async () => {
  return getFileManagerSnapshot();
});

ipcMain.handle("agent:open-external", async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("agent:test-deepseek", async () => {
  return testDeepSeekConnection(app.getPath("userData"));
});

ipcMain.handle("agent:clear-memory", async () => {
  await clearConversationHistory(app.getPath("userData"));
  chatState = {
    messages: [
      {
        role: "assistant",
        content: "你好，我是你的桌面 Agent。右键模型可以打开设置窗口。"
      }
    ],
    knowledge: [],
    lastReplyMeta: null
  };
  broadcastChatState();
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
  if (ignore) petWindow.setIgnoreMouseEvents(true, { forward: true });
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
  return {
    baseDir,
    dataDir: path.join(baseDir, "agent-data"),
    configPath: path.join(baseDir, "agent-data", "config.json"),
    memoryPath: path.join(baseDir, "agent-data", "memory", "conversation.jsonl"),
    knowledgeDir: path.join(baseDir, "agent-data", "knowledge"),
    ragDir: path.join(baseDir, "agent-data", "rag"),
    registryDir: path.join(baseDir, "agent-data", "registry")
  };
});

ipcMain.handle("agent:open-data-folder", async () => {
  const dataDir = path.join(app.getPath("userData"), "agent-data");
  await shell.openPath(dataDir);
  return true;
});
