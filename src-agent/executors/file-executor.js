import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import electron from "electron";
import {
  extractQuotedPath,
  normalizeText,
  pathExists,
  resolveUserPath,
  statPath,
  stripWrappingQuotes
} from "../shared/utils.js";

const { shell } = electron;

// ---- File operations ----

async function openLocalTarget(targetPath) {
  const exists = await pathExists(targetPath);
  if (!exists) {
    throw new Error(`没有找到 ${targetPath}`);
  }

  const result = await shell.openPath(targetPath);
  if (result) {
    throw new Error(result);
  }

  const stat = await statPath(targetPath);
  return {
    targetPath,
    targetType: stat?.isDirectory() ? "folder" : "file"
  };
}

async function listDirectorySnapshot(targetPath) {
  const stat = await statPath(targetPath);
  if (!stat) {
    throw new Error(`没有找到 ${targetPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${targetPath} 不是文件夹`);
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const entry of entries.slice(0, 30)) {
    const label = entry.isDirectory() ? `[文件夹] ${entry.name}` : `[文件] ${entry.name}`;
    if (entry.isDirectory()) {
      folders.push(label);
    } else {
      files.push(label);
    }
  }

  return {
    targetPath,
    totalCount: entries.length,
    preview: [...folders, ...files].slice(0, 18)
  };
}

async function readTextFilePreview(targetPath) {
  const stat = await statPath(targetPath);
  if (!stat) {
    throw new Error(`没有找到 ${targetPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${targetPath} 不是文件`);
  }

  const buffer = await fs.readFile(targetPath);
  const preview = buffer.toString("utf-8", 0, Math.min(buffer.length, 2400));
  return {
    targetPath,
    size: stat.size,
    preview
  };
}

async function createFolder(targetPath) {
  if (!targetPath) {
    throw new Error("没有识别到要创建的文件夹路径。");
  }
  await fs.mkdir(targetPath, { recursive: true });
  return targetPath;
}

async function createTextFile(targetPath) {
  if (!targetPath) {
    throw new Error("没有识别到要创建的文件路径。");
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (!(await pathExists(targetPath))) {
    await fs.writeFile(targetPath, "", "utf-8");
  }
  return targetPath;
}

async function appendTextToFile(targetPath, content) {
  if (!targetPath) {
    throw new Error("没有识别到目标文件路径。");
  }
  if (!content) {
    throw new Error("没有识别到要写入的内容。");
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.appendFile(targetPath, `${content}\n`, "utf-8");
  return targetPath;
}

async function deleteLocalTarget(targetPath) {
  if (!targetPath) {
    throw new Error("没有识别到要删除的路径。");
  }

  const stat = await statPath(targetPath);
  if (!stat) {
    throw new Error(`没有找到 ${targetPath}`);
  }

  if (stat.isDirectory()) {
    await fs.rm(targetPath, { recursive: true, force: true });
  } else {
    await fs.unlink(targetPath);
  }

  return targetPath;
}

// ---- Directory listing / search ----

async function listDirectoryEntries(basePath, options = {}) {
  const { limit = 12, filter } = options;

  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const mapped = entries
      .filter((entry) => !filter || filter(entry))
      .slice(0, limit)
      .map((entry) => ({
        name: entry.name,
        location: basePath,
        type: entry.isDirectory() ? "folder" : "file"
      }));
    return mapped;
  } catch {
    return [];
  }
}

async function searchInDirectory(basePath, lowered, maxDepth, results) {
  if (results.length >= 30) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(basePath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= 30) {
      return;
    }

    const fullPath = path.join(basePath, entry.name);
    if (entry.name.toLowerCase().includes(lowered)) {
      results.push({
        name: entry.name,
        location: basePath,
        type: entry.isDirectory() ? "folder" : "file"
      });
    }

    if (entry.isDirectory() && maxDepth > 0) {
      await searchInDirectory(fullPath, lowered, maxDepth - 1, results);
    }
  }
}

export async function searchLocalFiles(query) {
  const homeDir = os.homedir();
  const searchRoots = [
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "Documents"),
    path.join(homeDir, "Downloads"),
    "D:\\"
  ];
  const lowered = query.trim().toLowerCase();

  if (!lowered) {
    return [];
  }

  const results = [];
  for (const base of searchRoots) {
    await searchInDirectory(base, lowered, 2, results);
  }

  return results.slice(0, 30);
}

