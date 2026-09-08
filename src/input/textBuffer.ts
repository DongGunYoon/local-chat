// Pure grapheme-cluster text buffer for the multiline input editor.
// No React/Ink imports: every operation is a plain state -> state function.

import { segmentGraphemes } from "../utils/displayWidth.js";

export type BufferState = {
  /** The draft as grapheme clusters; "\n" is its own grapheme. */
  readonly graphemes: readonly string[];
  /** Grapheme index in [0, graphemes.length]. */
  readonly cursor: number;
};

/** Build a buffer from text, with the cursor at the end. */
export function createBuffer(text = ""): BufferState {
  const graphemes = segmentGraphemes(text);
  return { graphemes, cursor: graphemes.length };
}

export function toText(state: BufferState): string {
  return state.graphemes.join("");
}

export function isEmpty(state: BufferState): boolean {
  return state.graphemes.length === 0;
}

/**
 * Insert text (already normalised by the caller) at the cursor. Truncates so that
 * graphemes.length stays <= limit, always on a grapheme boundary; truncated is true
 * when anything was dropped. The cursor moves past the inserted text.
 */
export function insertText(
  state: BufferState,
  text: string,
  limit?: number,
): { state: BufferState; truncated: boolean } {
  const inserted = segmentGraphemes(text);
  const room = limit === undefined ? inserted.length : Math.max(0, limit - state.graphemes.length);
  const accepted = inserted.length <= room ? inserted : inserted.slice(0, room);
  const truncated = accepted.length < inserted.length;

  if (accepted.length === 0) return { state, truncated };

  // Re-segment the joined text so that a cluster split across the insertion point
  // (a combining mark typed after its base character) becomes a single grapheme.
  const head = state.graphemes.slice(0, state.cursor).join("") + accepted.join("");
  const tail = state.graphemes.slice(state.cursor).join("");
  return {
    state: { graphemes: segmentGraphemes(head + tail), cursor: segmentGraphemes(head).length },
    truncated,
  };
}

/** Delete the grapheme before the cursor. No-op at the start of the buffer. */
export function deleteBackward(state: BufferState): BufferState {
  if (state.cursor === 0) return state;

  const graphemes = [
    ...state.graphemes.slice(0, state.cursor - 1),
    ...state.graphemes.slice(state.cursor),
  ];
  return { graphemes, cursor: state.cursor - 1 };
}

/** Delete the grapheme after the cursor. No-op at the end of the buffer. */
export function deleteForward(state: BufferState): BufferState {
  if (state.cursor >= state.graphemes.length) return state;

  const graphemes = [
    ...state.graphemes.slice(0, state.cursor),
    ...state.graphemes.slice(state.cursor + 1),
  ];
  return { graphemes, cursor: state.cursor };
}

export function moveLeft(state: BufferState): BufferState {
  if (state.cursor === 0) return state;
  return { graphemes: state.graphemes, cursor: state.cursor - 1 };
}

export function moveRight(state: BufferState): BufferState {
  if (state.cursor >= state.graphemes.length) return state;
  return { graphemes: state.graphemes, cursor: state.cursor + 1 };
}

/** Move to the start of the current logical line (just after the previous "\n"). */
export function moveToLineStart(state: BufferState): BufferState {
  let cursor = state.cursor;
  while (cursor > 0 && state.graphemes[cursor - 1] !== "\n") {
    cursor--;
  }
  if (cursor === state.cursor) return state;
  return { graphemes: state.graphemes, cursor };
}

/** Move to the end of the current logical line (just before the next "\n", or the buffer end). */
export function moveToLineEnd(state: BufferState): BufferState {
  let cursor = state.cursor;
  while (cursor < state.graphemes.length && state.graphemes[cursor] !== "\n") {
    cursor++;
  }
  if (cursor === state.cursor) return state;
  return { graphemes: state.graphemes, cursor };
}

export function clearBuffer(): BufferState {
  return { graphemes: [], cursor: 0 };
}

export function graphemeBeforeCursor(state: BufferState): string | null {
  if (state.cursor === 0) return null;
  return state.graphemes[state.cursor - 1] ?? null;
}
