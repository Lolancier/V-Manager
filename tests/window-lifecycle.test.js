import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachWindowLifecycle, WINDOW_LIFECYCLE } from "../electron/window-lifecycle.js";

class FakeWindow extends EventEmitter {
  hidden = false;
  hide() { this.hidden = true; }
}

test("persistent windows hide instead of destroying while the app is running", () => {
  const win = new FakeWindow();
  let prevented = false;
  attachWindowLifecycle(win, { lifecycle: WINDOW_LIFECYCLE.persistent });
  win.emit("close", { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(win.hidden, true);
});

test("disposable windows allow close and release their registry slot", () => {
  const win = new FakeWindow();
  let beforeDestroy = 0;
  let destroyed = 0;
  attachWindowLifecycle(win, {
    lifecycle: WINDOW_LIFECYCLE.disposable,
    onBeforeDestroy: () => { beforeDestroy += 1; },
    onDestroyed: () => { destroyed += 1; }
  });
  win.emit("close", { preventDefault: () => assert.fail("disposable window must not prevent close") });
  win.emit("closed");
  assert.equal(beforeDestroy, 1);
  assert.equal(destroyed, 1);
});
