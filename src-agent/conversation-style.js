function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function deriveConversationStyle(message, relationshipProfile, personaText = "") {
  const text = String(message || "");
  const persona = String(personaText || "");
  const emotion = relationshipProfile?.emotion || {};
  const wantsDetail = /详细|展开|深入|具体分析|一步一步|完整说明|长一点|多讲/.test(text);
  const wantsBrief = /简短|简单说|一句话|直接说|只告诉我|别展开/.test(text);
  const tersePersona = /寡言|惜字如金|简洁|短句|话少|不爱说话/.test(persona);
  const talkativePersona = /健谈|话多|活泼|热情|爱聊天|絮叨/.test(persona);
  const lowMood = Number(emotion.valence ?? 0) <= -0.35 || emotion.label === "低落" || emotion.label === "不悦";
  const brightMood = Number(emotion.valence ?? 0) >= 0.45 || emotion.label === "开心" || emotion.label === "活跃";

  let maxChars = 110;
  let sentenceRange = "通常 1–4 句";
  if (lowMood) {
    maxChars = 70;
    sentenceRange = "通常 1–2 句，语气安静克制";
  } else if (brightMood) {
    maxChars = 160;
    sentenceRange = "通常 2–5 句，可以比平时多分享一点";
  }
  if (tersePersona) maxChars *= 0.65;
  if (talkativePersona && !lowMood) maxChars *= 1.25;
  if (wantsBrief) maxChars = Math.min(maxChars, 55);
  if (wantsDetail) {
    maxChars = 650;
    sentenceRange = "用户明确要求详细说明，可以分段或列点，但仍避免重复铺陈";
  }
  maxChars = Math.round(clamp(maxChars, 35, 650));
  // Reasoning-capable chat models spend completion tokens before visible text is
  // emitted. A tiny budget can therefore produce an empty answer even when the
  // requested reply is short. Keep the visible-length instruction compact, but
  // reserve enough completion budget for reasoning and a complete final answer.
  const maxTokens = Math.round(clamp(maxChars * 1.65 + 512, 768, 2048));

  return {
    maxChars,
    maxTokens,
    instruction: [
      `本轮回复长度：${sentenceRange}，正文尽量不超过约 ${maxChars} 个中文字符。`,
      "先直接回应用户，再决定是否补一句自然的关心或追问；不要写成小作文，不复述用户整段话。",
      "日常聊天不要使用标题、总结、排比式铺陈或连续舞台动作描写；只有用户明确要求详细内容时才展开。",
      "心情会影响表达量：低落时可以少说，开心时可以稍微多说；但不要故意冷落、惩罚或索取安慰。"
    ].join("\n")
  };
}
