import { BrowserWindow } from "electron";
import { attachWindowLifecycle, WINDOW_LIFECYCLE } from "./window-lifecycle.js";

export function createSettingsWindow(context) {
  const { PRELOAD_PATH, currentAppearanceTheme, getTitleBarOverlay, loadView, isQuitting } = context;
  const win = new BrowserWindow({
    width: 940,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#f3f5f6",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(currentAppearanceTheme),
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
    isQuitting,
    onDestroyed: context.onDestroyed
  });
  return win;
}

export function createScaleWindow(context) {
  const { PRELOAD_PATH, currentAppearanceTheme, getTitleBarOverlay, loadView, isQuitting } = context;
  const win = new BrowserWindow({
    width: 420,
    height: 380,
    minWidth: 420,
    minHeight: 380,
    maxWidth: 420,
    maxHeight: 380,
    backgroundColor: "#0f1118",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(currentAppearanceTheme),
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
    isQuitting,
    onDestroyed: context.onDestroyed
  });
  return win;
}

export function createComposerWindow(context) {
  const { PRELOAD_PATH, loadView, isQuitting, bounds } = context;
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
    isQuitting,
    onDestroyed: context.onDestroyed
  });
  return win;
}

export function createChatWindow(context) {
  const {
    PRELOAD_PATH,
    currentAppearanceTheme,
    getTitleBarOverlay,
    loadView,
    isQuitting,
    bounds,
    restorePetAfterChat,
    syncGlobalCursorTracking,
    onDestroyed
  } = context;
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
    titleBarOverlay: getTitleBarOverlay(currentAppearanceTheme),
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
    isQuitting,
    onBeforeDestroy: restorePetAfterChat,
    onDestroyed: () => {
      onDestroyed();
      syncGlobalCursorTracking();
    }
  });
  win.on("minimize", restorePetAfterChat);
  win.on("hide", restorePetAfterChat);
  win.on("restore", context.hidePetForChat);
  for (const eventName of ["show", "hide", "minimize", "restore"]) {
    win.on(eventName, syncGlobalCursorTracking);
  }
  return win;
}

export function createCodeWindow(context) {
  const { PRELOAD_PATH, getTitleBarOverlay, loadView, isQuitting } = context;
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
    isQuitting,
    onDestroyed: context.onDestroyed
  });
  return win;
}

export function createBubbleWindow(context) {
  const { PRELOAD_PATH, loadView, bounds, isBackgroundScheduleLaunch, updateBubbleWindowLayout, onDestroyed } = context;
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
  win.on("closed", onDestroyed);
  return win;
}

export function createExpressionWindow(context) {
  const {
    PRELOAD_PATH,
    currentAppearanceTheme,
    getTitleBarOverlay,
    loadView,
    isQuitting,
    getActiveExpressions,
    onDestroyed
  } = context;
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 440,
    backgroundColor: "#0f1118",
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(currentAppearanceTheme),
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
    isQuitting,
    onDestroyed
  });
  return win;
}

export function ensureWindow(currentWindow, createWindow) {
  if (!currentWindow || currentWindow.isDestroyed()) {
    return createWindow();
  }
  return currentWindow;
}
