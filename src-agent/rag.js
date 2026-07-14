import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAgentPaths } from "./runtime-paths.js";
import { pathExists, tokenize } from "./shared/utils.js";

const textFileExtensions = new Set([
  ".txt",
  ".md",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".html",
  ".htm",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".log"
]);

const defaultRagConfig = {
  enabled: true,
  mode: "keyword_index",
  embeddingProvider: "unconfigured",
  chunkSize: 800,
  chunkOverlap: 120,
  topK: 3,
  maxDepth: 5,
  maxFiles: 400,
  indexedRoots: [
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Downloads")
  ]
};

function chunkText(text, chunkSize, chunkOverlap) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return [];
  }

  const chunks = [];
  const safeChunkSize = Math.max(200, chunkSize);
  const safeOverlap = Math.max(0, Math.min(chunkOverlap, safeChunkSize - 50));
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + safeChunkSize);
    const content = normalized.slice(cursor, end).trim();
    if (content) {
      chunks.push({
        start: cursor,
        end,
        content
      });
    }
    if (end >= normalized.length) {
      break;
    }
    cursor = end - safeOverlap;
  }

  return chunks;
}

async function collectIndexableFiles(rootDir, options, results = [], depth = 0) {
  if (!rootDir || depth > options.maxDepth || results.length >= options.maxFiles || !(await pathExists(rootDir))) {
    return results;
  }

  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (results.length >= options.maxFiles) {
      break;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await collectIndexableFiles(fullPath, options, results, depth + 1);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!textFileExtensions.has(ext)) {
      continue;
    }

    results.push(fullPath);
  }

  return results;
}

async function buildFileRecord(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      ext: path.extname(filePath).toLowerCase()
    };
  } catch {
    return null;
  }
}

export async function ensureRagFiles(baseDir) {
  const { ragDir, ragConfigPath, ragIndexPath } = getAgentPaths(baseDir);
  await fs.mkdir(ragDir, { recursive: true });

  try {
    await fs.access(ragConfigPath);
  } catch {
    await fs.writeFile(ragConfigPath, JSON.stringify(defaultRagConfig, null, 2), "utf-8");
  }

  try {
    await fs.access(ragIndexPath);
  } catch {
    await fs.writeFile(
      ragIndexPath,
      JSON.stringify(
        {
          version: 2,
          updatedAt: null,
          chunks: [],
          files: []
        },
        null,
        2
      ),
      "utf-8"
    );
  }
}

export async function loadRagConfig(baseDir) {
  await ensureRagFiles(baseDir);
  const { ragConfigPath } = getAgentPaths(baseDir);
  const raw = await fs.readFile(ragConfigPath, "utf-8");
  return {
    ...defaultRagConfig,
    ...JSON.parse(raw)
  };
}

export async function saveRagConfig(baseDir, config) {
  const { ragConfigPath } = getAgentPaths(baseDir);
  const merged = {
    ...defaultRagConfig,
    ...(config ?? {})
  };
  await fs.writeFile(ragConfigPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export async function loadRagIndex(baseDir) {
  await ensureRagFiles(baseDir);
  const { ragIndexPath } = getAgentPaths(baseDir);
  const raw = await fs.readFile(ragIndexPath, "utf-8");
  return JSON.parse(raw);
}

export async function saveRagIndex(baseDir, indexPayload) {
  const { ragIndexPath } = getAgentPaths(baseDir);
  const payload = {
    version: indexPayload.version ?? 2,
    updatedAt: new Date().toISOString(),
    chunks: Array.isArray(indexPayload.chunks) ? indexPayload.chunks : [],
    files: Array.isArray(indexPayload.files) ? indexPayload.files : []
  };
  await fs.writeFile(ragIndexPath, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
}

export async function rebuildRagIndex(baseDir, overrides = {}) {
  const ragConfig = await loadRagConfig(baseDir);
  const config = {
    ...ragConfig,
    ...overrides
  };
  const indexedRoots = (config.indexedRoots ?? []).filter(Boolean);
  const filePaths = [];

  for (const rootDir of indexedRoots) {
    await collectIndexableFiles(rootDir, config, filePaths);
    if (filePaths.length >= config.maxFiles) {
      break;
    }
  }

  const files = [];
  const chunks = [];

  for (const filePath of filePaths.slice(0, config.maxFiles)) {
    const fileRecord = await buildFileRecord(filePath);
    if (!fileRecord) {
      continue;
    }

    let raw;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    files.push(fileRecord);
    const fileChunks = chunkText(raw, config.chunkSize, config.chunkOverlap).slice(0, 24);
    for (let index = 0; index < fileChunks.length; index += 1) {
      const chunk = fileChunks[index];
      chunks.push({
        id: `${filePath}#${index}`,
        file: filePath,
        title: path.basename(filePath),
        scoreHint: `${path.basename(filePath)} ${path.dirname(filePath)}`,
        start: chunk.start,
        end: chunk.end,
        content: chunk.content
      });
    }
  }

  return saveRagIndex(baseDir, {
    version: 2,
    files,
    chunks
  });
}

function scoreChunk(query, chunk) {
  const queryTokens = tokenize(query);
  const chunkTokens = tokenize(`${chunk.title || ""} ${chunk.scoreHint || ""} ${chunk.content || ""}`);
  let score = 0;

  for (const token of queryTokens) {
    if (chunkTokens.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function mapChunkToKnowledge(chunk, score) {
  return {
    file: chunk.file,
    score,
    content: chunk.content.slice(0, 900)
  };
}

export async function getRagSnapshot(baseDir) {
  const [config, index] = await Promise.all([loadRagConfig(baseDir), loadRagIndex(baseDir)]);
  return {
    config,
    status: {
      indexedFileCount: Array.isArray(index.files) ? index.files.length : 0,
      indexedChunkCount: Array.isArray(index.chunks) ? index.chunks.length : 0,
      updatedAt: index.updatedAt ?? null
    }
  };
}

export async function retrieveRagContext(baseDir, query, topK, fallbackRetriever) {
  const ragConfig = await loadRagConfig(baseDir);
  const ragIndex = await loadRagIndex(baseDir);
  const chunks = Array.isArray(ragIndex.chunks) ? ragIndex.chunks : [];

  if (ragConfig.enabled && chunks.length > 0) {
    const ranked = chunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk(query, chunk)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK ?? ragConfig.topK)
      .map((item) => mapChunkToKnowledge(item.chunk, item.score));

    if (ranked.length > 0) {
      return {
        items: ranked,
        meta: {
          ragMode: ragConfig.mode,
          embeddingProvider: ragConfig.embeddingProvider,
          indexedChunkCount: chunks.length
        }
      };
    }
  }

  const items = await fallbackRetriever(query, topK ?? ragConfig.topK);
  return {
    items,
    meta: {
      ragMode: chunks.length > 0 ? "keyword_index_fallback" : "keyword_fallback",
      embeddingProvider: ragConfig.embeddingProvider,
      indexedChunkCount: chunks.length
    }
  };
}
