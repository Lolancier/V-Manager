import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  classifyFile,
  createOrganizationPreview,
  executeOrganizationPreview,
  listFileOperations,
  scanManagedDirectory,
  undoFileOperation
} from "../src-agent/safe-file-manager.js";
import { executeTool } from "../src-agent/tool-executor.js";

test("safe scan classifies files without changing the directory", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-files-"));
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-data-"));
  t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(data, { recursive: true, force: true })]));
  await fs.writeFile(path.join(root, "report.pdf"), "pdf");
  await fs.writeFile(path.join(root, "photo.png"), "png");
  const scan = await scanManagedDirectory(root);
  assert.equal(scan.total, 2);
  assert.equal(classifyFile("report.pdf"), "document");
  assert.equal(await fs.readFile(path.join(root, "report.pdf"), "utf8"), "pdf");
});

test("organization requires a preview and can be undone from its operation log", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-files-"));
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-data-"));
  t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(data, { recursive: true, force: true })]));
  const source = path.join(root, "notes.txt");
  await fs.writeFile(source, "hello");
  const preview = await createOrganizationPreview(data, root, { mode: "type" });
  assert.equal(preview.status, "pending");
  assert.equal(await fs.readFile(source, "utf8"), "hello");

  const operation = await executeOrganizationPreview(data, preview.id);
  assert.equal(operation.moves.length, 1);
  assert.equal(await fs.stat(source).catch(() => null), null);
  assert.equal(await fs.readFile(operation.moves[0].to, "utf8"), "hello");

  const undo = await undoFileOperation(data, operation.id);
  assert.equal(undo.moves.length, 1);
  assert.equal(await fs.readFile(source, "utf8"), "hello");
  assert.ok((await listFileOperations(data)).length >= 2);
});

test("disk roots are rejected as an unsafe organization scope", async () => {
  await assert.rejects(() => scanManagedDirectory(path.parse(process.cwd()).root), /根目录/);
});

test("execution refuses files changed after the preview", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-files-"));
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-data-"));
  t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(data, { recursive: true, force: true })]));
  const source = path.join(root, "changing.txt");
  await fs.writeFile(source, "before");
  const preview = await createOrganizationPreview(data, root, { mode: "type" });
  await fs.writeFile(source, "changed after preview");
  await assert.rejects(() => executeOrganizationPreview(data, preview.id), /发生变化/);
  assert.equal(await fs.readFile(source, "utf8"), "changed after preview");
});

test("the organization tool requires the exact current confirmation message", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-files-"));
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "vivi-data-"));
  t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(data, { recursive: true, force: true })]));
  await fs.writeFile(path.join(root, "safe.txt"), "safe");
  const preview = await createOrganizationPreview(data, root, { mode: "type" });
  const rejected = await executeTool("execute_file_organization", { preview_id: preview.id }, { baseDir: data, currentUserMessage: "确认" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.requiresConfirmation, true);
  const accepted = await executeTool("execute_file_organization", { preview_id: preview.id }, { baseDir: data, currentUserMessage: "确认执行文件整理" });
  assert.equal(accepted.ok, true);
});
