export const MEMORY_IPC_CHANNELS = Object.freeze([
  "agent:get-memory-database-stats",
  "agent:get-companion-memory",
  "agent:get-rag-status",
  "agent:rebuild-rag-index",
  "agent:test-embedding",
  "agent:clear-memory"
]);

export function registerMemoryServiceIpc(options) {
  const { ipcMain } = options;
  const baseDir = () => options.getBaseDir();
  const handlers = new Map([
    ["agent:get-memory-database-stats", async () => options.getMemoryDatabaseStats(baseDir())],
    ["agent:get-companion-memory", async () => options.reconcileCompletedReminderCommitments()],
    ["agent:get-rag-status", async () => options.getRagStatus(baseDir())],
    ["agent:rebuild-rag-index", async () => options.rebuildKnowledgeIndex(baseDir())],
    ["agent:test-embedding", async () => options.testEmbeddingConnection(baseDir())],
    ["agent:clear-memory", async () => {
      await options.clearConversationHistory(baseDir());
      await options.clearCompanionMemory(baseDir());
      return options.onCleared();
    }]
  ]);

  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
  return () => {
    for (const channel of handlers.keys()) ipcMain.removeHandler(channel);
  };
}
