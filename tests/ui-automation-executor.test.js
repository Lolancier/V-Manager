import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchUrl, normalizeBrowserUrl } from "../src-agent/executors/ui-automation-executor.js";

test("normalizeBrowserUrl adds https to a bare host", () => {
  assert.equal(normalizeBrowserUrl("example.com/docs"), "https://example.com/docs");
});

test("normalizeBrowserUrl preserves http and https URLs", () => {
  assert.equal(normalizeBrowserUrl("http://example.com"), "http://example.com/");
  assert.equal(normalizeBrowserUrl("https://example.com?q=1"), "https://example.com/?q=1");
});

test("normalizeBrowserUrl rejects non-web protocols", () => {
  assert.throws(() => normalizeBrowserUrl("file:///C:/secret.txt"), /只允许打开/);
  assert.throws(() => normalizeBrowserUrl("javascript:alert(1)"), /只允许打开/);
});

test("buildSearchUrl encodes query and selects engine", () => {
  assert.equal(buildSearchUrl("Live2D 口型", "baidu"), "https://www.baidu.com/s?wd=Live2D%20%E5%8F%A3%E5%9E%8B");
  assert.equal(buildSearchUrl("v manager", "google"), "https://www.google.com/search?q=v%20manager");
  assert.equal(buildSearchUrl("v manager", "unknown"), "https://www.bing.com/search?q=v%20manager");
});

test("buildSearchUrl rejects an empty query", () => {
  assert.throws(() => buildSearchUrl("   "), /不能为空/);
});