export async function getFileManagerSnapshot() {
  const desktopPath = path.join(os.homedir(), "Desktop");
  const driveDPath = "D:\\";
  const desktopApps = await listDirectoryEntries(desktopPath, {
    limit: 16,
    filter: (entry) => {
      const lowered = entry.name.toLowerCase();
      return lowered.endsWith(".lnk") || lowered.endsWith(".url") || lowered.endsWith(".exe");
    }
  });
  const desktopFolders = await listDirectoryEntries(desktopPath, {
    limit: 12,
    filter: (entry) => entry.isDirectory()
  });
  const driveDFolders = await listDirectoryEntries(driveDPath, {
    limit: 20,
    filter: (entry) => entry.isDirectory()
  });

  return {
    desktopPath,
    driveDPath,
    desktopApps,
    desktopFolders,
    driveDFolders
  };
}

// ---- Intent extraction ----

function inferOpenTarget(message) {
  const directPath = resolveUserPath(extractQuotedPath(message));
  if (directPath) {
    return directPath;
  }

  const normalized = normalizeText(message);
  const patterns = [
    /(?:打开|进入|查看)(.+?)(?:文件夹|目录)/,
    /(?:打开|进入|查看)(.+?)(?:文件|文档|文本)/,
    /(?:打开|进入|查看)(桌面|文档|下载|用户目录|D盘|desktop|documents|downloads|home)/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const candidate = resolveUserPath(match[1].trim());
      if (candidate) {
        return candidate;
      }
    }
  }

  return "";
}

function extractCreateFolderTarget(message) {
  const directPath = resolveUserPath(extractQuotedPath(message));
  if (directPath) {
    return directPath;
  }

  const normalized = normalizeText(message);
  const inLocationMatch = normalized.match(/(?:在)(桌面|文档|下载|用户目录|D盘)(?:里|中)?(?:创建|新建)(.+?)(?:文件夹|目录)/i);
  if (inLocationMatch?.[1] && inLocationMatch?.[2]) {
    const baseDir = resolveUserPath(inLocationMatch[1]);
    return baseDir ? path.join(baseDir, inLocationMatch[2].trim()) : "";
  }

  const match = normalized.match(/(?:创建|新建)(.+?)(?:文件夹|目录)/);
  return match?.[1] ? resolveUserPath(match[1].trim()) : "";
}

function extractCreateTextFileTarget(message) {
  const directPath = resolveUserPath(extractQuotedPath(message));
  if (directPath) {
    return directPath;
  }

  const normalized = normalizeText(message);
  const inLocationMatch = normalized.match(/(?:在)(桌面|文档|下载|用户目录|D盘)(?:里|中)?(?:创建|新建)(.+?)(?:文本文件|txt文件|文件)/i);
  if (inLocationMatch?.[1] && inLocationMatch?.[2]) {
    const baseDir = resolveUserPath(inLocationMatch[1]);
    return baseDir ? path.join(baseDir, inLocationMatch[2].trim()) : "";
  }

  const match = normalized.match(/(?:创建|新建)(.+?)(?:文本文件|txt文件|文件)/);
  return match?.[1] ? resolveUserPath(match[1].trim()) : "";
}

function extractAppendContent(message) {
  const quotedParts = [...message.matchAll(/[""](.+?)[""]/g)].map((item) => item[1]);
  if (quotedParts.length >= 2) {
    return {
      targetPath: resolveUserPath(quotedParts[0]),
      content: quotedParts.slice(1).join("\n")
    };
  }

  const pathText = extractQuotedPath(message);
  const targetPath = resolveUserPath(pathText);
  const contentMatch = message.match(/(?:写入|追加|添加|记到).+?(?:内容|文字)?[:：]\s*([\s\S]+)$/);

  return {
    targetPath,
    content: contentMatch?.[1]?.trim() ?? ""
  };
}

// ---- Tool-callable exports ----

export async function listDirectoryContent(targetPath) {
  const snapshot = await listDirectorySnapshot(targetPath);
  return {
    ok: true,
    path: snapshot.targetPath,
    totalCount: snapshot.totalCount,
    items: snapshot.preview
  };
}

export async function readFileContent(targetPath) {
  const preview = await readTextFilePreview(targetPath);
  return {
    ok: true,
    path: preview.targetPath,
    size: preview.size,
    content: preview.preview
  };
}

export async function openTarget(targetPath) {
  const result = await openLocalTarget(targetPath);
  return {
    ok: true,
    path: result.targetPath,
    type: result.targetType
  };
}

export async function createFolderCmd(targetPath) {
  const created = await createFolder(targetPath);
  return { ok: true, path: created };
}

export async function createTextFileCmd(targetPath) {
  const created = await createTextFile(targetPath);
  return { ok: true, path: created };
}

