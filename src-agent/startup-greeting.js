function completionText(choice) {
  return String(choice?.message?.content || choice?.text || "").trim();
}

function periodOfDay(now) {
  const hour = now.getHours();
  if (hour < 6) return "深夜";
  if (hour < 11) return "早上";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  return "晚上";
}

export function fallbackStartupGreeting(config, context = {}, now = new Date()) {
  const name = config.personaName || "Vivi";
  const address = context.userAddress || "你";
  const recent = context.history?.filter((item) => item.role === "user").at(-1)?.content;
  const variants = recent ? [
    `${address}，你回来啦。上次说到的事情，我还记得。要接着聊聊吗？`,
    `又见面了。刚才想起我们上次聊的那些事……${address}今天想从哪里继续？`,
    `${periodOfDay(now)}好。看到你回来，我就放心了一点。上次的话题还要继续吗？`
  ] : [
    `${periodOfDay(now)}好，${address}。${name}在这里，今天想先聊些什么？`,
    `你来啦。刚刚还在想，今天会不会见到你。`,
    `${address}，欢迎回来。今天看起来很适合慢慢聊一会儿。`
  ];
  return variants[(now.getDate() + now.getHours()) % variants.length];
}

export async function generateStartupGreeting(config, context = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const fallback = fallbackStartupGreeting(config, context, now);
  if (!config.deepseek?.apiKey) return { reply: fallback, mode: "local" };
  const fetchImpl = options.modelFetch || fetch;
  const recentHistory = (context.history || []).slice(-10).map((item) => `${item.role === "user" ? "用户" : "角色"}：${item.content}`).join("\n");
  const memory = context.memory || {};
  const prompt = [
    config.personaPrompt || `你是 ${config.personaName || "Vivi"}。`,
    "现在应用刚刚启动，用户再次见到你。生成一句自然、简短、有角色感的见面问候。",
    "可以承接最近话题或记忆，但不要机械复述；不要自我介绍，不要说明软件功能、设置入口或系统状态。",
    "不要使用固定模板，不要输出舞台说明、括号动作、Markdown 或引号。控制在 15 到 70 个汉字。",
    `当前时间：${now.toLocaleString("zh-CN", { hour12: false })}`,
    `长期记忆摘要：${JSON.stringify({ facts: memory.facts?.slice(-3), episodes: memory.episodes?.slice(-3), habits: memory.habits?.slice(-3), commitments: memory.commitments?.filter((item) => item.status === "open").slice(-2) })}`,
    `近期对话：\n${recentHistory || "暂无"}`
  ].join("\n\n");
  try {
    const response = await fetchImpl(`${String(config.deepseek.baseUrl).replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: options.signal || AbortSignal.timeout(12_000),
      headers: { authorization: `Bearer ${config.deepseek.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.deepseek.chatModel || config.deepseek.model,
        temperature: 1.05,
        max_tokens: 180,
        messages: [{ role: "system", content: prompt }, { role: "user", content: "自然地和我见面。" }]
      })
    });
    if (!response.ok) return { reply: fallback, mode: "local" };
    const body = await response.json();
    const reply = completionText(body.choices?.[0]).replace(/^[“\"]|[”\"]$/g, "").trim();
    return { reply: reply && reply.length <= 180 ? reply : fallback, mode: reply ? "model" : "local" };
  } catch {
    return { reply: fallback, mode: "local" };
  }
}
