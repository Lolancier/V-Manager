import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createUtilityTaskSupervisor } from "../electron/services/utility-task-supervisor.js";

class FakeUtilityProcess extends EventEmitter {
  messages = [];
  killed = false;
  postMessage(message) { this.messages.push(message); }
  kill() { this.killed = true; return true; }
}

test("utility supervisor lazily starts one process and correlates task responses", async () => {
  const child = new FakeUtilityProcess();
  let forks = 0;
  const supervisor = createUtilityTaskSupervisor({
    entryPoint: "worker.js",
    fork: () => { forks += 1; return child; }
  });
  const resultPromise = supervisor.run("rag:rebuild", { baseDir: "data" });
  assert.equal(forks, 1);
  assert.equal(supervisor.snapshot().pending[0], "rag:rebuild");
  const request = child.messages[0];
  child.emit("message", { taskId: request.taskId, ok: true, result: { rebuilt: true } });
  assert.deepEqual(await resultPromise, { rebuilt: true });
  assert.deepEqual(supervisor.snapshot().pending, []);
  assert.equal(supervisor.close(), true);
  assert.equal(child.killed, true);
});

test("utility supervisor rejects pending work when its process exits", async () => {
  const child = new FakeUtilityProcess();
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child });
  const result = supervisor.run("rag:ensure", {}).catch((error) => error.message);
  child.emit("exit", 9);
  assert.match(await result, /意外退出/);
});
