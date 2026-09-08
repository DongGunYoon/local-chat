import { type Key, useStdin } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyKey, type KeyContext } from "../input/keymap.js";
import {
  computeScroll,
  cursorPosition,
  layoutRows,
  moveVertical,
  type VisualRow,
} from "../input/layout.js";
import { PasteDetector } from "../input/pasteDetector.js";
import {
  type BufferState,
  clearBuffer,
  createBuffer,
  deleteBackward,
  deleteForward,
  graphemeBeforeCursor,
  insertText,
  moveLeft,
  moveRight,
  moveToLineEnd,
  moveToLineStart,
  toText,
} from "../input/textBuffer.js";
import { MAX_DRAFT_CHARS } from "../network/limits.js";
import { finalizeOutgoing, normalizeInput } from "../utils/sanitize.js";

const TRUNCATION_NOTICE = "Draft truncated to 100,000 characters";

export type MessageInputController = {
  state: BufferState;
  text: string;
  rows: readonly VisualRow[];
  scrollRow: number;
  visibleCount: number;
  visibleRows: readonly VisualRow[];
  caret: { row: number; col: number };
  caretVisible: { row: number; col: number };
  /** True when the latest raw stdin chunk was consumed by paste handling; reading resets it. */
  consumeChunkFlag(): boolean;
  isPasting(): boolean;
  handleKey(input: string, key: Key): "handled" | "passthrough";
  clear(): void;
};

export type MessageInputOptions = {
  /** Cells available for the text itself. */
  width: number;
  maxVisibleRows: number;
  /** False while an overlay owns the screen: pastes are discarded and keys ignored. */
  focus: boolean;
  /** Returns true when the text was accepted, which clears the draft. */
  onSubmit: (text: string) => boolean;
  onNotice: (message: string) => void;
};

/**
 * Owns the multiline draft: buffer state, visual rows, paste framing and key handling.
 *
 * The buffer lives in a ref that every update advances synchronously, and React state
 * only mirrors it for rendering. Ink drains all pending stdin chunks before React
 * re-renders, so a handler that read the rendered state would still see the draft from
 * before the previous keystroke - and Enter would then send a stale, shorter message.
 */
