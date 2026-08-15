import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { MEMORY_IPC_CHANNELS, registerMemoryServiceIpc } from "../electron/services/memory-service.js";
import { createTrustedIpcRegistrar } from "../electron/ipc-security.js";

test("memory service owns a removable, domain-scoped IPC surface", async () => {
  const handlers = new Map();
  const removed = [];
  const calls = [];
  const dispose = registerMemoryServiceIpc({
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => removed.push(channel)
    },
    getBaseDir: () => "memory-root",
    getMemoryDatabaseStats: async (baseDir) => ({ baseDir }),
    reconcileCompletedReminderCommitments: async () => ({ commitments: [] }),
    getRagStatus: async () => ({ ready: true }),
    rebuildKnowledgeIndex: async () => ({ rebuilt: true }),
    testEmbeddingConnection: async () => ({ ok: true }),
    clearConversationHistory: async (baseDir) => calls.push(["history", baseDir]),
    clearCompanionMemory: async (baseDir) => calls.push(["companion", baseDir]),
    onCleared: () => true
  });

  assert.deepEqual([...handlers.keys()], [...MEMORY_IPC_CHANNELS]);
  assert.deepEqual(await handlers.get("agent:get-memory-database-stats")(), { baseDir: "memory-root" });
  assert.equal(await handlers.get("agent:clear-memory")(), true);
  assert.deepEqual(calls, [["history", "memory-root"], ["companion", "memory-root"]]);
  dispose();
  assert.deepEqual(removed, [...MEMORY_IPC_CHANNELS]);
});

test("memory service composes with the trusted IPC registrar", async () => {
  const handlers = new Map();
  const registrar = createTrustedIpcRegistrar({
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel)
  }, {
    isDev: true,
    devServerUrl: "http://localhost:5173",
    rendererRoot: path.resolve("dist")
  });
  let serviceCalls = 0;
  registerMemoryServiceIpc({
    ipcMain: registrar,
    getBaseDir: () => "memory-root",
    getMemoryDatabaseStats: async () => { serviceCalls += 1; return { ok: true }; },
    reconcileCompletedReminderCommitments: async () => ({}),
    getRagStatus: async () => ({}),
    rebuildKnowledgeIndex: async () => ({}),
    testEmbeddingConnection: async () => ({}),
    clearConversationHistory: async () => {},
    clearCompanionMemory: async () => {},
    onCleared: () => true
  });

  const mainFrame = { url: "http://localhost:5173/?view=settings" };
  const trustedEvent = { senderFrame: mainFrame, sender: { mainFrame } };
  assert.deepEqual(await handlers.get("agent:get-memory-database-stats")(trustedEvent), { ok: true });
  const foreignMainFrame = { url: "https://example.com" };
  assert.throws(
    () => handlers.get("agent:get-memory-database-stats")({ senderFrame: foreignMainFrame, sender: { mainFrame: foreignMainFrame } }),
    /拒绝/
  );
  assert.throws(
    () => handlers.get("agent:get-memory-database-stats")({ senderFrame: { url: mainFrame.url }, sender: { mainFrame } }),
    /拒绝/
  );
  assert.equal(serviceCalls, 1);
});
