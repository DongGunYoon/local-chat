// Pure text hygiene helpers shared by the input engine and the network layer.
// No React/Ink imports: this module must stay usable from plain Node code.

const TAB_WIDTH = 4;

// Modified-Enter encodings that some terminals and tmux leak inside pastes.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches a literal CSI-u escape
const CSI_U_ENTER = /\x1b\[13;\d+u/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches a literal modifyOtherKeys escape
const MODIFY_OTHER_KEYS_ENTER = /\x1b\[27;\d+;13~/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: matches a literal CSI escape sequence
const CSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches a literal OSC escape sequence
const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches a two-byte ESC sequence
const TWO_BYTE_ESCAPE = /\x1b[@-Z\\-_]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches a leftover lone ESC
const LONE_ESCAPE = /\x1b/g;

// C0 controls except \n and \t, DEL, C1 controls, bidi controls, BOM and zero-width space.
// ZWJ (U+200D), ZWNJ (U+200C) and VS16 (U+FE0F) are deliberately NOT in this set.
const UNSAFE_CONTROLS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removes non-printable control bytes
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x80-\x9f\u202a-\u202e\u2066-\u2069\ufeff\u200b]/g;

/** Normalise text that came from the keyboard, the clipboard or the network. Never removes printable characters. */
export function normalizeInput(text: string): string {
  return text
    .replace(CSI_U_ENTER, "\n")
    .replace(MODIFY_OTHER_KEYS_ENTER, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(CSI_SEQUENCE, "")
    .replace(OSC_SEQUENCE, "")
    .replace(TWO_BYTE_ESCAPE, "")
    .replace(LONE_ESCAPE, "")
    .replace(UNSAFE_CONTROLS, "")
    .replace(/\t/g, " ".repeat(TAB_WIDTH));
}

/** Prepare a draft for sending: normalizeInput, strip trailing spaces/tabs on every line, drop leading and trailing blank lines. Indentation inside lines is preserved. */
export function finalizeOutgoing(text: string): string {
  const lines = normalizeInput(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));

  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

/** For anything received from the network. Non-strings become "". */
export function sanitizeIncoming(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeInput(value);
}

/** Nickname/room-name hygiene: non-string → null; normalizeInput; collapse all whitespace runs (including newlines) to one space; trim; empty → null. No length or character-class rules. */
export function sanitizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = normalizeInput(value).replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed;
}

/** True when text is a single line (no "\n"), matches /^\/\S/ and does not start with "//". */
export function isSlashCommand(text: string): boolean {
  if (text.includes("\n")) return false;
  if (text.startsWith("//")) return false;
  return /^\/\S/.test(text);
}

/** For a single-line text starting with "//", drop exactly one leading slash; otherwise return text unchanged. */
export function unescapeLeadingSlash(text: string): string {
  if (text.includes("\n")) return text;
  if (!text.startsWith("//")) return text;
  return text.slice(1);
}
