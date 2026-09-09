import { describe, expect, it } from "vitest";
import {
  decodeKey,
  MAX_HELD_BYTES,
  type ModifiedEnterMode,
  translateChunk,
} from "../../src/terminal/keyEncoding.js";

const ESC = "\u001B";
const CSI = `${ESC}[`;

function translate(chunk: string, enter: ModifiedEnterMode = "newline", carry = "") {
  return translateChunk(chunk, enter, carry);
}

function output(chunk: string, enter: ModifiedEnterMode = "newline"): string {
  const result = translate(chunk, enter);
  expect(result.held).toBe("");
  return result.output;
}

describe("translateChunk - Enter and its modifiers", () => {
  it("leaves plain Enter, Ctrl+J and typed text untouched", () => {
    expect(output("\r")).toBe("\r");
    expect(output("\n")).toBe("\n");
    expect(output("hello 안녕 日本語 👍🏽")).toBe("hello 안녕 日本語 👍🏽");
  });

  it.each([
    ["Shift+Enter (kitty)", `${CSI}13;2u`],
    ["Alt+Enter (kitty)", `${CSI}13;3u`],
    ["Ctrl+Enter (kitty)", `${CSI}13;5u`],
    ["Ctrl+Shift+Enter (kitty)", `${CSI}13;6u`],
    ["Shift+Enter (modifyOtherKeys)", `${CSI}27;2;13~`],
    ["Ctrl+Enter (modifyOtherKeys)", `${CSI}27;5;13~`],
    ["Shift+keypad Enter (kitty)", `${CSI}57414;2u`],
    ["kitty with event type and alternates", `${CSI}13:13;2:1u`],
  ])("turns %s into a newline in the chat editor", (_name, sequence) => {
    expect(output(sequence, "newline")).toBe("\n");
  });

  it("turns a modified Enter into plain Enter outside the chat editor", () => {
    expect(output(`${CSI}13;2u`, "return")).toBe("\r");
    expect(output(`${CSI}27;2;13~`, "return")).toBe("\r");
  });

  it("ignores Caps Lock and Num Lock bits, which the kitty protocol reports on functional keys", () => {
    expect(output(`${CSI}13;66u`)).toBe("\n"); // Shift+Enter with Caps Lock
    expect(output(`${CSI}13;130u`)).toBe("\n"); // Shift+Enter with Num Lock
    expect(output(`${CSI}13;65u`)).toBe("\r"); // Enter with Caps Lock only
    expect(output(`${CSI}27;65u`)).toBe(ESC); // Esc with Caps Lock
    expect(output(`${CSI}99;133u`)).toBe("\u0003"); // Ctrl+C with Num Lock
    expect(output(`${CSI}97;69u`)).toBe("\u0001"); // Ctrl+A with Caps Lock
  });

  it("keeps an unmodified kitty Enter as Enter", () => {
    expect(output(`${CSI}13u`)).toBe("\r");
    expect(output(`${CSI}13;1u`)).toBe("\r");
  });
});

