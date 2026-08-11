import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeLocalDatabase } from "../src-agent/local-database.js";
import {
  activatePersonaCard,
  archivePersonaCard,
  buildPersonaCardPrompt,
  createPersonaCard,
  ensureDefaultPersonaCard,
  listPersonaCards,
  updatePersonaCard
} from "../src-agent/persona-cards.js";

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
  assert.match(buildPersonaCardPrompt(updated), /不得把虚构内容写成用户的现实事实/);

  await activatePersonaCard(baseDir, created.id);
  let cards = await listPersonaCards(baseDir);
  assert.equal(cards.find((card) => card.id === created.id)?.isActive, true);
  await archivePersonaCard(baseDir, original.id);
  cards = await listPersonaCards(baseDir);
  assert.equal(cards.find((card) => card.id === original.id)?.status, "archived");
  assert.equal(cards.find((card) => card.id === created.id)?.version, 2);
});
