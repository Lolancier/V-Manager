import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureGptSovitsService, installGptSovitsRuntime, isGptSovitsServiceReady, stopGptSovitsService } from "../src-agent/gpt-sovits-runtime.js";

async function temporaryRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v-manager-gpt-runtime-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

// Build a minimal usable runtime layout (matching isUsableRuntime) plus a
// couple of extra files to confirm the copy is self-contained.
async function makeSourceRoot(t) {
  const root = await temporaryRoot(t);
  await fs.mkdir(path.join(root, "third_party", "GPT-SoVITS", ".conda"), { recursive: true });
  await fs.mkdir(path.join(root, "third_party", "GPT-SoVITS", "GPT_SoVITS"), { recursive: true });
  await fs.writeFile(path.join(root, "third_party", "GPT-SoVITS", ".conda", "python.exe"), "PYTHON");
  await fs.writeFile(path.join(root, "third_party", "GPT-SoVITS", "api_v2.py"), "API");
  await fs.writeFile(path.join(root, "third_party", "GPT-SoVITS", "GPT_SoVITS", "model.ckpt"), "WEIGHT");
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  await fs.writeFile(path.join(root, "scripts", "start-gpt-sovits.ps1"), "# start");
  await fs.writeFile(path.join(root, "third_party", "GPT-SoVITS", "vmanager-api.log"), "noise");
  return root;
}

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

test("installGptSovitsRuntime copies a usable runtime and reports progress", async (t) => {
  const source = await makeSourceRoot(t);
  const target = await temporaryRoot(t);
  const progress = [];
  const result = await installGptSovitsRuntime(target, {
    sourceRoot: source,
    onProgress: (p) => progress.push(p)
  });
  assert.equal(result, target);
  // The target layout reproduces the expected structure.
  assert.equal(await fs.readFile(path.join(target, "third_party", "GPT-SoVITS", ".conda", "python.exe"), "utf8"), "PYTHON");
  assert.equal(await fs.readFile(path.join(target, "third_party", "GPT-SoVITS", "GPT_SoVITS", "model.ckpt"), "utf8"), "WEIGHT");
  assert.equal(await fs.readFile(path.join(target, "scripts", "start-gpt-sovits.ps1"), "utf8"), "# start");
  // Disposable log and .git dirs are not carried over.
  await assert.rejects(fs.stat(path.join(target, "third_party", "GPT-SoVITS", "vmanager-api.log")));
  // The installed root is itself a usable runtime.
  const usedBefore = path.join(target, "third_party", "GPT-SoVITS", ".conda", "python.exe");
  assert.ok(await fs.stat(usedBefore).then((s) => s.isFile()));
  // Progress reached 100%.
  assert.equal(progress.at(-1)?.percent, 100);
});

test("installGptSovitsRuntime refuses to overwrite an existing usable runtime", async (t) => {
  const source = await makeSourceRoot(t);
  const target = await makeSourceRoot(t); // already usable
  await assert.rejects(installGptSovitsRuntime(target, { sourceRoot: source }), /已经包含可用的/);
});

test("installGptSovitsRuntime rejects a missing source blueprint", async (t) => {
  const target = await temporaryRoot(t);
  const source = await temporaryRoot(t); // empty, not usable
  await assert.rejects(installGptSovitsRuntime(target, { sourceRoot: source }), /缺少可复制的/);
});
