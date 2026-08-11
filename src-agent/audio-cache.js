import fs from "node:fs/promises";
import path from "node:path";

export const AUDIO_CACHE_MAX_FILES = 12;
export const AUDIO_CACHE_MAX_BYTES = 64 * 1024 * 1024;

export async function touchAudioCacheFile(filePath) {
  const now = new Date();
  await fs.utimes(filePath, now, now).catch(() => {});
}

export async function pruneAudioCache(cacheDir, {
  maxFiles = AUDIO_CACHE_MAX_FILES,
  maxBytes = AUDIO_CACHE_MAX_BYTES,
  preserve = []
} = {}) {
  const preserved = new Set(preserve.map((item) => path.resolve(item)));
  const entries = await fs.readdir(cacheDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:wav|mp3|ogg|aac)$/i.test(entry.name)) continue;
    const filePath = path.join(cacheDir, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat) files.push({ filePath, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  let keptFiles = 0;
  let keptBytes = 0;
  let removedFiles = 0;
  let removedBytes = 0;
  for (const file of files) {
    const isPreserved = preserved.has(path.resolve(file.filePath));
    const withinLimits = keptFiles < Math.max(0, maxFiles) && keptBytes + file.size <= Math.max(0, maxBytes);
    if (isPreserved || withinLimits) {
      keptFiles += 1;
      keptBytes += file.size;
      continue;
    }
    await fs.unlink(file.filePath).catch(() => {});
    removedFiles += 1;
    removedBytes += file.size;
  }
  return { keptFiles, keptBytes, removedFiles, removedBytes };
}
