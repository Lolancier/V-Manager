import { loadConfig } from "../../src-agent/core.js";
import {
  loadLifeState,
  pauseProactiveForToday,
  resetWorkSession
} from "../../src-agent/proactive-engine.js";
import { recordPetTouch } from "../../src-agent/relationship-engine.js";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const COMPANION_LIFE_HANDLE_CHANNELS = Object.freeze([
  "agent:pet-touch",
  "agent:get-life-state",
  "agent:pause-proactive-today",
  "agent:reset-work-session"
]);

const defaultDependencies = {
  loadConfig,
  loadLifeState,
  pauseProactiveForToday,
  recordPetTouch,
  resetWorkSession
};

export function createCompanionLifeService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  let lastPetTouchAt = 0;

  async function getLifeState() {
    const current = options.getLifeState() ?? await dependencies.loadLifeState(options.getBaseDir());
    options.setLifeState(current);
    return current;
  }

  async function updateLifeState(operation) {
    const state = await operation(options.getBaseDir());
    options.setLifeState(state);
    options.onLifeStateUpdated?.(state);
    return state;
  }

  async function petTouch() {
    await options.markOwnerInteraction();
    if (options.isAutonomousBusy()) {
      const reply = await options.getCaughtInterestReply();
      options.publishInterestInteraction(reply, "surprised");
      const chatState = options.getChatState();
      return {
        ok: true,
        busy: true,
        interestBusy: true,
        reply: chatState.messages.at(-1).content,
        mood: "surprised"
      };
    }

    const chatState = options.getChatState();
    if (/^(生成中|正在执行|正在查询)/.test(chatState.lastReplyMeta?.sourceLabel || "")) {
      return { ok: false, busy: true };
    }

    const now = options.now();
    const cooldownMs = 1400;
    if (now - lastPetTouchAt < cooldownMs) {
      return { ok: false, cooldownMs: cooldownMs - (now - lastPetTouchAt) };
    }
    lastPetTouchAt = now;

    const config = options.mergeConfig(await dependencies.loadConfig(options.getBaseDir()));
    const reaction = await dependencies.recordPetTouch(options.getBaseDir(), {
      grow: config.relationship?.enabled !== false
    });
    const replacePreviousTouch = chatState.lastReplyMeta?.sourceLabel === "触碰互动"
      && chatState.messages.at(-1)?.role === "assistant";
    const nextMessages = replacePreviousTouch
      ? [...chatState.messages.slice(0, -1), { role: "assistant", content: reaction.reply }]
      : [...chatState.messages, { role: "assistant", content: reaction.reply }];
    const nextChatState = {
      ...chatState,
      messages: nextMessages,
      lastReplyMeta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        model: "local-relationship-engine",
        detectedMood: reaction.mood,
        relationship: reaction.profile,
        sourceLabel: "触碰互动"
      }
    };
    options.setChatState(nextChatState);
    options.broadcastChatState();
    options.broadcastRelationshipProfile(reaction.profile);
    options.broadcastMoodUpdate({
      phase: "final",
      mood: reaction.mood,
      faceParams: reaction.faceParams,
      reply: reaction.reply
    });
    return { ok: true, ...reaction };
  }

  return createTrustedDomainIpcService({
    serviceName: "陪伴生活服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:pet-touch", listener: petTouch },
      { channel: "agent:get-life-state", listener: getLifeState },
      { channel: "agent:pause-proactive-today", listener: () => updateLifeState(dependencies.pauseProactiveForToday) },
      { channel: "agent:reset-work-session", listener: () => updateLifeState(dependencies.resetWorkSession) }
    ],
    snapshot: () => ({ petTouchCooldownActive: options.now() - lastPetTouchAt < 1400 })
  });
}
