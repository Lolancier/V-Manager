import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { createUtilityTaskSupervisor, resolveUtilityEntryPoint } from "../electron/services/utility-task-supervisor.js";
import { createRagTaskClient } from "../electron/services/rag-task-client.js";
import { createUtilityMessageHandler } from "../electron/workers/utility-entry.js";

const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

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

test("utility supervisor times out, suppresses late results, and clears pending state", async () => {
  const child = new FakeUtilityProcess();
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child, timeoutMs: 5 });
  const result = supervisor.run("rag:ensure", {}).catch((error) => error.message);
  const request = child.messages[0];
  assert.match(await result, /超时/);
  assert.deepEqual(child.messages[1], { kind: "cancel", taskId: request.taskId });
  child.emit("message", { taskId: request.taskId, ok: true, result: { late: true } });
  assert.deepEqual(supervisor.snapshot().pending, []);
  supervisor.close();
});

test("utility supervisor rejects synchronous postMessage failures without leaking pending tasks", async () => {
  const child = new FakeUtilityProcess();
  child.postMessage = () => { throw new Error("post failed"); };
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child });
  await assert.rejects(supervisor.run("rag:rebuild", {}), /post failed/);
  assert.deepEqual(supervisor.snapshot().pending, []);
  supervisor.close();
});

test("utility supervisor close is idempotent and permanently rejects new work", async () => {
  const child = new FakeUtilityProcess();
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child });
  const pending = supervisor.run("rag:rebuild", {});
  assert.equal(supervisor.close(), true);
  assert.equal(supervisor.close(), false);
  await assert.rejects(pending, /关闭/);
  await assert.rejects(supervisor.run("rag:ensure", {}), /已经关闭/);
  assert.equal(child.killed, true);
});

test("utility supervisor close contains a synchronous worker kill failure", () => {
  const child = new FakeUtilityProcess();
  child.kill = () => { throw new Error("kill failed"); };
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child });
  const task = supervisor.run("rag:ensure", {});
  void task.catch(() => {});
  assert.equal(supervisor.close(), false);
  assert.equal(supervisor.close(), false);
});

test("utility supervisor turns fork failures into rejected calls", async () => {
  const child = new FakeUtilityProcess();
  let attempts = 0;
  const supervisor = createUtilityTaskSupervisor({
    entryPoint: "worker.js",
    fork: () => {
      attempts += 1;
      if (attempts === 1) throw new Error("fork failed");
      return child;
    }
  });
  await assert.rejects(supervisor.run("rag:ensure", {}), /fork failed/);
  const retry = supervisor.run("rag:ensure", {});
  child.emit("message", { taskId: child.messages[0].taskId, ok: true, result: { ready: true } });
  assert.deepEqual(await retry, { ready: true });
  assert.equal(attempts, 2);
  supervisor.close();
});

test("utility entry path resolves inside both development and packaged electron directories", () => {
  const developmentElectronDir = path.join("C:\\project", "electron");
  const packagedElectronDir = path.join("C:\\Program Files", "V-Manager", "resources", "app.asar", "electron");
  assert.equal(resolveUtilityEntryPoint(developmentElectronDir), path.join(developmentElectronDir, "workers", "utility-entry.js"));
  assert.equal(resolveUtilityEntryPoint(packagedElectronDir), path.join(packagedElectronDir, "workers", "utility-entry.js"));
});

test("a timed-out RAG task keeps the base-directory lock until the worker confirms real completion", async () => {
  const child = new FakeUtilityProcess();
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child, timeoutMs: 5 });
  const client = createRagTaskClient({ supervisor });
  const ensure = client.ensure("data");
  await flushTasks();
  const ensureRequest = child.messages[0];
  await assert.rejects(ensure, /超时/);
  const rebuild = client.rebuild("data");
  await flushTasks();
  assert.equal(child.messages.filter((message) => message.kind === "run").length, 1);
  child.emit("message", { taskId: ensureRequest.taskId, cancelled: true });
  await flushTasks();
  const runMessages = child.messages.filter((message) => message.kind === "run");
  assert.equal(runMessages.length, 2);
  assert.equal(runMessages[1].type, "rag:rebuild");
  child.emit("message", { taskId: runMessages[1].taskId, ok: true, result: { files: [], chunks: [] } });
  await rebuild;
  supervisor.close();
});

