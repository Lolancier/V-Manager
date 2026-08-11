const metadataLine = /^\s*\[(?:mood|face):.*\]\s*$/i;
const voiceTag = /\[(?:whispers?|laughs?|sighs?|excited|sad|angry|curious|surprised)\]/gi;

function stripDelimitedSections(input, open, close) {
  let depth = 0;
  let output = "";
  let pending = "";
  for (const char of input) {
    if (char === open) {
      if (depth === 0) pending = char;
      else pending += char;
      depth += 1;
      continue;
    }
    if (char === close && depth > 0) {
      depth -= 1;
      if (depth === 0) pending = "";
      else pending += char;
      continue;
    }
    if (depth === 0) output += char;
    else pending += char;
  }
  // Preserve malformed, unmatched text instead of silently dropping the rest
  // of the reply. Well-formed stage directions are still removed.
  if (depth > 0) output += pending;
  return output;
}

export function sanitizeSpeechText(input) {
  let text = String(input || "")
    .split(/\r?\n/)
    .filter((line) => !metadataLine.test(line))
    .join("\n");

  // Parenthesized passages are Vivi's stage directions / inner monologue. They
  // stay visible in chat, but are deliberately excluded from spoken output.
  text = stripDelimitedSections(text, "（", "）");
  text = stripDelimitedSections(text, "(", ")");
  text = text.replace(voiceTag, " ");

  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
