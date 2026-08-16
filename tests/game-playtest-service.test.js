import test from "node:test";
import assert from "node:assert/strict";
import { createGamePlaytestService } from "../electron/services/game-playtest-service.js";

test("game playtest service injects the isolated driver and tracks active work", async () => {
  let release;
  const createDriver = async () => ({});
  const service = createGamePlaytestService({
    createDriver,
    runPlaytest: async (options) => {
      assert.equal(options.createDriver, createDriver);
      await new Promise((resolve) => { release = resolve; });
      return { ok: true };
    }
  });
  const result = service.run({ artifactPath: "game.html" });
  assert.deepEqual(service.snapshot(), { disposed: false, active: 1 });
  release();
  assert.deepEqual(await result, { ok: true });
  assert.deepEqual(service.snapshot(), { disposed: false, active: 0 });
});

test("disposing the playtest service aborts active work and rejects new runs", async () => {
  let observedSignal;
  let finish;
  const service = createGamePlaytestService({
    createDriver: async () => ({}),
    runPlaytest: async (options) => {
      observedSignal = options.signal;
      await new Promise((resolve) => { finish = resolve; });
      return { cancelled: options.signal.aborted };
    }
  });
  const running = service.run();
  assert.equal(service.dispose(), true);
  assert.equal(service.dispose(), false);
  assert.equal(observedSignal.aborted, true);
  finish();
  assert.deepEqual(await running, { cancelled: true });
  await assert.rejects(service.run(), /已经关闭/);
});

test("caller cancellation is forwarded and listener cleanup is safe", async () => {
  const caller = new AbortController();
  let release;
  let innerSignal;
  const service = createGamePlaytestService({
    createDriver: async () => ({}),
    runPlaytest: async (options) => {
      innerSignal = options.signal;
      await new Promise((resolve) => { release = resolve; });
      return { cancelled: options.signal.aborted };
    }
  });
  const running = service.run({ signal: caller.signal });
  caller.abort();
  assert.equal(innerSignal.aborted, true);
  release();
  assert.deepEqual(await running, { cancelled: true });
  assert.equal(service.snapshot().active, 0);
});
