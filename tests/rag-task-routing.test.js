import test from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../src-agent/tool-executor.js";
import { handle as handleAppCommand } from "../src-agent/executors/app-executor.js";

test("model RAG rebuild tool uses the injected background client", async () => {
  const calls = [];
  const result = await executeTool("rebuild_rag_index", {}, {
    baseDir: "electron-data",
    ragClient: { rebuild: async (baseDir) => { calls.push(baseDir); return { files: ["a"], chunks: ["b", "c"] }; } }
  });
  assert.deepEqual(calls, ["electron-data"]);
  assert.deepEqual(result, { ok: true, files: 1, chunks: 2 });
});

test("local RAG rebuild command uses the injected background client", async () => {
  const calls = [];
  const result = await handleAppCommand("请重建知识库索引", {
    baseDir: "electron-data",
    ragClient: { rebuild: async (baseDir) => { calls.push(baseDir); return { files: ["a"], chunks: ["b"] }; } }
  });
  assert.deepEqual(calls, ["electron-data"]);
  assert.match(result.reply, /1 个文件、1 个片段/);
  assert.equal(result.meta.localTool, "rag_rebuild");
});
