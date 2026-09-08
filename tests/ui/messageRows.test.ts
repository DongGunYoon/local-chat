import { describe, expect, it } from "vitest";
import type { ChatEntry } from "../../src/network/types.js";
import { layoutMessage, type MessageRow } from "../../src/ui/MessageList.js";
import { getDisplayWidth, segmentGraphemes } from "../../src/utils/displayWidth.js";

const COLS = 80;
/** "HH:MM " (6) + "me" (2) + " › " (3) */
const PREFIX_WIDTH = 11;
const FIRST_WIDTH = COLS - PREFIX_WIDTH;
/** WRAP_INDENT is 10 for chat rows. */
const CONT_WIDTH = COLS - 10;
/** "HH:MM " (6) + "● " (2) */
const SYSTEM_WIDTH = COLS - 8;

function chat(content: string, overrides: Partial<ChatEntry> = {}): ChatEntry {
  return { id: "e1", type: "message", nickname: "me", content, timestamp: 0, ...overrides };
}

function system(content: string): ChatEntry {
  return { id: "s1", type: "system", content, timestamp: 0 };
}

function layout(entry: ChatEntry, cols = COLS, showHostBadge = false): MessageRow[] {
  return layoutMessage(entry, cols, "host", showHostBadge);
}

const texts = (rows: readonly MessageRow[]): string[] => rows.map((row) => row.text);
const graphemeCounts = (rows: readonly MessageRow[]): number[] =>
  rows.map((row) => segmentGraphemes(row.text).length);

describe("layoutMessage", () => {
  it("returns one first row for a short message", () => {
    const rows = layout(chat("hi"));

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("first");
    expect(rows[0].key).toBe("e1:0");
    expect(rows[0].text).toBe("hi");
    expect(rows[0].entry.id).toBe("e1");
  });

  it("keys and kinds follow the row index", () => {
    const rows = layout(chat("a\nb\nc"));

    expect(texts(rows)).toEqual(["a", "b", "c"]);
    expect(rows.map((row) => row.key)).toEqual(["e1:0", "e1:1", "e1:2"]);
    expect(rows.map((row) => row.kind)).toEqual(["first", "cont", "cont"]);
  });

  it("reserves the prefix width on the first row only", () => {
    expect(layout(chat("a".repeat(FIRST_WIDTH)))).toHaveLength(1);

    const rows = layout(chat("a".repeat(FIRST_WIDTH + 1)));
    expect(texts(rows)).toEqual(["a".repeat(FIRST_WIDTH), "a"]);
  });

  it("widens the prefix for the host badge and the own-message star", () => {
    // "HH:MM " (6) + "👑 " (3) + "host" (4) + " › " (3) = 16
    const host = chat("a".repeat(COLS - 16), { nickname: "host" });
    expect(layout(host, COLS, true)).toHaveLength(1);
    expect(layout(chat("a".repeat(COLS - 15), { nickname: "host" }), COLS, true)).toHaveLength(2);

    // "HH:MM " (6) + "me" (2) + "★" (1) + " › " (3) = 12
    expect(layout(chat("a".repeat(COLS - 12), { isMe: true }))).toHaveLength(1);
    expect(layout(chat("a".repeat(COLS - 11), { isMe: true }))).toHaveLength(2);
  });

  it("never splits a 2-cell Korean grapheme", () => {
    const rows = layout(chat("한".repeat(100)));

    // 34 graphemes = 68 cells fit in 69; 35 = 70 cells fit in the 70-cell continuation.
    expect(graphemeCounts(rows)).toEqual([34, 35, 31]);
    for (const row of rows) {
      expect(getDisplayWidth(row.text)).toBeLessThanOrEqual(CONT_WIDTH);
    }
    expect(texts(rows).join("")).toBe("한".repeat(100));
  });

  it("wraps a Japanese message on grapheme boundaries", () => {
    const sentence = "吾輩は猫である。名前はまだ無い。";
    const content = sentence.repeat(5);
    const rows = layout(chat(content));

    expect(graphemeCounts(rows)).toEqual([34, 35, 11]);
    expect(getDisplayWidth(rows[0].text)).toBeLessThanOrEqual(FIRST_WIDTH);
    expect(texts(rows).join("")).toBe(content);
  });

  it("keeps emoji clusters whole", () => {
    const zwj = "\u200D";
    const family = `\u{1F468}${zwj}\u{1F469}${zwj}\u{1F467}${zwj}\u{1F466}`;
    const content = family.repeat(40);
    const rows = layout(chat(content));

    expect(graphemeCounts(rows)).toEqual([34, 6]);
    expect(texts(rows).join("")).toBe(content);
    for (const row of rows) {
      expect(row.text.startsWith(zwj)).toBe(false);
      expect(row.text.endsWith(zwj)).toBe(false);
    }
  });

  it("breaks at a space and carries the partial word down", () => {
    // cols 25 -> first width 14: "hello world fo" fills the row, so the break moves up.
    const rows = layout(chat("hello world foo bar"), 25);

    expect(texts(rows)).toEqual(["hello world ", "foo bar"]);
    expect(texts(rows).join("")).toBe("hello world foo bar");
  });

  it("never starts a continuation row with the space that closed the row before it", () => {
    // "hello worlds" is exactly 12 cells, so the space after it is the grapheme that
    // no longer fits; it has to stay on the full row instead of jogging the next indent.
    const rows = layout(chat("hello worlds again"), 23);

    expect(texts(rows)).toEqual(["hello worlds ", "again"]);
    expect(texts(rows).join("")).toBe("hello worlds again");
  });

  it("falls back to grapheme breaks for a word longer than the row", () => {
    // cols 20 -> first width 9, continuation width 10.
    const rows = layout(chat(`a ${"b".repeat(30)}`), 20);

    expect(texts(rows)).toEqual(["a ", "b".repeat(10), "b".repeat(10), "b".repeat(10)]);
  });

  it("breaks a long URL at graphemes because it has no space", () => {
    const url = `https://example.com/${"a".repeat(180)}`;
    const rows = layout(chat(url));

    expect(texts(rows).map((text) => text.length)).toEqual([FIRST_WIDTH, CONT_WIDTH, 61]);
    expect(texts(rows).join("")).toBe(url);
  });

  it("gives an empty paragraph a row of its own", () => {
    expect(texts(layout(chat("a\n\nb")))).toEqual(["a", "", "b"]);
  });

  it("lays out system messages against the 8-cell system prefix", () => {
    expect(layout(system("done"))).toHaveLength(1);
    expect(texts(layout(system("b".repeat(SYSTEM_WIDTH))))).toEqual(["b".repeat(SYSTEM_WIDTH)]);

    const rows = layout(system("b".repeat(100)));
    expect(texts(rows)).toEqual(["b".repeat(SYSTEM_WIDTH), "b".repeat(100 - SYSTEM_WIDTH)]);
    expect(rows.map((row) => row.key)).toEqual(["s1:0", "s1:1"]);
  });

  it("has no length cap", () => {
    const rows = layout(chat("x".repeat(10_000)));

    expect(rows.length).toBeGreaterThan(100);
    expect(texts(rows).join("")).toBe("x".repeat(10_000));
    expect(texts(rows).some((text) => text.includes("…"))).toBe(false);
  });
});
