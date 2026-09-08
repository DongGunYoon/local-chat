// Pure visual-row layout for the multiline input editor: soft wrapping, cursor
// placement, scrolling and vertical movement. No React/Ink imports.

import { graphemeWidth, segmentGraphemes } from "../utils/displayWidth.js";
import type { BufferState } from "./textBuffer.js";

export type VisualRow = {
  /** The row's graphemes joined, without the terminating "\n". */
  text: string;
  /** Index of the first grapheme in this row. */
  start: number;
  /** Exclusive index of the last grapheme of the row's text; a "\n", if any, sits at this index. */
  end: number;
  /** Display width of text. */
  width: number;
  /** True when the row ends with "\n" or is the last row of the buffer. */
  hardBreak: boolean;
};

function makeRow(
  graphemes: readonly string[],
  start: number,
  end: number,
  width: number,
  hardBreak: boolean,
): VisualRow {
  return { text: graphemes.slice(start, end).join(""), start, end, width, hardBreak };
}

/**
 * Wrap graphemes into rows of at most `width` cells. A 2-cell grapheme never straddles
 * rows. An empty buffer yields one empty row; a trailing "\n" yields a trailing empty
 * row. A width of 0 or less behaves as 1.
 */
export function layoutRows(graphemes: readonly string[], width: number): VisualRow[] {
  const maxWidth = Math.max(1, Math.floor(width));
  const rows: VisualRow[] = [];
  let start = 0;
  let rowWidth = 0;

  for (let i = 0; i < graphemes.length; i++) {
    const grapheme = graphemes[i];
    if (grapheme === "\n") {
      rows.push(makeRow(graphemes, start, i, rowWidth, true));
      start = i + 1;
      rowWidth = 0;
      continue;
    }

    const cells = graphemeWidth(grapheme);
    // A grapheme wider than the row still gets a row of its own, so layout always advances.
    if (i > start && rowWidth + cells > maxWidth) {
      rows.push(makeRow(graphemes, start, i, rowWidth, false));
      start = i;
      rowWidth = 0;
    }
    rowWidth += cells;
  }

  rows.push(makeRow(graphemes, start, graphemes.length, rowWidth, true));
  return rows;
}

/** Cell column of the cursor inside a row, `offset` graphemes past the row start. */
function columnAt(row: VisualRow, offset: number): number {
  if (offset <= 0) return 0;
  if (offset >= row.end - row.start) return row.width;

  let column = 0;
  const graphemes = segmentGraphemes(row.text);
  for (let i = 0; i < offset && i < graphemes.length; i++) {
    column += graphemeWidth(graphemes[i]);
  }
  return column;
}

/**
 * Row and cell column of a cursor index. A cursor exactly at the end of a full
 * soft-wrapped row is reported at column 0 of the next row; at the end of a
 * hard-broken (or last) row it stays on that row.
 */
export function cursorPosition(
  rows: readonly VisualRow[],
  cursor: number,
): { row: number; col: number } {
  if (rows.length === 0) return { row: 0, col: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isLast = i === rows.length - 1;
    if (cursor < row.end || (cursor === row.end && (row.hardBreak || isLast))) {
      return { row: i, col: columnAt(row, cursor - row.start) };
    }
  }

  const last = rows[rows.length - 1];
  return { row: rows.length - 1, col: last.width };
}

/**
 * Cursor-follow scrolling: keep caretRow inside [scroll, scroll + visible) and clamp
 * the result to [0, max(0, total - visible)].
 */
export function computeScroll(
  scroll: number,
  caretRow: number,
  visible: number,
  total: number,
): number {
  const window = Math.max(1, visible);
  let next = scroll;
  if (caretRow < next) next = caretRow;
  else if (caretRow >= next + window) next = caretRow - window + 1;

  return Math.min(Math.max(next, 0), Math.max(0, total - window));
}

/**
 * Move the cursor to the row above/below, onto the grapheme whose cell column is the
 * largest <= stickyCol (stickyCol defaults to the current column). Returns the same
 * state at the first/last row.
 */
export function moveVertical(
  state: BufferState,
  rows: readonly VisualRow[],
  direction: -1 | 1,
  stickyCol: number | null,
): { state: BufferState; stickyCol: number } {
  const here = cursorPosition(rows, state.cursor);
  const target = stickyCol ?? here.col;
  const targetRow = rows[here.row + direction];
  if (targetRow === undefined) return { state, stickyCol: target };

  // The end of a soft-wrapped row renders at column 0 of the next row, so stop before it.
  const lastIndex = Math.max(
    targetRow.start,
    targetRow.hardBreak ? targetRow.end : targetRow.end - 1,
  );
  let cursor = targetRow.start;
  let column = 0;
  for (let i = targetRow.start; i < lastIndex; i++) {
    const next = column + graphemeWidth(state.graphemes[i]);
    if (next > target) break;
    column = next;
    cursor = i + 1;
  }

  return { state: { graphemes: state.graphemes, cursor }, stickyCol: target };
}
