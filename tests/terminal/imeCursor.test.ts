import { describe, expect, it } from "vitest";
import { isCursorSyncInstalled, setImeCursorTarget } from "../../src/terminal/imeCursor.js";

// installCursorSync() is deliberately never called here: it would wrap the real
// process.stdout for the rest of the worker and there is no way to take that back.
// The proxy itself is covered by cursorSync.test.ts.
describe("imeCursor", () => {
  it("stays uninstalled until the entry point opts in", () => {
    expect(isCursorSyncInstalled()).toBe(false);
  });

  it("ignores targets while uninstalled", () => {
    expect(() => setImeCursorTarget({ rowsFromBottom: 3, col: 7 })).not.toThrow();
    expect(() => setImeCursorTarget(null)).not.toThrow();
    expect(isCursorSyncInstalled()).toBe(false);
  });
});
