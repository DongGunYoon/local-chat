import { Box, Text } from "ink";
import type React from "react";
import { COLORS, KAOMOJI_MAP, SYMBOLS } from "./theme.js";

type HelpOverlayProps = {
  height: number;
};

type HelpItem = {
  key: string;
  desc: string;
};

// One cell wider than the longest key ("/erase, /e, /clear") so key and description
// never touch; descriptions stay within the remaining 19 cells of an 80 column terminal.
const KEY_WIDTH = 19;

const COMMANDS: HelpItem[] = [
  { key: "/users", desc: "Show online users" },
  { key: "/erase, /e, /clear", desc: "Clear messages" },
  { key: "/copy, /c", desc: "Copy last message" },
  { key: "/copy N", desc: "Copy Nth message" },
  { key: "/fake, /f", desc: "Boss mode" },
  { key: "/quit", desc: "Exit app" },
  { key: "/help", desc: "This overlay" },
];

const KAOMOJI: HelpItem[] = ["/shrug", "/tableflip", "/lenny", "/sparkles"].map((cmd) => ({
  key: cmd,
  desc: KAOMOJI_MAP[cmd],
}));

const INPUT: HelpItem[] = [
  { key: "Enter", desc: "Send" },
  { key: "Shift+Enter", desc: "New line" },
  { key: "Ctrl+J, \\ + Enter", desc: "New line (any term)" },
  { key: "Option+Enter", desc: "New line (Meta)" },
  { key: "\u2191 \u2193", desc: "Move in draft" },
  { key: "Ctrl+A / Ctrl+E", desc: "Line start / end" },
  { key: "Ctrl+U", desc: "Clear draft" },
  { key: "//text", desc: "Send a literal /" },
];

const SHORTCUTS: HelpItem[] = [
  { key: "Tab", desc: "Boss mode (fast)" },
  { key: "Shift+\u2191\u2193", desc: "Scroll one line" },
  { key: "PgUp/PgDn", desc: "Page scroll" },
  { key: "Esc \u00D72", desc: "Browse rooms" },
  { key: "Ctrl+C", desc: "Exit app" },
];

function Section({
  title,
  items,
}: {
  title: string;
  items: readonly HelpItem[];
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.secondary}>
        {title}
      </Text>
      {items.map((item) => (
        <Box key={item.key}>
          <Box width={KEY_WIDTH}>
            <Text color={COLORS.primary}>{item.key}</Text>
          </Box>
          <Text color={COLORS.muted}>{item.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function HelpOverlay({ height }: HelpOverlayProps): React.JSX.Element {
  return (
    <Box flexDirection="column" height={height} paddingX={2}>
      <Box justifyContent="center">
        <Text bold color={COLORS.primary}>
          {SYMBOLS.line}
          {SYMBOLS.line} HELP {SYMBOLS.line}
          {SYMBOLS.line}
        </Text>
      </Box>

      <Box flexGrow={1}>
        <Box flexDirection="column" width="50%">
          <Section title="Commands" items={COMMANDS} />
          <Section title="Kaomoji" items={KAOMOJI} />
        </Box>
        <Box flexDirection="column" width="50%">
          <Section title="Input" items={INPUT} />
          <Section title="Shortcuts" items={SHORTCUTS} />
        </Box>
      </Box>

      <Box justifyContent="center">
        <Text dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
}
