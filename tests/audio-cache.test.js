import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { pruneAudioCache } from "../src-agent/audio-cache.js";

test("audio cache keeps only the most recent bounded clips", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-audio-cache-"));
  try {
    for (let index = 0; index < 5; index += 1) {
      const filePath = path.join(root, `${index}.wav`);
      await fs.writeFile(filePath, Buffer.alloc(10, index));
      const time = new Date(1700000000000 + index * 1000);
      await fs.utimes(filePath, time, time);
    }
    const result = await pruneAudioCache(root, { maxFiles: 3, maxBytes: 100 });
    assert.equal(result.removedFiles, 2);
    assert.deepEqual((await fs.readdir(root)).sort(), ["2.wav", "3.wav", "4.wav"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("audio cache enforces a byte ceiling", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-audio-bytes-"));
  try {
    await fs.writeFile(path.join(root, "old.wav"), Buffer.alloc(40));
    await fs.writeFile(path.join(root, "new.wav"), Buffer.alloc(40));
    await fs.utimes(path.join(root, "old.wav"), new Date(1), new Date(1));
    await fs.utimes(path.join(root, "new.wav"), new Date(2), new Date(2));
    await pruneAudioCache(root, { maxFiles: 10, maxBytes: 50 });
    assert.deepEqual(await fs.readdir(root), ["new.wav"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
