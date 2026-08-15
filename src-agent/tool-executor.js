import { getSystemResourceSnapshot, getDiskSpace, killProcess, listRunningApps } from "./executors/system-executor.js";
import { closeApplicationByTarget, getApplicationStatus, launchAppByTarget, locateApplication } from "./executors/app-executor.js";
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
import {
  searchWorkspaceCode,
  readWorkspaceCode,
  applyWorkspacePatch,
  createWorkspaceFile,
  writeWorkspaceCode,
  runWorkspaceCommand
} from "./code-executor.js";
import fs from "node:fs/promises";
import path from "node:path";
import { openBrowserUrl, openInVscode, searchWeb } from "./executors/ui-automation-executor.js";
import { requestWeChatMessage } from "./executors/wechat-executor.js";
import {
  createOrganizationPreview,
  executeOrganizationPreview,
  listFileOperations,
  scanManagedDirectory,
  undoFileOperation
} from "./safe-file-manager.js";
import {
  abortWindowsPowerAction,
  cancelSchedule,
  confirmLatestPowerDraft,
  createPowerDraft,
  createReminder,
  listSchedules,
  updateReminder
} from "./schedule-engine.js";
import { activatePersonaCard, createPersonaCard, getActivePersonaCard, updatePersonaCard } from "./persona-cards.js";

function hasCurrentPersonaEditAuthorization(message) {
  const normalized = String(message || "").replace(/\s+/g, "");
  return /(?:修改|更新|调整|重写|换掉|改成|改名|叫做|叫我|称呼).{0,30}(?:人物卡|人格卡|人设|角色设定|名字|姓名|自称|称呼|性格|背景|口癖)/.test(normalized)
    || /(?:人物卡|人格卡|人设|角色设定|名字|姓名|自称|称呼|性格|背景|口癖).{0,30}(?:修改|更新|调整|重写|换掉|改成|改名|叫做)/.test(normalized);
}