describe("translateChunk - other keys", () => {
  it("turns the kitty Esc into a bare ESC, and two of them into ESC ESC", () => {
    expect(output(`${CSI}27u`)).toBe(ESC);
    expect(output(`${CSI}27u${CSI}27u`)).toBe(`${ESC}${ESC}`);
    expect(output(`${CSI}27;3u`)).toBe(ESC);
  });

  it("maps Ctrl+letter chords onto control bytes", () => {
    expect(output(`${CSI}99;5u`)).toBe("\u0003"); // Ctrl+C
    expect(output(`${CSI}97;5u`)).toBe("\u0001"); // Ctrl+A
    expect(output(`${CSI}101;5u`)).toBe("\u0005"); // Ctrl+E
    expect(output(`${CSI}117;5u`)).toBe("\u0015"); // Ctrl+U
    expect(output(`${CSI}106;5u`)).toBe("\n"); // Ctrl+J
    expect(output(`${CSI}109;5u`)).toBe("\r"); // Ctrl+M
    expect(output(`${CSI}27;5;99~`)).toBe("\u0003"); // Ctrl+C, xterm form
    expect(output(`${CSI}91;5u`)).toBe(ESC); // Ctrl+[
  });

  it("maps Alt+key onto ESC+key, which Ink reports as Meta", () => {
    expect(output(`${CSI}120;3u`)).toBe(`${ESC}x`);
    expect(output(`${CSI}27;3;120~`)).toBe(`${ESC}x`);
  });

  it("emits the shifted character for a shift-only text key (xterm mode 2)", () => {
    expect(output(`${CSI}27;2;65~`)).toBe("A");
    expect(output(`${CSI}27;2;33~`)).toBe("!");
    expect(output(`${CSI}27;2;196~`)).toBe("Ä");
  });

  it("emits the shifted character for a shift-only kitty text key", () => {
    expect(output(`${CSI}97;2u`)).toBe("A"); // no alternate key given: upper-case the letter
    expect(output(`${CSI}97:65;2u`)).toBe("A"); // alternate (shifted) key given
    expect(output(`${CSI}49:33;2u`)).toBe("!"); // Shift+1 with the shifted key given
    expect(output(`${CSI}49;2u`)).toBe("1"); // Shift+1 without it: nothing better to do
  });

  it("drops codepoints that are not Unicode scalar values instead of throwing", () => {
    expect(output(`${CSI}1114112u`)).toBe(""); // beyond U+10FFFF
    expect(output(`${CSI}55296u`)).toBe(""); // lone surrogate
    expect(output(`${CSI}99999999999u`)).toBe("");
  });

  it("maps Shift+Tab onto CSI Z and keeps plain Tab", () => {
    expect(output(`${CSI}9;2u`)).toBe(`${CSI}Z`);
    expect(output(`${CSI}27;2;9~`)).toBe(`${CSI}Z`);
    expect(output(`${CSI}9u`)).toBe("\t");
  });

  it("maps a modified Backspace onto plain Backspace", () => {
    expect(output(`${CSI}127;2u`)).toBe("\u007F");
    expect(output(`${CSI}127;5u`)).toBe("\u007F");
    expect(output(`${CSI}8;3u`)).toBe("\u007F");
  });

  it("rewrites F1/F2/F4 from the kitty CSI form to the SS3 form Ink knows", () => {
    expect(output(`${CSI}P`)).toBe(`${ESC}OP`);
    expect(output(`${CSI}Q`)).toBe(`${ESC}OQ`);
    expect(output(`${CSI}1;2S`)).toBe(`${ESC}OS`);
  });

  it("maps keypad navigation keys onto their legacy sequences", () => {
    expect(output(`${CSI}57419u`)).toBe(`${CSI}A`);
    expect(output(`${CSI}57419;2u`)).toBe(`${CSI}1;2A`);
    expect(output(`${CSI}57421u`)).toBe(`${CSI}5~`);
    expect(output(`${CSI}57421;2u`)).toBe(`${CSI}5;2~`);
    expect(output(`${CSI}57426u`)).toBe(`${CSI}3~`);
  });

  it("drops keys that have no legacy form instead of leaking them as text", () => {
    expect(output(`${CSI}57399u`)).toBe(""); // KP_0: crashes Ink 5.2.1 if it gets through
    expect(output(`${CSI}57376u`)).toBe(""); // F13
    expect(output(`${CSI}57428u`)).toBe(""); // media play
    expect(output(`${CSI}97;9u`)).toBe(""); // Super+a
    expect(output(`${CSI}9;5u`)).toBe(""); // Ctrl+Tab
    expect(output(`${CSI}32;5u`)).toBe(""); // Ctrl+Space
    expect(output(`${CSI}120;7u`)).toBe(""); // Ctrl+Alt+x
    expect(output(`${CSI};u`)).toBe("");
  });

  it("passes cursor keys, paste markers and unknown sequences through unchanged", () => {
    const untouched = [
      `${CSI}A`,
      `${CSI}1;2A`,
      `${CSI}3~`,
      `${CSI}5;2~`,
      `${CSI}H`,
      `${CSI}Z`,
      `${CSI}200~pasted\r\ntext${CSI}201~`,
      `${ESC}OP`,
      `${ESC}x`,
      `${ESC}\r`,
      ESC,
      `${ESC}${ESC}`,
      `${CSI}?2004h`,
    ];
    for (const sequence of untouched) {
      expect(output(sequence)).toBe(sequence);
    }
  });

  it("decodes sequences embedded in a paste, as tmux re-encodes pasted line feeds", () => {
    const chunk = `${CSI}200~line one${CSI}106;5uline two${CSI}201~`;
    expect(output(chunk)).toBe(`${CSI}200~line one\nline two${CSI}201~`);
  });
});

