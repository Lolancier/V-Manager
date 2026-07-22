import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeWorkspaceCode } from "../src-agent/code-executor.js";

test("direct editor save requires explicit confirmation", async () => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-code-"));
  try {
    await fs.writeFile(path.join(workspaceDir, "demo.js"), "const value = 1;\n", "utf-8");
    await assert.rejects(
      writeWorkspaceCode(
        { path: "demo.js", content: "const value = 2;\n", expected_content: "const value = 1;\n" },
        { workspaceDir }
      ),
      /确认执行/
    );
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});

test("direct editor save detects concurrent changes instead of overwriting them", async () => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-code-"));
  try {
    const filePath = path.join(workspaceDir, "demo.js");
    await fs.writeFile(filePath, "const value = 2;\n", "utf-8");
    await assert.rejects(
      writeWorkspaceCode(
        { path: "demo.js", content: "const value = 3;\n", expected_content: "const value = 1;\n" },
        { workspaceDir, codeAgentConfirmed: true }
      ),
      /已被其他操作修改/
    );
    assert.equal(await fs.readFile(filePath, "utf-8"), "const value = 2;\n");
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});

test("direct editor saves an unchanged-base edit inside the workspace", async () => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-code-"));
  try {
    const filePath = path.join(workspaceDir, "demo.js");
    await fs.writeFile(filePath, "const value = 1;\n", "utf-8");
    const result = await writeWorkspaceCode(
      { path: "demo.js", content: "const value = 3;\n", expected_content: "const value = 1;\n" },
      { workspaceDir, codeAgentConfirmed: true }
    );
    assert.equal(result.changed, true);
    assert.equal(await fs.readFile(filePath, "utf-8"), "const value = 3;\n");
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});

test("an empty file base is still protected from concurrent edits", async () => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-code-"));
  try {
    const filePath = path.join(workspaceDir, "empty.js");
    await fs.writeFile(filePath, "// changed elsewhere\n", "utf-8");
    await assert.rejects(
      writeWorkspaceCode(
        { path: "empty.js", content: "// my edit\n", expected_content: "" },
        { workspaceDir, codeAgentConfirmed: true }
      ),
      /已被其他操作修改/
    );
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});