export function useMessageInput(options: MessageInputOptions): MessageInputController {
  const { width, maxVisibleRows, focus, onSubmit, onNotice } = options;
  const { internal_eventEmitter: emitter } = useStdin();

  const [state, setState] = useState<BufferState>(() => createBuffer());
  const stateRef = useRef<BufferState>(state);
  const scrollRef = useRef(0);
  const stickyColRef = useRef<number | null>(null);
  const lastRawBulkInsertAtRef = useRef<number | null>(null);
  const consumedRef = useRef(false);
  const detectorRef = useRef<PasteDetector | null>(null);

  // Latest-value refs, so the stdin subscription can stay mounted for the whole session.
  const focusRef = useRef(focus);
  const onSubmitRef = useRef(onSubmit);
  const onNoticeRef = useRef(onNotice);
  focusRef.current = focus;
  onSubmitRef.current = onSubmit;
  onNoticeRef.current = onNotice;

  /** The single write path: advance the ref, then mirror it into React state. */
  const applyBuffer = useCallback((update: (previous: BufferState) => BufferState): BufferState => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const insertDraft = useCallback(
    (text: string): void => {
      const normalized = normalizeInput(text);
      if (normalized === "") return;

      let truncated = false;
      applyBuffer((previous) => {
        const result = insertText(previous, normalized, MAX_DRAFT_CHARS);
        truncated = result.truncated;
        return result.state;
      });
      if (truncated) onNoticeRef.current(TRUNCATION_NOTICE);
    },
    [applyBuffer],
  );

  const handlePastedText = useCallback(
    (text: string): void => {
      if (!focusRef.current) return;
      stickyColRef.current = null;
      insertDraft(text);
    },
    [insertDraft],
  );

  useEffect(() => {
    const detector = new PasteDetector({ onPaste: handlePastedText, onText: handlePastedText });
    detectorRef.current = detector;

    // Ink emits every raw chunk before its own useInput handlers run, so a chunk that
    // belongs to a paste can be swallowed before it is parsed as keys.
    const handleChunk = (chunk: unknown): void => {
      consumedRef.current = detector.feed(String(chunk));
    };
    emitter?.prependListener("input", handleChunk);

    return () => {
      emitter?.removeListener("input", handleChunk);
      detector.dispose();
      detectorRef.current = null;
    };
  }, [emitter, handlePastedText]);

  const rows = useMemo(() => layoutRows(state.graphemes, width), [state.graphemes, width]);
  const caret = useMemo(() => cursorPosition(rows, state.cursor), [rows, state.cursor]);

  const visibleCount = Math.min(Math.max(rows.length, 1), Math.max(1, maxVisibleRows));
  const scrollRow = computeScroll(scrollRef.current, caret.row, visibleCount, rows.length);
  scrollRef.current = scrollRow;
  const visibleRows = rows.slice(scrollRow, scrollRow + visibleCount);

  const clear = useCallback((): void => {
    applyBuffer(clearBuffer);
    scrollRef.current = 0;
    stickyColRef.current = null;
    lastRawBulkInsertAtRef.current = null;
  }, [applyBuffer]);

  const submit = (): void => {
    const outgoing = finalizeOutgoing(toText(stateRef.current));
    if (outgoing === "") return;
    if (onSubmitRef.current(outgoing)) clear();
  };

  const handleKey = (input: string, key: Key): "handled" | "passthrough" => {
    if (!focusRef.current) return "handled";

    const current = stateRef.current;
    const context: KeyContext = {
      graphemeBeforeCaret: graphemeBeforeCursor(current),
      lastRawBulkInsertAt: lastRawBulkInsertAtRef.current,
      now: Date.now(),
      bracketedPasteSeen: detectorRef.current?.hasSeenBracketedPaste() ?? false,
    };
    const action = classifyKey(input, key, context);
    if (action.type !== "up" && action.type !== "down") stickyColRef.current = null;

    switch (action.type) {
      case "submit":
        submit();
        return "handled";

      case "newline":
        insertDraft("\n");
        return "handled";

      case "backslashNewline":
        applyBuffer(
          (previous) => insertText(deleteBackward(previous), "\n", MAX_DRAFT_CHARS).state,
        );
        return "handled";

      case "insert":
        insertDraft(action.text);
        return "handled";

      case "bulkInsert":
        insertDraft(action.text);
        lastRawBulkInsertAtRef.current = context.now;
        return "handled";

      case "insertAndSubmit":
        insertDraft(action.text);
        submit();
        return "handled";

      case "backspace":
        applyBuffer(deleteBackward);
        return "handled";

      case "delete":
        applyBuffer(deleteForward);
        return "handled";

      case "left":
        applyBuffer(moveLeft);
        return "handled";

      case "right":
        applyBuffer(moveRight);
        return "handled";

      case "lineStart":
        applyBuffer(moveToLineStart);
        return "handled";

      case "lineEnd":
        applyBuffer(moveToLineEnd);
        return "handled";

      case "up":
      case "down": {
        // Rows are memoised from the rendered state, which the ref may already be ahead of.
        const currentRows = current === state ? rows : layoutRows(current.graphemes, width);
        const moved = moveVertical(
          current,
          currentRows,
          action.type === "up" ? -1 : 1,
          stickyColRef.current,
        );
        stickyColRef.current = moved.stickyCol;
        applyBuffer(() => moved.state);
        return "handled";
      }

      case "clear":
        clear();
        return "handled";

      case "passthrough":
        return "passthrough";

      case "ignore":
        return "handled";
    }
  };

  const consumeChunkFlag = useCallback((): boolean => {
    const consumed = consumedRef.current;
    consumedRef.current = false;
    return consumed;
  }, []);

  const isPasting = useCallback((): boolean => detectorRef.current?.isPasting() ?? false, []);

  return {
    state,
    text: toText(state),
    rows,
    scrollRow,
    visibleCount,
    visibleRows,
    caret,
    caretVisible: { row: caret.row - scrollRow, col: caret.col },
    consumeChunkFlag,
    isPasting,
    handleKey,
    clear,
  };
}
