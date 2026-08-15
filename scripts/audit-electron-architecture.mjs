import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");
const countLines = (text) => text.split(/\r?\n/).length;
const countMatches = (text, pattern) => [...text.matchAll(pattern)].length;

async function listFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(relative));
    else result.push(relative);
  }
  return result;
}

const [main, electronFiles, packageJson] = await Promise.all([
  read("electron/main.js"),
  listFiles("electron"),
  read("package.json").then(JSON.parse)
]);
const preloadSources = electronFiles
  .filter((file) => /(?:^|[\\/])preload(?:[.-][^\\/]*)?\.(?:c?js|mjs)$/.test(file))
  .map((file) => file.replaceAll("\\", "/"))
  .sort();
const agentFiles = (await listFiles("src-agent")).filter((file) => /\.(?:c?js|mjs)$/.test(file));
const directElectronImports = [];
for (const file of agentFiles) {
  const content = await read(file);
  if (/from\s+["']electron["']|require\(["']electron["']\)/.test(content)) directElectronImports.push(file);
}

const windowBlocks = [...main.matchAll(/new BrowserWindow\(\{([\s\S]*?)\n\s*\}\);/g)].map((match) => match[1]);
const insecureWindows = windowBlocks.filter((block) => /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/.test(block));
const metrics = {
  electronVersion: packageJson.devDependencies?.electron || packageJson.dependencies?.electron || "missing",
  mainLines: countLines(main),
  directMainIpcHandlers: countMatches(main, /ipcMain\.handle\(/g),
  directMainIpcListeners: countMatches(main, /ipcMain\.on\(/g),
  browserWindowConstructors: windowBlocks.length,
  directElectronImportsInAgentCore: directElectronImports,
  insecureWindowDefinitions: insecureWindows.length,
  preloadSources,
  browserWindowsUsingCanonicalPreload: windowBlocks.filter((block) => /preload:\s*PRELOAD_PATH\b/.test(block)).length,
  canonicalPreloadPackaged: packageJson.main === "electron/main.js" && packageJson.build?.files?.includes("electron/**/*"),
  singleRendererEntrypoint: /src\/main\.tsx/.test(await read("index.html"))
};

const critical = [];
const warnings = [];
if (metrics.insecureWindowDefinitions) critical.push(`${metrics.insecureWindowDefinitions} 个 BrowserWindow 使用了不安全的 webPreferences`);
if (directElectronImports.length) critical.push(`src-agent 仍直接导入 Electron：${directElectronImports.join(", ")}`);
if (preloadSources.length !== 1 || preloadSources[0] !== "electron/preload.cjs") critical.push(`preload 必须只有 electron/preload.cjs 一个源，当前为：${preloadSources.join(", ") || "无"}`);
if (!/const PRELOAD_PATH = path\.join\(__dirname, ["']preload\.cjs["']\);/.test(main)) critical.push("主进程未声明 canonical PRELOAD_PATH");
if (metrics.browserWindowsUsingCanonicalPreload !== metrics.browserWindowConstructors) critical.push(`${metrics.browserWindowConstructors - metrics.browserWindowsUsingCanonicalPreload} 个 BrowserWindow 未使用 canonical PRELOAD_PATH`);
if (!metrics.canonicalPreloadPackaged) critical.push("生产打包入口或 electron/**/* 文件清单未包含 canonical preload");
if (metrics.mainLines > 1500) warnings.push(`electron/main.js 仍有 ${metrics.mainLines} 行，需要按领域继续拆分`);
if (metrics.directMainIpcHandlers > 30) warnings.push(`主文件仍直接注册 ${metrics.directMainIpcHandlers} 个 IPC handler`);
if (metrics.singleRendererEntrypoint) warnings.push("所有窗口共用单一 React 入口，尚未按窗口进行代码分割");

console.log(JSON.stringify({ metrics, critical, warnings }, null, 2));
if (critical.length) process.exitCode = 1;
