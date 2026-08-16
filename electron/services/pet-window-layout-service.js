import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const PET_WINDOW_LAYOUT_HANDLE_CHANNELS = Object.freeze([
  "agent:get-pet-scale",
  "agent:get-position-lock",
  "agent:set-position-lock",
  "agent:get-pet-window-bounds",
  "agent:set-pet-window-position",
  "agent:update-pet-window-layout",
  "agent:update-bubble-window-size"
]);

export const PET_WINDOW_LAYOUT_LISTENER_CHANNELS = Object.freeze([
  "agent:set-pet-mouse-passthrough",
  "agent:show-pet-context-menu"
]);
export const PET_WINDOW_LAYOUT_IPC_MANIFEST = Object.freeze({
  handles: PET_WINDOW_LAYOUT_HANDLE_CHANNELS,
  listeners: PET_WINDOW_LAYOUT_LISTENER_CHANNELS
});

export function createPetWindowLayoutService(options) {
  let petScale = options.initialPetScale ?? 1;
  let positionLocked = options.initialPositionLocked ?? false;
  let bubbleContentSize = options.initialBubbleContentSize || { width: 330, height: 180 };
  let interestBubbleWokenForTask = "";
  const operations = new Map([
    ...PET_WINDOW_LAYOUT_HANDLE_CHANNELS.map((channel) => [channel, 0]),
    ...PET_WINDOW_LAYOUT_LISTENER_CHANNELS.map((channel) => [channel, 0])
  ]);

  function record(channel) {
    operations.set(channel, operations.get(channel) + 1);
  }

  async function setPositionLock(_event, locked) {
    const nextLocked = Boolean(locked);
    setPositionLocked(nextLocked);
    options.broadcastPositionLock(nextLocked);
    record("agent:set-position-lock");
    return nextLocked;
  }

  function setPositionLocked(locked) {
    positionLocked = Boolean(locked);
    return positionLocked;
  }

  async function getPetWindowBounds() {
    if (!options.isPetWindowActive()) return { x: 0, y: 0, width: 0, height: 0 };
    const bounds = options.getPetWindowBounds();
    record("agent:get-pet-window-bounds");
    return bounds;
  }

  async function setPetWindowPosition(_event, { x, y }) {
    if (!options.isPetWindowActive()) return false;
    options.setPetWindowPosition(Math.round(x), Math.round(y));
    options.updateBubbleWindowLayout();
    record("agent:set-pet-window-position");
    return true;
  }

  async function updatePetWindowLayout(_event, { scale }) {
    if (!options.isPetWindowActive()) return null;
    const nextScale = Math.max(0.8, Math.min(1.5, Number(scale) || 1));
    petScale = nextScale;
    const nextSize = options.getPetWindowSize(nextScale);
    const currentBounds = options.getPetWindowBounds();
    const workArea = options.getWorkAreaForBounds(currentBounds);
    const centeredX = Math.round(currentBounds.x - (nextSize.width - currentBounds.width) / 2);
    const bottomAnchoredY = Math.round(currentBounds.y - (nextSize.height - currentBounds.height));
    const nextX = Math.max(workArea.x, Math.min(centeredX, workArea.x + workArea.width - nextSize.width));
    const nextY = Math.max(workArea.y, bottomAnchoredY);

    options.setPetWindowBounds({
      x: nextX,
      y: nextY,
      width: nextSize.width,
      height: nextSize.height
    });
    options.broadcastPetScale(nextScale);
    options.updateBubbleWindowLayout();
    record("agent:update-pet-window-layout");
    return nextSize;
  }

  async function updateBubbleWindowSize(event, size) {
    if (!options.isBubbleWindowActive() || !options.isSenderBubbleWindow(event)) return null;
    const contentSize = {
      width: Math.max(280, Math.min(680, Math.ceil(Number(size?.width) || 330))),
      height: Math.max(100, Math.ceil(Number(size?.height) || 180))
    };
    bubbleContentSize = contentSize;
    options.updateBubbleWindowLayout();
    record("agent:update-bubble-window-size");
    return options.getBubbleWindowBounds();
  }

  function setMousePassthrough(event, ignore) {
    if (!options.isPetWindowActive() || !options.isSenderPetWindow(event)) return;
    const shouldIgnore = options.isHoverAutoHideEnabled() || Boolean(ignore);
    options.setPetMousePassthrough(shouldIgnore);
    record("agent:set-pet-mouse-passthrough");
  }

  function showContextMenu(event) {
    options.showPetContextMenu(event);
    record("agent:show-pet-context-menu");
  }

  function shouldWakeInterestBubble(payload) {
    const taskKey = payload?.status === "working"
      ? `${payload.startedAt || ""}:${payload.activityId || ""}`
      : "";
    if (!taskKey) {
      interestBubbleWokenForTask = "";
      return false;
    }
    if (taskKey === interestBubbleWokenForTask || payload.type !== "mini_game") return false;
    interestBubbleWokenForTask = taskKey;
    return true;
  }

  const runtime = createTrustedDomainIpcService({
    serviceName: "宠物窗口布局服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:get-pet-scale", listener: () => petScale },
      { channel: "agent:get-position-lock", listener: () => positionLocked },
      { channel: "agent:set-position-lock", listener: setPositionLock },
      { channel: "agent:get-pet-window-bounds", listener: getPetWindowBounds },
      { channel: "agent:set-pet-window-position", listener: setPetWindowPosition },
      { channel: "agent:update-pet-window-layout", listener: updatePetWindowLayout },
      { channel: "agent:update-bubble-window-size", listener: updateBubbleWindowSize }
    ],
    listeners: [
      { channel: "agent:set-pet-mouse-passthrough", listener: setMousePassthrough },
      { channel: "agent:show-pet-context-menu", listener: showContextMenu }
    ],
    snapshot: () => ({
      operations: Object.fromEntries(operations),
      bubbleContentSize: { ...bubbleContentSize },
      interestBubbleWokenForTask,
      petScale,
      positionLocked
    })
  });

  return {
    ...runtime,
    getBubbleContentSize: () => ({ ...bubbleContentSize }),
    getPetScale: () => petScale,
    getPositionLocked: () => positionLocked,
    setPositionLocked,
    shouldWakeInterestBubble
  };
}
