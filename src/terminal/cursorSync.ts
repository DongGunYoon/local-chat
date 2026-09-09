/**
 * Keeps the real terminal cursor on the caret without breaking Ink's frame diffing.
 *
 * Ink's log-update writes `eraseLines(previousLineCount) + frame + "\n"` and never restores
 * the cursor, so after every frame the cursor rests at column 1 of the line below the frame.
 * eraseLines then walks *up* from wherever the cursor happens to be, which is why moving the
 * cursor from a React effect corrupts the next frame.
 *
 * This proxy owns the move instead: it appends a relative move to the caret after each write
 * and undoes that exact move before the next one, so Ink always starts from the resting cell
 * it expects. Relative moves only - absolute positioning conflicts with Ink's tracking and
 * corrupts Terminal.app's text buffer.
 */

/** `rowsFromBottom` counts lines above Ink's resting cell and must be >= 1; `col` is 1-based. */
export type CursorTarget = { rowsFromBottom: number; col: number };

export type CursorSync = {
  /** Pass to Ink's `render({ stdout })`. */
  stdout: NodeJS.WriteStream;
  /** Stores the target only; it is applied on the next write. */
  setTarget(target: CursorTarget | null): void;
  getTarget(): CursorTarget | null;
};

/** Start of Ink's clearTerminal (`\u001B[2J\u001B[3J\u001B[H`), which homes the cursor itself. */
const CLEAR_TERMINAL_START = "\u001B[2J";
const HIDE_CURSOR = "\u001B[?25l";
const SHOW_CURSOR = "\u001B[?25h";

export function createCursorSync(real: NodeJS.WriteStream = process.stdout): CursorSync {
  // `real.write` is captured once so the proxy's own write trap can never re-enter it.
  const realWrite = real.write.bind(real) as (...args: unknown[]) => boolean;

  let target: CursorTarget | null = null;
  /** Rows the previous write moved the cursor up by; 0 when it rests where Ink left it. */
  let parked = 0;

  // A resize makes Ink redraw from scratch, so the park is no longer where we left it.
  real.on("resize", () => {
    parked = 0;
  });

  // Ink only ever writes strings; String() keeps a stray Buffer from breaking the app.
  const write = (chunk: unknown, ...rest: unknown[]): boolean => {
    let data = String(chunk);

    if (data.startsWith(CLEAR_TERMINAL_START)) {
      parked = 0;
    }

    const prefix = parked > 0 ? `\u001B[${parked}B\u001B[1G` : "";

    if (target !== null) {
      // The caret is where the user is typing, so the cursor stays visible for the IME.
      data = data.replaceAll(HIDE_CURSOR, "");
    }

    const suffix =
      target !== null ? `\u001B[${target.rowsFromBottom}A\u001B[${target.col}G${SHOW_CURSOR}` : "";
    parked = target !== null ? target.rowsFromBottom : 0;

    return realWrite(prefix + data + suffix, ...rest);
  };

  const stdout = new Proxy(real, {
    get(stream, property) {
      if (property === "write") return write;
      const value = Reflect.get(stream, property);
      return typeof value === "function" ? value.bind(stream) : value;
    },
  }) as NodeJS.WriteStream;

  return {
    stdout,
    setTarget(next: CursorTarget | null): void {
      target = next;
    },
    getTarget(): CursorTarget | null {
      return target;
    },
  };
}
