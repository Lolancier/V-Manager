const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export function estimateTokens(value) {
  const text = String(value ?? "");
  if (!text) return 0;
  const cjk = text.match(CJK_PATTERN)?.length || 0;
  const remainder = text.replace(CJK_PATTERN, "").replace(/\s+/g, " ").trim();
  return cjk + Math.ceil(remainder.length / 4);
}

export function estimateMessageTokens(message) {
  if (!message) return 0;
  return 4 + estimateTokens(message.role) + estimateTokens(message.content)
    + estimateTokens(message.tool_calls ? JSON.stringify(message.tool_calls) : "")
    + estimateTokens(message.tool_call_id || "");
}

export function truncateToTokenBudget(value, tokenBudget, { keepEnd = false } = {}) {
  const text = String(value ?? "");
  const budget = Math.max(0, Math.floor(Number(tokenBudget) || 0));
  if (!text || budget === 0) return "";
  if (estimateTokens(text) <= budget) return text;
  const marker = "…";
  const contentBudget = Math.max(0, budget - estimateTokens(marker));
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = keepEnd ? text.slice(text.length - middle) : text.slice(0, middle);
    if (estimateTokens(candidate) <= contentBudget) low = middle;
    else high = middle - 1;
  }
  if (keepEnd) return `${marker}${text.slice(text.length - low)}`;
  return `${text.slice(0, low)}${marker}`;
}

export function trimKnowledgeToTokenBudget(items = [], tokenBudget = 1800) {
  const budget = Math.max(0, Math.floor(Number(tokenBudget) || 0));
  const selected = [];
  let used = 0;
  const fingerprints = new Set();
  for (const item of items) {
    if (!item || used >= budget) break;
    const normalized = String(item.content || "").replace(/\s+/g, " ").trim();
    const fingerprint = normalized.slice(0, 160);
    if (!normalized || fingerprints.has(fingerprint)) continue;
    const headerTokens = estimateTokens(item.file || "") + 8;
    const available = budget - used - headerTokens;
    if (available < 24) break;
    const content = truncateToTokenBudget(item.content, available);
    selected.push({ ...item, content });
    fingerprints.add(fingerprint);
    used += headerTokens + estimateTokens(content);
  }
  return { items: selected, estimatedTokens: used, budget };
}
