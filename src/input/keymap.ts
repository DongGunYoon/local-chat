// Pure key classification for the multiline input editor: one Ink (input, key) event
// becomes exactly one editor action. No React/Ink runtime imports - only the Key type.

import type { Key } from "ink";
import { segmentGraphemes } from "../utils/displayWidth.js";

export type InputAction =
  | { type: "submit" }
  | { type: "newline" }
  /** Remove the "\" before the caret, then insert a newline. */
  | { type: "backslashNewline" }
  /** A single grapheme typed by hand. */
  | { type: "insert"; text: string }
  /** A multi-grapheme raw chunk (paste fallback); the caller arms the fast-return guard. */
  | { type: "bulkInsert"; text: string }
  /** An IME commit that arrived in the same chunk as its Enter. */
  | { type: "insertAndSubmit"; text: string }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "left" }
  | { type: "right" }
  | { type: "up" }
  | { type: "down" }
  | { type: "lineStart" }
  | { type: "lineEnd" }
  | { type: "clear" }
  /** Tab, Esc, Shift+arrows, PgUp/PgDn, Ctrl+C - ChatRoom handles these itself. */
  | { type: "passthrough" }
  | { type: "ignore" };

export type KeyContext = {
  /** The grapheme immediately before the caret, or null when the caret is at the start. */
  graphemeBeforeCaret: string | null;
  /** Timestamp (ms) of the last bulkInsert, or null when there was none. */
  lastRawBulkInsertAt: number | null;
  /** Current time in ms. */
  now: number;
  /** Once true, the fast-return guard is disabled for the rest of the session. */
  bracketedPasteSeen: boolean;
};

/**
 * A plain Enter arriving within this window after a raw multi-grapheme chunk is treated
 * as part of a paste (a newline), not as a send. Only used while the terminal has not
 * proven it speaks bracketed paste.
 */
export const FAST_RETURN_MS = 30;

/**
 * CSI-u ("\u001B[13;2u") and modifyOtherKeys ("\u001B[27;2;13~") encodings of a modified
 * Enter, as delivered by Ink after it strips the leading ESC. Modifiers 2-8 cover
 * Shift, Alt and Ctrl combinations.
 */
export const NEWLINE_SEQUENCES: readonly RegExp[] = [/^\[13;[2-8]u$/, /^\[27;[2-8];13~$/];

const ESC = "\u001B";

/** True for "\r" and for one or more ESC followed by "\r" (Option/Alt+Enter). */
function isEscapedReturn(input: string): boolean {
  if (!input.endsWith("\r")) return false;
  for (const char of input.slice(0, -1)) {
    if (char !== ESC) return false;
  }
  return true;
}

/** Map one Ink input event to a single editor action. The first matching rule wins. */
export function classifyKey(input: string, key: Key, ctx: KeyContext): InputAction {
  // 1. Keys the surrounding screen owns.
  if (
    key.tab ||
    key.escape ||
    key.pageUp ||
    key.pageDown ||
    ((key.upArrow || key.downArrow) && key.shift) ||
    (key.ctrl && input === "c")
  ) {
    return { type: "passthrough" };
  }

  // 2. Plain Enter: send, unless it continues a backslash or a raw paste.
  if (key.return) {
    if (ctx.graphemeBeforeCaret === "\\") return { type: "backslashNewline" };
    if (
      !ctx.bracketedPasteSeen &&
      ctx.lastRawBulkInsertAt !== null &&
      ctx.now - ctx.lastRawBulkInsertAt <= FAST_RETURN_MS
    ) {
      return { type: "newline" };
    }
    return { type: "submit" };
  }

  // 3. Ctrl+J.
  if (input === "\n") return { type: "newline" };

  // 4. Option/Alt+Enter, which reaches us as a CR without the return name.
  if (isEscapedReturn(input)) return { type: "newline" };

  // 5. Shift+Enter from terminals that speak CSI-u or modifyOtherKeys.
  if (NEWLINE_SEQUENCES.some((pattern) => pattern.test(input))) return { type: "newline" };

  // 6. Navigation and deletion. Ink 5 parses both Backspace ("\u007F") and forward
  //    Delete ("\u001B[3~") as name "delete", so they are indistinguishable here and
  //    both erase backwards.
  if (key.upArrow) return { type: "up" };
  if (key.downArrow) return { type: "down" };
  if (key.leftArrow) return { type: "left" };
  if (key.rightArrow) return { type: "right" };
  if (key.backspace || key.delete) return { type: "backspace" };

  // 7. Editing chords.
  if (key.ctrl) {
    if (input === "a") return { type: "lineStart" };
    if (input === "e") return { type: "lineEnd" };
    if (input === "u") return { type: "clear" };
    return { type: "ignore" };
  }

  // 8. Any other Option/Meta chord.
  if (key.meta) return { type: "ignore" };

  // 9. Text that arrived in the same chunk as a CR: an IME commit plus Enter, or a
  //    paste that the terminal did not bracket. The caller normalises CR/LF.
  if (input.endsWith("\r")) {
    const prefix = input.slice(0, -1);
    const graphemes = segmentGraphemes(prefix).length;
    if (graphemes === 1) return { type: "insertAndSubmit", text: prefix };
    if (graphemes >= 2) return { type: "bulkInsert", text: prefix };
    return { type: "newline" };
  }

  // 10. Plain text.
  if (input.length === 0) return { type: "ignore" };
  if (segmentGraphemes(input).length >= 2) return { type: "bulkInsert", text: input };
  // Never insert an escape sequence remnant as if it were typed text.
  if (input.includes(ESC)) return { type: "ignore" };
  return { type: "insert", text: input };
}
