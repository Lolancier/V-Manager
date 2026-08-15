import test from "node:test";
import assert from "node:assert/strict";
import { createUtilityMessageHandler } from "../electron/workers/utility-entry.js";

test("utility entry rejects unknown task types", async () => {
  const messages = [];
  const handle = createUtilityMessageHandler({ handlers: {}, postMessage: (message) => messages.push(message) });
  await handle({ kind: "run", taskId: "unknown-1", type: "rag:unknown", payload: {} });
  assert.equal(messages[0].taskId, "unknown-1");
  assert.equal(messages[0].ok, false);
  assert.match(messages[0].error.message, /不支持/);
});

test("utility entry correlates successful and failed task results", async () => {
  const messages = [];
  const handle = createUtilityMessageHandler({
    handlers: {
      success: async ({ value }) => ({ value }),
      failure: async () => { throw new TypeError("bad task"); }
    },
    postMessage: (message) => messages.push(message)
  });
  await handle({ kind: "run", taskId: "success-1", type: "success", payload: { value: 3 } });
  await handle({ kind: "run", taskId: "failure-1", type: "failure", payload: {} });
  assert.deepEqual(messages[0], { taskId: "success-1", ok: true, result: { value: 3 } });
  assert.equal(messages[1].taskId, "failure-1");
  assert.equal(messages[1].ok, false);
  assert.equal(messages[1].error.name, "TypeError");
});

test("utility cancellation suppresses a late result without claiming to abort underlying IO", async () => {
  const messages = [];
  let release;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const handle = createUtilityMessageHandler({
    handlers: {
      delayed: async () => {
        markStarted();
        return new Promise((resolve) => { release = resolve; });
      }
    },
    postMessage: (message) => messages.push(message)
  });
  const task = handle({ kind: "run", taskId: "delayed-1", type: "delayed", payload: {} });
  await started;
  await handle({ kind: "cancel", taskId: "delayed-1" });
  release({ finished: true });
  await task;
  assert.deepEqual(messages, [{ taskId: "delayed-1", cancelled: true }]);
});

test("utility entry escalates an unrecoverable terminal acknowledgement failure", async () => {
  const failures = [];
  const handle = createUtilityMessageHandler({
    handlers: { success: async () => ({ ok: true }) },
    postMessage: () => { throw new Error("parent closed"); },
    onProtocolFailure: (error) => failures.push(error.message)
  });
  await assert.doesNotReject(handle({ kind: "run", taskId: "post-failure", type: "success", payload: {} }));
  assert.equal(handle.snapshot().terminal, 1);
  await handle({ kind: "cancel", taskId: "post-failure" });
  assert.deepEqual(failures, ["parent closed"]);
  assert.deepEqual(handle.snapshot(), { active: 0, terminal: 0, protocolFailed: true });
});
