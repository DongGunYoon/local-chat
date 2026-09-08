import { describe, expect, it } from "vitest";
import { PASTE_END, PASTE_START, PasteDetector } from "../../src/input/pasteDetector.js";

const ESC = "\u001B";

/** Deterministic stand-in for setTimeout: nothing fires until fire() is called. */
function fakeTimers() {
  const timers = new Map<number, () => void>();
  let nextId = 1;

  return {
    setTimer: (fn: () => void, _ms: number): unknown => {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (handle: unknown): void => {
      timers.delete(handle as number);
    },
    fire: (): void => {
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
    get pending(): number {
      return timers.size;
    },
  };
}

function makeDetector() {
  const pastes: string[] = [];
  const texts: string[] = [];
  const timers = fakeTimers();
  const detector = new PasteDetector({
    onPaste: (text) => pastes.push(text),
    onText: (text) => texts.push(text),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { detector, pastes, texts, timers };
}

const SAMPLE = `${PASTE_START}a\r\nb${PASTE_END}`;

const MIXED_LINES = [
  "안녕하세요 여러분",
  "こんにちは、みなさん",
  "大家好，欢迎光临",
  "مرحبا بالعالم",
  "Hello from a very ordinary English line.",
  "family \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and thumbs \u{1F44D}\u{1F3FD}",
];

function bigText(): string {
  const lines: string[] = [];
  while (lines.join("\r\n").length < 3000) {
    lines.push(`${lines.length}: ${MIXED_LINES[lines.length % MIXED_LINES.length]}`);
  }
  return lines.join("\r\n");
}

describe("PasteDetector - whole chunks", () => {
  it("reports a paste that arrives in one chunk", () => {
    const { detector, pastes, texts } = makeDetector();
    expect(detector.feed(SAMPLE)).toBe(true);
    expect(pastes).toEqual(["a\r\nb"]);
    expect(texts).toEqual([]);
    expect(detector.isPasting()).toBe(false);
  });

  it("keeps text that precedes the start marker in the paste", () => {
    const { detector, pastes } = makeDetector();
    detector.feed(`abc${PASTE_START}def${PASTE_END}`);
    expect(pastes).toEqual(["abcdef"]);
  });

  it("delivers text after the end marker separately", () => {
    const { detector, pastes, texts } = makeDetector();
    expect(detector.feed(`${PASTE_START}x${PASTE_END}y`)).toBe(true);
    expect(pastes).toEqual(["x"]);
    expect(texts).toEqual(["y"]);
  });

  it("tracks whether the terminal speaks bracketed paste", () => {
    const { detector } = makeDetector();
    expect(detector.hasSeenBracketedPaste()).toBe(false);
    detector.feed("plain");
    expect(detector.hasSeenBracketedPaste()).toBe(false);
    detector.feed(SAMPLE);
    expect(detector.hasSeenBracketedPaste()).toBe(true);
  });
});

describe("PasteDetector - split chunks", () => {
  it("reassembles a paste split at every offset", () => {
    for (let i = 3; i < SAMPLE.length; i++) {
      const { detector, pastes, texts } = makeDetector();
      const first = detector.feed(SAMPLE.slice(0, i));
      const second = detector.feed(SAMPLE.slice(i));
      expect(first, `offset ${i} first chunk`).toBe(true);
      expect(second, `offset ${i} second chunk`).toBe(true);
      expect(pastes, `offset ${i}`).toEqual(["a\r\nb"]);
      expect(texts, `offset ${i}`).toEqual([]);
    }
  });

  // Offsets 1 and 2 leave only "ESC" or "ESC[" behind. Those are the Esc key and the
  // start of an arrow key, so they are deliberately not held back and the paste is lost
  // rather than delaying every Esc press; a split there needs a 1-byte TTY read and
  // cannot happen in practice.
  it("does not hold a lone ESC or a bare CSI introducer at the head of a paste", () => {
    for (const i of [1, 2]) {
      const { detector, pastes, texts } = makeDetector();
      expect(detector.feed(SAMPLE.slice(0, i)), `offset ${i} first chunk`).toBe(false);
      expect(pastes, `offset ${i}`).toEqual([]);
      expect(texts, `offset ${i}`).toEqual([]);
      expect(detector.hasSeenBracketedPaste(), `offset ${i}`).toBe(false);
    }
  });

  it("reassembles a 3 KB multilingual paste split at every offset", () => {
    const text = bigText();
    const stream = `${PASTE_START}${text}${PASTE_END}`;
    for (let i = 3; i < stream.length; i++) {
      const { detector, pastes, texts } = makeDetector();
      const first = detector.feed(stream.slice(0, i));
      const second = detector.feed(stream.slice(i));
      expect(first, `offset ${i} first chunk`).toBe(true);
      expect(second, `offset ${i} second chunk`).toBe(true);
      expect(pastes.length, `offset ${i} paste count`).toBe(1);
      expect(pastes[0] === text, `offset ${i} paste text`).toBe(true);
      expect(texts, `offset ${i}`).toEqual([]);
    }
  });

  it("reassembles a paste split into three chunks", () => {
    const text = bigText();
    const stream = `${PASTE_START}${text}${PASTE_END}`;
    const cuts: ReadonlyArray<[number, number]> = [
      [3, 10],
      [4, 7],
      [6, 1000],
      [1000, stream.length - 3],
      [5, stream.length - 1],
    ];

    for (const [a, b] of cuts) {
      const { detector, pastes, texts } = makeDetector();
      expect(detector.feed(stream.slice(0, a)), `cut ${a}/${b} chunk 1`).toBe(true);
      expect(detector.feed(stream.slice(a, b)), `cut ${a}/${b} chunk 2`).toBe(true);
      expect(detector.feed(stream.slice(b)), `cut ${a}/${b} chunk 3`).toBe(true);
      expect(pastes.length, `cut ${a}/${b} paste count`).toBe(1);
      expect(pastes[0] === text, `cut ${a}/${b} paste text`).toBe(true);
      expect(texts, `cut ${a}/${b}`).toEqual([]);
    }
  });

  it("handles an end marker split across chunks", () => {
    for (const [head, tail] of [
      [`${ESC}[20`, "1~"],
      [ESC, "[201~"],
    ]) {
      const { detector, pastes } = makeDetector();
      detector.feed(`${PASTE_START}body`);
      expect(detector.feed(head)).toBe(true);
      expect(pastes).toEqual([]);
      expect(detector.feed(tail)).toBe(true);
      expect(pastes).toEqual(["body"]);
    }
  });

  it("holds a partial start marker until the rest arrives", () => {
    const { detector, pastes, texts } = makeDetector();
    expect(detector.feed(`${ESC}[20`)).toBe(true);
    expect(detector.isPasting()).toBe(false);
    expect(detector.feed(`0~abc${PASTE_END}`)).toBe(true);
    expect(pastes).toEqual(["abc"]);
    expect(texts).toEqual([]);
  });

  it("flushes a held partial start marker as text when it never completes", () => {
    const { detector, pastes, texts, timers } = makeDetector();
    expect(detector.feed(`${ESC}[2`)).toBe(true);
    timers.fire();
    expect(texts).toEqual([`${ESC}[2`]);
    expect(pastes).toEqual([]);
    expect(detector.hasSeenBracketedPaste()).toBe(false);
  });

  it("survives a held partial start marker with no onText handler", () => {
    const pastes: string[] = [];
    const timers = fakeTimers();
    const detector = new PasteDetector({
      onPaste: (text) => pastes.push(text),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    expect(detector.feed(`${ESC}[200`)).toBe(true);
    expect(() => timers.fire()).not.toThrow();
    expect(pastes).toEqual([]);
  });
});

describe("PasteDetector - chunks that are not paste traffic", () => {
  it("passes ordinary text through untouched", () => {
    const { detector, pastes, texts, timers } = makeDetector();
    expect(detector.feed("hello")).toBe(false);
    expect(pastes).toEqual([]);
    expect(texts).toEqual([]);
    expect(timers.pending).toBe(0);
  });

  it("never holds a lone ESC or a bare CSI introducer", () => {
    const { detector, timers } = makeDetector();
    expect(detector.feed(ESC)).toBe(false);
    expect(detector.feed(`${ESC}[`)).toBe(false);
    expect(timers.pending).toBe(0);
  });
});

describe("PasteDetector - idle timeout", () => {
  it("finalizes a paste that never sends an end marker", () => {
    const { detector, pastes, texts, timers } = makeDetector();
    expect(detector.feed(`${PASTE_START}partial`)).toBe(true);
    expect(detector.isPasting()).toBe(true);
    timers.fire();
    expect(pastes).toEqual(["partial"]);
    expect(texts).toEqual([]);
    expect(detector.isPasting()).toBe(false);
  });

  it("clears its timers on dispose", () => {
    const { detector, pastes, timers } = makeDetector();
    detector.feed(`${PASTE_START}partial`);
    detector.dispose();
    expect(timers.pending).toBe(0);
    timers.fire();
    expect(pastes).toEqual([]);
  });
});
