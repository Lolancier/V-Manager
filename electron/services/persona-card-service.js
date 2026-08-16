import {
  activatePersonaCard,
  applyPersonaCardToConfig,
  archivePersonaCard,
  createPersonaCard,
  getActivePersonaCard,
  listPersonaCards,
  restorePersonaCard,
  updatePersonaCard
} from "../../src-agent/persona-cards.js";
import { loadConfig } from "../../src-agent/core.js";

export const PERSONA_CARD_HANDLE_CHANNELS = Object.freeze([
  "agent:list-persona-cards",
  "agent:create-persona-card",
  "agent:update-persona-card",
  "agent:activate-persona-card",
  "agent:archive-persona-card",
  "agent:restore-persona-card"
]);

const defaultDependencies = {
  activatePersonaCard,
  applyPersonaCardToConfig,
  archivePersonaCard,
  createPersonaCard,
  getActivePersonaCard,
  listPersonaCards,
  loadConfig,
  restorePersonaCard,
  updatePersonaCard
};

export function createPersonaCardService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  const registeredChannels = new Set();
  let started = false;
  let disposed = false;

  const baseDir = () => options.getBaseDir();

  function register(channel, listener) {
    options.trustedIpc.handle(channel, listener);
    registeredChannels.add(channel);
  }

  async function refreshRuntimePersona(card = null, storedConfig = null) {
    const sourceConfig = storedConfig ?? await dependencies.loadConfig(baseDir());
    const activeCard = card || await dependencies.getActivePersonaCard(baseDir(), storedConfig ?? options.getConfig());
    const config = dependencies.applyPersonaCardToConfig(options.mergeConfig(sourceConfig), activeCard);
    options.setConfig(config);
    options.broadcastConfigUpdated(config);
    return {
      card: activeCard,
      cards: await dependencies.listPersonaCards(baseDir()),
      config
    };
  }

  async function applyRuntimePersona(config) {
    const card = await dependencies.getActivePersonaCard(baseDir(), config);
    return { card, config: dependencies.applyPersonaCardToConfig(config, card) };
  }

  function registerIpc() {
    if (disposed) throw new Error("人物卡服务已经释放。");
    try {
      register("agent:list-persona-cards", () => dependencies.listPersonaCards(baseDir()));
      register("agent:create-persona-card", async (_event, input) => {
        const card = await dependencies.createPersonaCard(baseDir(), input);
        return { card, cards: await dependencies.listPersonaCards(baseDir()) };
      });
      register("agent:update-persona-card", async (_event, cardId, input) => {
        const card = await dependencies.updatePersonaCard(baseDir(), cardId, input);
        const active = (await dependencies.listPersonaCards(baseDir())).find((item) => item.id === cardId)?.isActive;
        return active ? refreshRuntimePersona(card) : { card, cards: await dependencies.listPersonaCards(baseDir()) };
      });
      register("agent:activate-persona-card", async (_event, cardId) => {
        const card = await dependencies.activatePersonaCard(baseDir(), cardId);
        return refreshRuntimePersona(card);
      });
      register("agent:archive-persona-card", async (_event, cardId) => {
        await dependencies.archivePersonaCard(baseDir(), cardId);
        return dependencies.listPersonaCards(baseDir());
      });
      register("agent:restore-persona-card", async (_event, cardId) => {
        await dependencies.restorePersonaCard(baseDir(), cardId);
        return dependencies.listPersonaCards(baseDir());
      });
    } catch (error) {
      for (const channel of registeredChannels) options.trustedIpc.removeHandler(channel);
      registeredChannels.clear();
      throw error;
    }
    return service;
  }

  function start() {
    if (disposed) throw new Error("人物卡服务已经释放。");
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
    applyRuntimePersona,
    dispose,
    refreshRuntimePersona,
    registerIpc,
    snapshot,
    start,
    stop
  };
  return service;
}
