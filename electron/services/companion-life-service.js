import {
  getFollowUpCandidate,
  markCommitmentFollowedUp
} from "../../src-agent/companion-memory.js";
import { loadConfig } from "../../src-agent/core.js";
import {
  evaluateLifeTick,
  loadLifeState,
  pauseProactiveForToday,
  recordOwnerInteraction,
  resetWorkSession,
  saveLifeState
} from "../../src-agent/proactive-engine.js";
import { loadRelationshipProfile, recordPetTouch } from "../../src-agent/relationship-engine.js";
import { createTrustedDomainIpcService } from "./trusted-domain-ipc-service.js";

export const COMPANION_LIFE_HANDLE_CHANNELS = Object.freeze([
  "agent:pet-touch",
  "agent:get-life-state",
  "agent:pause-proactive-today",
  "agent:reset-work-session"
]);
export const COMPANION_LIFE_IPC_MANIFEST = Object.freeze({
  handles: COMPANION_LIFE_HANDLE_CHANNELS,
  listeners: []
});

const defaultDependencies = {
  evaluateLifeTick,
  getFollowUpCandidate,
  loadConfig,
  loadLifeState,
  loadRelationshipProfile,
  markCommitmentFollowedUp,
  pauseProactiveForToday,
  recordOwnerInteraction,
  recordPetTouch,
  resetWorkSession,
  saveLifeState
};

