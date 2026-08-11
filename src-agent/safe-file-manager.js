import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TYPE_FOLDERS = {
  image: "图片", document: "文档", spreadsheet: "表格", presentation: "演示文稿",
  archive: "压缩包", audio: "音频", video: "视频", code: "代码", installer: "安装包", other: "其他"
};
const EXTENSIONS = {
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"],
  document: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"],
  spreadsheet: [".xls", ".xlsx", ".csv", ".tsv"],
  presentation: [".ppt", ".pptx"],
  archive: [".zip", ".7z", ".rar", ".tar", ".gz"],
  audio: [".mp3", ".wav", ".flac", ".m4a", ".aac"],
  video: [".mp4", ".mkv", ".mov", ".avi", ".webm"],
  code: [".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".html", ".css", ".json"],
  installer: [".exe", ".msi", ".msix", ".appx"]
};

function managerDir(baseDir) { return path.join(baseDir, "agent-data", "file-manager"); }
function previewsDir(baseDir) { return path.join(managerDir(baseDir), "previews"); }
function operationsPath(baseDir) { return path.join(managerDir(baseDir), "operations.jsonl"); }

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function validateDirectory(targetPath) {
  const resolved = path.resolve(targetPath);
  if (resolved === path.parse(resolved).root) throw new Error("不能直接扫描或整理磁盘根目录。");
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`目录不存在：${resolved}`);
  return resolved;
}

export function resolveManagedDirectory(input = "downloads") {
  const value = String(input || "downloads").trim().toLowerCase();
  if (["downloads", "download", "下载", "下载目录"].includes(value)) return path.join(os.homedir(), "Downloads");
  if (["desktop", "桌面"].includes(value)) return path.join(os.homedir(), "Desktop");
  return path.resolve(String(input));
}

export function classifyFile(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return Object.entries(EXTENSIONS).find(([, values]) => values.includes(extension))?.[0] || "other";
}

export async function scanManagedDirectory(input, options = {}) {
  const root = await validateDirectory(resolveManagedDirectory(input));
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 200));
  for (const entry of entries) {
    if (files.length >= limit || entry.isDirectory() || entry.name.startsWith(".")) continue;
    const sourcePath = path.join(root, entry.name);
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) continue;
    files.push({
      name: entry.name,
      path: sourcePath,
      type: classifyFile(entry.name),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }
  return { root, scannedAt: new Date().toISOString(), total: files.length, files };
}

function destinationFolder(file, mode) {
  if (mode === "date") {
    const date = new Date(file.modifiedAt);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return TYPE_FOLDERS[file.type] || TYPE_FOLDERS.other;
}

export async function createOrganizationPreview(baseDir, input, options = {}) {
  const scan = await scanManagedDirectory(input, options);
  const mode = options.mode === "date" ? "date" : "type";
  const destinationRoot = path.join(scan.root, options.quarantine ? ".Vivi隔离区" : "Vivi整理");
  const moves = scan.files.map((file) => ({
    source: file.path,
    destination: path.join(destinationRoot, destinationFolder(file, mode), file.name),
    name: file.name,
    type: file.type,
    size: file.size,
    modifiedAt: file.modifiedAt
  })).filter((move) => path.resolve(move.source) !== path.resolve(move.destination));
  const preview = {
    id: randomUUID(), root: scan.root, destinationRoot, mode,
    kind: options.quarantine ? "quarantine" : "organize",
    createdAt: new Date().toISOString(), status: "pending", moves
  };
  await fs.mkdir(previewsDir(baseDir), { recursive: true });
  await fs.writeFile(path.join(previewsDir(baseDir), `${preview.id}.json`), JSON.stringify(preview, null, 2), "utf8");
  return preview;
}

async function uniqueDestination(target) {
  if (!await fs.stat(target).catch(() => null)) return target;
  const extension = path.extname(target);
  const stem = path.basename(target, extension);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(path.dirname(target), `${stem} (${index})${extension}`);
    if (!await fs.stat(candidate).catch(() => null)) return candidate;
  }
  throw new Error(`无法为 ${target} 生成不冲突的文件名。`);
}

async function appendOperation(baseDir, operation) {
  await fs.mkdir(managerDir(baseDir), { recursive: true });
  await fs.appendFile(operationsPath(baseDir), `${JSON.stringify(operation)}\n`, "utf8");
}

export async function executeOrganizationPreview(baseDir, previewId) {
  const previewPath = path.join(previewsDir(baseDir), `${String(previewId).replace(/[^a-zA-Z0-9-]/g, "")}.json`);
  const preview = JSON.parse(await fs.readFile(previewPath, "utf8"));
  if (preview.status !== "pending") throw new Error("该整理预览已经执行或失效。");
  const root = await validateDirectory(preview.root);
  const completed = [];
  for (const move of preview.moves) {
    if (!isInside(root, move.source) || !isInside(root, move.destination)) throw new Error("整理计划包含越界路径，已拒绝执行。");
    const stat = await fs.stat(move.source).catch(() => null);
    if (!stat?.isFile()) throw new Error(`预览中的文件已不存在：${move.source}`);
    if (stat.size !== move.size || Math.abs(stat.mtime.getTime() - new Date(move.modifiedAt).getTime()) > 1000) {
      throw new Error(`文件在预览后发生变化，请重新生成预览：${move.source}`);
    }
  }
  try {
    for (const move of preview.moves) {
      const destination = await uniqueDestination(move.destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rename(move.source, destination);
      completed.push({ from: move.source, to: destination });
    }
  } catch (error) {
    for (const move of [...completed].reverse()) {
      if (!await fs.stat(move.from).catch(() => null) && await fs.stat(move.to).catch(() => null)) {
        await fs.rename(move.to, move.from).catch(() => null);
      }
    }
    throw error;
  }
  const operation = {
    id: randomUUID(), previewId: preview.id, kind: preview.kind, mode: preview.mode,
    root, createdAt: new Date().toISOString(), status: "completed", undoable: true, moves: completed
  };
  preview.status = "executed";
  preview.operationId = operation.id;
  await fs.writeFile(previewPath, JSON.stringify(preview, null, 2), "utf8");
  await appendOperation(baseDir, operation);
  return operation;
}

export async function listFileOperations(baseDir, limit = 20) {
  try {
    const lines = (await fs.readFile(operationsPath(baseDir), "utf8")).split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line)).slice(-Math.max(1, limit)).reverse();
  } catch { return []; }
}

export async function undoFileOperation(baseDir, operationId) {
  const operations = await listFileOperations(baseDir, 200);
  const target = operationId ? operations.find((item) => item.id === operationId) : operations.find((item) => item.undoable && item.status === "completed");
  if (!target || !target.undoable || target.status !== "completed") throw new Error("没有可撤销的文件整理操作。");
  const restored = [];
  for (const move of [...target.moves].reverse()) {
    const destinationStat = await fs.stat(move.to).catch(() => null);
    const originalStat = await fs.stat(move.from).catch(() => null);
    if (!destinationStat?.isFile() || originalStat) continue;
    await fs.mkdir(path.dirname(move.from), { recursive: true });
    await fs.rename(move.to, move.from);
    restored.push({ from: move.to, to: move.from });
  }
  const undo = {
    id: randomUUID(), kind: "undo", parentId: target.id, root: target.root,
    createdAt: new Date().toISOString(), status: "completed", undoable: false, moves: restored
  };
  await appendOperation(baseDir, undo);
  await appendOperation(baseDir, { ...target, createdAt: new Date().toISOString(), status: "undone", undoable: false, supersedes: target.id });
  return undo;
}
