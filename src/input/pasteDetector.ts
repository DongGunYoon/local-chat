// Bracketed-paste framing over raw stdin chunks. Pure and timer-injectable: no React,
// Ink or Node imports beyond the default setTimeout used when no timers are supplied.
//
// Terminals wrap a paste as ESC[200~ ... ESC[201~ once the app enables mode 2004. A
// paste can span several TTY reads, so both markers may be split across chunks, and a
// terminal can drop the end marker entirely (the idle timer finishes the paste then).

const ESC = "\u001B";

export const PASTE_START = `${ESC}[200~`;
export const PASTE_END = `${ESC}[201~`;

/**
 * Shortest tail that is held back while waiting for the rest of a start marker. A lone
 * ESC is the Esc key and "ESC[" starts an arrow key, so neither may be delayed.
 */
const MIN_HELD_PREFIX = 3;

export type PasteDetectorOptions = {
  /** Raw text between the markers; the caller normalises CR/LF. */
  onPaste: (text: string) => void;
  /** Text that arrived in the same chunk after an end marker, or a held prefix that timed out. */
  onText?: (text: string) => void;
  /** Finalize a paste that never sent an end marker. Default 1500 ms. */
  idleMs?: number;
  /** Flush a held partial start marker as ordinary text. Default 50 ms. */
  prefixMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** True when the chunk ends with a long enough proper prefix of PASTE_START. */
function endsWithStartPrefix(chunk: string): boolean {
  const longest = Math.min(chunk.length, PASTE_START.length - 1);
  for (let length = longest; length >= MIN_HELD_PREFIX; length--) {
    if (chunk.endsWith(PASTE_START.slice(0, length))) return true;
  }
  return false;
}

export class PasteDetector {
  private readonly onPaste: (text: string) => void;
  private readonly onText?: (text: string) => void;
  private readonly idleMs: number;
  private readonly prefixMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  private pasting = false;
  private buffer = "";
  private held = "";
  private seenBracketedPaste = false;
  private idleHandle: unknown = null;
  private prefixHandle: unknown = null;

  constructor(options: PasteDetectorOptions) {
    this.onPaste = options.onPaste;
    this.onText = options.onText;
    this.idleMs = options.idleMs ?? 1500;
    this.prefixMs = options.prefixMs ?? 50;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /**
   * Feed one raw stdin chunk. Returns true when the chunk was consumed by paste
   * handling, in which case the caller must ignore Ink's parsed event for it.
   */
  feed(chunk: string): boolean {
    let data = chunk;

    if (this.held !== "") {
      data = this.held + data;
      this.held = "";
      this.cancelPrefixTimer();
    }

    return this.pasting ? this.feedPasting(data) : this.feedIdle(data);
  }

  isPasting(): boolean {
    return this.pasting;
  }

  hasSeenBracketedPaste(): boolean {
    return this.seenBracketedPaste;
  }

  /** Drop every pending timer and buffered fragment; the detector is done. */
  dispose(): void {
    this.cancelIdleTimer();
    this.cancelPrefixTimer();
    this.pasting = false;
    this.buffer = "";
    this.held = "";
  }

  private feedIdle(chunk: string): boolean {
    const start = chunk.indexOf(PASTE_START);
    if (start !== -1) {
      this.seenBracketedPaste = true;
      this.pasting = true;
      // Anything typed before the marker belongs to the same burst of input.
      this.buffer = chunk.slice(0, start);
      return this.feedPasting(chunk.slice(start + PASTE_START.length));
    }

    if (endsWithStartPrefix(chunk)) {
      // The whole chunk is held, not just the marker fragment: feed() has one return
      // value, so a chunk cannot be half consumed and half passed through.
      this.held = chunk;
      this.prefixHandle = this.setTimer(() => {
        this.prefixHandle = null;
        const pending = this.held;
        this.held = "";
        if (pending !== "") this.onText?.(pending);
      }, this.prefixMs);
      return true;
    }

    return false;
  }

  private feedPasting(chunk: string): boolean {
    this.buffer += chunk;

    // The whole buffer is searched so an end marker split across chunks is still found.
    const end = this.buffer.indexOf(PASTE_END);
    if (end === -1) {
      this.restartIdleTimer();
      return true;
    }

    const text = this.buffer.slice(0, end);
    const rest = this.buffer.slice(end + PASTE_END.length);
    this.reset();
    this.onPaste(text);

    if (rest !== "" && !this.feed(rest)) {
      this.onText?.(rest);
    }
    return true;
  }

  private reset(): void {
    this.cancelIdleTimer();
    this.pasting = false;
    this.buffer = "";
  }

  private restartIdleTimer(): void {
    this.cancelIdleTimer();
    this.idleHandle = this.setTimer(() => {
      this.idleHandle = null;
      const text = this.buffer;
      this.reset();
      this.onPaste(text);
    }, this.idleMs);
  }

  private cancelIdleTimer(): void {
    if (this.idleHandle !== null) {
      this.clearTimer(this.idleHandle);
      this.idleHandle = null;
    }
  }

  private cancelPrefixTimer(): void {
    if (this.prefixHandle !== null) {
      this.clearTimer(this.prefixHandle);
      this.prefixHandle = null;
    }
  }
}
