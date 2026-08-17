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

  function registerIpc() {
    if (disposed) throw new Error(`${serviceName}已经释放。`);
    if (ipcRegistered) return service;
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
    return snapshot();
  }

  function dispose() {
    if (disposed) return stop();
    disposed = true;
    stop();
    for (const disposer of listenerDisposers.values()) {
      try { disposer(); } catch {}
    }
    listenerDisposers.clear();
    for (const channel of registeredHandlers) options.trustedIpc.removeHandler(channel);
    registeredHandlers.clear();
    ipcRegistered = false;
    return snapshot();
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