export async function appendToFileCmd(targetPath, content) {
  const filePath = await appendTextToFile(targetPath, content);
  return { ok: true, path: filePath };
}

export async function deletePathCmd(targetPath) {
  const deleted = await deleteLocalTarget(targetPath);
  return { ok: true, path: deleted };
}

// ---- Executor handle ----

/**
 * Handle file-system intents: open, list, read, create, append, delete, search.
 * Returns null if the message does not match any file-operation intent.
 */
export async function handle(message) {
  const lowered = message.toLowerCase();
  const openTarget = inferOpenTarget(message);
  const createFolderTarget = extractCreateFolderTarget(message);
  const createTextFileTarget = extractCreateTextFileTarget(message);
  const appendPayload = extractAppendContent(message);
  const deleteTarget = lowered.includes("删除") || lowered.includes("移除") ? resolveUserPath(extractQuotedPath(message)) : "";
  const wantsListDirectory =
    lowered.includes("列出") ||
    (lowered.includes("看看") && (lowered.includes("文件夹") || lowered.includes("目录"))) ||
    lowered.includes("目录里有什么") ||
    lowered.includes("文件夹里有什么");
  const wantsReadFile =
    lowered.includes("读取") ||
    lowered.includes("读一下") ||
    lowered.includes("查看文件内容") ||
    lowered.includes("打开文件内容");

  // Quick exit: no file intents matched
  if (
    !openTarget &&
    !createFolderTarget &&
    !createTextFileTarget &&
    !(appendPayload.targetPath && appendPayload.content) &&
    !deleteTarget &&
    !(wantsListDirectory && openTarget) &&
    !(wantsReadFile && openTarget)
  ) {
    return null;
  }

  // List directory
  if (wantsListDirectory && openTarget) {
    try {
      const snapshot = await listDirectorySnapshot(openTarget);
      return {
        reply: `我刚看了 ${snapshot.targetPath}，这里一共有大约 ${snapshot.totalCount} 项。前面几项是：\n${snapshot.preview.join("\n")}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_list"
        }
      };
    } catch (error) {
      return {
        reply: `我没能列出这个目录：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_list"
        }
      };
    }
  }

  // Read file
  if (wantsReadFile && openTarget) {
    try {
      const filePreview = await readTextFilePreview(openTarget);
      return {
        reply: `我读了一下 ${filePreview.targetPath}，文件大小大约 ${filePreview.size} 字节。前面的内容是：\n${filePreview.preview || "这个文件目前是空的。"}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_read"
        }
      };
    } catch (error) {
      return {
        reply: `我没能读取这个文件：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_read"
        }
      };
    }
  }

  // Create folder
  if (createFolderTarget) {
    try {
      const createdPath = await createFolder(createFolderTarget);
      return {
        reply: `文件夹已经创建好了：${createdPath}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_create_folder"
        }
      };
    } catch (error) {
      return {
        reply: `创建文件夹失败：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_create_folder"
        }
      };
    }
  }

  // Create text file
  if (createTextFileTarget) {
    try {
      const createdPath = await createTextFile(createTextFileTarget);
      return {
        reply: `文件已经建好了：${createdPath}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_create_file"
        }
      };
    } catch (error) {
      return {
        reply: `创建文件失败：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_create_file"
        }
      };
    }
  }

  // Append content
  if (appendPayload.targetPath && appendPayload.content) {
    try {
      const filePath = await appendTextToFile(appendPayload.targetPath, appendPayload.content);
      return {
        reply: `内容已经追加到 ${filePath} 里了。`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_append"
        }
      };
    } catch (error) {
      return {
        reply: `写入失败：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_append"
        }
      };
    }
  }

  // Delete
  if (deleteTarget) {
    try {
      const deletedPath = await deleteLocalTarget(deleteTarget);
      return {
        reply: `已经删除：${deletedPath}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_delete"
        }
      };
    } catch (error) {
      return {
        reply: `删除失败：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_delete"
        }
      };
    }
  }

  // Open file/folder
  if (openTarget) {
    try {
      const opened = await openLocalTarget(openTarget);
      return {
        reply: opened.targetType === "folder" ? `已经帮你打开文件夹：${opened.targetPath}` : `已经帮你打开文件：${opened.targetPath}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: "",
          localTool: "filesystem_open"
        }
      };
    } catch (error) {
      return {
        reply: `打开失败：${error.message}`,
        meta: {
          responseMode: "local_tool",
          usedKnowledge: false,
          knowledgeCount: 0,
          knowledgeFiles: [],
          fallbackReason: error.message,
          localTool: "filesystem_open"
        }
      };
    }
  }

  return null;
}
