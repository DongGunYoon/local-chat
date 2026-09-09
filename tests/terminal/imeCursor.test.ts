import { describe, expect, it } from "vitest";
import {
  isCursorSyncInstalled,
  setImeCursorTarget,
  shouldSyncImeCursor,
} from "../../src/terminal/imeCursor.js";

// installCursorSync() is deliberately never called here: it would wrap the real
// process.stdout for the rest of the worker and there is no way to take that back.
// The proxy itself is covered by cursorSync.test.ts.
describe("imeCursor", () => {
  it("stays uninstalled until the entry point installs it", () => {
    expect(isCursorSyncInstalled()).toBe(false);
  });

  it("ignores targets while uninstalled", () => {
    expect(() => setImeCursorTarget({ rowsFromBottom: 3, col: 7 })).not.toThrow();
    expect(() => setImeCursorTarget(null)).not.toThrow();
    expect(isCursorSyncInstalled()).toBe(false);
  });
});

describe("shouldSyncImeCursor", () => {
  const argv = ["node", "dist/index.js"];

  it("is on by default in a terminal", () => {
    expect(shouldSyncImeCursor({}, argv, true)).toBe(true);
  });

  it("keeps working for users who still set the old opt-in value", () => {
    expect(shouldSyncImeCursor({ LOCAL_CHAT_IME_CURSOR: "1" }, argv, true)).toBe(true);
  });

  it.each(["0", "false", "off", "no", " OFF ", "False"])("turns off for %j", (value) => {
    expect(shouldSyncImeCursor({ LOCAL_CHAT_IME_CURSOR: value }, argv, true)).toBe(false);
  });

  it("stays on for unrecognised values", () => {
    expect(shouldSyncImeCursor({ LOCAL_CHAT_IME_CURSOR: "" }, argv, true)).toBe(true);
    expect(shouldSyncImeCursor({ LOCAL_CHAT_IME_CURSOR: "yes" }, argv, true)).toBe(true);
  });

  it("turns off with --no-ime-cursor even when the env says on", () => {
    expect(
      shouldSyncImeCursor({ LOCAL_CHAT_IME_CURSOR: "1" }, [...argv, "--no-ime-cursor"], true),
    ).toBe(false);
  });

  it("stays off when stdout is not a terminal", () => {
    expect(shouldSyncImeCursor({ LOCAL_CHAT_IME_CURSOR: "1" }, argv, false)).toBe(false);
  });
});
