import test from "node:test";
import assert from "node:assert/strict";
import { createPersonaCardService, PERSONA_CARD_HANDLE_CHANNELS } from "../electron/services/persona-card-service.js";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";

function ipcDouble() {
  const handlers = new Map();
  return {
    handlers,
    raw: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel)
    }
  };
}

function trustedEvent(url = "http://localhost:5173") {
  const mainFrame = { url };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

function makeHarness() {
  const ipc = ipcDouble();
  const trustedIpc = createTrustedIpcRegistrar(ipc.raw, {
    isDev: true, devServerUrl: "http://localhost:5173", rendererRoot: "dist"
  });
  const cards = [
    { id: "alpha", name: "Alpha", isActive: true },
    { id: "beta", name: "Beta", isActive: false }
  ];
  const broadcasts = [];
  let config = { personaName: "Alpha" };
  const dependencies = {
    activatePersonaCard: async (_baseDir, id) => {
      for (const card of cards) card.isActive = card.id === id;
      return cards.find((card) => card.id === id);
    },
    applyPersonaCardToConfig: (source, card) => ({ ...source, personaName: card.name, activePersonaCardId: card.id }),
    archivePersonaCard: async (_baseDir, id) => { cards.find((card) => card.id === id).status = "archived"; },
    createPersonaCard: async (_baseDir, input) => ({ id: "new", isActive: false, ...input }),
    getActivePersonaCard: async () => cards.find((card) => card.isActive),
    listPersonaCards: async () => cards.map((card) => ({ ...card })),
    loadConfig: async () => ({ source: "stored" }),
    restorePersonaCard: async (_baseDir, id) => { delete cards.find((card) => card.id === id).status; },
    updatePersonaCard: async (_baseDir, id, input) => ({ ...cards.find((card) => card.id === id), ...input, version: 2 })
  };
  const service = createPersonaCardService({
    trustedIpc,
    getBaseDir: () => "base",
    getConfig: () => config,
    setConfig: (next) => { config = next; },
    mergeConfig: (value) => ({ ...value, merged: true }),
    broadcastConfigUpdated: (next) => broadcasts.push(next),
    dependencies
  });
  return { broadcasts, cards, config: () => config, ipc, service };
}

test("persona service owns all card channels with trusted main-frame validation", async () => {
  const harness = makeHarness();
  harness.service.registerIpc();
  assert.deepEqual([...harness.ipc.handlers.keys()], [...PERSONA_CARD_HANDLE_CHANNELS]);

  assert.deepEqual(await harness.ipc.handlers.get("agent:list-persona-cards")(trustedEvent()), harness.cards.map((card) => ({ ...card })));
  assert.deepEqual(await harness.ipc.handlers.get("agent:create-persona-card")(trustedEvent(), { name: "New" }), {
    card: { id: "new", isActive: false, name: "New" },
    cards: harness.cards.map((card) => ({ ...card }))
  });

  const activated = await harness.ipc.handlers.get("agent:activate-persona-card")(trustedEvent(), "beta");
  assert.equal(activated.card.id, "beta");
  assert.equal(activated.cards.find((card) => card.id === "beta").isActive, true);
  assert.equal(activated.config.personaName, "Beta");
  assert.equal(activated.config.activePersonaCardId, "beta");
  assert.equal(harness.config().personaName, "Beta");
  assert.deepEqual(harness.broadcasts.at(-1), activated.config);

  assert.throws(() => harness.ipc.handlers.get("agent:list-persona-cards")({ senderFrame: { url: "http://localhost:5173" }, sender: { mainFrame: { url: "http://localhost:5173" } } }), /拒绝/);
  assert.throws(() => harness.ipc.handlers.get("agent:list-persona-cards")(trustedEvent("https://example.com")), /拒绝/);
  await harness.service.dispose();
  assert.equal(harness.ipc.handlers.size, 0);
  await harness.service.dispose();
});

test("persona service preserves inactive update and archive/restore return shapes", async () => {
  const harness = makeHarness();
  harness.service.registerIpc();
  const inactive = await harness.ipc.handlers.get("agent:update-persona-card")(trustedEvent(), "beta", { name: "Beta II" });
  assert.equal(inactive.card.id, "beta");
  assert.equal(inactive.card.version, 2);
  assert.equal(inactive.cards.length, 2);

  await harness.ipc.handlers.get("agent:archive-persona-card")(trustedEvent(), "beta");
  assert.equal(harness.cards.find((card) => card.id === "beta").status, "archived");
  await harness.ipc.handlers.get("agent:restore-persona-card")(trustedEvent(), "beta");
  assert.equal(harness.cards.find((card) => card.id === "beta").status, undefined);
});

test("persona service has lifecycle snapshots and rollback-safe registration", async () => {
  const harness = makeHarness();
  await harness.service.start();
  assert.equal(harness.service.snapshot().started, true);
  harness.service.stop();
  assert.equal(harness.service.snapshot().started, false);
  harness.service.dispose();

  const handlers = new Set();
  const service = createPersonaCardService({
    trustedIpc: {
      handle(channel) {
        if (channel === "agent:create-persona-card") throw new Error("failed");
        handlers.add(channel);
      },
      removeHandler: (channel) => handlers.delete(channel)
    },
    getBaseDir: () => "base",
    getConfig: () => ({}),
    setConfig: () => {},
    mergeConfig: (value) => value,
    dependencies: {}
  });
  assert.throws(() => service.registerIpc(), /failed/);
  assert.equal(handlers.size, 0);
});
