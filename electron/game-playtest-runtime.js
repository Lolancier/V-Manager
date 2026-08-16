import { BrowserWindow, session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export async function createIsolatedGameDriver(artifactPath) {
  const partition = `vivi-playtest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const isolatedSession = session.fromPartition(partition, { cache: false });
  const errors = [];
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith("file:") || details.url.startsWith("data:") || details.url.startsWith("blob:");
    if (!allowed) errors.push({ type: "network-blocked", message: details.url.slice(0, 300) });
    callback({ cancel: !allowed });
  });
  isolatedSession.on("will-download", (event) => {
    event.preventDefault();
    errors.push({ type: "download-blocked", message: "游戏尝试下载文件。" });
  });
  const playWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      session: isolatedSession,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: false,
      backgroundThrottling: false,
      navigateOnDragDrop: false,
      disableDialogs: true
    }
  });
  playWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  playWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
    errors.push({ type: "navigation-blocked", message: "游戏尝试离开本地页面。" });
  });
  playWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) errors.push({ type: level >= 3 ? "console-error" : "console-warning", message: String(message).slice(0, 500) });
  });
  playWindow.webContents.on("render-process-gone", (_event, details) => errors.push({ type: "render-gone", message: details.reason }));
  playWindow.webContents.on("did-fail-load", (_event, code, description) => errors.push({ type: "load-failed", message: `${code}: ${description}` }));
  playWindow.on("unresponsive", () => errors.push({ type: "unresponsive", message: "游戏页面无响应。" }));

  return {
    async load() {
      await playWindow.loadFile(path.resolve(artifactPath));
      await new Promise((resolve) => setTimeout(resolve, 350));
    },
    async readState() {
      return playWindow.webContents.executeJavaScript(`(() => {
        let exposed = {};
        try {
          const api = window.__VIVI_GAME__ || {};
          exposed = typeof api.getState === "function" ? (api.getState() || {}) : api;
        } catch (error) { exposed = { message: String(error && error.message || error) }; }
        const visible = (element) => {
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const buttons = [...document.querySelectorAll("button,[role=button],input[type=button],input[type=submit]")].filter(visible).slice(0, 12).map((element) => {
          const rect = element.getBoundingClientRect(); return { text: (element.innerText || element.value || "").slice(0, 80), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        });
        const canvasElement = [...document.querySelectorAll("canvas")].find(visible);
        const canvasRect = canvasElement && canvasElement.getBoundingClientRect();
        return {
          protocolDetected: Boolean(window.__VIVI_GAME__),
          status: exposed.status, gameStatus: exposed.gameStatus, score: exposed.score, highestScore: exposed.highestScore,
          highScore: exposed.highScore, points: exposed.points, message: exposed.message,
          recommendedActions: Array.isArray(exposed.recommendedActions) ? exposed.recommendedActions.slice(0, 20) : [],
          bodyText: (document.body && document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 3000), buttons,
          canvas: canvasRect ? { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height } : null
        };
      })()`, true);
    },
    async key(keyCode) {
      playWindow.webContents.sendInputEvent({ type: "keyDown", keyCode });
      playWindow.webContents.sendInputEvent({ type: "keyUp", keyCode });
    },
    async click(x, y) {
      playWindow.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(x), y: Math.round(y) });
      playWindow.webContents.sendInputEvent({ type: "mouseDown", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
      playWindow.webContents.sendInputEvent({ type: "mouseUp", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
    },
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    async screenshot(targetPath) {
      const image = await playWindow.webContents.capturePage();
      await fs.writeFile(targetPath, image.toPNG());
      return targetPath;
    },
    errors: () => errors,
    async close() {
      if (!playWindow.isDestroyed()) playWindow.destroy();
      await Promise.allSettled([
        isolatedSession.clearStorageData(),
        isolatedSession.clearCache()
      ]);
    }
  };
}