export function createCompanionLifeService(options) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) };
  let lastPetTouchAt = 0;
  let lifeState = null;
  let proactiveTimer = null;
  let tickPromise = null;
  let tickRunning = false;
  let ownerInteractionPromise = null;
  let ownerInteractionTail = Promise.resolve();
  let ownerInteractionPending = 0;
  let ownerInteractionRevision = 0;
  let ownerInteractionUpdateRunning = false;
  let engineStarted = false;
  let generation = 0;
  let activePetTouchPromise = null;
  let serviceDisposed = false;

  function ownerInteractionIdleSeconds(state = lifeState, now = new Date()) {
    const lastInteraction = Date.parse(state?.lastInteractionAt || state?.updatedAt || "");
    return Number.isFinite(lastInteraction)
      ? Math.max(0, (now.getTime() - lastInteraction) / 1000)
      : 0;
  }

  function commitLifeState(state) {
    lifeState = state;
    options.onLifeStateUpdated?.(state);
    return state;
  }

  async function getLifeState() {
    const stateGeneration = generation;
    const current = lifeState ?? await dependencies.loadLifeState(options.getBaseDir());
    if (stateGeneration !== generation) return lifeState;
    return commitLifeState(current);
  }

  async function updateLifeState(operation) {
    const stateGeneration = generation;
    const state = await operation(options.getBaseDir());
    if (stateGeneration !== generation) return lifeState;
    return commitLifeState(state);
  }

  async function markOwnerInteraction(now = new Date()) {
    if (serviceDisposed) return lifeState;
    const interactionGeneration = generation;
    ownerInteractionRevision += 1;
    ownerInteractionPending += 1;
    ownerInteractionUpdateRunning = true;
    const previous = ownerInteractionTail;
    let interactionPromise;
    interactionPromise = previous.catch(() => undefined).then(async () => {
      try {
        if (interactionGeneration !== generation || serviceDisposed) return lifeState;
        const state = await dependencies.recordOwnerInteraction(options.getBaseDir(), lifeState, now);
        if (interactionGeneration !== generation || serviceDisposed) return lifeState;
        return commitLifeState(state);
      } finally {
        ownerInteractionPending = Math.max(0, ownerInteractionPending - 1);
        ownerInteractionUpdateRunning = ownerInteractionPending > 0;
        if (ownerInteractionPromise === interactionPromise) ownerInteractionPromise = null;
      }
    });
    ownerInteractionTail = interactionPromise;
    ownerInteractionPromise = interactionPromise;
    return interactionPromise;
  }

  async function tick() {
    if (tickRunning || ownerInteractionUpdateRunning || !options.isHostReady?.()) return;
    const tickGeneration = generation;
    tickRunning = true;
    tickPromise = (async () => {
      try {
        const interactionRevisionAtStart = ownerInteractionRevision;
        const now = new Date();
        const previous = lifeState ?? await dependencies.loadLifeState(options.getBaseDir(), now);
        await options.reconcileCompletedReminders?.();
        const companion = await dependencies.getFollowUpCandidate(options.getBaseDir(), now);
        const relationship = await dependencies.loadRelationshipProfile(options.getBaseDir());
        const config = options.mergeConfig(await dependencies.loadConfig(options.getBaseDir()));
        const interestSettings = options.getInterestSettings(config);
        const result = dependencies.evaluateLifeTick(previous, config.proactive, {
          now,
          interactionIdleSeconds: ownerInteractionIdleSeconds(previous, now),
          interruptionScore: companion.store.feedback.interruptionScore,
          followUpCandidate: companion.candidate,
          relationshipStage: relationship.affection.stage,
          autonomousLifeEnabled: interestSettings.enabled && interestSettings.autonomousLifeEnabled
        });
        if (tickGeneration !== generation || interactionRevisionAtStart !== ownerInteractionRevision) return;
        const savedState = await dependencies.saveLifeState(options.getBaseDir(), result.state);
        if (tickGeneration !== generation || serviceDisposed) return;
        commitLifeState(savedState);
        for (const event of result.events) {
          if (tickGeneration !== generation || serviceDisposed) return;
          publishProactiveEvent(event);
          if (event.kind === "commitment_followup" && companion.candidate) {
            await dependencies.markCommitmentFollowedUp(options.getBaseDir(), companion.candidate.id, now);
          }
        }
      } catch (error) {
        if (tickGeneration === generation && !serviceDisposed) options.onError?.("life tick", error);
      } finally {
        if (tickGeneration === generation || serviceDisposed) tickRunning = false;
        if (tickPromise === runningTick) tickPromise = null;
      }
    })();
    const runningTick = tickPromise;
    return tickPromise;
  }

  function startEngine() {
    if (!engineStarted || proactiveTimer || !options.isHostReady?.()) return;
    tickPromise = tick();
    proactiveTimer = options.setInterval?.(() => {
      tickPromise = tick();
    }, options.tickIntervalMs || 30_000);
  }

  function stopEngine() {
    generation += 1;
    if (proactiveTimer) options.clearInterval?.(proactiveTimer);
    proactiveTimer = null;
    const pendingTick = tickPromise;
    const pendingOwnerInteraction = ownerInteractionPromise;
    const pendingPetTouch = activePetTouchPromise;
    const pendingWork = [pendingTick, pendingOwnerInteraction, pendingPetTouch].filter(Boolean);
    activePetTouchPromise = null;
    return Promise.allSettled(pendingWork).then(() => {
      if (tickPromise === pendingTick) tickPromise = null;
      if (ownerInteractionPromise === pendingOwnerInteraction) ownerInteractionPromise = null;
      tickRunning = false;
      ownerInteractionUpdateRunning = ownerInteractionPending > 0;
    });
  }

  async function restoreLifeState() {
    if (serviceDisposed) return lifeState;
    const restoreGeneration = generation;
    lifeState = await dependencies.loadLifeState(options.getBaseDir());
    if (restoreGeneration !== generation) return lifeState;
    return lifeState;
  }

  function publishProactiveEvent(event) {
    const state = options.chatStateStore.appendProactiveEvent(event);
    options.onProactiveEvent?.(event, state);
    return state;
  }

  function publishInterestInteraction(message, mood = "thinking", userText = "") {
    const content = typeof message === "object" && message ? message.message : message;
    const state = options.chatStateStore.appendLocalInteraction({
      userText,
      message: content,
      lastReplyMeta: {
        responseMode: "local_tool",
        usedKnowledge: false,
        knowledgeCount: 0,
        knowledgeFiles: [],
        fallbackReason: "",
        model: "local-interest-state",
        detectedMood: mood,
        sourceLabel: "私密空间创作状态"
      }
    });
    options.onInterestInteraction?.(content, mood);
    return state;
  }

  async function runPetTouch() {
    const touchGeneration = generation;
    await markOwnerInteraction();
    if (touchGeneration !== generation) return { ok: false, busy: true };
    if (options.isAutonomousBusy()) {
      const reply = await options.getCaughtInterestReply();
      publishInterestInteraction(reply, "surprised");
      const chatState = options.chatStateStore.getState();
      return {
        ok: true,
        busy: true,
        interestBusy: true,
        reply: chatState.messages.at(-1).content,
        mood: "surprised"
      };
    }

    const chatState = options.chatStateStore.getState();
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
    if (touchGeneration !== generation) return { ok: false, busy: true };
    options.chatStateStore.appendAssistant(reaction.reply, {
      responseMode: "local_tool",
      usedKnowledge: false,
      knowledgeCount: 0,
      knowledgeFiles: [],
      fallbackReason: "",
      model: "local-relationship-engine",
      detectedMood: reaction.mood,
      relationship: reaction.profile,
      sourceLabel: "触碰互动"
    }, { replaceLastTouch: true });
    options.broadcastRelationshipProfile(reaction.profile);
    options.broadcastMoodUpdate({
      phase: "final",
      mood: reaction.mood,
      faceParams: reaction.faceParams,
      reply: reaction.reply
    });
    return { ok: true, ...reaction };
  }

  async function petTouch() {
    if (activePetTouchPromise) return activePetTouchPromise;
    const touchPromise = runPetTouch();
    activePetTouchPromise = touchPromise;
    try {
      return await touchPromise;
    } finally {
      if (activePetTouchPromise === touchPromise) activePetTouchPromise = null;
    }
  }

  const runtime = createTrustedDomainIpcService({
    serviceName: "陪伴生活服务",
    trustedIpc: options.trustedIpc,
    handlers: [
      { channel: "agent:pet-touch", listener: petTouch },
      { channel: "agent:get-life-state", listener: getLifeState },
      { channel: "agent:pause-proactive-today", listener: () => updateLifeState(dependencies.pauseProactiveForToday) },
      { channel: "agent:reset-work-session", listener: () => updateLifeState(dependencies.resetWorkSession) }
    ],
    snapshot: () => ({
      ownerInteractionRunning: ownerInteractionUpdateRunning,
      petTouchCooldownActive: options.now() - lastPetTouchAt < 1400,
      proactiveTickRunning: tickRunning,
      lifeStatePresent: lifeState !== null
    })
  });

  async function start() {
    if (serviceDisposed) throw new Error("陪伴生活服务已经释放。");
    const snapshot = runtime.start();
    engineStarted = true;
    startEngine();
    return snapshot;
  }

  async function stop() {
    await stopEngine();
    engineStarted = false;
    return runtime.stop();
  }

  async function dispose() {
    serviceDisposed = true;
    await stopEngine();
    engineStarted = false;
    return runtime.dispose();
  }

  function registerIpc() {
    runtime.registerIpc();
    return service;
  }

  const service = {
    ...runtime,
    dispose,
    getLifeState: () => lifeState,
    isProactiveBusy: () => tickRunning || ownerInteractionUpdateRunning,
    markOwnerInteraction,
    ownerInteractionIdleSeconds,
    petTouch,
    publishInterestInteraction,
    publishProactiveEvent,
    registerIpc,
    restoreLifeState,
    start,
    startEngine,
    stop
  };
  return service;
}
