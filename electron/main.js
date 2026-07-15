import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentReply,
  clearConversationHistory,
  defaultConfig,
  ensureDataFiles,
  getAppRegistrySnapshot,
  getConfigPath,
  getFileManagerSnapshot,
  getRagStatus,
  getSystemResourceSnapshot,
  listKnowledgeFiles,
  loadConfig,
  rebuildAppRegistry,
  rebuildKnowledgeIndex,
  saveConfig,
  searchLocalFiles,
  testDeepSeekConnection,
  testEmbeddingConnection
} from "../src-agent/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const devServerUrl = "http://localhost:5173";
let petWindow = null;
let settingsWindow = null;
let scaleWindow = null;
let composerWindow = null;
let chatWindow = null;
let bubbleWindow = null;
let petWindowScale = 1;
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
  const normalized = Math.max(0.8, Math.min(1.16, scale));
  const delta = normalized - 1;
  return {
    width: Math.round(440 + delta * 760),
    height: Math.round(860 + delta * 1350)
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

function getChatWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) {
    return {
      width: 460,
      height: 640
    };
  }

  const bounds = petWindow.getBounds();
  return {
    x: bounds.x + bounds.width + 18,
    y: bounds.y + 120,
    width: 460,
    height: 640
  };
}

function getComposerWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) {
    return {
      width: 430,
      height: 280
    };
  }

  const bounds = petWindow.getBounds();
  return {
    x: bounds.x + Math.max(40, Math.round(bounds.width * 0.08)),
    y: bounds.y + bounds.height - 310,
    width: 430,
    height: 280
  };
}

function getBubbleWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) {
    return {
      width: 290,
      height: 220
    };
  }

  const bounds = petWindow.getBounds();
  return {
    x: bounds.x + bounds.width - 28,
    y: bounds.y + 28,
    width: 290,
    height: 220
  };
}

function createPetWindow() {
  const initialSize = getPetWindowSize();
  const win = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    minWidth: 360,
    minHeight: 700,
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
    width: 480,
    height: 780,
    minWidth: 420,
    minHeight: 720,
    backgroundColor: "#0f1118",
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
    width: 360,
    height: 250,
    minWidth: 340,
    minHeight: 230,
    maxWidth: 420,
    maxHeight: 280,
    backgroundColor: "#0f1118",
    autoHideMenuBar: true,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
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
    backgroundColor: "#0f1118",
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

function ensureBubbleWindow() {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    return createBubbleWindow();
  }

  return bubbleWindow;
}

function openSettingsWindow() {
  const win = ensureSettingsWindow();
  win.show();
  win.focus();
  return true;
}

function openScaleWindow() {
  const win = ensureScaleWindow();
  win.show();
  win.focus();
  win.webContents.send("agent:pet-scale-updated", petWindowScale);
  return true;
}

function openComposerWindow() {
  const win = ensureComposerWindow();
  win.show();
  win.focus();
  win.webContents.send("agent:chat-state-updated", chatState);
  return true;
}

function openChatWindow() {
  const win = ensureChatWindow();
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
}

function updateBubbleWindowLayout() {
  if (!bubbleWindow || bubbleWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) {
    return;
  }

  const bounds = getBubbleWindowBounds();
  bubbleWindow.setBounds(bounds);
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
          label: "调整模型大小",
          click: () => openScaleWindow()
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
  const config = await loadConfig(app.getPath("userData"));
  const knowledgeFiles = await listKnowledgeFiles(app.getPath("userData"));

  return {
    config,
    knowledgeFiles,
    runtime: {
      mode: "desktop",
      configPath: getConfigPath(app.getPath("userData"))
    },
    abilities: [
      { id: "chat", name: "自然对话", status: "ready", detail: "已接入人格设定和本地知识检索。" },
      { id: "memory", name: "本地记忆/RAG", status: "ready", detail: "从本地知识库检索相关片段参与回答。" },
      { id: "resource", name: "资源查看", status: "ready", detail: "可查看 CPU、内存、运行进程和当前前台应用数量。" },
      { id: "launcher", name: "应用启动", status: "ready", detail: "已接入本地执行层，可直接启动常见应用，也支持传入本地 exe 路径。" },
      { id: "browser", name: "浏览器搜索", status: "planned", detail: "预留插件位，后续接浏览器自动化或联网搜索。" },
      { id: "filesystem", name: "文件管理", status: "ready", detail: "当前支持打开文件/文件夹、列目录、读取文本、创建文件夹/文本文件、追加内容与显式删除。" },
      { id: "messenger", name: "QQ/微信消息发送", status: "planned", detail: "后续通过 UI 自动化/系统脚本接入，现阶段仅做能力规划。" }
    ]
  };
});

ipcMain.handle("agent:save-config", async (_event, nextConfig) => {
  const merged = {
    ...defaultConfig,
    ...nextConfig,
    deepseek: {
      ...defaultConfig.deepseek,
      ...(nextConfig.deepseek ?? {})
    },
    embedding: {
      ...defaultConfig.embedding,
      ...(nextConfig.embedding ?? {})
    },
    memory: {
      ...defaultConfig.memory,
      ...(nextConfig.memory ?? {})
    }
  };
  await saveConfig(app.getPath("userData"), merged);
  petWindow?.webContents.send("agent:config-updated", merged);
  settingsWindow?.webContents.send("agent:config-updated", merged);
  return merged;
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
  return chatState;
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

ipcMain.handle("agent:open-scale-window", async () => {
  return openScaleWindow();
});

ipcMain.handle("agent:get-chat-state", async () => {
  return chatState;
});

ipcMain.handle("agent:get-pet-scale", async () => {
  return petWindowScale;
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

ipcMain.handle("agent:update-pet-window-layout", async (_event, { scale }) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }

  petWindowScale = Math.max(0.8, Math.min(1.16, Number(scale) || 1));
  const nextSize = getPetWindowSize(petWindowScale);
  const currentBounds = petWindow.getBounds();
  const nextX = Math.round(currentBounds.x - (nextSize.width - currentBounds.width) / 2);
  const nextY = Math.round(currentBounds.y - (nextSize.height - currentBounds.height));

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
