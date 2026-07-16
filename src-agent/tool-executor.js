import { getSystemResourceSnapshot, getDiskSpace, checkProcessRunning, killProcess, listRunningApps } from "./executors/system-executor.js";
import { launchAppByTarget, locateApplication } from "./executors/app-executor.js";
import {
  listDirectoryContent,
  readFileContent,
  openTarget,
  createFolderCmd,
  createTextFileCmd,
  appendToFileCmd,
  deletePathCmd,
  searchLocalFiles
} from "./executors/file-executor.js";
import { refreshAppRegistry } from "./app-registry.js";
import { getRagSnapshot, rebuildRagIndex, loadRagConfig, retrieveRagContext } from "./rag.js";
import { getAgentPaths } from "./runtime-paths.js";
import { tokenize } from "./shared/utils.js";
import { executeWorkspaceIntent } from "./workspace-executor.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Execute a tool by name and return a structured result.
 * @param {string} name - Tool function name
 * @param {object} args - Parsed arguments from the model
 * @param {{ baseDir: string }} context - Agent context
 * @returns {Promise<object>} Structured result (always has an `ok` field)
 */
export async function executeTool(name, args = {}, context = {}) {
  const { baseDir } = context;

  try {
    switch (name) {
      // ---- System ----
      case "get_system_resources": {
        const resources = await getSystemResourceSnapshot();
        return {
          ok: true,
          cpu: { model: resources.cpuModel, usagePercent: resources.cpuUsagePercent },
          memory: { totalGB: resources.totalMemoryGB, usedGB: resources.usedMemoryGB, freeGB: +(resources.totalMemoryGB - resources.usedMemoryGB).toFixed(1), usagePercent: resources.memoryUsagePercent },
          processes: { total: resources.processCount, visibleWindows: resources.visibleAppCount },
          topMemory: (resources.topProcesses || []).slice(0, 5).map((p) => ({ name: p.name, pid: p.pid, memoryMB: p.memoryMB }))
        };
      }
      case "get_disk_space":
        return await getDiskSpace(args.drive);
      case "check_process_running":
        return await checkProcessRunning(args.name);
      case "kill_process":
        return await killProcess(args.name);
      case "list_running_apps":
        return await listRunningApps();

      // ---- App ----
      case "launch_application": {
        try {
          const result = await launchAppByTarget(baseDir, args.name);
          return {
            ok: true,
            label: result.label,
            targetPath: result.targetPath,
            launchMode: result.launchMode,
            launcherPid: result.launcherPid
          };
        } catch (error) {
          return { ok: false, target: args.name, error: error.message };
        }
      }
      case "find_application":
        return await locateApplication(args.name, baseDir);
      case "refresh_app_registry": {
        const registry = await refreshAppRegistry(baseDir);
        return { ok: true, appCount: registry.apps.length };
      }

      // ---- File ----
      case "list_directory":
        return await listDirectoryContent(args.path);
      case "read_text_file":
        return await readFileContent(args.path);
      case "open_file_or_folder":
        return await openTarget(args.path);
      case "create_folder":
        return await createFolderCmd(args.path);
      case "create_text_file":
        return await createTextFileCmd(args.path);
      case "append_to_file":
        return await appendToFileCmd(args.path, args.content);
      case "delete_file_or_folder":
        return await deletePathCmd(args.path);
      case "search_files": {
        const results = await searchLocalFiles(args.query);
        return { ok: true, query: args.query, count: results.length, results: results.slice(0, 20) };
      }

      // ---- RAG ----
      case "search_knowledge_base": {
        const { knowledgeDir } = getAgentPaths(baseDir);
        const ragConfig = await loadRagConfig(baseDir);
        const files = await fs.readdir(knowledgeDir);
        const queryTokens = tokenize(args.query);
        const scored = [];

        for (const file of files) {
          const fullPath = path.join(knowledgeDir, file);
          const content = await fs.readFile(fullPath, "utf-8");
          const contentTokens = tokenize(content);
          let score = 0;
          for (const token of queryTokens) {
            if (contentTokens.includes(token)) score += 1;
          }
          if (score > 0) {
            scored.push({ file, score, content: content.slice(0, 600) });
          }
        }

        const topItems = scored.sort((a, b) => b.score - a.score).slice(0, ragConfig.topK || 3);
        return {
          ok: true,
          query: args.query,
          count: topItems.length,
          items: topItems.map((item) => ({ file: item.file, snippet: item.content.split("\n").slice(0, 8).join("\n") }))
        };
      }
      case "get_rag_status": {
        const snapshot = await getRagSnapshot(baseDir);
        return { ok: true, files: snapshot.status.indexedFileCount, chunks: snapshot.status.indexedChunkCount, updatedAt: snapshot.status.updatedAt };
      }
      case "rebuild_rag_index": {
        const index = await rebuildRagIndex(baseDir);
        return { ok: true, files: index.files.length, chunks: index.chunks.length };
      }

      // ---- Workspace ----
      case "list_workspace": {
        const result = await executeWorkspaceIntent({ type: "workspace_list", targetPath: args.path || "" }, { cwd: process.cwd() });
        return { ok: true, reply: result?.reply || "" };
      }
      case "switch_workspace": {
        const result = await executeWorkspaceIntent({ type: "workspace_switch", targetPath: args.path || "" }, { cwd: process.cwd() });
        return { ok: true, reply: result?.reply || "" };
      }

      // ---- Mood (handled by core.js interceptor, fallback no-op) ----
      case "set_mood":
        return { ok: true };

      default:
        return { ok: false, error: `未知工具: ${name}` };
    }
  } catch (error) {
    return { ok: false, error: error.message, tool: name };
  }
}
