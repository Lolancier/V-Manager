export const WINDOW_LIFECYCLE = Object.freeze({
  persistent: "persistent",
  disposable: "disposable"
});

export function attachWindowLifecycle(win, options = {}) {
  const lifecycle = options.lifecycle || WINDOW_LIFECYCLE.disposable;
  const isQuitting = options.isQuitting || (() => false);

  if (lifecycle === WINDOW_LIFECYCLE.persistent) {
    win.on("close", (event) => {
      if (isQuitting()) return;
      event.preventDefault();
      win.hide();
      options.onHidden?.();
    });
  } else {
    win.on("close", () => {
      if (!isQuitting()) options.onBeforeDestroy?.();
    });
  }

  win.on("closed", () => options.onDestroyed?.());
  return win;
}
