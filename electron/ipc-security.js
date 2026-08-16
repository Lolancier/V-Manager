import path from "node:path";
import { fileURLToPath } from "node:url";

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isTrustedRendererUrl(rawUrl, options) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    return false;
  }
  if (options.isDev) return url.origin === new URL(options.devServerUrl).origin;
  if (url.protocol !== "file:") return false;
  try {
    return isInside(options.rendererRoot, fileURLToPath(url));
  } catch {
    return false;
  }
}

export function createTrustedIpcRegistrar(ipcMain, options) {
  const eventListeners = new Map();
  const isTrustedEvent = (event) => {
    const frame = event?.senderFrame;
    return Boolean(frame && frame === event.sender?.mainFrame && isTrustedRendererUrl(frame.url, options));
  };
  const validate = (event) => {
    if (!isTrustedEvent(event)) throw new Error("拒绝来自非受信渲染页面的 IPC 调用。");
  };
  const forgetEventListener = (channel, listener, wrapped) => {
    const channelListeners = eventListeners.get(channel);
    const wrappers = channelListeners?.get(listener);
    if (!wrappers) return;
    wrappers.delete(wrapped);
    if (!wrappers.size) channelListeners.delete(listener);
    if (!channelListeners.size) eventListeners.delete(channel);
  };
  const registrar = {
    handle(channel, listener) {
      ipcMain.handle(channel, (event, ...args) => {
        validate(event);
        return listener(event, ...args);
      });
    },
    removeHandler(channel) {
      ipcMain.removeHandler(channel);
    },
    on(channel, listener) {
      const wrapped = (event, ...args) => {
        if (!isTrustedEvent(event)) return;
        return listener(event, ...args);
      };
      ipcMain.on(channel, wrapped);
      const channelListeners = eventListeners.get(channel) || new Map();
      const wrappers = channelListeners.get(listener) || new Set();
      wrappers.add(wrapped);
      channelListeners.set(listener, wrappers);
      eventListeners.set(channel, channelListeners);
      let disposed = false;
      return () => {
        if (disposed) return;
        if (!eventListeners.get(channel)?.get(listener)?.has(wrapped)) {
          disposed = true;
          return;
        }
        ipcMain.removeListener(channel, wrapped);
        forgetEventListener(channel, listener, wrapped);
        disposed = true;
      };
    },
    removeListener(channel, listener) {
      const wrappers = eventListeners.get(channel)?.get(listener);
      const wrapped = wrappers ? [...wrappers].at(-1) : null;
      if (!wrapped) return;
      ipcMain.removeListener(channel, wrapped);
      forgetEventListener(channel, listener, wrapped);
    }
  };
  return registrar;
}
