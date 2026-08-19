import path from "node:path";

export function mergeAgentConfig(nextConfig = {}, { defaultConfig, normalizeInterestConfig }) {
  const { calendar: _removedCalendar, ...supportedConfig } = nextConfig;
  return {
    ...defaultConfig,
    ...supportedConfig,
    deepseek: {
      ...defaultConfig.deepseek,
      ...(nextConfig.deepseek ?? {}),
      providers: { ...(defaultConfig.deepseek?.providers ?? {}), ...(nextConfig.deepseek?.providers ?? {}) }
    },
    embedding: { ...defaultConfig.embedding, ...(nextConfig.embedding ?? {}) },
    astrbot: {
      ...defaultConfig.astrbot,
      ...(nextConfig.astrbot ?? {}),
      contactMap: { ...defaultConfig.astrbot.contactMap, ...(nextConfig.astrbot?.contactMap ?? {}) }
    },
    appearance: { ...defaultConfig.appearance, ...(nextConfig.appearance ?? {}) },
    voice: {
      ...defaultConfig.voice,
      ...(nextConfig.voice ?? {}),
      baseUrl: nextConfig.voice?.baseUrl || defaultConfig.voice.baseUrl,
      model: nextConfig.voice?.model || defaultConfig.voice.model,
      voice: nextConfig.voice?.voice || defaultConfig.voice.voice
    },
    speechInput: { ...defaultConfig.speechInput, ...(nextConfig.speechInput ?? {}) },
    relationship: { ...defaultConfig.relationship, ...(nextConfig.relationship ?? {}) },
    proactive: { ...defaultConfig.proactive, ...(nextConfig.proactive ?? {}) },
    interests: normalizeInterestConfig(nextConfig.interests),
    memory: { ...defaultConfig.memory, ...(nextConfig.memory ?? {}) }
  };
}

export function getModelContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".js") return "application/javascript";
  if (extension === ".css") return "text/css";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function getTitleBarOverlay(theme = "light", forceDark = false) {
  const dark = forceDark || theme === "dark";
  return {
    color: dark ? "#111417" : "#ffffff",
    symbolColor: dark ? "#dce3e6" : "#31383c",
    height: 36
  };
}

export function createViewLoader({ isDev, devServerUrl, getAppPath }) {
  function getRendererPage(view) {
    return view === "pet" ? "index.html" : `${view}.html`;
  }

  function loadView(win, view) {
    const page = getRendererPage(view);
    if (isDev) {
      win.loadURL(`${devServerUrl}/${page}`);
    } else {
      win.loadFile(path.join(getAppPath(), "dist", page));
    }
  }

  return {
    getRendererPage,
    loadView
  };
}

export function getPetWindowSize(scale) {
  const normalized = Math.max(0.8, Math.min(1.5, scale));
  return {
    width: Math.round(640 * normalized),
    height: Math.round(960 * normalized)
  };
}

export function getWindowBoundsNearPet({ petWindow, screen, width, height, verticalOffset }) {
  if (!petWindow || petWindow.isDestroyed()) return { width, height };

  const petBounds = petWindow.getBounds();
  const workArea = screen.getDisplayMatching(petBounds).workArea;
  const gap = 18;
  const spaceRight = workArea.x + workArea.width - (petBounds.x + petBounds.width);
  const spaceLeft = petBounds.x - workArea.x;
  const placeRight = spaceRight >= width + gap || spaceRight >= spaceLeft;
  const desiredX = placeRight
    ? petBounds.x + petBounds.width + gap
    : petBounds.x - width - gap;
  const desiredY = petBounds.y + verticalOffset;

  return {
    x: Math.round(Math.max(workArea.x, Math.min(desiredX, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(desiredY, workArea.y + workArea.height - height))),
    width,
    height
  };
}

export function getChatWindowBounds({ petWindow, screen }) {
  return getWindowBoundsNearPet({ petWindow, screen, width: 1120, height: 720, verticalOffset: 48 });
}

export function getComposerWindowBounds({ petWindow, screen }) {
  return getWindowBoundsNearPet({ petWindow, screen, width: 430, height: 310, verticalOffset: 180 });
}

export function getBubbleWindowBounds({ petWindow, screen, getBubbleContentSize }) {
  if (!petWindow || petWindow.isDestroyed()) {
    const contentSize = getBubbleContentSize();
    return {
      width: contentSize.width,
      height: contentSize.height,
      placement: "right"
    };
  }

  const bounds = petWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const contentSize = getBubbleContentSize();
  const width = Math.min(contentSize.width, workArea.width - 24);
  const height = Math.min(contentSize.height, workArea.height - 24);
  const petCenterX = bounds.x + bounds.width / 2;
  const placement = petCenterX < workArea.x + workArea.width / 2 ? "right" : "left";
  const desiredX = placement === "right"
    ? bounds.x + bounds.width * 0.62
    : bounds.x + bounds.width * 0.38 - width;
  const desiredY = bounds.y + bounds.height * 0.08;

  return {
    x: Math.round(Math.max(workArea.x + 12, Math.min(desiredX, workArea.x + workArea.width - width - 12))),
    y: Math.round(Math.max(workArea.y + 12, Math.min(desiredY, workArea.y + workArea.height - height - 12))),
    width: Math.round(width),
    height: Math.round(height),
    placement
  };
}
