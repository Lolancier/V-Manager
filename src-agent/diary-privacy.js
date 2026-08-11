const DIARY_MENTION_RE = /日记|日志|今天写了什么/;
const DIARY_OPEN_RE = /(?:打开|给我看|让我看|看看|读给我|展示).{0,8}(?:日记|日志)|(?:日记|日志).{0,8}(?:打开|给我看|让我看|看看|展示)/;
const DIARY_STATUS_RE = /(?:写|记|更新|完成).{0,6}(?:日记|日志)|(?:日记|日志).{0,8}(?:写|记|更新|完成).{0,3}(?:了|吗|没|没有|没有啊)?/;

export function classifyDiaryRequest(message) {
  const text = String(message || "").trim();
  if (!DIARY_MENTION_RE.test(text)) return null;
  if (DIARY_OPEN_RE.test(text)) return "open";
  if (DIARY_STATUS_RE.test(text) || /日记呢/.test(text)) return "status";
  return null;
}

export function canShareDiaryInChat(profile) {
  const stage = profile?.affection?.stage;
  const valence = Number(profile?.emotion?.valence ?? 0);
  return (stage === "close_friend" || stage === "kindred") && valence >= -0.35;
}

export function diaryStatusReply({ written, profile, personaName = "Vivi" }) {
  const mood = profile?.emotion?.label || "平静";
  const shareable = written && canShareDiaryInChat(profile);
  if (!written) return "还没有。等我今天写好了，会安静地放在自己的空间里。";
  if (mood === "低落" || mood === "不悦") return "写了。今天不太想多说，不过我有好好收着。";
  if (shareable && (mood === "开心" || mood === "温柔")) return "写啦。今天心情还不错……你真想看的话，我可以打开给你。";
  if (shareable) return "嗯，今天的已经写好了。你想看的话，可以直接问我。";
  return `${personaName}今天写过了，安静地放在私密空间里。`;
}

export function diaryOpenReply({ written, profile }) {
  if (!written) return { allowed: false, reply: "今天的还没写好，暂时没有可以打开的内容。" };
  if (!canShareDiaryInChat(profile)) {
    const lowMood = Number(profile?.emotion?.valence ?? 0) < -0.35;
    return {
      allowed: false,
      reply: lowMood
        ? "今天先不给你看。我想自己安静地收着。"
        : "这篇我暂时想留在自己的空间里。你如果确实要查看，可以去设置里的“Vivi的私密空间”。"
    };
  }
  return { allowed: true, reply: "好吧，只给你看一下。我帮你打开了。" };
}
