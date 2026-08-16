import fs from "node:fs/promises";
import path from "node:path";
import { analyzeElectronArchitecture } from "./electron-architecture-audit.mjs";

const root = process.cwd();
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

async function listFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(relative));
    else result.push(relative);
  }
  return result;
}

const [main, electronFiles, packageJson, indexHtml, memoryService, scheduleService, core, appExecutor, toolExecutor] = await Promise.all([
  read("electron/main.js"),
  listFiles("electron"),
  read("package.json").then(JSON.parse),
  read("index.html"),
  read("electron/services/memory-service.js"),
  read("electron/services/schedule-service.js"),
  read("src-agent/core.js"),
  read("src-agent/executors/app-executor.js"),
  read("src-agent/tool-executor.js")
]);
const agentFiles = (await listFiles("src-agent")).filter((file) => /\.(?:c?js|mjs)$/.test(file));
const directElectronImports = [];
for (const file of agentFiles) {
  const content = await read(file);
  if (/from\s+["']electron["']|require\(["']electron["']\)/.test(content)) directElectronImports.push(file);
}

const result = analyzeElectronArchitecture({
  main,
  electronFiles,
  packageJson,
  indexHtml,
  directElectronImports,
  ragSources: { memoryService, core, appExecutor, toolExecutor },
  scheduleService
});
console.log(JSON.stringify(result, null, 2));
if (result.critical.length) process.exitCode = 1;
