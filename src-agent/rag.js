import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAgentPaths } from "./runtime-paths.js";
import { pathExists, tokenize } from "./shared/utils.js";
import { loadAppRegistry } from "./app-registry.js";

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
  mode: "auto",
  embeddingProvider: "siliconflow",
  embeddingModel: "BAAI/bge-m3",
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

// ---- Embedding helpers ----

async function loadMainEmbeddingConfig(baseDir) {
  try {
    const { configPath } = getAgentPaths(baseDir);
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    return config.embedding ?? null;
  } catch {
    return null;
  }
}

export async function testEmbeddingConnection(baseDir) {
  const config = await loadMainEmbeddingConfig(baseDir);

  if (!config?.apiKey) {
    return {
      ok: false,
      message: "尚未配置 Embedding API Key。请在设置面板中填入硅基流动（SiliconFlow）或其他兼容服务的 Key。",
      model: config?.model ?? "BAAI/bge-m3",
      baseUrl: config?.baseUrl ?? "https://api.siliconflow.cn/v1"
    };
  }

  const baseUrl = (config.baseUrl || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
  const model = config.model || "BAAI/bge-m3";

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({ model, input: ["连通性测试"] })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        message: `Embedding API 测试失败：${response.status} ${errorText.slice(0, 300)}`,
        model,
        baseUrl
      };
    }

    const data = await response.json();
    const dims = data.data?.[0]?.embedding?.length ?? 0;

    return {
      ok: true,
      message: `Embedding API 连通成功，模型 ${model} 返回向量维度 ${dims}。`,
      model,
      baseUrl,
      dimensions: dims
    };
  } catch (error) {
    return {
      ok: false,
      message: `Embedding API 测试异常：${error.message}`,
      model,
      baseUrl
    };
  }
}

