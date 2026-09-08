import { describe, expect, it } from "vitest";
import { computeScroll, cursorPosition, layoutRows, moveVertical } from "../../src/input/layout.js";
import { createBuffer } from "../../src/input/textBuffer.js";

const graphemesOf = (text: string) => createBuffer(text).graphemes;

describe("layoutRows", () => {
  it("fits five 2-cell graphemes into a 10-cell row", () => {
    const rows = layoutRows(graphemesOf("한글한글한글"), 10);
    expect(rows).toEqual([
      { text: "한글한글한", start: 0, end: 5, width: 10, hardBreak: false },
      { text: "글", start: 5, end: 6, width: 2, hardBreak: true },
    ]);
  });

  it("never splits a 2-cell grapheme across rows", () => {
    const rows = layoutRows(graphemesOf("a한b日c"), 5);
    expect(rows).toEqual([
      { text: "a한b", start: 0, end: 3, width: 4, hardBreak: false },
      { text: "日c", start: 3, end: 5, width: 3, hardBreak: true },
    ]);
  });

  it("keeps a grapheme wider than the row on a row of its own", () => {
    const rows = layoutRows(graphemesOf("한글"), 1);
    expect(rows.map((row) => row.text)).toEqual(["한", "글"]);
  });

  it("treats a width of 0 or less as 1", () => {
    expect(layoutRows(graphemesOf("abc"), 0).map((row) => row.text)).toEqual(["a", "b", "c"]);
    expect(layoutRows(graphemesOf("abc"), -5).map((row) => row.text)).toEqual(["a", "b", "c"]);
  });

  it("yields one empty row for an empty buffer", () => {
    expect(layoutRows([], 10)).toEqual([{ text: "", start: 0, end: 0, width: 0, hardBreak: true }]);
  });

  it("keeps an empty row between two consecutive newlines", () => {
    const rows = layoutRows(graphemesOf("a\n\nb"), 10);
    expect(rows).toEqual([
      { text: "a", start: 0, end: 1, width: 1, hardBreak: true },
      { text: "", start: 2, end: 2, width: 0, hardBreak: true },
      { text: "b", start: 3, end: 4, width: 1, hardBreak: true },
    ]);
  });

  it("yields a trailing empty row for a trailing newline", () => {
    const rows = layoutRows(graphemesOf("ab\n"), 10);
    expect(rows).toEqual([
      { text: "ab", start: 0, end: 2, width: 2, hardBreak: true },
      { text: "", start: 3, end: 3, width: 0, hardBreak: true },
    ]);
  });

  it("hard-breaks a row that a newline closes exactly at the row width", () => {
    const rows = layoutRows(graphemesOf("한글한글한\n"), 10);
    expect(rows).toEqual([
      { text: "한글한글한", start: 0, end: 5, width: 10, hardBreak: true },
      { text: "", start: 6, end: 6, width: 0, hardBreak: true },
    ]);
  });
});

describe("cursorPosition", () => {
  it("reports the end of a soft-wrapped row at column 0 of the next row", () => {
    const rows = layoutRows(graphemesOf("한글한글한글"), 10);
    expect(cursorPosition(rows, 4)).toEqual({ row: 0, col: 8 });
    expect(cursorPosition(rows, 5)).toEqual({ row: 1, col: 0 });
    expect(cursorPosition(rows, 6)).toEqual({ row: 1, col: 2 });
  });

  it("keeps the end of a hard-broken row on that row", () => {
    const rows = layoutRows(graphemesOf("a\nb"), 10);
    expect(cursorPosition(rows, 0)).toEqual({ row: 0, col: 0 });
    expect(cursorPosition(rows, 1)).toEqual({ row: 0, col: 1 });
    expect(cursorPosition(rows, 2)).toEqual({ row: 1, col: 0 });
    expect(cursorPosition(rows, 3)).toEqual({ row: 1, col: 1 });
  });

  it("clamps a cursor past the end of the buffer to the last row", () => {
    const rows = layoutRows(graphemesOf("a\nb"), 10);
    expect(cursorPosition(rows, 99)).toEqual({ row: 1, col: 1 });
    expect(cursorPosition(rows, -1)).toEqual({ row: 0, col: 0 });
  });
});

describe("computeScroll", () => {
  it("leaves the scroll alone while the caret is visible", () => {
    expect(computeScroll(2, 3, 3, 10)).toBe(2);
  });

  it("follows the caret upwards", () => {
    expect(computeScroll(4, 2, 3, 10)).toBe(2);
  });

  it("follows the caret downwards", () => {
    expect(computeScroll(0, 5, 3, 10)).toBe(3);
  });

  it("clamps to the last full window", () => {
    expect(computeScroll(0, 9, 3, 10)).toBe(7);
    expect(computeScroll(9, 9, 3, 10)).toBe(7);
  });

  it("clamps to 0 when everything fits or the scroll went negative", () => {
    expect(computeScroll(5, 0, 10, 3)).toBe(0);
    expect(computeScroll(-2, 0, 3, 10)).toBe(0);
  });
});

describe("moveVertical", () => {
  const text = "abcdefg\n한글한\nab\n한글한글";
  const state = createBuffer(text);
  const rows = layoutRows(state.graphemes, 20);

  it("lands on the grapheme with the largest column <= stickyCol", () => {
    const from = { graphemes: state.graphemes, cursor: 5 };
    const down = moveVertical(from, rows, 1, null);
    expect(down.stickyCol).toBe(5);
    expect(cursorPosition(rows, down.state.cursor)).toEqual({ row: 1, col: 4 });
  });

  it("keeps stickyCol across an intermediate short row", () => {
    const first = moveVertical({ graphemes: state.graphemes, cursor: 5 }, rows, 1, null);
    const second = moveVertical(first.state, rows, 1, first.stickyCol);
    expect(second.stickyCol).toBe(5);
    expect(cursorPosition(rows, second.state.cursor)).toEqual({ row: 2, col: 2 });
    const third = moveVertical(second.state, rows, 1, second.stickyCol);
    expect(third.stickyCol).toBe(5);
    expect(cursorPosition(rows, third.state.cursor)).toEqual({ row: 3, col: 4 });
  });

  it("moves back up to the same sticky column", () => {
    const up = moveVertical({ graphemes: state.graphemes, cursor: 17 }, rows, -1, 5);
    expect(cursorPosition(rows, up.state.cursor)).toEqual({ row: 2, col: 2 });
  });

  it("is a no-op at the first and last row", () => {
    const top = { graphemes: state.graphemes, cursor: 3 };
    const atTop = moveVertical(top, rows, -1, null);
    expect(atTop.state).toBe(top);
    expect(atTop.stickyCol).toBe(3);

    const bottom = { graphemes: state.graphemes, cursor: state.graphemes.length };
    const atBottom = moveVertical(bottom, rows, 1, 4);
    expect(atBottom.state).toBe(bottom);
    expect(atBottom.stickyCol).toBe(4);
  });

  it("stays on a soft-wrapped row instead of landing on its wrap point", () => {
    const wrapped = createBuffer("한글한글한글");
    const wrappedRows = layoutRows(wrapped.graphemes, 10);
    const up = moveVertical(wrapped, wrappedRows, -1, 20);
    expect(up.state.cursor).toBe(4);
    expect(cursorPosition(wrappedRows, up.state.cursor)).toEqual({ row: 0, col: 8 });
  });
});
