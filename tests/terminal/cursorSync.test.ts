import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CursorSync, createCursorSync } from "../../src/terminal/cursorSync.js";

const CUU = (n: number): string => `\u001B[${n}A`;
const CUD = (n: number): string => `\u001B[${n}B`;
const CHA = (n: number): string => `\u001B[${n}G`;
const SHOW = "\u001B[?25h";
const HIDE = "\u001B[?25l";
const CLEAR_TERMINAL = "\u001B[2J\u001B[3J\u001B[H";

type FakeStream = {
  write: ReturnType<typeof vi.fn>;
  columns: number;
  rows: number;
  isTTY: boolean;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
};

function makeStream(): FakeStream {
  return {
    write: vi.fn(() => true),
    columns: 80,
    rows: 24,
    isTTY: true,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  };
}

let real: FakeStream;
let sync: CursorSync;

beforeEach(() => {
  real = makeStream();
  sync = createCursorSync(real as unknown as NodeJS.WriteStream);
});

describe("createCursorSync", () => {
  it("passes writes through byte for byte while no target is set", () => {
    sync.stdout.write("frame\n");

    expect(real.write).toHaveBeenCalledTimes(1);
    expect(real.write).toHaveBeenNthCalledWith(1, "frame\n");
  });

  it("appends a relative move to the caret once a target is set", () => {
    sync.setTarget({ rowsFromBottom: 3, col: 7 });

    // setTarget only stores: the move rides along with the next frame.
    expect(real.write).not.toHaveBeenCalled();

    sync.stdout.write("f2\n");

    expect(real.write).toHaveBeenNthCalledWith(1, `f2\n${CUU(3)}${CHA(7)}${SHOW}`);
  });

  it("returns to the resting cell before the next frame", () => {
    sync.setTarget({ rowsFromBottom: 3, col: 7 });
    sync.stdout.write("f2\n");
    sync.stdout.write("f3\n");

    expect(real.write).toHaveBeenNthCalledWith(
      2,
      `${CUD(3)}${CHA(1)}f3\n${CUU(3)}${CHA(7)}${SHOW}`,
    );
  });

  it("keeps the cursor visible by dropping every hide sequence while targeted", () => {
    sync.setTarget({ rowsFromBottom: 2, col: 5 });
    sync.stdout.write(`a${HIDE}b${HIDE}`);

    expect(real.write).toHaveBeenNthCalledWith(1, `ab${CUU(2)}${CHA(5)}${SHOW}`);
  });

  it("leaves hide sequences alone while no target is set", () => {
    sync.stdout.write(`a${HIDE}b`);

    expect(real.write).toHaveBeenNthCalledWith(1, `a${HIDE}b`);
  });

  it("undoes the park exactly once when the target is cleared", () => {
    sync.setTarget({ rowsFromBottom: 3, col: 7 });
    sync.stdout.write("f2\n");

    sync.setTarget(null);
    sync.stdout.write("x");
    sync.stdout.write("y");

    expect(real.write).toHaveBeenNthCalledWith(2, `${CUD(3)}${CHA(1)}x`);
    expect(real.write).toHaveBeenNthCalledWith(3, "y");
  });

  it("drops the prefix when Ink clears the whole terminal", () => {
    sync.setTarget({ rowsFromBottom: 3, col: 7 });
    sync.stdout.write("f2\n");
    sync.stdout.write(`${CLEAR_TERMINAL}f3\n`);

    expect(real.write).toHaveBeenNthCalledWith(2, `${CLEAR_TERMINAL}f3\n${CUU(3)}${CHA(7)}${SHOW}`);
  });

  it("reports the target it was given", () => {
    expect(sync.getTarget()).toBeNull();

    sync.setTarget({ rowsFromBottom: 3, col: 7 });
    expect(sync.getTarget()).toEqual({ rowsFromBottom: 3, col: 7 });

    sync.setTarget(null);
    expect(sync.getTarget()).toBeNull();
  });

  it("forwards stream properties and binds methods to the real stream", () => {
    expect(sync.stdout.columns).toBe(80);
    expect(sync.stdout.rows).toBe(24);
    expect(sync.stdout.isTTY).toBe(true);

    const listener = (): void => {};
    sync.stdout.off("resize", listener);
    expect(real.off).toHaveBeenCalledWith("resize", listener);
  });

  it("forgets the park when the terminal is resized", () => {
    const registered = real.on.mock.calls.find(([event]) => event === "resize");
    expect(registered, "no resize listener registered").toBeDefined();
    const onResize = registered?.[1] as () => void;

    sync.setTarget({ rowsFromBottom: 2, col: 3 });
    sync.stdout.write("f1\n");
    onResize();
    sync.stdout.write("f2\n");

    expect(real.write).toHaveBeenNthCalledWith(2, `f2\n${CUU(2)}${CHA(3)}${SHOW}`);
  });
});
