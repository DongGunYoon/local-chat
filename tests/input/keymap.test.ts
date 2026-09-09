import { describe, expect, it } from "vitest";
import {
  classifyKey,
  FAST_RETURN_MS,
  type InputAction,
  type KeyContext,
} from "../../src/input/keymap.js";
import { toInkEvent } from "../helpers/inkInput.js";

const ESC = "\u001B";
const NOW = 1_000;

function context(overrides: Partial<KeyContext> = {}): KeyContext {
  return {
    graphemeBeforeCaret: null,
    lastRawBulkInsertAt: null,
    now: NOW,
    bracketedPasteSeen: false,
    ...overrides,
  };
}

function classifyRaw(raw: string, overrides: Partial<KeyContext> = {}): InputAction {
  const { input, key } = toInkEvent(raw);
  return classifyKey(input, key, context(overrides));
}

describe("classifyKey - newline vs submit", () => {
  it("submits on plain Enter", () => {
    expect(classifyRaw("\r")).toEqual({ type: "submit" });
  });

  it("inserts a newline on Ctrl+J", () => {
    expect(classifyRaw("\n")).toEqual({ type: "newline" });
  });

  it("inserts a newline on Option/Alt+Enter", () => {
    expect(classifyRaw(`${ESC}\r`)).toEqual({ type: "newline" });
    expect(classifyRaw(`${ESC}${ESC}\r`)).toEqual({ type: "newline" });
  });

  it("inserts a newline on CSI-u and modifyOtherKeys Shift+Enter", () => {
    expect(classifyRaw(`${ESC}[13;2u`)).toEqual({ type: "newline" });
    expect(classifyRaw(`${ESC}[27;2;13~`)).toEqual({ type: "newline" });
    expect(classifyRaw(`${ESC}[27;5;13~`)).toEqual({ type: "newline" });
  });

  it("turns backslash + Enter into a newline", () => {
    expect(classifyRaw("\r", { graphemeBeforeCaret: "\\" })).toEqual({
      type: "backslashNewline",
    });
  });
});

describe("classifyKey - fast-return paste guard", () => {
  it("treats an Enter right after a raw bulk insert as a newline", () => {
    expect(classifyRaw("\r", { lastRawBulkInsertAt: NOW - 10 })).toEqual({ type: "newline" });
  });

  it("submits once bracketed paste has been seen", () => {
    expect(classifyRaw("\r", { lastRawBulkInsertAt: NOW - 10, bracketedPasteSeen: true })).toEqual({
      type: "submit",
    });
  });

  it("submits when the bulk insert is older than the window", () => {
    expect(classifyRaw("\r", { lastRawBulkInsertAt: NOW - FAST_RETURN_MS - 1 })).toEqual({
      type: "submit",
    });
  });
});

describe("classifyKey - control and navigation keys", () => {
  const cases: ReadonlyArray<[string, InputAction, string]> = [
    [`${ESC}b`, { type: "ignore" }, "Option+b"],
    ["\u0001", { type: "lineStart" }, "Ctrl+A"],
    ["\u0005", { type: "lineEnd" }, "Ctrl+E"],
    ["\u0015", { type: "clear" }, "Ctrl+U"],
    ["\u0002", { type: "ignore" }, "Ctrl+B"],
    ["\u0003", { type: "passthrough" }, "Ctrl+C"],
    ["\u007F", { type: "backspace" }, "Backspace"],
    [`${ESC}[3~`, { type: "backspace" }, "forward Delete"],
    [`${ESC}[A`, { type: "up" }, "Up"],
    [`${ESC}[B`, { type: "down" }, "Down"],
    [`${ESC}[D`, { type: "left" }, "Left"],
    [`${ESC}[C`, { type: "right" }, "Right"],
    [`${ESC}[1;2A`, { type: "passthrough" }, "Shift+Up"],
    [`${ESC}[5~`, { type: "passthrough" }, "PageUp"],
    ["\t", { type: "passthrough" }, "Tab"],
    [ESC, { type: "passthrough" }, "Esc"],
    [`${ESC}${ESC}`, { type: "passthrough" }, "Esc Esc"],
  ];

  for (const [raw, expected, label] of cases) {
    it(`classifies ${label}`, () => {
      expect(classifyRaw(raw)).toEqual(expected);
    });
  }
});

describe("classifyKey - text", () => {
  it("inserts a single grapheme", () => {
    expect(classifyRaw("한")).toEqual({ type: "insert", text: "한" });
    expect(classifyRaw("日")).toEqual({ type: "insert", text: "日" });
    expect(classifyRaw("e\u0301")).toEqual({ type: "insert", text: "e\u0301" });
    expect(classifyRaw("\u{1F44D}\u{1F3FD}")).toEqual({
      type: "insert",
      text: "\u{1F44D}\u{1F3FD}",
    });
    expect(classifyRaw("A")).toEqual({ type: "insert", text: "A" });
  });

  it("submits an IME commit that arrives with its Enter", () => {
    expect(classifyRaw("녕\r")).toEqual({ type: "insertAndSubmit", text: "녕" });
    expect(classifyRaw("ん\r")).toEqual({ type: "insertAndSubmit", text: "ん" });
  });

  it("bulk-inserts multi-grapheme chunks", () => {
    expect(classifyRaw("안녕\r")).toEqual({ type: "bulkInsert", text: "안녕" });
    expect(classifyRaw("hello\r")).toEqual({ type: "bulkInsert", text: "hello" });
    expect(classifyRaw("line1\rline2")).toEqual({ type: "bulkInsert", text: "line1\rline2" });
    expect(classifyRaw("ab")).toEqual({ type: "bulkInsert", text: "ab" });
  });

  it("ignores an empty input", () => {
    expect(classifyKey("", { ...toInkEvent("a").key }, context())).toEqual({ type: "ignore" });
  });

  it("never inserts a string containing ESC", () => {
    expect(classifyKey(ESC, { ...toInkEvent("a").key }, context())).toEqual({ type: "ignore" });
  });
});

describe("classifyKey - CSI remnants", () => {
  it("ignores an unnamed CSI remnant instead of inserting it as text", () => {
    expect(classifyRaw(`${ESC}[57400;5u`)).toEqual({ type: "ignore" });
    expect(classifyRaw(`${ESC}[>4;1m`)).toEqual({ type: "ignore" });
    expect(classifyRaw(`${ESC}[?1u`)).toEqual({ type: "ignore" });
    expect(classifyRaw(`${ESC}[27;3;120~`)).toEqual({ type: "ignore" });
  });

  it("ignores a partial CSI tail the stdin translator gave up on", () => {
    expect(classifyRaw(`${ESC}[1;`)).toEqual({ type: "ignore" });
    expect(classifyRaw(`${ESC}[13`)).toEqual({ type: "ignore" });
  });

  it("still inserts pasted text that merely looks bracket-like", () => {
    expect(classifyRaw("[A")).toEqual({ type: "bulkInsert", text: "[A" });
    expect(classifyRaw("[")).toEqual({ type: "insert", text: "[" });
  });
});
