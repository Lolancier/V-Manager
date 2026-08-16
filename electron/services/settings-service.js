import {
  getConfigPath,
  listKnowledgeFiles,
  loadConfig,
  saveConfig
} from "../../src-agent/core.js";
import { testAstrBotConnection } from "../../src-agent/astrbot-client.js";
import { getMemoryDatabaseStats } from "../../src-agent/local-database.js";
import {
  getActivePersonaCard,
  applyPersonaCardToConfig,
  listPersonaCards
} from "../../src-agent/persona-cards.js";
import { loadRelationshipProfile, resetRelationshipProfile as resetStoredRelationshipProfile } from "../../src-agent/relationship-engine.js";

export const SETTINGS_HANDLE_CHANNELS = Object.freeze([
  "agent:get-bootstrap",
  "agent:get-startup-status",
  "agent:save-config",
  "agent:test-astrbot",
  "agent:get-relationship-profile",
  "agent:reset-relationship-profile"
]);

const defaultDependencies = {
  getActivePersonaCard,
  applyPersonaCardToConfig,
  getConfigPath,
  getMemoryDatabaseStats,
  listKnowledgeFiles,
  listPersonaCards,
  loadConfig,
  loadRelationshipProfile,
  resetStoredRelationshipProfile,
  saveConfig,
  testAstrBotConnection
};

const bootstrapAbilities = [
  { id: "chat", name: "自然对话", status: "ready", detail: "已接入人格设定和本地知识检索。" },
  { id: "relationship", name: "情绪与好感", status: "ready", detail: "本地计算情绪变化和关系阶段，并持续影响回复语气与 Live2D 神态。" },
  { id: "proactive", name: "主动陪伴", status: "ready", detail: "根据连续工作、空闲状态、安静时段和每日上限提供本地健康关怀，并管理 Vivi 的休息节奏。" },
  { id: "schedules", name: "提醒与电源计划", status: "ready", detail: "支持本地提醒，以及经二次确认的定时关机和重启；所有计划均可查看和取消。" },
  { id: "memory", name: "本地记忆/RAG", status: "ready", detail: "从本地知识库检索相关片段参与回答。" },
  { id: "resource", name: "资源查看", status: "ready", detail: "可查看 CPU、内存、运行进程和当前前台应用数量。" },
  { id: "launcher", name: "应用启动", status: "ready", detail: "已接入本地执行层，可直接启动常见应用，也支持传入本地 exe 路径。" },
  { id: "code-agent", name: "代码代理", status: "ready", detail: "可在当前工作区搜索和读取代码；文件修改与开发命令必须经用户明确确认后执行。" },
  { id: "browser", name: "浏览器搜索", status: "ready", detail: "可在系统默认浏览器中打开网址，并使用 Bing、Google 或百度搜索。" },
  { id: "vscode", name: "VS Code 适配", status: "ready", detail: "可用 VS Code 打开本地文件或工作区，并定位到指定文件行。" },
  { id: "filesystem", name: "安全文件管家", status: "ready", detail: "支持只读扫描、整理预览、按类型/日期归档、隔离、操作日志与撤销；删除仅进入 Windows 回收站。" },
  {
    id: "messenger",
    name: "消息联动",
    status: "planned",
    detail: "AstrBot、微信代发、消息读取与自动回复统一归入后续路线，本阶段不作为正式能力开放。"
  }
];

export function createSettingsService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const registeredChannels = new Set();
  let started = false;
  let disposed = false;

  const baseDir = () => options.getBaseDir();

  function register(channel, listener) {
    options.trustedIpc.handle(channel, listener);
    registeredChannels.add(channel);
  }

  async function getBootstrap() {
    const storedConfig = options.mergeConfig(await dependencies.loadConfig(baseDir()));
    const runtimePersona = await options.loadRuntimePersona(storedConfig);
    const knowledgeFiles = await dependencies.listKnowledgeFiles(baseDir());
    const relationshipProfile = await dependencies.loadRelationshipProfile(baseDir());
    const personaCards = await dependencies.listPersonaCards(baseDir());
    const memoryDatabase = await dependencies.getMemoryDatabaseStats(baseDir());

    return {
      config: runtimePersona.config,
      activePersonaCard: runtimePersona.card,
      personaCards,
      memoryDatabase,
      startupDiagnostics: options.getStartupDiagnostics(),
      relationshipProfile,
      live2dModels: options.getLive2DModels(),
      knowledgeFiles,
      runtime: {
        mode: "desktop",
        configPath: dependencies.getConfigPath(baseDir())
      },
      abilities: bootstrapAbilities
    };
  }

  async function saveConfig(_event, nextConfig) {
    const mergedConfig = options.mergeConfig(nextConfig);
    await dependencies.saveConfig(baseDir(), mergedConfig);
    const previousConfig = options.getConfig();
    await options.beforeConfigApplied?.(previousConfig, mergedConfig);
    const runtimePersona = await options.loadRuntimePersona(mergedConfig);
    await options.afterConfigApplied?.(runtimePersona.config);
    return runtimePersona.config;
  }

  async function testAstrBot(_event, astrbotOverride) {
    const config = options.mergeConfig(await dependencies.loadConfig(baseDir()));
    try {
      const result = await dependencies.testAstrBotConnection({ ...config.astrbot, ...(astrbotOverride ?? {}) });
      return { ok: true, message: `AstrBot 已连接，发现 ${result.bots.length} 个可用机器人/平台。`, bots: result.bots };
    } catch (error) {
      return { ok: false, message: `AstrBot 连接失败：${error.message}`, bots: [] };
    }
  }

  async function resetRelationshipProfile() {
    const profile = await dependencies.resetStoredRelationshipProfile(baseDir());
    options.broadcastRelationshipProfile?.(profile);
    return profile;
  }

  function registerIpc() {
    if (disposed) throw new Error("设置服务已经释放。");
    try {
      register("agent:get-bootstrap", () => getBootstrap());
      register("agent:get-startup-status", () => options.getStartupStatus());
      register("agent:save-config", saveConfig);
      register("agent:test-astrbot", testAstrBot);
      register("agent:get-relationship-profile", () => dependencies.loadRelationshipProfile(baseDir()));
      register("agent:reset-relationship-profile", resetRelationshipProfile);
    } catch (error) {
      for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
      registeredChannels.clear();
      throw error;
    }
    return service;
  }

  function start() {
    if (disposed) throw new Error("设置服务已经释放。");
    started = true;
    return Promise.resolve(snapshot());
  }

  function stop() {
    started = false;
    return snapshot();
  }

  function dispose() {
    if (disposed) return stop();
    disposed = true;
    const result = stop();
    for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
    registeredChannels.clear();
    return result;
  }

  function snapshot() {
    return {
      started,
      disposed,
      channels: [...registeredChannels]
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
