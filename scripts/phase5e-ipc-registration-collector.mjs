import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";
import { createChatStateStore } from "../electron/services/chat-state-store.js";
import {
  SYSTEM_RESOURCE_IPC_MANIFEST,
  createSystemResourceService
} from "../electron/services/system-resource-service.js";
import {
  FILE_MANAGER_IPC_MANIFEST,
  createFileManagerService
} from "../electron/services/file-manager-service.js";
import {
  HOST_SHELL_IPC_MANIFEST,
  createHostShellService
} from "../electron/services/host-shell-service.js";
import {
  COMPANION_LIFE_IPC_MANIFEST,
  createCompanionLifeService
} from "../electron/services/companion-life-service.js";
import {
  WINDOW_INTENT_IPC_MANIFEST,
  createWindowIntentService
} from "../electron/services/window-intent-service.js";
import {
  CODE_WORKSPACE_IPC_MANIFEST,
  createCodeWorkspaceService
} from "../electron/services/code-workspace-service.js";
import {
  EXPRESSION_CHAT_STATE_IPC_MANIFEST,
  createExpressionChatStateService
} from "../electron/services/expression-chat-state-service.js";
import {
  PET_WINDOW_LAYOUT_IPC_MANIFEST,
  createPetWindowLayoutService
} from "../electron/services/pet-window-layout-service.js";
import {
  RENDERER_READY_IPC_MANIFEST,
  createRendererReadyService
} from "../electron/services/renderer-ready-service.js";

function createFakeTrustedRegistrar() {
  const handles = [];
  const listeners = [];
  const ipc = {
    handle: (channel, handler) => handles.push({ channel, handler }),
    on: (channel, listener) => {
      listeners.push({ channel, listener });
      return () => {};
    },
    removeHandler: () => {},
    removeListener: () => {}
  };
  return {
    handles,
    listeners,
    trustedIpc: createTrustedIpcRegistrar(ipc, {
      isDev: true,
      devServerUrl: "http://localhost:5173"
    })
  };
}

const factories = {
  systemResource: createSystemResourceService,
  fileManager: createFileManagerService,
  hostShell: createHostShellService,
  companionLife: createCompanionLifeService,
  windowIntent: createWindowIntentService,
  codeWorkspace: createCodeWorkspaceService,
  expressionChatState: createExpressionChatStateService,
  petWindowLayout: createPetWindowLayoutService,
  rendererReady: createRendererReadyService
};

const manifests = {
  systemResource: SYSTEM_RESOURCE_IPC_MANIFEST,
  fileManager: FILE_MANAGER_IPC_MANIFEST,
  hostShell: HOST_SHELL_IPC_MANIFEST,
  companionLife: COMPANION_LIFE_IPC_MANIFEST,
  windowIntent: WINDOW_INTENT_IPC_MANIFEST,
  codeWorkspace: CODE_WORKSPACE_IPC_MANIFEST,
  expressionChatState: EXPRESSION_CHAT_STATE_IPC_MANIFEST,
  petWindowLayout: PET_WINDOW_LAYOUT_IPC_MANIFEST,
  rendererReady: RENDERER_READY_IPC_MANIFEST
};

function serviceOptions() {
  const chatStateStore = createChatStateStore();
  chatStateStore.start();
  return {
    getBaseDir: () => "audit-user-data",
    readLoginItemSettings: () => ({ openAtLogin: false }),
    writeLoginItemSettings: () => {},
    isAutonomousBusy: () => false,
    getCaughtInterestReply: () => ({}),
    isHostReady: () => false,
    broadcastRelationshipProfile: () => {},
    broadcastMoodUpdate: () => {},
    mergeConfig: (config) => config,
    getInterestSettings: () => ({ enabled: false, autonomousLifeEnabled: false }),
    now: () => 0,
    openSettingsWindow: () => true,
    openComposerWindow: () => true,
    openChatWindow: () => true,
    openCodeWindow: () => true,
    openScaleWindow: () => true,
    openExpressionWindow: () => true,
    initialWorkspaceDir: process.cwd(),
    onWorkspaceChanged: () => {},
    showOpenDialog: () => ({ canceled: true, filePaths: [] }),
    chatStateStore,
    broadcastActiveExpressions: () => {},
    initialPetScale: 1,
    initialPositionLocked: false,
    initialBubbleContentSize: { width: 330, height: 180 },
    broadcastPositionLock: () => {},
    isPetWindowActive: () => false,
    getPetWindowBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    setPetWindowBounds: () => {},
    setPetWindowPosition: () => {},
    updateBubbleWindowLayout: () => {},
    getPetWindowSize: () => ({ width: 0, height: 0 }),
    getWorkAreaForBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    broadcastPetScale: () => {},
    isBubbleWindowActive: () => false,
    isSenderBubbleWindow: () => false,
    getBubbleWindowBounds: () => ({ width: 0, height: 0 }),
    isSenderPetWindow: () => false,
    isHoverAutoHideEnabled: () => false,
    setPetMousePassthrough: () => {},
    showPetContextMenu: () => {},
    getStartupStatus: () => ({ phase: "ready" }),
    setRendererModelStatus: () => {},
    releaseStartup: () => {}
  };
}

export async function collectPhase5eIpcRegistrations() {
  const contracts = [];
  for (const [key, factory] of Object.entries(factories)) {
    const registrar = createFakeTrustedRegistrar();
    const service = factory({ ...serviceOptions(), trustedIpc: registrar.trustedIpc });
    service.registerIpc().start();
    await service.dispose();
    contracts.push({
      key,
      manifest: manifests[key],
      registrations: {
        handles: registrar.handles.map(({ channel }) => channel),
        listeners: registrar.listeners.map(({ channel }) => channel)
      }
    });
  }
  return contracts;
}