function hasCurrentPersonaCreateAuthorization(message) {
  const normalized = String(message || "").replace(/\s+/g, "");
  return /(?:创建|新建|生成|制作|做|写).{0,24}(?:人物卡|人格卡|角色卡|人设卡)/.test(normalized)
    || /(?:人物卡|人格卡|角色卡|人设卡).{0,24}(?:创建|新建|生成|制作|做|写)/.test(normalized);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return String(value || "").split(/[、，,\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizePersonaToolPayload(args) {
  const source = args.payload && typeof args.payload === "object" && !Array.isArray(args.payload) ? args.payload : args;
  const aliases = {
    identityName: "identity_name", selfReference: "self_reference", userAddress: "user_address",
    personalityTraits: "personality_traits", speechStyle: "speech_style", exampleLines: "example_lines",
    live2dModelId: "live2d_model_id"
  };
  const payload = {};
  for (const key of ["identityName", "identity", "selfReference", "userAddress", "relationship", "values", "personalityTraits", "speechStyle", "habits", "boundaries", "background", "cosplay", "extra", "exampleLines", "live2dModelId"]) {
    const value = source[key] ?? source[aliases[key]];
    if (value !== undefined) payload[key] = ["values", "personalityTraits", "exampleLines"].includes(key) ? arrayValue(value) : value;
  }
  return payload;
}

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
        return await getApplicationStatus(baseDir, args.name);
      case "kill_process":
        return /^\d+$/.test(String(args.name || "").trim())
          ? await killProcess(args.name)
          : await closeApplicationByTarget(baseDir, args.name);
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
      case "open_browser_url":
        return await openBrowserUrl(args.url);
      case "search_web":
        return await searchWeb(args.query, args.engine);
      case "open_in_vscode":
        return await openInVscode(args.path, args.line);
      case "send_wechat_message":
        return await requestWeChatMessage(args, context);

      // ---- Schedules ----
      case "create_reminder": {
        const item = await createReminder(baseDir, { dueAt: args.due_at, message: args.message });
        await context.scheduleClient?.afterMutation?.();
        return { ok: true, item };
      }
      case "list_schedules":
        return { ok: true, items: await listSchedules(baseDir) };
      case "update_reminder": {
        const item = await updateReminder(baseDir, args.id, { dueAt: args.due_at, message: args.message });
        await context.scheduleClient?.afterMutation?.();
        return { ok: true, item };
      }
      case "cancel_schedule": {
        const item = await cancelSchedule(baseDir, args.id, new Date(), {
          beforeCancel: () => context.scheduleClient?.abortPowerAction?.() || abortWindowsPowerAction()
        });
        await context.scheduleClient?.afterMutation?.();
        return { ok: true, item };
      }
      case "create_power_action_draft": {
        const item = await createPowerDraft(baseDir, { action: args.action, dueAt: args.due_at, message: args.message });
        await context.scheduleClient?.afterMutation?.();
        return { ok: true, requiresConfirmation: true, item };
      }
      case "confirm_power_action": {
        const expectedText = args.action === "restart" ? "确认定时重启" : "确认定时关机";
        if (String(context.currentUserMessage || "").trim().replace(/[！!。.]$/, "") !== expectedText) {
          return { ok: false, requiresConfirmation: true, error: `只有用户当前消息单独为“${expectedText}”时才能确认。` };
        }
        const item = await confirmLatestPowerDraft(baseDir, args.action);
        await context.scheduleClient?.afterMutation?.();
        return { ok: true, item };
      }

      // ---- Persona card ----
      case "get_active_persona_card": {
        const card = await getActivePersonaCard(baseDir, context.config || {});
        return { ok: true, card };
      }
      case "create_persona_card": {
        if (!hasCurrentPersonaCreateAuthorization(context.currentUserMessage)) {
          return { ok: false, requiresCurrentUserAuthorization: true, error: "当前这条用户消息没有明确授权创建人物卡。" };
        }
        const payload = normalizePersonaToolPayload(args);
        const card = await createPersonaCard(baseDir, {
          name: args.name || args.card_name || `${payload.identityName || "新角色"} · 人物卡`,
          payload,
          source: "assistant_tool"
        });
        const activateRequested = args.activate === true && /(?:启用|切换|换成|使用).{0,20}(?:人物卡|角色|人设|它|她|他)/.test(String(context.currentUserMessage || ""));
        const resultCard = activateRequested ? await activatePersonaCard(baseDir, card.id) : card;
        return {
          ok: true,
          changed: true,
          activated: activateRequested,
          card: resultCard,
          message: activateRequested ? `人物卡“${card.name}”已创建并启用。` : `人物卡“${card.name}”已创建；需要时可在人物卡列表中启用。`
        };
      }
      case "update_active_persona_card": {
        if (!hasCurrentPersonaEditAuthorization(context.currentUserMessage)) {
          return { ok: false, requiresCurrentUserAuthorization: true, error: "当前这条用户消息没有明确授权修改人物卡。" };
        }
        const active = await getActivePersonaCard(baseDir, context.config || {});
        if (!active) return { ok: false, error: "没有找到当前启用的人物卡。" };
        const patch = args.patch && typeof args.patch === "object" && !Array.isArray(args.patch) ? args.patch : {};
        const updated = await updatePersonaCard(baseDir, active.id, {
          name: args.card_name || active.name,
          payload: patch,
          reason: `角色自行更新：${String(args.reason || "响应用户当前指令").slice(0, 180)}`,
          source: "assistant_tool"
        });
        return { ok: true, changed: true, card: updated, message: `人物卡已更新到版本 ${updated.version}，下一轮对话会直接使用。` };
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
        const index = context.ragClient
          ? await context.ragClient.rebuild(baseDir)
          : await rebuildRagIndex(baseDir);
        return { ok: true, files: index.files.length, chunks: index.chunks.length };
      }

      // ---- Workspace ----
      case "list_workspace": {
        const result = await executeWorkspaceIntent(
          { type: "workspace_list", targetPath: args.path || "" },
          { cwd: context.workspaceDir || process.cwd() }
        );
        return { ok: true, reply: result?.reply || "" };
      }
      case "scan_managed_directory":
        return { ok: true, ...(await scanManagedDirectory(args.path, { limit: args.limit })) };
      case "preview_file_organization": {
        const preview = await createOrganizationPreview(baseDir, args.path, { mode: args.mode, quarantine: args.quarantine });
        return { ok: true, preview, requiresConfirmation: true };
      }
      case "execute_file_organization": {
        if (String(context.currentUserMessage || "").trim() !== "确认执行文件整理") {
          return { ok: false, requiresConfirmation: true, error: "只有用户当前消息单独为“确认执行文件整理”时才能执行。" };
        }
        return { ok: true, operation: await executeOrganizationPreview(baseDir, args.preview_id) };
      }
      case "list_file_operations":
        return { ok: true, operations: await listFileOperations(baseDir, args.limit) };
      case "undo_file_operation":
        return { ok: true, operation: await undoFileOperation(baseDir, args.operation_id) };
      case "switch_workspace": {
        const result = await executeWorkspaceIntent(
          { type: "workspace_switch", targetPath: args.path || "" },
          { cwd: context.workspaceDir || process.cwd() }
        );
        return { ok: true, reply: result?.reply || "" };
      }

      // ---- Code agent ----
      case "search_workspace_code":
        return await searchWorkspaceCode(args.query, { extension: args.extension }, context);
      case "read_workspace_code":
        return await readWorkspaceCode(args.path, context);
      case "apply_workspace_patch":
        return await applyWorkspacePatch(args, context);
      case "create_workspace_file":
        return await createWorkspaceFile(args, context);
      case "write_workspace_code":
        return await writeWorkspaceCode(args, context);
      case "run_workspace_command":
        return await runWorkspaceCommand(args.command, context);

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
