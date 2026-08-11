import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function psQuote(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

export function windowsTaskName(id) {
  return `V-Manager-${String(id || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48)}`;
}

export function buildScheduledLaunchSpec({ executablePath, appPath, isPackaged, scheduleId }) {
  const executable = path.resolve(executablePath);
  const appArgument = isPackaged ? "" : `"${path.resolve(appPath)}" `;
  return {
    executable,
    arguments: `${appArgument}--vivi-background-schedule --vivi-schedule-id=${scheduleId}`,
    workingDirectory: isPackaged ? path.dirname(executable) : path.resolve(appPath)
  };
}

export async function registerWindowsScheduleTask(item, launchSpec, options = {}) {
  if (process.platform !== "win32" && !options.allowNonWindows) {
    return { ok: false, supported: false, error: "Windows 任务计划仅支持 Windows。" };
  }
  const dueAt = new Date(item.dueAt);
  if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date()) {
    return { ok: false, supported: true, error: "计划时间已经过去。" };
  }
  const taskName = windowsTaskName(item.id);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$action = New-ScheduledTaskAction -Execute ${psQuote(launchSpec.executable)} -Argument ${psQuote(launchSpec.arguments)} -WorkingDirectory ${psQuote(launchSpec.workingDirectory)}`,
    `$trigger = New-ScheduledTaskTrigger -Once -At ([DateTimeOffset]::Parse(${psQuote(dueAt.toISOString())}).LocalDateTime)`,
    "$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 10)",
    `Register-ScheduledTask -TaskName ${psQuote(taskName)} -Action $action -Trigger $trigger -Settings $settings -Description ${psQuote(`V-Manager ${item.type === "power" ? "电源计划" : "本地提醒"}`)} -Force | Out-Null`
  ].join("\n");
  const runner = options.runner || execFileAsync;
  try {
    await runner("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 20_000
    });
    return { ok: true, supported: true, taskName };
  } catch (error) {
    return { ok: false, supported: true, taskName, error: error.stderr || error.message };
  }
}

export async function unregisterWindowsScheduleTask(id, options = {}) {
  if (process.platform !== "win32" && !options.allowNonWindows) {
    return { ok: false, supported: false, error: "Windows 任务计划仅支持 Windows。" };
  }
  const taskName = windowsTaskName(id);
  const script = `$task = Get-ScheduledTask -TaskName ${psQuote(taskName)} -ErrorAction SilentlyContinue; if ($task) { Unregister-ScheduledTask -TaskName ${psQuote(taskName)} -Confirm:$false }`;
  const runner = options.runner || execFileAsync;
  try {
    await runner("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 20_000
    });
    return { ok: true, supported: true, taskName };
  } catch (error) {
    return { ok: false, supported: true, taskName, error: error.stderr || error.message };
  }
}
