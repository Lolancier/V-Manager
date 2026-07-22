import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const CODE_EXTENSIONS = new Set([
  ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".json", ".css", ".html", ".md", ".yml", ".yaml", ".xml", ".py", ".java", ".go", ".rs", ".vue", ".svelte"
]);
const IGNORED_DIRECTORIES = new Set([".git", ".claude", ".idea", "agent-data", "node_modules", "dist", "build", "coverage", ".cache", ".vite", "third_party"]);
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SEARCH_FILES = 1500;

function getWorkspaceRoot(context = {}) {
  return path.resolve(context.workspaceDir || process.cwd());
}

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveWorkspacePath(relativePath, context = {}) {
  const root = getWorkspaceRoot(context);
  const rawPath = String(relativePath || "").trim();
  if (!rawPath) throw new Error("需要提供工作区内的相对路径。");
  if (path.isAbsolute(rawPath)) throw new Error("代码代理只接受工作区内的相对路径。");

  const target = path.resolve(root, rawPath);
  if (!isWithinRoot(root, target)) throw new Error("目标路径超出了当前工作区。");
  return { root, target, relativePath: path.relative(root, target) };
}

function assertConfirmed(context) {
  if (!context.codeAgentConfirmed) {
    throw new Error("这是会修改工作区或执行命令的操作，请先向用户展示计划并等待其明确回复“确认执行”。");
  }
}

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function walkCodeFiles(root, onFile) {
  let visited = 0;
  async function visit(directory) {
    if (visited >= MAX_SEARCH_FILES) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (visited >= MAX_SEARCH_FILES) return;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(path.join(directory, entry.name));
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        visited += 1;
        await onFile(path.join(directory, entry.name));
      }
    }
  }
  await visit(root);
  return visited;
}

export async function searchWorkspaceCode(query, options = {}, context = {}) {
  const needle = String(query || "").trim();
  if (!needle) return { ok: false, error: "搜索内容不能为空。" };

  const root = getWorkspaceRoot(context);
  const extension = String(options.extension || "").trim().toLowerCase();
  const matches = [];
  let scanned = 0;

  await walkCodeFiles(root, async (filePath) => {
    if (extension && path.extname(filePath).toLowerCase() !== extension) return;
    scanned += 1;
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_BYTES || matches.length >= 80) return;
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && matches.length < 80; index += 1) {
      if (lines[index].toLowerCase().includes(needle.toLowerCase())) {
        matches.push({
          path: path.relative(root, filePath),
          line: index + 1,
          text: lines[index].trim().slice(0, 300)
        });
      }
    }
  });

  return { ok: true, query: needle, scannedFiles: scanned, count: matches.length, matches };
}

export async function readWorkspaceCode(relativePath, context = {}) {
  const { target, relativePath: safePath } = await resolveWorkspacePath(relativePath, context);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error("目标不是文件。");
  if (stat.size > MAX_FILE_BYTES) throw new Error("文件超过 512KB，代码代理不会一次读取它。");
  const content = await fs.readFile(target, "utf-8");
  return { ok: true, path: safePath, content, truncated: false };
}

export async function listWorkspaceCodeFiles(context = {}, options = {}) {
  const root = getWorkspaceRoot(context);
  const maxDepth = Math.max(1, Math.min(8, Number(options.maxDepth) || 6));
  const maxEntries = Math.max(50, Math.min(2000, Number(options.maxEntries) || 800));
  const entries = [];

  async function visit(directory, depth) {
    if (depth > maxDepth || entries.length >= maxEntries) return;
    const children = await fs.readdir(directory, { withFileTypes: true });
    children.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });

    for (const entry of children) {
      if (entries.length >= maxEntries) return;
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        entries.push({ type: "directory", name: entry.name, path: relativePath, depth });
        await visit(fullPath, depth + 1);
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        entries.push({ type: "file", name: entry.name, path: relativePath, depth });
      }
    }
  }

  await visit(root, 0);
  return { ok: true, root, entries, truncated: entries.length >= maxEntries };
}

