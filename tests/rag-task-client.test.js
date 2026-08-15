import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRagTaskClient } from "../electron/services/rag-task-client.js";

const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

function controlledSupervisor() {
  const calls = [];
  return {
    calls,
    run(type, payload) {
      let resolve;
      let reject;
      const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
      calls.push({ type, payload, promise, resolve, reject });
      return promise;
    }
  };
}

test("RAG client deduplicates identical work for the same resolved base directory", async () => {
  const supervisor = controlledSupervisor();
  const client = createRagTaskClient({ supervisor });
  const first = client.ensure("data");
  const second = client.ensure(path.resolve("data"));
  assert.equal(first, second);
  await flushTasks();
  assert.equal(supervisor.calls.length, 1);
  supervisor.calls[0].resolve({ rebuilt: false });
  assert.deepEqual(await first, { rebuilt: false });
});

test("RAG client does not globally serialize different base directories", async () => {
  const supervisor = controlledSupervisor();
  const client = createRagTaskClient({ supervisor });
  const first = client.rebuild("data-a");
  const second = client.rebuild("data-b");
  await flushTasks();
  assert.equal(supervisor.calls.length, 2);
  assert.notEqual(supervisor.calls[0].payload.baseDir, supervisor.calls[1].payload.baseDir);
  supervisor.calls[0].resolve({ files: [], chunks: [] });
  supervisor.calls[1].resolve({ files: [], chunks: [] });
  await Promise.all([first, second]);
});

test("RAG client serializes ensure before a higher-priority explicit rebuild", async () => {
  const supervisor = controlledSupervisor();
  const client = createRagTaskClient({ supervisor });
  const ensure = client.ensure("data");
  await flushTasks();
  const rebuild = client.rebuild("data");
  const duplicateRebuild = client.rebuild(path.resolve("data"));
  assert.equal(rebuild, duplicateRebuild);
  assert.equal(supervisor.calls.length, 1);
  supervisor.calls[0].resolve({ rebuilt: false });
  await ensure;
  await flushTasks();
  assert.equal(supervisor.calls.length, 2);
  assert.deepEqual(supervisor.calls.map((call) => call.type), ["rag:ensure", "rag:rebuild"]);
  supervisor.calls[1].resolve({ files: [], chunks: [] });
  await rebuild;
});

test("RAG ensure joins an active rebuild instead of starting a competing writer", async () => {
  const supervisor = controlledSupervisor();
  const client = createRagTaskClient({ supervisor });
  const rebuild = client.rebuild("data");
  await flushTasks();
  const ensure = client.ensure("data");
  const duplicateEnsure = client.ensure(path.resolve("data"));
  assert.equal(ensure, duplicateEnsure);
  assert.equal(supervisor.calls.length, 1);
  supervisor.calls[0].resolve({ files: ["a"], chunks: ["one", "two"], embeddedCount: 1, updatedAt: "now" });
  await rebuild;
  assert.deepEqual(await ensure, {
    rebuilt: true,
    indexedFileCount: 1,
    indexedChunkCount: 2,
    embeddedChunkCount: 1,
    updatedAt: "now"
  });
});

test("RAG client clears failed work so a later request can retry", async () => {
  const supervisor = controlledSupervisor();
  const client = createRagTaskClient({ supervisor });
  const first = client.rebuild("data");
  await flushTasks();
  supervisor.calls[0].reject(new Error("worker crashed"));
  await assert.rejects(first, /worker crashed/);
  await flushTasks();
  const retry = client.rebuild("data");
  await flushTasks();
  assert.equal(supervisor.calls.length, 2);
  supervisor.calls[1].resolve({ files: [], chunks: [] });
  await retry;
});

test("a RAG task cancelled while queued never reaches the worker", async () => {
  const supervisor = controlledSupervisor();
  const client = createRagTaskClient({ supervisor });
  const ensure = client.ensure("data");
  await flushTasks();
  const controller = new AbortController();
  const rebuild = client.rebuild("data", { signal: controller.signal });
  controller.abort(new Error("no longer needed"));
  supervisor.calls[0].resolve({ rebuilt: false });
  await ensure;
  await assert.rejects(rebuild, /no longer needed/);
  assert.equal(supervisor.calls.length, 1);
});
