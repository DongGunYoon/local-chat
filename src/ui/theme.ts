export const COLORS = {
  primary: "cyan",
  secondary: "magenta",
  nickname: "green",
  system: "yellow",
  error: "red",
  muted: "gray",
  border: "cyan",
  inputBorder: "gray",
} as const;

export const SYMBOLS = {
  prompt: "\u276F",
  system: "\u25CF",
  messageSep: "\u203A",
  back: "\u25C2",
  cursor: "\u25B8",
  dot: "\u00B7",
  line: "\u2500",
  doubleLine: "\u2550",
  host: "👑",
} as const;

export const KAOMOJI_MAP: Record<string, string> = {
  "/shrug": "\u00AF\\_(\u30C4)_/\u00AF",
  "/tableflip": "(\u256F\u00B0\u25A1\u00B0)\u256F\uFE35 \u253B\u2501\u253B",
  "/unflip": "\u253C\u2500\u253C\u30CE( \u00BA _ \u00BA\u30CE)",
  "/lenny": "( \u0361\u00B0 \u035C\u0296 \u0361\u00B0)",
  "/disapproval": "\u0CA0_\u0CA0",
  "/sparkles": "(\uFF89\u25D5\u30EE\u25D5)\uFF89*:\u30FB\uFF9F\u2727",
};
