import { Menu, nativeImage } from "electron";

export function createTrayIcon() {
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, red, green, blue, alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    bitmap[offset] = blue;
    bitmap[offset + 1] = green;
    bitmap[offset + 2] = red;
    bitmap[offset + 3] = alpha;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - 15.5;
      const dy = y - 15.5;
      if (dx * dx + dy * dy <= 14 * 14) setPixel(x, y, 31, 174, 161);
    }
  }
  for (let y = 8; y <= 22; y += 1) {
    const progress = (y - 8) / 14;
    const leftX = Math.round(9 + progress * 6);
    const rightX = Math.round(22 - progress * 6);
    for (let width = -1; width <= 1; width += 1) {
      setPixel(leftX + width, y, 255, 255, 255);
      setPixel(rightX + width, y, 255, 255, 255);
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 }).resize({ width: 16, height: 16 });
}

export function buildTrayContextMenu(options) {
  const {
    petVisible,
    currentAgentConfig,
    isAutoLaunchEnabled,
    onTogglePet,
    onOpenChat,
    onOpenComposer,
    onOpenCode,
    onOpenSettings,
    onToggleHoverAutoHide,
    onToggleAutoLaunch,
    onQuit
  } = options;
  return Menu.buildFromTemplate([
    { label: "Vivi 正在后台运行", enabled: false },
    { type: "separator" },
    { label: petVisible ? "隐藏桌宠" : "显示桌宠", click: () => onTogglePet(petVisible) },
    { label: "打开聊天栏", click: () => onOpenChat() },
    { label: "快速输入", click: () => onOpenComposer() },
    { label: "代码工作台", click: () => onOpenCode() },
    { label: "设置", click: () => onOpenSettings() },
    {
      label: "鼠标移入时隐藏并穿透",
      type: "checkbox",
      checked: currentAgentConfig.appearance?.hoverAutoHide === true,
      click: (menuItem) => { void onToggleHoverAutoHide(menuItem.checked); }
    },
    { type: "separator" },
    {
      label: "开机自动启动",
      type: "checkbox",
      checked: isAutoLaunchEnabled,
      click: (menuItem) => onToggleAutoLaunch(menuItem.checked)
    },
    { type: "separator" },
    {
      label: "退出 V-Manager",
      click: () => onQuit()
    }
  ]);
}

export function buildPetContextMenu(options) {
  const {
    live2dModels,
    selectedModelId,
    positionLocked,
    isAlwaysOnTop,
    currentAgentConfig,
    onFocusComposer,
    onClearBubble,
    onOpenHistoryPanel,
    onOpenExpressionWindow,
    onPetAction,
    onSelectModel,
    onOpenScaleWindow,
    onOpenCodeWindow,
    onOpenSettingsWindow,
    onTogglePositionLock,
    onToggleAlwaysOnTop,
    onToggleHoverAutoHide,
    onCenterPet,
    onHidePet,
    onQuit
  } = options;

  return Menu.buildFromTemplate([
    {
      label: "对话",
      submenu: [
        {
          label: "打开对话窗口",
          click: () => onFocusComposer()
        },
        {
          label: "清空气泡",
          click: () => onClearBubble()
        },
        {
          label: "打开聊天栏",
          click: () => onOpenHistoryPanel()
        }
      ]
    },
    {
      label: "角色",
      submenu: [
        {
          label: "表情与动作",
          submenu: [
            {
              label: "打开表情面板",
              click: () => onOpenExpressionWindow()
            },
            { type: "separator" },
            {
              label: "待机",
              click: () => onPetAction("pet-idle")
            },
            {
              label: "开心",
              click: () => onPetAction("pet-happy")
            },
            {
              label: "思考",
              click: () => onPetAction("pet-thinking")
            }
          ]
        },
        {
          label: "切换模型",
          submenu: live2dModels.map((model) => ({
            label: model.label,
            type: "radio",
            checked: selectedModelId === model.id,
            click: () => { void onSelectModel(model.id); }
          }))
        },
        {
          label: "调整模型大小",
          click: () => onOpenScaleWindow()
        }
      ]
    },
    {
      label: "开发",
      submenu: [
        {
          label: "打开代码工作台",
          click: () => onOpenCodeWindow()
        }
      ]
    },
    {
      label: "设置",
      click: () => onOpenSettingsWindow()
    },
    {
      label: "窗口",
      submenu: [
        {
          label: "固定位置",
          type: "checkbox",
          checked: positionLocked,
          click: () => onTogglePositionLock()
        },
        { type: "separator" },
        {
          label: isAlwaysOnTop ? "取消置顶" : "保持置顶",
          click: () => onToggleAlwaysOnTop()
        },
        {
          label: "鼠标移入时隐藏并穿透",
          type: "checkbox",
          checked: currentAgentConfig.appearance?.hoverAutoHide === true,
          click: (menuItem) => { void onToggleHoverAutoHide(menuItem.checked); }
        },
        {
          label: "重置位置",
          click: () => onCenterPet()
        }
      ]
    },
    {
      type: "separator"
    },
    {
      label: "隐藏桌宠",
      click: () => onHidePet()
    },
    {
      label: "退出",
      click: () => onQuit()
    }
  ]);
}
