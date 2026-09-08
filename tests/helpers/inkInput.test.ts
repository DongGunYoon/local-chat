import { describe, expect, it } from "vitest";
import { toInkEvent } from "./inkInput.js";

const ESC = "\u001B";

describe("toInkEvent", () => {
  it("parses plain Enter as the return key", () => {
    const { input, key } = toInkEvent("\r");
    expect(key.return).toBe(true);
    expect(input).toBe("\r");
  });

  it("parses Ctrl+J as enter, not return", () => {
    const { input, key } = toInkEvent("\n");
    expect(key.return).toBe(false);
    expect(input).toBe("\n");
  });

  it("delivers Option/Alt+Enter as a bare CR without the return flag", () => {
    const { input, key } = toInkEvent(`${ESC}\r`);
    expect(key.return).toBe(false);
    expect(input).toBe("\r");
  });

  it("strips exactly one leading ESC", () => {
    expect(toInkEvent(`${ESC}${ESC}\r`).input).toBe(`${ESC}\r`);
  });

  it("marks a lone ESC and a double ESC as escape", () => {
    expect(toInkEvent(ESC).key.escape).toBe(true);
    const doubled = toInkEvent(`${ESC}${ESC}`);
    expect(doubled.key.escape).toBe(true);
    expect(doubled.key.meta).toBe(true);
  });

  it("delivers CSI-u and modifyOtherKeys Enter encodings as text", () => {
    expect(toInkEvent(`${ESC}[13;2u`).input).toBe("[13;2u");
    expect(toInkEvent(`${ESC}[27;2;13~`).input).toBe("[27;2;13~");
  });

  it("delivers unrecognised multi-character chunks whole", () => {
    expect(toInkEvent("a\rb").input).toBe("a\rb");
    expect(toInkEvent("녕\r").input).toBe("녕\r");
    expect(toInkEvent("hello").input).toBe("hello");
    expect(toInkEvent(`${ESC}[200~pasted`).input).toBe("[200~pasted");
  });

  it("reports Ctrl chords with the letter as input", () => {
    const { input, key } = toInkEvent("\u0001");
    expect(key.ctrl).toBe(true);
    expect(input).toBe("a");
  });

  it("cannot tell Backspace from forward Delete", () => {
    for (const raw of ["\u007F", `${ESC}[3~`]) {
      const { input, key } = toInkEvent(raw);
      expect(key.delete).toBe(true);
      expect(input).toBe("");
    }
  });

  it("blanks the input of non-alphanumeric keys", () => {
    const tab = toInkEvent("\t");
    expect(tab.key.tab).toBe(true);
    expect(tab.input).toBe("");

    const shiftUp = toInkEvent(`${ESC}[1;2A`);
    expect(shiftUp.key.upArrow).toBe(true);
    expect(shiftUp.key.shift).toBe(true);
    expect(shiftUp.input).toBe("");
  });

  it("sets shift for a single uppercase letter", () => {
    const { input, key } = toInkEvent("A");
    expect(input).toBe("A");
    expect(key.shift).toBe(true);
  });
});
