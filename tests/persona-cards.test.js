import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeLocalDatabase } from "../src-agent/local-database.js";
import {
  activatePersonaCard,
  archivePersonaCard,
  applyPersonaCardToConfig,
  buildPersonaCardPrompt,
  createPersonaCard,
  ensureDefaultPersonaCard,
  listPersonaCards,
  updatePersonaCard
} from "../src-agent/persona-cards.js";
import { executeTool } from "../src-agent/tool-executor.js";
import { resolveAgentRoute } from "../src-agent/router.js";

test("persona cards version, switch and archive without deleting history", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-persona-"));
  await initializeLocalDatabase(baseDir);
  const original = await ensureDefaultPersonaCard(baseDir, { personaName: "Vivi", personaPrompt: "自然说话" });
  assert.equal(original.isActive, true);

  const created = await createPersonaCard(baseDir, {
    name: "侦探 Vivi",
    payload: { identityName: "Vivi", cosplay: "冷静的侦探", values: ["诚实"] }
  });
  const updated = await updatePersonaCard(baseDir, created.id, {
    name: "侦探 Vivi",
    payload: { ...created.payload, userAddress: "搭档" }
  });
  assert.equal(updated.version, 2);
  const prompt = buildPersonaCardPrompt(updated);
  assert.match(prompt, /不得把虚构内容写成用户的现实事实/);
  assert.match(prompt, /当前唯一角色身份/);
  assert.match(prompt, /不要退回成泛化的“桌面 Agent”介绍/);

  await activatePersonaCard(baseDir, created.id);
  let cards = await listPersonaCards(baseDir);
  assert.equal(cards.find((card) => card.id === created.id)?.isActive, true);
  await archivePersonaCard(baseDir, original.id);
  cards = await listPersonaCards(baseDir);
  assert.equal(cards.find((card) => card.id === original.id)?.status, "archived");
  assert.equal(cards.find((card) => card.id === created.id)?.version, 2);
});

test("persona voice pack selects exactly one provider and voice", () => {
  const base = { personaName: "Vivi", appearance: {}, voice: { provider: "gpt_sovits", gptSovitsProfileId: "old", localPackId: "old", localSpeakerId: 0 } };
  const local = applyPersonaCardToConfig(base, { id: "a", version: 1, name: "A", payload: { identityName: "A", voicePackId: "sherpa-zh:2" } });
  assert.equal(local.voice.provider, "local");
  assert.equal(local.voice.localPackId, "sherpa-zh");
  assert.equal(local.voice.localSpeakerId, 2);
  const sovits = applyPersonaCardToConfig(base, { id: "b", version: 1, name: "B", payload: { identityName: "B", voicePackId: "gpt-sovits:shorekeeper" } });
  assert.equal(sovits.voice.provider, "gpt_sovits");
  assert.equal(sovits.voice.gptSovitsProfileId, "shorekeeper");
});

test("explicit chat commands can update the active persona while vague requests cannot", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-persona-tool-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  await initializeLocalDatabase(baseDir);
  await ensureDefaultPersonaCard(baseDir, { personaName: "Vivi" });

  assert.equal(resolveAgentRoute("把你的名字改成九条真白，并更新人物卡").type, "persona_control");
  const rejected = await executeTool("update_active_persona_card", {
    patch: { identityName: "九条真白" }, reason: "想换名字"
  }, { baseDir, currentUserMessage: "你觉得这个名字怎么样" });
  assert.equal(rejected.ok, false);

  const accepted = await executeTool("update_active_persona_card", {
    patch: { identityName: "九条真白", selfReference: "真白" }, reason: "按用户要求改名"
  }, { baseDir, currentUserMessage: "把你的名字改成九条真白，并更新人物卡" });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.card.version, 2);
  assert.equal(accepted.card.payload.identityName, "九条真白");
});

test("explicit chat commands can create a new persona card from flat DSML-style arguments", async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-persona-create-tool-"));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  await initializeLocalDatabase(baseDir);
  await ensureDefaultPersonaCard(baseDir, { personaName: "九条真白" });

  const rejected = await executeTool("create_persona_card", { name: "守岸人", identity_name: "守岸人" }, {
    baseDir,
    currentUserMessage: "你觉得守岸人怎么样"
  });
  assert.equal(rejected.ok, false);

  const accepted = await executeTool("create_persona_card", {
    name: "守岸人",
    identity_name: "守岸人",
    identity: "黑海岸的守护者",
    personality_traits: ["温柔", "坚定"],
    example_lines: ["漂泊者，你来了。"]
  }, { baseDir, currentUserMessage: "帮我生成一个鸣潮守岸人的人物卡" });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.activated, false);
  assert.equal(accepted.card.payload.identityName, "守岸人");
  assert.deepEqual(accepted.card.payload.personalityTraits, ["温柔", "坚定"]);
});
