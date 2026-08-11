import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getLocalTtsStatus, installLocalTtsPack, listLocalTtsPacks } from "../src-agent/local-tts.js";

test("local TTS exposes installable voice packs", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-tts-list-"));
  const packs = await listLocalTtsPacks(baseDir);
  assert.equal(packs.length >= 2, true);
  assert.equal(packs[0].installed, false);
  assert.equal(packs[0].speakers.length, 5);
});

test("local TTS installer validates extracted model files", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-tts-install-"));
  const fetchImpl = async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-length": "3" }
  });
  const extractImpl = async (_archive, root, pack) => {
    const directory = path.join(root, pack.directoryName);
    await fs.mkdir(directory, { recursive: true });
    const model = await fs.open(path.join(directory, "model.onnx"), "w");
    await model.truncate(105 * 1024 * 1024);
    await model.close();
    await fs.writeFile(path.join(directory, "tokens.txt"), "x".repeat(200));
    await fs.writeFile(path.join(directory, "lexicon.txt"), "x".repeat(2000));
  };
  const status = await installLocalTtsPack(baseDir, "sherpa-zh-ll", undefined, fetchImpl, extractImpl);
  assert.equal(status.installed, true);
  assert.equal((await getLocalTtsStatus(baseDir, "sherpa-zh-ll")).installed, true);
});