async function callEmbeddingAPI(config, texts) {
  const apiKey = config?.apiKey;
  if (!apiKey) {
    throw new Error("未配置 Embedding API Key");
  }

  const baseUrl = (config.baseUrl || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
  const model = config.model || "BAAI/bge-m3";
  const input = Array.isArray(texts) ? texts : [texts];

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API 请求失败：${response.status} ${errorText}`);
  }

  const data = await response.json();
  // Sort by index to preserve input order
  return (data.data || [])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

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
    version: indexPayload.version ?? 3,
    updatedAt: new Date().toISOString(),
    chunks: Array.isArray(indexPayload.chunks) ? indexPayload.chunks : [],
    files: Array.isArray(indexPayload.files) ? indexPayload.files : [],
    embeddedCount: indexPayload.embeddedCount ?? 0
  };
  await fs.writeFile(ragIndexPath, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
}

async function generateRegistryKnowledge(baseDir) {
  try {
    const registry = await loadAppRegistry(baseDir);
    const apps = registry.apps || [];
    if (apps.length === 0) return;

    const { knowledgeDir } = getAgentPaths(baseDir);
    const lines = [
      "# 本机已安装应用列表",
      `> 自动生成，重建 RAG 索引时更新。共 ${apps.length} 个应用。`,
      "",
      "| 应用名称 | 别名 | 安装位置 | 快捷方式 |",
      "|---|---|---|---|"
    ];

    for (const app of apps) {
      const aliases = (app.aliases || []).filter((a) => a !== app.label).slice(0, 3).join("、") || "-";
      const installPath = (app.installLocations || [])[0] || (app.commands || [])[0] || "-";
      const shortcut = (app.shortcutPaths || [])[0] || "-";
      lines.push(`| ${app.label} | ${aliases} | ${installPath} | ${shortcut} |`);
    }

    // Also add a plain text summary for better embedding match
    lines.push("");
    lines.push("## 应用清单（纯文本）");
    lines.push("");
    for (const app of apps) {
      const names = [app.label, ...(app.aliases || [])].filter(Boolean).join("、");
      const paths = [...(app.installLocations || []), ...(app.commands || [])].filter(Boolean).join("；");
      lines.push(`- ${names}${paths ? " → " + paths : ""}`);
    }

    const filePath = path.join(knowledgeDir, "installed-apps.md");
    await fs.writeFile(filePath, lines.join("\n"), "utf-8");
  } catch (error) {
    console.error("[rag] 生成应用注册表知识文件失败:", error.message);
  }
}

export async function rebuildRagIndex(baseDir, overrides = {}) {
  // Generate knowledge files from system data before indexing
  await generateRegistryKnowledge(baseDir);

  const ragConfig = await loadRagConfig(baseDir);
  const config = {
    ...ragConfig,
    ...overrides
  };
  const indexedRoots = (config.indexedRoots ?? []).filter(Boolean);

  // Always include the agent knowledge directory (persona, profile, compressed memories)
  const { knowledgeDir } = getAgentPaths(baseDir);
  if (!indexedRoots.some((root) => knowledgeDir.startsWith(root))) {
    indexedRoots.unshift(knowledgeDir);
  }

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

  // ---- Generate embeddings ----
  const embeddingConfig = await loadMainEmbeddingConfig(baseDir);
  let embeddedCount = 0;

  if (embeddingConfig?.apiKey && chunks.length > 0) {
    const batchSize = 32;
    for (let batchStart = 0; batchStart < chunks.length; batchStart += batchSize) {
      const batch = chunks.slice(batchStart, batchStart + batchSize);
      try {
        const texts = batch.map((chunk) => chunk.content);
        const vectors = await callEmbeddingAPI(embeddingConfig, texts);
        for (let index = 0; index < batch.length; index += 1) {
          if (vectors[index]) {
            batch[index].embedding = vectors[index];
            embeddedCount += 1;
          }
        }
      } catch (error) {
        // If a batch fails, leave those chunks without embeddings
        // They will still be searchable via keyword fallback
        console.error(`[rag] embedding batch ${batchStart}-${batchStart + batchSize} 失败:`, error.message);
      }
    }
  }

  return saveRagIndex(baseDir, {
    version: 3,
    files,
    chunks,
    embeddedCount
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
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  return {
    config,
    status: {
      indexedFileCount: Array.isArray(index.files) ? index.files.length : 0,
      indexedChunkCount: chunks.length,
      embeddedChunkCount: index.embeddedCount ?? chunks.filter((c) => Array.isArray(c.embedding)).length,
      updatedAt: index.updatedAt ?? null
    }
  };
}

export async function retrieveRagContext(baseDir, query, topK, fallbackRetriever) {
  const ragConfig = await loadRagConfig(baseDir);
  const ragIndex = await loadRagIndex(baseDir);
  const chunks = Array.isArray(ragIndex.chunks) ? ragIndex.chunks : [];
  const hasEmbeddings = chunks.length > 0 && chunks.some((c) => Array.isArray(c.embedding));

  if (!ragConfig.enabled || chunks.length === 0) {
    // No index — fall back to raw knowledge file scan
    const items = await fallbackRetriever(query, topK ?? ragConfig.topK);
    return {
      items,
      meta: {
        ragMode: "keyword_fallback",
        embeddingProvider: ragConfig.embeddingProvider,
        indexedChunkCount: 0
      }
    };
  }

  // ---- Try vector search if embeddings exist and mode allows it ----
  const useVector = hasEmbeddings && ragConfig.mode !== "keyword_only";
  if (useVector) {
    const embeddingConfig = await loadMainEmbeddingConfig(baseDir);
    if (embeddingConfig?.apiKey) {
      try {
        const queryVecs = await callEmbeddingAPI(embeddingConfig, [query]);
        const queryVec = queryVecs[0];
        const ranked = chunks
          .map((chunk) => ({
            chunk,
            score: cosineSimilarity(queryVec, chunk.embedding)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK ?? ragConfig.topK)
          .filter((item) => item.score > 0.3)
          .map((item) => mapChunkToKnowledge(item.chunk, item.score));

        if (ranked.length > 0) {
          return {
            items: ranked,
            meta: {
              ragMode: "vector",
              embeddingProvider: ragConfig.embeddingProvider || "siliconflow",
              indexedChunkCount: chunks.length
            }
          };
        }
      } catch (error) {
        console.error("[rag] 向量检索失败，降级到关键词检索:", error.message);
      }
    }
  }

  // ---- Keyword fallback ----
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
        ragMode: ragConfig.mode === "keyword_only"
      ? "keyword_only"
      : hasEmbeddings
        ? "vector_fallback_keyword"
        : "keyword_index",
        embeddingProvider: ragConfig.embeddingProvider,
        indexedChunkCount: chunks.length
      }
    };
  }

  // Last resort — raw knowledge file scan
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
