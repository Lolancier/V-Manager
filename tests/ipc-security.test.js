import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createTrustedIpcRegistrar, isTrustedRendererUrl } from "../electron/ipc-security.js";

const rendererRoot = path.resolve("dist");
const devPolicy = { isDev: true, devServerUrl: "http://localhost:5173", rendererRoot };
const productionPolicy = { isDev: false, devServerUrl: "http://localhost:5173", rendererRoot };

function eventFor(frameUrl, options = {}) {
  const senderMainFrame = options.mainFrame || { url: frameUrl };
  return {
    senderFrame: options.missingFrame ? undefined : (options.senderFrame || senderMainFrame),
    sender: { mainFrame: senderMainFrame }
  };
}

function createIpcMainDouble(options = {}) {
  const handlers = new Map();
  const listeners = new Map();
  const removed = [];
  return {
    handlers,
    listeners,
    removed,
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
      on: (channel, listener) => {
        const channelListeners = listeners.get(channel) || [];
        channelListeners.push(listener);
        listeners.set(channel, channelListeners);
      },
      removeListener: (channel, listener) => {
        if (options.failRemoveOnce) {
          options.failRemoveOnce = false;
          throw new Error("remove failed");
        }
        removed.push([channel, listener]);
        const channelListeners = listeners.get(channel) || [];
        const index = channelListeners.lastIndexOf(listener);
        if (index >= 0) channelListeners.splice(index, 1);
      }
    }
  };
}

test("development URL policy accepts only the configured protocol, host, and port", () => {
  assert.equal(isTrustedRendererUrl("http://localhost:5173/?view=settings", devPolicy), true);
  assert.equal(isTrustedRendererUrl("https://localhost:5173/?view=settings", devPolicy), false);
  assert.equal(isTrustedRendererUrl("http://localhost:5174/?view=settings", devPolicy), false);
  assert.equal(isTrustedRendererUrl("https://example.com", devPolicy), false);
  assert.equal(isTrustedRendererUrl("not a url", devPolicy), false);
});

test("production URL policy accepts dist query/hash and rejects non-file, malformed, adjacent, or escaped files", () => {
  const inside = `${pathToFileURL(path.join(rendererRoot, "index.html"))}?view=settings#panel`;
  const nested = pathToFileURL(path.join(rendererRoot, "assets", "index.js")).toString();
  const adjacent = pathToFileURL(path.resolve(`${rendererRoot}-adjacent`, "index.html")).toString();
  const outside = pathToFileURL(path.join(rendererRoot, "..", "outside.html")).toString();
  assert.equal(isTrustedRendererUrl(inside, productionPolicy), true);
  assert.equal(isTrustedRendererUrl(nested, productionPolicy), true);
  assert.equal(isTrustedRendererUrl("https://example.com/index.html", productionPolicy), false);
  assert.equal(isTrustedRendererUrl("not a url", productionPolicy), false);
  assert.equal(isTrustedRendererUrl(adjacent, productionPolicy), false);
  assert.equal(isTrustedRendererUrl(outside, productionPolicy), false);
});

test("trusted IPC handle rejects child frames, foreign main frames, and missing frames", async () => {
  const double = createIpcMainDouble();
  const registrar = createTrustedIpcRegistrar(double.ipcMain, devPolicy);
  let calls = 0;
  registrar.handle("test", async (_event, value) => { calls += 1; return value; });
  const trusted = eventFor("http://localhost:5173/?view=settings");
  assert.equal(await double.handlers.get("test")(trusted, 42), 42);

  const mainFrame = { url: "http://localhost:5173/?view=settings" };
  assert.throws(
    () => double.handlers.get("test")(eventFor(mainFrame.url, { mainFrame, senderFrame: { url: mainFrame.url } }), 42),
    /拒绝/
  );
  assert.throws(() => double.handlers.get("test")(eventFor("https://example.com"), 42), /拒绝/);
  assert.throws(() => double.handlers.get("test")(eventFor("http://localhost:5173", { missingFrame: true }), 42), /拒绝/);
  assert.equal(calls, 1);
});

test("trusted IPC on silently drops foreign and child-frame events", () => {
  const double = createIpcMainDouble();
  const registrar = createTrustedIpcRegistrar(double.ipcMain, devPolicy);
  const received = [];
  const listener = (_event, value) => received.push(value);
  const dispose = registrar.on("event", listener);
  const wrapped = double.listeners.get("event")[0];

  wrapped(eventFor("http://localhost:5173/?view=pet"), "first");
  assert.doesNotThrow(() => wrapped(eventFor("https://example.com"), "foreign"));
  const mainFrame = { url: "http://localhost:5173/?view=pet" };
  assert.doesNotThrow(() => wrapped(eventFor(mainFrame.url, { mainFrame, senderFrame: { url: mainFrame.url } }), "child"));
  wrapped(eventFor("http://localhost:5173/?view=pet"), "second");
  assert.deepEqual(received, ["first", "second"]);

  dispose();
  dispose();
  assert.equal(double.listeners.get("event").length, 0);
  assert.deepEqual(double.removed, [["event", wrapped]]);
});

test("trusted IPC on propagates trusted business listener failures", () => {
  const double = createIpcMainDouble();
  const registrar = createTrustedIpcRegistrar(double.ipcMain, devPolicy);
  registrar.on("event", () => { throw new Error("business failed"); });
  const wrapped = double.listeners.get("event")[0];
  assert.throws(() => wrapped(eventFor("http://localhost:5173/?view=pet")), /business failed/);
});

test("trusted IPC disposer retries a failed removal and becomes idempotent after success", () => {
  const options = { failRemoveOnce: true };
  const double = createIpcMainDouble(options);
  const registrar = createTrustedIpcRegistrar(double.ipcMain, devPolicy);
  const dispose = registrar.on("event", () => {});
  assert.throws(dispose, /remove failed/);
  assert.equal(double.listeners.get("event").length, 1);
  dispose();
  dispose();
  assert.equal(double.listeners.get("event").length, 0);
  assert.equal(double.removed.length, 1);
});

test("trusted IPC removeListener resolves the original listener to its wrapper", () => {
  const double = createIpcMainDouble();
  const registrar = createTrustedIpcRegistrar(double.ipcMain, devPolicy);
  const listener = () => {};
  const dispose = registrar.on("event", listener);
  const wrapped = double.listeners.get("event")[0];
  registrar.removeListener("event", listener);
  dispose();
  assert.equal(double.listeners.get("event").length, 0);
  assert.deepEqual(double.removed, [["event", wrapped]]);
});
