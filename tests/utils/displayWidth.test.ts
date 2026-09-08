import { describe, expect, it } from "vitest";
import { graphemeWidth, segmentGraphemes } from "../../src/utils/displayWidth.js";

describe("segmentGraphemes", () => {
  it("returns an empty array for an empty string", () => {
    expect(segmentGraphemes("")).toEqual([]);
  });

  it("keeps ZWJ sequences, skin tones, flags and combining marks whole", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(segmentGraphemes(`${family}\u{1F1EF}\u{1F1F5}e\u0301`)).toEqual([
      family,
      "\u{1F1EF}\u{1F1F5}",
      "e\u0301",
    ]);
  });

  it("splits mixed scripts into single characters", () => {
    expect(segmentGraphemes("a한日")).toEqual(["a", "한", "日"]);
  });

  it("treats a newline as its own grapheme", () => {
    expect(segmentGraphemes("a\nb")).toEqual(["a", "\n", "b"]);
  });
});

describe("graphemeWidth", () => {
  it("reports 2 cells for CJK and emoji and 1 cell for ASCII and halfwidth katakana", () => {
    expect(graphemeWidth("한")).toBe(2);
    expect(graphemeWidth("日")).toBe(2);
    expect(graphemeWidth("\u{1F44D}\u{1F3FD}")).toBe(2);
    expect(graphemeWidth("a")).toBe(1);
    expect(graphemeWidth("ﾊ")).toBe(1);
  });

  it("reports 0 cells for a newline", () => {
    expect(graphemeWidth("\n")).toBe(0);
  });

  it("returns the same width on a cache hit", () => {
    expect(graphemeWidth("글")).toBe(graphemeWidth("글"));
  });
});
