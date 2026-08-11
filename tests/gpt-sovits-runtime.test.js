import test from "node:test";
import assert from "node:assert/strict";
import { ensureGptSovitsService, isGptSovitsServiceReady, stopGptSovitsService } from "../src-agent/gpt-sovits-runtime.js";

test("GPT-SoVITS readiness check treats connection failures as offline", async () => {
  assert.equal(await isGptSovitsServiceReady("http://127.0.0.1:9880", async () => { throw new Error("offline"); }), false);
});

test("GPT-SoVITS service is started once when health check is offline", async () => {
  let ready = false;
  let starts = 0;
  const fetchImpl = async () => ({ ok: ready });
  const result = await ensureGptSovitsService("http://127.0.0.1:9880", {
    fetchImpl,
    startImpl: async () => { starts += 1; ready = true; }
  });
  assert.equal(result.started, true);
  assert.equal(starts, 1);
});

test("GPT-SoVITS stop waits until the local service is offline", async () => {
  let ready = true;
  const fetchImpl = async (url) => {
    if (String(url).includes("command=exit")) ready = false;
    return { ok: ready };
  };
  const result = await stopGptSovitsService("http://127.0.0.1:9880", fetchImpl);
  assert.equal(result.stopped, true);
  assert.equal(result.ready, false);
});