export async function applyWorkspacePatch(args = {}, context = {}) {
  assertConfirmed(context);
  const { target, relativePath } = await resolveWorkspacePath(args.path, context);
  const oldText = String(args.old_text ?? "");
  const newText = String(args.new_text ?? "");
  if (!oldText) throw new Error("修改代码时必须提供读取到的 old_text，避免盲写覆盖。");
  if (Buffer.byteLength(newText, "utf-8") > MAX_FILE_BYTES) throw new Error("单次写入内容超过 512KB 限制。");

  const current = await fs.readFile(target, "utf-8");
  const firstIndex = current.indexOf(oldText);
  if (firstIndex === -1) throw new Error("old_text 与当前文件不匹配，文件可能已变化。请重新读取后再修改。");
  if (current.indexOf(oldText, firstIndex + oldText.length) !== -1) {
    throw new Error("old_text 在文件中出现多次，无法安全确定修改位置。请提供更完整的上下文。");
  }

  await fs.writeFile(target, current.replace(oldText, newText), "utf-8");
  return { ok: true, path: relativePath, changed: true };
}

export async function createWorkspaceFile(args = {}, context = {}) {
  assertConfirmed(context);
  const { target, relativePath } = await resolveWorkspacePath(args.path, context);
  const content = String(args.content ?? "");
  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) throw new Error("单次写入内容超过 512KB 限制。");
  try {
    await fs.access(target);
    throw new Error("文件已存在。请使用 apply_workspace_patch 修改已有文件。");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf-8");
  return { ok: true, path: relativePath, created: true };
}

export async function writeWorkspaceCode(args = {}, context = {}) {
  assertConfirmed(context);
  const { target, relativePath } = await resolveWorkspacePath(args.path, context);
  const content = String(args.content ?? "");
  const expectedContent = String(args.expected_content ?? "");
  const hasExpectedContent = Object.prototype.hasOwnProperty.call(args, "expected_content");
  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) throw new Error("单次写入内容超过 512KB 限制。");

  const current = await fs.readFile(target, "utf-8");
  if (hasExpectedContent && current !== expectedContent) {
    throw new Error("保存前文件已被其他操作修改。请重新读取文件并合并改动，避免覆盖新内容。");
  }
  if (current === content) return { ok: true, path: relativePath, changed: false };
  await fs.writeFile(target, content, "utf-8");
  return { ok: true, path: relativePath, changed: true };
}

function parseAllowedCommand(command) {
  const value = String(command || "").trim();
  if (!value || /[&|;<>`$\n\r]/.test(value)) throw new Error("命令不能为空，且不能包含 shell 连接符或重定向符。");
  const parts = value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, "")) || [];
  const [bin, ...args] = parts;
  const allowed =
    (bin === "npm" && ((args[0] === "run" && args.length >= 2) || args[0] === "test")) ||
    (["pnpm", "yarn"].includes(bin) && ((args[0] === "run" && args.length >= 2) || ["test", "build", "lint"].includes(args[0]))) ||
    (bin === "npx" && args[0] === "tsc" && args.slice(1).every((arg) => arg === "--noEmit" || arg === "--pretty")) ||
    (bin === "node" && args[0] === "--test") ||
    (["python", "py"].includes(bin) && args[0] === "-m" && args[1] === "pytest") ||
    (bin === "pytest") ||
    (bin === "cargo" && ["check", "test"].includes(args[0])) ||
    (bin === "go" && args[0] === "test") ||
    (bin === "git" && ["status", "diff", "log", "rev-parse"].includes(args[0]));
  if (!allowed) {
    throw new Error("只允许运行项目构建/测试/检查命令，以及只读 git status/diff/log/rev-parse 命令；不允许安装依赖或执行 shell 连接符。");
  }
  return { bin, args, display: value };
}

export async function runWorkspaceCommand(command, context = {}) {
  const { bin, args, display } = parseAllowedCommand(command);
  const isReadOnlyGitCommand = bin === "git" && ["status", "diff", "log", "rev-parse"].includes(args[0]);
  if (!isReadOnlyGitCommand) assertConfirmed(context);
  const cwd = getWorkspaceRoot(context);
  const output = await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("命令执行超过 120 秒，已停止。"));
    }, 120_000);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-20_000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  return { ok: output.code === 0, command: display, exitCode: output.code, stdout: output.stdout, stderr: output.stderr };
}
