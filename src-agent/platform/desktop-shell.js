const REQUIRED_METHODS = ["openExternal", "openPath", "trashItem"];

let desktopShell = null;

export function configureDesktopShell(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("桌面 Shell 适配器必须是对象。");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`桌面 Shell 适配器缺少 ${method}()。`);
    }
  }
  desktopShell = Object.freeze({
    openExternal: adapter.openExternal,
    openPath: adapter.openPath,
    trashItem: adapter.trashItem
  });
  return desktopShell;
}

export function getDesktopShell() {
  if (!desktopShell) {
    throw new Error("桌面 Shell 尚未配置；该操作必须由桌面宿主进程提供能力。");
  }
  return desktopShell;
}

export function resetDesktopShellForTests() {
  desktopShell = null;
}
