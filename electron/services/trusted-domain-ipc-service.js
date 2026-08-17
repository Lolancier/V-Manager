export function createTrustedDomainIpcService(options) {
  const serviceName = options.serviceName || "IPC 服务";
  const handlers = options.handlers || [];
  const listeners = options.listeners || [];
  const registeredHandlers = new Set();
  const listenerDisposers = new Map();
  let ipcRegistered = false;
  let started = false;
  let disposed = false;

  const ensureActive = () => {
    if (disposed) throw new Error(`${serviceName}已经释放。`);
    if (!started) throw new Error(`${serviceName}尚未启动。`);
  };

  function removeTrackedRegistrations() {
    for (const [channel, disposer] of listenerDisposers) {
      try {
        disposer();
        listenerDisposers.delete(channel);
      } catch {}
    }
    for (const channel of registeredHandlers) {
      try {
        options.trustedIpc.removeHandler(channel);
        registeredHandlers.delete(channel);
      } catch {}
    }
    ipcRegistered = listenerDisposers.size > 0 || registeredHandlers.size > 0;
  }

  function registerIpc() {
    if (disposed) throw new Error(`${serviceName}已经释放。`);
    if (ipcRegistered) return service;
    if (listenerDisposers.size || registeredHandlers.size) {
      throw new Error(`${serviceName}存在尚未清理的 IPC 注册。`);
    }
    const addedHandlers = new Set();
    const addedListeners = new Map();
    try {
      for (const listener of listeners) {
        addedListeners.set(listener.channel, options.trustedIpc.on(listener.channel, (event, ...args) => {
          if (disposed || !started) return;
          return listener.listener(event, ...args);
        }));
      }
      for (const handler of handlers) {
        options.trustedIpc.handle(handler.channel, async (event, ...args) => {
          ensureActive();
          return handler.listener(event, ...args);
        });
        addedHandlers.add(handler.channel);
      }
    } catch (error) {
      for (const disposer of addedListeners.values()) {
        try {
          disposer();
        } catch {
          try { disposer(); } catch {}
        }
      }
      for (const channel of addedHandlers) options.trustedIpc.removeHandler(channel);
      throw error;
    }
    for (const [channel, disposer] of addedListeners) listenerDisposers.set(channel, disposer);
    for (const channel of addedHandlers) registeredHandlers.add(channel);
    ipcRegistered = true;
    return service;
  }

  function start() {
    if (disposed) throw new Error(`${serviceName}已经释放。`);
    started = true;
    return snapshot();
  }

  function stop() {
    started = false;
    if (disposed) removeTrackedRegistrations();
    return snapshot();
  }

  function dispose() {
    disposed = true;
    return stop();
  }

  function snapshot() {
    return {
      started,
      disposed,
      handles: [...registeredHandlers],
      listeners: [...listenerDisposers.keys()],
      ...(options.snapshot ? options.snapshot() : {})
    };
  }

  const service = {
    dispose,
    registerIpc,
    snapshot,
    start,
    stop
  };
  return service;
}
