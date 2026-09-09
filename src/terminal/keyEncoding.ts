/**
 * Decodes "enhanced" keyboard encodings into the legacy bytes the rest of the app already
 * understands, so Shift+Enter, Ctrl+Enter and Option/Alt+Enter can be told apart from Enter.
 *
 * Two wire formats are accepted, both of which terminals only produce after the app asks:
 *   - kitty keyboard protocol:  CSI code [:alt] ; mods [:event] u     e.g. ESC[13;2u
 *   - xterm modifyOtherKeys:    CSI 27 ; mods ; code ~                e.g. ESC[27;2;13~
 * plus the replies to the two capability queries, which are consumed and reported.
 *
 * The translation happens before Ink parses the chunk: Ink 5.2.1 throws on some CSI-u
 * sequences (a keypad key such as ESC[57399u), and it would otherwise insert the raw text
 * of any sequence it does not know. Everything the decoder does not recognise as a key is
 * dropped for that reason; everything that is not an escape sequence passes through untouched.
 */

/** What a modified Enter (Shift/Ctrl/Alt) turns into: a newline in the chat editor, plain Enter elsewhere. */
export type ModifiedEnterMode = "newline" | "return";

export type ProtocolReply =
  | { kind: "kitty"; flags: number }
  | { kind: "modifyOtherKeys"; value: number };

export type TranslateResult = {
  /** Bytes for Ink; "" when the whole chunk was consumed. */
  output: string;
  /** An incomplete trailing escape sequence, to be prepended to the next chunk. */
  held: string;
  /** Capability replies that were removed from the stream. */
  replies: ProtocolReply[];
};

const ESC = "\u001B";
const DEL = "\u007F";
const CSI = `${ESC}[`;

/** Longest incomplete `ESC[` tail worth waiting for; anything longer is not a key sequence. */
export const MAX_HELD_BYTES = 16;

// Modifier bits of the kitty protocol and modifyOtherKeys: the parameter is 1 + bitmask.
const SHIFT = 1;
const ALT = 2;
const CTRL = 4;
/** Caps Lock and Num Lock: the kitty protocol reports them on functional keys, and they never change the key. */
const LOCKS = 64 | 128;

// Functional key numbers from the kitty protocol's private-use range that have legacy forms.
const KP_ENTER = 57414;
const KEYPAD_LEGACY: Record<number, string> = {
  57417: "D", // KP_LEFT
  57418: "C", // KP_RIGHT
  57419: "A", // KP_UP
  57420: "B", // KP_DOWN
  57421: "5~", // KP_PAGE_UP
  57422: "6~", // KP_PAGE_DOWN
  57423: "H", // KP_HOME
  57424: "F", // KP_END
  57426: "3~", // KP_DELETE
};

/** A complete CSI sequence at the start of `text` (which begins right after `ESC[`). */
const COMPLETE_CSI = /^([\d;:?<=>]*)([A-Za-z~@])/;
/** Parameter bytes only: the sequence may continue in the next chunk. */
const INCOMPLETE_CSI = /^[\d;:?<=>]*$/;

/** Rebuilds a cursor-key style sequence with the legacy modifier form (CSI 1;m X or CSI X). */
function legacyCursorKey(suffix: string, mods: number): string {
  if (mods <= 1) return CSI + suffix;
  // "5~" style keys carry the modifier before the tilde; letter keys use the "1;m" prefix.
  if (suffix.endsWith("~")) return `${CSI}${suffix.slice(0, -1)};${mods}~`;
  return `${CSI}1;${mods}${suffix}`;
}

/**
 * Turns one decoded key (a Unicode codepoint or a kitty functional key number, plus the
 * 1-based modifier parameter) into legacy bytes, or null when the key has no legacy form.
 */
export function decodeKey(
  code: number,
  mods: number,
  enter: ModifiedEnterMode,
  shiftedCode: number | null = null,
): string | null {
  const bits = (Number.isFinite(mods) && mods >= 1 ? mods - 1 : 0) & ~LOCKS;
  const shift = (bits & SHIFT) !== 0;
  const alt = (bits & ALT) !== 0;
  const ctrl = (bits & CTRL) !== 0;
  const other = bits & ~(SHIFT | ALT | CTRL);
  if (other !== 0) return null;

  if (code === 13 || code === KP_ENTER) {
    if (bits === 0) return "\r";
    return enter === "newline" ? "\n" : "\r";
  }
  if (code === 27) return ESC;
  if (code === 9) {
    if (bits === 0) return "\t";
    return shift && !ctrl && !alt ? `${CSI}Z` : null;
  }
  if (code === 127 || code === 8) return DEL;

  const keypad = KEYPAD_LEGACY[code];
  if (keypad !== undefined) return legacyCursorKey(keypad, mods);
  // The rest of the kitty functional-key range (F13+, media keys, modifiers) has no legacy form.
  if (code >= 57344 && code <= 63743) return null;

  if (ctrl && !alt) {
    // Ctrl+letter and the classic Ctrl+[ ... Ctrl+_ chords map onto C0 control bytes.
    if ((code >= 97 && code <= 122) || (code >= 64 && code <= 95)) {
      return String.fromCharCode(code & 0x1f);
    }
    return null;
  }
  if (ctrl && alt) return null;

  if (code < 32 || !isScalarValue(code)) return null;
  let text = String.fromCodePoint(code);
  if (shift && !alt) {
    // A shifted text key normally arrives as plain text; when it comes as a sequence, the
    // shifted codepoint is either given as the alternate key or is the upper-case letter.
    if (shiftedCode !== null && isScalarValue(shiftedCode) && shiftedCode >= 32) {
      text = String.fromCodePoint(shiftedCode);
    } else if (text.toUpperCase().length === 1) {
      text = text.toUpperCase();
    }
  }
  // Option/Alt+key arrives as ESC+key in every terminal that sends Option as Meta.
  if (alt) return ESC + text;
  return text;
}

