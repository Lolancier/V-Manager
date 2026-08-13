import { randomUUID } from "node:crypto";

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function parseParameterValue(raw, stringFlag) {
  const value = decodeEntities(raw).trim();
  if (String(stringFlag).toLowerCase() === "true") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Some DeepSeek-compatible gateways serialize function calls as DSML in the
 * assistant content instead of returning OpenAI-style tool_calls. Convert only
 * explicitly advertised tools; unknown markup is never executable.
 */
export function parseDsmlToolCalls(content, allowedToolNames = []) {
  const source = String(content || "");
  if (!/<[｜|]{2}DSML[｜|]{2}tool_calls>/i.test(source)) return [];
  const allowed = new Set(allowedToolNames);
  const calls = [];
  const invokePattern = /<[｜|]{2}DSML[｜|]{2}invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/[｜|]{2}DSML[｜|]{2}invoke>/gi;
  for (const invoke of source.matchAll(invokePattern)) {
    const name = invoke[1].trim();
    if (!allowed.has(name)) continue;
    const args = {};
    const parameterPattern = /<[｜|]{2}DSML[｜|]{2}parameter\s+name="([^"]+)"(?:\s+string="([^"]+)")?\s*>([\s\S]*?)<\/[｜|]{2}DSML[｜|]{2}parameter>/gi;
    for (const parameter of invoke[2].matchAll(parameterPattern)) {
      args[parameter[1].trim()] = parseParameterValue(parameter[3], parameter[2]);
    }
    calls.push({
      id: `call_dsml_${randomUUID().replace(/-/g, "")}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) }
    });
  }
  return calls;
}

export function normalizeToolCallMessage(message, tools = []) {
  if (!message || message.tool_calls?.length) return message;
  const allowed = tools.map((tool) => tool.function?.name).filter(Boolean);
  const toolCalls = parseDsmlToolCalls(message.content, allowed);
  return toolCalls.length ? { ...message, content: null, tool_calls: toolCalls } : message;
}
