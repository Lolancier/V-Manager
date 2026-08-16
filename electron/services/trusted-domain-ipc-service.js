export function createTrustedDomainIpcService(options) {
  const serviceName = options.serviceName || "IPC 服务";
  const handlers = options.handlers || [];
  const listeners = options.listeners || [];
  const registeredHandlers = new Set();
  const listenerDisposers = new Map();
  let started = false;
  let disposed = false;

  const ensureActive = () => {
    if (disposed) throw new Error(`${serviceName}已经释放。`);
    if (!started) throw new Error(`${serviceName}尚未启动。`);
  };

  function registerIpc() {
    if (disposed) throw new Error(`${serviceName}已经释放。`);
    try {
      for (const listener of listeners) {
        listenerDisposers.set(listener.channel, options.trustedIpc.on(listener.channel, (event, ...args) => {
          if (disposed || !started) return;
          return listener.listener(event, ...args);
        }));
      }
      for (const handler of handlers) {
        options.trustedIpc.handle(handler.channel, async (event, ...args) => {
          ensureActive();
          return handler.listener(event, ...args);
        });
        registeredHandlers.add(handler.channel);
      }
    } catch (error) {
      for (const disposer of listenerDisposers.values()) {
        try { disposer(); } catch {}
      }
      listenerDisposers.clear();
      for (const channel of registeredHandlers) options.trustedIpc.removeHandler(channel);
      registeredHandlers.clear();
      throw error;
    }
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
