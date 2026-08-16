import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureRagFiles, loadRagIndex, saveRagIndex } from "../src-agent/rag.js";

test("RAG index replacement is atomic and leaves no temporary file", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-rag-write-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  await ensureRagFiles(baseDir);
  await saveRagIndex(baseDir, {
    version: 3,
    files: [{ path: "knowledge.md" }],
    chunks: [{ id: "knowledge.md#0", content: "hello" }],
    embeddedCount: 0
  });
  const index = await loadRagIndex(baseDir);
  assert.equal(index.files.length, 1);
  assert.equal(index.chunks.length, 1);
  const ragDir = path.join(baseDir, "agent-data", "rag");
  assert.equal((await fs.readdir(ragDir)).some((name) => name.endsWith(".tmp")), false);
});
