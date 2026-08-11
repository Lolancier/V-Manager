import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendRawConversationTurn,
  getMemoryDatabaseStats,
  initializeLocalDatabase,
  withLocalDatabase
} from "../src-agent/local-database.js";

test("imports legacy JSONL once and keeps new raw turns in SQLite", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-db-"));
  const memoryDir = path.join(baseDir, "agent-data", "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(path.join(memoryDir, "conversation.jsonl"), `${JSON.stringify({
    timestamp: "2026-08-09T10:00:00.000Z", user: "早上好", assistant: "早上好。"
  })}\n`, "utf8");

  await initializeLocalDatabase(baseDir);
  await initializeLocalDatabase(baseDir);
  assert.equal((await getMemoryDatabaseStats(baseDir)).rawMessageCount, 2);

  await appendRawConversationTurn(baseDir, {
    user: "记住今天要测试", assistant: "好。", personaCardId: "persona-1", personaVersion: 3
  });
  const stats = await getMemoryDatabaseStats(baseDir);
  assert.equal(stats.rawMessageCount, 4);
  assert.equal(stats.conversationCount, 2);

  const rows = await withLocalDatabase(baseDir, ({ db, queryAll }) => queryAll(
    db, "SELECT role, content, persona_card_id, persona_version FROM raw_messages ORDER BY seq_no"
  ));
  assert.deepEqual(rows.at(-1), {
    role: "assistant", content: "好。", persona_card_id: "persona-1", persona_version: 3
  });
});