/** True for a codepoint String.fromCodePoint accepts and that is not a lone surrogate. */
function isScalarValue(code: number): boolean {
  return (
    Number.isInteger(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
  );
}

/** Parses one modifier parameter; a missing or malformed value means "no modifiers". */
function parseMods(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 1;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

export type DecodedCsi =
  | { type: "text"; text: string }
  | { type: "drop" }
  | { type: "reply"; reply: ProtocolReply }
  | { type: "passthrough" };

/** Decodes one complete CSI sequence given its parameter string and final byte. */
export function decodeCsi(params: string, final: string, enter: ModifiedEnterMode): DecodedCsi {
  if (final === "u") {
    if (params.startsWith("?")) {
      const flags = Number.parseInt(params.slice(1), 10);
      return Number.isFinite(flags)
        ? { type: "reply", reply: { kind: "kitty", flags } }
        : { type: "drop" };
    }
    // CSI code[:shifted[:base]] ; mods[:event] u
    const match = /^(\d+)(?::(\d*)(?::\d*)?)?(?:;(\d*)(?::\d*)?)?$/.exec(params);
    if (!match) return { type: "drop" };
    const shifted = match[2] ? Number.parseInt(match[2], 10) : null;
    const text = decodeKey(
      Number.parseInt(match[1] ?? "", 10),
      parseMods(match[3]),
      enter,
      shifted,
    );
    return text === null ? { type: "drop" } : { type: "text", text };
  }

  if (final === "~") {
    // CSI 27 ; mods ; code ~
    const match = /^27;(\d+);(\d+)$/.exec(params);
    if (match) {
      const text = decodeKey(Number.parseInt(match[2] ?? "", 10), parseMods(match[1]), enter);
      return text === null ? { type: "drop" } : { type: "text", text };
    }
    return { type: "passthrough" };
  }

  if (final === "m" && params.startsWith(">")) {
    // Reply to CSI ? 4 m: CSI > 4 ; value m
    const match = /^>4;(\d+)$/.exec(params);
    if (match) {
      const value = Number.parseInt(match[1] ?? "", 10);
      return { type: "reply", reply: { kind: "modifyOtherKeys", value } };
    }
    return { type: "drop" };
  }

  if (final === "P" || final === "Q" || final === "S") {
    // F1/F2/F4 arrive as CSI P/Q/S under the kitty protocol; Ink only knows the SS3 form.
    if (params === "" || /^1;\d+$/.test(params)) return { type: "text", text: `${ESC}O${final}` };
  }

  return { type: "passthrough" };
}

/**
 * Translates one raw stdin chunk. `held` from the previous call must be passed back as
 * `carry` so a sequence split across two reads is decoded as one.
 */
export function translateChunk(
  chunk: string,
  enter: ModifiedEnterMode,
  carry = "",
): TranslateResult {
  const text = carry + chunk;
  const replies: ProtocolReply[] = [];
  let output = "";
  let index = 0;

  while (index < text.length) {
    const start = text.indexOf(CSI, index);
    if (start === -1) {
      output += text.slice(index);
      break;
    }
    output += text.slice(index, start);
    const rest = text.slice(start + CSI.length);

    const complete = COMPLETE_CSI.exec(rest);
    if (complete) {
      const params = complete[1] ?? "";
      const final = complete[2] ?? "";
      const decoded = decodeCsi(params, final, enter);
      switch (decoded.type) {
        case "text":
          output += decoded.text;
          break;
        case "reply":
          replies.push(decoded.reply);
          break;
        case "passthrough":
          output += CSI + complete[0];
          break;
        case "drop":
          break;
      }
      index = start + CSI.length + complete[0].length;
      continue;
    }

    if (INCOMPLETE_CSI.test(rest) && rest.length + CSI.length <= MAX_HELD_BYTES) {
      // The final byte has not arrived yet: keep the tail for the next chunk.
      return { output, held: CSI + rest, replies };
    }

    // Not a key sequence we could ever complete; let it through unchanged.
    output += CSI;
    index = start + CSI.length;
  }

  return { output, held: "", replies };
}
