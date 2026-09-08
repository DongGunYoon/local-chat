import { describe, expect, it } from "vitest";
import {
  clearBuffer,
  createBuffer,
  deleteBackward,
  deleteForward,
  graphemeBeforeCursor,
  insertText,
  isEmpty,
  moveLeft,
  moveRight,
  moveToLineEnd,
  moveToLineStart,
  toText,
} from "../../src/input/textBuffer.js";

const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"; // family ZWJ sequence
const THUMB = "\u{1F44D}\u{1F3FD}"; // thumbs up with a skin tone modifier
const HEART = "\u2764\uFE0F"; // heart with VS16
const E_ACUTE = "e\u0301"; // e + combining acute accent
const FLAG_KR = "\u{1F1F0}\u{1F1F7}"; // regional indicator pair

describe("createBuffer — grapheme clusters", () => {
  it.each([
    ["family ZWJ sequence", FAMILY],
    ["skin tone modifier", THUMB],
    ["variation selector", HEART],
    ["combining acute", E_ACUTE],
    ["Korean syllable", "한"],
    ["Han character", "日"],
    ["regional indicator flag", FLAG_KR],
  ])("counts a %s as one grapheme", (_label, text) => {
    const state = createBuffer(text);
    expect(state.graphemes).toEqual([text]);
    expect(state.cursor).toBe(1);
  });

  it("keeps halfwidth katakana as separate graphemes", () => {
    // ﾊﾝ is two independent halfwidth code points, not one cluster.
    expect(createBuffer("ﾊﾝ").graphemes).toEqual(["ﾊ", "ﾝ"]);
  });

  it("treats a newline as its own grapheme", () => {
    expect(createBuffer("a\nb").graphemes).toEqual(["a", "\n", "b"]);
  });

  it("places the cursor at the end and round-trips through toText", () => {
    const state = createBuffer(`안녕${FAMILY}hi`);
    expect(state.cursor).toBe(state.graphemes.length);
    expect(toText(state)).toBe(`안녕${FAMILY}hi`);
  });

  it("starts empty when no text is given", () => {
    expect(isEmpty(createBuffer())).toBe(true);
    expect(isEmpty(createBuffer(""))).toBe(true);
    expect(isEmpty(createBuffer("a"))).toBe(false);
  });
});

describe("deleteBackward / deleteForward", () => {
  it("removes a whole ZWJ sequence with one backspace", () => {
    const state = deleteBackward(createBuffer(`hi${FAMILY}`));
    expect(toText(state)).toBe("hi");
    expect(state.cursor).toBe(2);
  });

  it("removes a whole skin-tone emoji with one backspace", () => {
    expect(toText(deleteBackward(createBuffer(`${THUMB}`)))).toBe("");
  });

  it("is a no-op at the start of the buffer", () => {
    const state = moveToLineStart(createBuffer("abc"));
    expect(deleteBackward(state)).toBe(state);
  });

  it("removes the grapheme after the cursor", () => {
    const state = moveToLineStart(createBuffer(`${FAMILY}hi`));
    expect(toText(deleteForward(state))).toBe("hi");
    expect(deleteForward(state).cursor).toBe(0);
  });

  it("is a no-op at the end of the buffer", () => {
    const state = createBuffer("abc");
    expect(deleteForward(state)).toBe(state);
  });
});

describe("cursor movement", () => {
  it("moves left and right by grapheme, not by code unit", () => {
    const state = createBuffer(`a${THUMB}b`);
    expect(state.cursor).toBe(3);
    const left = moveLeft(moveLeft(state));
    expect(left.cursor).toBe(1);
    expect(moveRight(left).cursor).toBe(2);
  });

  it("is a no-op at both ends", () => {
    const start = moveToLineStart(createBuffer("한글"));
    expect(moveLeft(start)).toBe(start);
    const end = createBuffer("한글");
    expect(moveRight(end)).toBe(end);
  });
});

describe("moveToLineStart / moveToLineEnd", () => {
  it("stays inside the current logical line", () => {
    const state = { graphemes: createBuffer("ab\ncd\nef").graphemes, cursor: 4 };
    expect(moveToLineStart(state).cursor).toBe(3);
    expect(moveToLineEnd(state).cursor).toBe(5);
  });

  it("reaches the buffer edges on the first and last line", () => {
    const state = createBuffer("ab\ncd");
    expect(moveToLineEnd(state).cursor).toBe(5);
    expect(moveToLineStart({ graphemes: state.graphemes, cursor: 1 }).cursor).toBe(0);
  });

  it("stops before the newline when the cursor sits on it", () => {
    const state = { graphemes: createBuffer("ab\ncd").graphemes, cursor: 2 };
    expect(moveToLineEnd(state)).toBe(state);
    expect(moveToLineStart(state).cursor).toBe(0);
  });
});

describe("insertText", () => {
  it("inserts at the cursor and moves past the inserted text", () => {
    const state = moveToLineStart(createBuffer("ab"));
    const { state: next, truncated } = insertText(state, "한글");
    expect(toText(next)).toBe("한글ab");
    expect(next.cursor).toBe(2);
    expect(truncated).toBe(false);
  });

  it("cuts on a grapheme boundary and never inside a ZWJ sequence", () => {
    const { state, truncated } = insertText(createBuffer(""), `hi${FAMILY}!`, 3);
    expect(state.graphemes).toEqual(["h", "i", FAMILY]);
    expect(toText(state)).toBe(`hi${FAMILY}`);
    expect(truncated).toBe(true);
  });

  it("counts the existing draft against the limit", () => {
    const { state, truncated } = insertText(createBuffer("abc"), "de", 4);
    expect(toText(state)).toBe("abcd");
    expect(truncated).toBe(true);
  });

  it("does not report truncation when the text exactly fits", () => {
    const { state, truncated } = insertText(createBuffer("abc"), "de", 5);
    expect(toText(state)).toBe("abcde");
    expect(truncated).toBe(false);
  });

  it("drops everything and keeps the state when the buffer is already full", () => {
    const full = createBuffer("abc");
    const { state, truncated } = insertText(full, "d", 3);
    expect(state).toBe(full);
    expect(truncated).toBe(true);
  });

  it("has no limit when none is given", () => {
    const { state, truncated } = insertText(createBuffer(""), `${FLAG_KR}${HEART}${E_ACUTE}`);
    expect(state.graphemes).toEqual([FLAG_KR, HEART, E_ACUTE]);
    expect(truncated).toBe(false);
  });

  it("inserts a newline as its own grapheme", () => {
    const { state } = insertText(createBuffer("ab"), "\n");
    expect(state.graphemes).toEqual(["a", "b", "\n"]);
    expect(state.cursor).toBe(3);
  });
});

describe("graphemeBeforeCursor", () => {
  it("returns null at the start of the buffer", () => {
    expect(graphemeBeforeCursor(createBuffer(""))).toBeNull();
    expect(graphemeBeforeCursor(moveToLineStart(createBuffer("abc")))).toBeNull();
  });

  it("returns the whole cluster before the cursor", () => {
    expect(graphemeBeforeCursor(createBuffer(`a${FAMILY}`))).toBe(FAMILY);
  });

  it("returns the newline when the cursor follows one", () => {
    expect(graphemeBeforeCursor(createBuffer("a\n"))).toBe("\n");
  });
});

describe("clearBuffer", () => {
  it("returns an empty buffer with the cursor at 0", () => {
    expect(clearBuffer()).toEqual({ graphemes: [], cursor: 0 });
    expect(isEmpty(clearBuffer())).toBe(true);
  });
});
