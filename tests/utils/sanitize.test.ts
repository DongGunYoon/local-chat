import { describe, expect, it } from "vitest";
import {
  finalizeOutgoing,
  isSlashCommand,
  normalizeInput,
  sanitizeIncoming,
  sanitizeNickname,
  unescapeLeadingSlash,
} from "../../src/utils/sanitize.js";

describe("normalizeInput — line endings", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeInput("a\r\nb")).toBe("a\nb");
  });

  it("converts a lone CR to LF", () => {
    expect(normalizeInput("a\rb")).toBe("a\nb");
  });

  it("converts the CSI-u encoding of a modified Enter to LF", () => {
    expect(normalizeInput("a\x1b[13;2ub")).toBe("a\nb");
    expect(normalizeInput("a\x1b[13;5ub")).toBe("a\nb");
  });

  it("converts the modifyOtherKeys encoding of a modified Enter to LF", () => {
    expect(normalizeInput("a\x1b[27;2;13~b")).toBe("a\nb");
    expect(normalizeInput("a\x1b[27;5;13~b")).toBe("a\nb");
  });
});

describe("normalizeInput — escape sequences and controls", () => {
  it("strips CSI colour sequences", () => {
    expect(normalizeInput("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("strips a clear-screen CSI sequence", () => {
    expect(normalizeInput("a\x1b[2Jb")).toBe("ab");
  });

  it("strips OSC title sequences terminated by BEL", () => {
    expect(normalizeInput("a\x1b]0;x\x07b")).toBe("ab");
  });

  it("strips OSC sequences terminated by ST", () => {
    expect(normalizeInput("a\x1b]0;x\x1b\\b")).toBe("ab");
  });

  it("strips two-byte ESC sequences", () => {
    expect(normalizeInput("a\x1bMb")).toBe("ab");
  });

  it("strips a lone ESC", () => {
    expect(normalizeInput("a\x1bb")).toBe("ab");
  });

  it("removes C0 controls but keeps newline", () => {
    expect(normalizeInput("a\x00\x01\x08\x0b\x0c\x0e\x1fb\nc")).toBe("ab\nc");
  });

  it("removes DEL and C1 controls", () => {
    expect(normalizeInput("a\x7fb\x85c\x9fd")).toBe("abcd");
  });

  it("removes bidi override controls", () => {
    expect(normalizeInput("a‮b‬c⁦d⁩e")).toBe("abcde");
  });

  it("removes BOM and zero-width space", () => {
    expect(normalizeInput("a﻿b​c")).toBe("abc");
  });

  it("expands each tab to four spaces", () => {
    expect(normalizeInput("a\tb")).toBe("a    b");
    expect(normalizeInput("\t\t")).toBe("        ");
  });
});

describe("normalizeInput — printable characters are never removed", () => {
  const preserved: Array<[string, string]> = [
    ["ZWJ family emoji", "👨‍👩‍👧"],
    ["skin tone emoji", "👍🏽"],
    ["heart with VS16", "❤️"],
    ["ZWNJ", "a‌b"],
    ["combining acute accent", "é"],
    ["Arabic", "مرحبا بالعالم"],
    ["Hebrew", "שלום עולם"],
    ["Korean", "안녕하세요"],
    ["Japanese", "こんにちは世界"],
    ["Chinese", "你好世界"],
  ];

  for (const [name, text] of preserved) {
    it(`preserves ${name} byte-for-byte`, () => {
      expect(normalizeInput(text)).toBe(text);
    });
  }
});

describe("finalizeOutgoing", () => {
  it("keeps indentation inside lines", () => {
    expect(finalizeOutgoing("a\n    indented\nb")).toBe("a\n    indented\nb");
  });

  it("drops leading and trailing blank lines", () => {
    expect(finalizeOutgoing("\n\nhello\n\n")).toBe("hello");
  });

  it("strips trailing spaces and tabs on every line", () => {
    expect(finalizeOutgoing("a   \nb\t\nc")).toBe("a\nb\nc");
  });

  it("keeps blank lines in the middle", () => {
    expect(finalizeOutgoing("a\n\nb")).toBe("a\n\nb");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(finalizeOutgoing("  \n\t\n  ")).toBe("");
  });

  it("normalizes before finalizing", () => {
    expect(finalizeOutgoing("\r\n\x1b[31ma\x1b[0m  \r\n")).toBe("a");
  });
});

describe("sanitizeIncoming", () => {
  it("returns an empty string for non-strings", () => {
    expect(sanitizeIncoming(42)).toBe("");
    expect(sanitizeIncoming(null)).toBe("");
    expect(sanitizeIncoming(undefined)).toBe("");
    expect(sanitizeIncoming({ a: 1 })).toBe("");
  });

  it("normalizes strings", () => {
    expect(sanitizeIncoming("a\r\n\x1b[2Jb")).toBe("a\nb");
  });
});

describe("sanitizeNickname", () => {
  it("returns null for non-strings", () => {
    expect(sanitizeNickname({})).toBeNull();
    expect(sanitizeNickname(5)).toBeNull();
    expect(sanitizeNickname(null)).toBeNull();
  });

  it("collapses whitespace runs and trims", () => {
    expect(sanitizeNickname("  a\n b ")).toBe("a b");
  });

  it("returns null when nothing printable survives", () => {
    expect(sanitizeNickname("\x1b[2J")).toBeNull();
    expect(sanitizeNickname("")).toBeNull();
    expect(sanitizeNickname("   ")).toBeNull();
  });

  it("keeps international nicknames unchanged", () => {
    expect(sanitizeNickname("홍길동")).toBe("홍길동");
    expect(sanitizeNickname("山田太郎")).toBe("山田太郎");
    expect(sanitizeNickname("José")).toBe("José");
    expect(sanitizeNickname("😀")).toBe("😀");
  });

  it("applies no length or character-class rules", () => {
    const long = "a".repeat(500);
    expect(sanitizeNickname(long)).toBe(long);
    expect(sanitizeNickname("!@#$%^&*()")).toBe("!@#$%^&*()");
  });
});

describe("isSlashCommand", () => {
  it("accepts a single-line slash command", () => {
    expect(isSlashCommand("/copy 2")).toBe(true);
  });

  it("rejects multi-line text", () => {
    expect(isSlashCommand("/a\nb")).toBe(false);
  });

  it("rejects an escaped leading slash", () => {
    expect(isSlashCommand("//x")).toBe(false);
  });

  it("accepts non-ASCII command names", () => {
    expect(isSlashCommand("/ㄹ")).toBe(true);
  });

  it("accepts a path-looking command", () => {
    expect(isSlashCommand("/usr/local/bin")).toBe(true);
  });

  it("rejects a bare or spaced slash", () => {
    expect(isSlashCommand("/")).toBe(false);
    expect(isSlashCommand("/ copy")).toBe(false);
    expect(isSlashCommand("hi /copy")).toBe(false);
  });
});

describe("unescapeLeadingSlash", () => {
  it("drops exactly one leading slash", () => {
    expect(unescapeLeadingSlash("//x")).toBe("/x");
  });

  it("leaves a single leading slash alone", () => {
    expect(unescapeLeadingSlash("/x")).toBe("/x");
  });

  it("leaves multi-line text alone", () => {
    expect(unescapeLeadingSlash("//a\nb")).toBe("//a\nb");
  });

  it("leaves text without a leading slash alone", () => {
    expect(unescapeLeadingSlash("x//y")).toBe("x//y");
  });
});
