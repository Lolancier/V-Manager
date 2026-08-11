import {
  abortWindowsPowerAction,
  cancelSchedule,
  confirmLatestPowerDraft,
  createPowerDraft,
  createReminder,
  listSchedulesForDay,
  listSchedules,
  parseNaturalSchedule,
  snoozeLatestReminder,
  updateReminder
} from "../schedule-engine.js";

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function actionLabel(action) {
  return action === "restart" ? "重启" : "关机";
}

export async function handle(message, context = {}) {
  const text = String(message || "").trim();
  const baseDir = context.baseDir;
  if (!baseDir) return null;

  const confirm = text.match(/^确认(?:执行)?(?:定时)?(关机|重启)[！!。.]?$/);
  if (confirm) {
    try {
      const item = await confirmLatestPowerDraft(baseDir, confirm[1] === "重启" ? "restart" : "shutdown");
      return {
        reply: `已确认：电脑将在 ${formatTime(item.dueAt)} ${actionLabel(item.action)}。执行前 Windows 会再提供约 60 秒取消时间。`,
        meta: { responseMode: "local_tool", localTool: "power_schedule_confirm" }
      };
    } catch (error) {
      return { reply: error.message, meta: { responseMode: "local_tool", localTool: "power_schedule_confirm" } };
    }
  }

  const snooze = text.match(/^(\d+)\s*分钟后(?:再|重新)?提醒我(?:一下)?[！!。.]?$/);
  if (snooze) {
    try {
      const item = await snoozeLatestReminder(baseDir, Number(snooze[1]));
      return { reply: `好，${snooze[1]} 分钟后再提醒你“${item.message}”。`, meta: { responseMode: "local_tool", localTool: "reminder_snooze" } };
    } catch (error) {
      return { reply: error.message, meta: { responseMode: "local_tool", localTool: "reminder_snooze" } };
    }
  }

  if (/^(?:取消|撤销)(?:定时)?(?:关机|重启|提醒|计划)/.test(text)) {
    try {
      const action = /重启/.test(text) ? "restart" : /关机/.test(text) ? "shutdown" : null;
      const candidates = await listSchedules(baseDir);
      const target = action ? [...candidates].reverse().find((item) => item.type === "power" && item.action === action) : null;
      if (action && !target) throw new Error(`当前没有可取消的定时${actionLabel(action)}计划。`);
      const item = await cancelSchedule(baseDir, target?.id);
      if (item.wasExecuting) await abortWindowsPowerAction();
      return { reply: `已取消“${item.title}”（原定 ${formatTime(item.dueAt)}）。`, meta: { responseMode: "local_tool", localTool: "schedule_cancel" } };
    } catch (error) {
      return { reply: error.message, meta: { responseMode: "local_tool", localTool: "schedule_cancel" } };
    }
  }

  if (/(?:查看|列出|有哪些|有什么|显示).*(?:提醒|计划|日程|安排|事项)|(?:提醒|计划|日程)(?:列表|清单)/.test(text)) {
    const todayOnly = /今天|今日/.test(text);
    const items = todayOnly ? await listSchedulesForDay(baseDir) : await listSchedules(baseDir);
    const reply = items.length
      ? `${todayOnly ? "今天的安排" : "当前本地日程"}：\n${items.map((item, index) => `${index + 1}. ${item.title} · ${formatTime(item.dueAt)}${item.status === "pending_confirmation" ? " · 等待确认" : ""}`).join("\n")}`
      : todayOnly ? "今天没有未完成的安排。" : "当前没有未完成的提醒或电源计划。";
    return { reply, meta: { responseMode: "local_tool", localTool: "schedule_list" } };
  }

  if (/(?:修改|改到|改成|推迟|提前).*(?:提醒|闹铃)|(?:提醒|闹铃).*(?:修改|改到|改成|推迟|提前)/.test(text)) {
    const parsedUpdate = parseNaturalSchedule(text);
    if (!parsedUpdate?.dueAt) {
      return { reply: "我还没识别出新的提醒时间，请再说一次明确日期和时间。", meta: { responseMode: "local_tool", localTool: "reminder_update" } };
    }
    try {
      const candidates = await listSchedules(baseDir);
      const target = [...candidates].reverse().find((item) => item.type === "reminder" && item.status === "scheduled");
      if (!target) throw new Error("当前没有可修改的提醒。");
      const contentMatch = text.match(/内容改(?:成|为)[“\"]?(.+?)[”\"]?(?:[。！!]|$)/);
      const item = await updateReminder(baseDir, target.id, {
        dueAt: parsedUpdate.dueAt,
        message: contentMatch?.[1]?.trim()
      });
      return { reply: `已经把“${item.message}”改到 ${formatTime(item.dueAt)}，本地日程表和 Windows 后台任务已一并更新。`, meta: { responseMode: "local_tool", localTool: "reminder_update" } };
    } catch (error) {
      return { reply: error.message, meta: { responseMode: "local_tool", localTool: "reminder_update" } };
    }
  }

  const parsed = parseNaturalSchedule(text);
  if (!parsed) return null;
  try {
    if (parsed.type === "power") {
      const item = await createPowerDraft(baseDir, parsed);
      return {
        reply: `我先创建了待确认计划：${formatTime(item.dueAt)} ${actionLabel(item.action)}电脑。\n这可能导致未保存内容丢失；请检查时间，确认无误后单独回复“确认定时${actionLabel(item.action)}”。`,
        meta: { responseMode: "local_tool", localTool: "power_schedule_draft" }
      };
    }
    const item = await createReminder(baseDir, parsed);
    return {
      reply: `记好了：${formatTime(item.dueAt)} 提醒你“${item.message}”。`,
      meta: { responseMode: "local_tool", localTool: "reminder_create" }
    };
  } catch (error) {
    return { reply: `计划没有创建：${error.message}`, meta: { responseMode: "local_tool", localTool: "schedule_error" } };
  }
}