test("cancel postMessage failure keeps the worker and directory lock until that worker exits", async () => {
  const firstChild = new FakeUtilityProcess();
  const secondChild = new FakeUtilityProcess();
  firstChild.postMessage = function postMessage(message) {
    if (message.kind === "cancel") throw new Error("cancel post failed");
    this.messages.push(message);
  };
  let forks = 0;
  const supervisor = createUtilityTaskSupervisor({
    entryPoint: "worker.js",
    fork: () => (++forks === 1 ? firstChild : secondChild),
    timeoutMs: 5
  });
  const client = createRagTaskClient({ supervisor });
  await assert.rejects(client.ensure("data"), /cancel post failed|超时/);
  const rebuild = client.rebuild("data");
  await flushTasks();
  assert.equal(firstChild.killed, true);
  assert.equal(forks, 1);
  assert.deepEqual(supervisor.snapshot().pending, ["rag:ensure"]);
  firstChild.emit("message", { taskId: firstChild.messages[0].taskId, ok: true, result: { late: true } });
  await flushTasks();
  assert.equal(forks, 1);
  firstChild.emit("exit", 1);
  await flushTasks();
  assert.equal(forks, 2);
  assert.equal(secondChild.messages[0].type, "rag:rebuild");
  secondChild.emit("message", { taskId: secondChild.messages[0].taskId, ok: true, result: { files: [], chunks: [] } });
  await rebuild;
  supervisor.close();
});

test("worker result post failure is recovered by timeout cancel in a real supervisor-handler bridge", async () => {
  class HandlerBackedProcess extends FakeUtilityProcess {
    resultPosts = 0;
    constructor() {
      super();
      this.handler = createUtilityMessageHandler({
        handlers: {
          "rag:ensure": async () => ({ rebuilt: false }),
          "rag:rebuild": async () => ({ files: [], chunks: [] })
        },
        postMessage: (message) => {
          this.resultPosts += 1;
          if (this.resultPosts === 1) throw new Error("first result post failed");
          this.emit("message", message);
        }
      });
    }
    postMessage(message) {
      this.messages.push(message);
      void this.handler(message);
    }
  }
  const child = new HandlerBackedProcess();
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child, timeoutMs: 5 });
  const client = createRagTaskClient({ supervisor });
  await assert.rejects(client.ensure("data"), /超时/);
  assert.equal(child.handler.snapshot().terminal, 0);
  assert.deepEqual(supervisor.snapshot().pending, []);
  const rebuild = client.rebuild("data");
  assert.deepEqual(await rebuild, { files: [], chunks: [] });
  assert.equal(child.messages.filter((message) => message.kind === "run").length, 2);
  supervisor.close();
});

test("an old worker exit cannot clear a replacement worker or reject its tasks", async () => {
  const firstChild = new FakeUtilityProcess();
  const secondChild = new FakeUtilityProcess();
  let forks = 0;
  const supervisor = createUtilityTaskSupervisor({
    entryPoint: "worker.js",
    fork: () => (++forks === 1 ? firstChild : secondChild)
  });
  const first = supervisor.run("rag:ensure", {});
  firstChild.emit("error", new Error("first crashed"));
  await assert.rejects(first, /first crashed/);
  const second = supervisor.run("rag:rebuild", {});
  firstChild.emit("exit", 9);
  assert.equal(supervisor.snapshot().running, true);
  assert.deepEqual(supervisor.snapshot().pending, ["rag:rebuild"]);
  secondChild.emit("message", { taskId: secondChild.messages[0].taskId, ok: true, result: { files: [], chunks: [] } });
  await second;
  supervisor.close();
});

test("utility supervisor ignores unknown, duplicate, and late messages", async () => {
  const child = new FakeUtilityProcess();
  const supervisor = createUtilityTaskSupervisor({ entryPoint: "worker.js", fork: () => child });
  child.emit("message", { taskId: "unknown", ok: true, result: {} });
  const result = supervisor.run("rag:ensure", {});
  const taskId = child.messages[0].taskId;
  child.emit("message", { taskId, ok: true, result: { once: true } });
  child.emit("message", { taskId, ok: false, error: { message: "duplicate" } });
  assert.deepEqual(await result, { once: true });
  assert.deepEqual(supervisor.snapshot().pending, []);
  supervisor.close();
});