describe("translateChunk - capability replies", () => {
  it("consumes the kitty keyboard protocol reply and reports its flags", () => {
    const result = translate(`${CSI}?1u`);
    expect(result.output).toBe("");
    expect(result.replies).toEqual([{ kind: "kitty", flags: 1 }]);
  });

  it("consumes the modifyOtherKeys reply and reports its value", () => {
    const result = translate(`${CSI}>4;1m`);
    expect(result.output).toBe("");
    expect(result.replies).toEqual([{ kind: "modifyOtherKeys", value: 1 }]);
  });

  it("keeps the text around a reply", () => {
    const result = translate(`ab${CSI}?0ucd`);
    expect(result.output).toBe("abcd");
    expect(result.replies).toEqual([{ kind: "kitty", flags: 0 }]);
  });
});

describe("translateChunk - sequences split across reads", () => {
  it("holds an incomplete tail and finishes it with the next chunk", () => {
    const first = translate(`typed${CSI}13`);
    expect(first.output).toBe("typed");
    expect(first.held).toBe(`${CSI}13`);

    const second = translate(";2u more", "newline", first.held);
    expect(second.output).toBe("\n more");
    expect(second.held).toBe("");
  });

  it("holds a bare CSI introducer", () => {
    const result = translate(CSI);
    expect(result.output).toBe("");
    expect(result.held).toBe(CSI);
  });

  it("does not hold a lone ESC, which is the Esc key in legacy terminals", () => {
    expect(translate(ESC)).toEqual({ output: ESC, held: "", replies: [] });
    expect(translate(`abc${ESC}`)).toEqual({ output: `abc${ESC}`, held: "", replies: [] });
  });

  it("gives up on a tail that is too long to be a key sequence", () => {
    const tail = `${CSI}${"1".repeat(MAX_HELD_BYTES)}`;
    const result = translate(tail);
    expect(result.held).toBe("");
    expect(result.output).toBe(tail);
  });

  it("gives up on a tail with bytes that cannot be parameters", () => {
    const result = translate(`${CSI}abc`);
    expect(result.held).toBe("");
    expect(result.output).toBe(`${CSI}abc`);
  });

  it("reassembles a split paste marker so the paste detector sees it whole", () => {
    const first = translate(`text${CSI}20`);
    expect(first).toEqual({ output: "text", held: `${CSI}20`, replies: [] });
    const second = translate("1~", "newline", first.held);
    expect(second).toEqual({ output: `${CSI}201~`, held: "", replies: [] });
  });
});

describe("decodeKey", () => {
  it("treats a missing or malformed modifier as unmodified", () => {
    expect(decodeKey(13, 0, "newline")).toBe("\r");
    expect(decodeKey(13, Number.NaN, "newline")).toBe("\r");
  });

  it("returns plain text for an unmodified codepoint", () => {
    expect(decodeKey(0x1f44d, 1, "newline")).toBe("👍");
  });

  it("returns null for control codepoints that are not keys", () => {
    expect(decodeKey(1, 1, "newline")).toBeNull();
  });
});
