import { Box, Text } from "ink";
import type React from "react";
import { COLORS, KAOMOJI_MAP, SYMBOLS } from "./theme.js";

type HelpOverlayProps = {
  height: number;
};

const HELP_SECTIONS = [
  {
    title: "Commands",
    items: [
      { key: "/users", desc: "Show online users" },
      { key: "/erase, /e, /clear", desc: "Clear all messages" },
      { key: "/copy, /c", desc: "Copy last message" },
      { key: "/copy N", desc: "Copy Nth recent message" },
      { key: "/fake, /f", desc: "Boss mode" },
      { key: "/quit", desc: "Exit app" },
      { key: "/help", desc: "Toggle this overlay" },
    ],
  },
  {
    title: "Kaomoji",
    items: ["/shrug", "/tableflip", "/lenny", "/sparkles"].map((cmd) => ({
      key: cmd,
      desc: KAOMOJI_MAP[cmd],
    })),
  },
  {
    title: "Shortcuts",
    items: [
      { key: "Tab", desc: "Boss mode (instant!)" },
      { key: "Shift+\u2191\u2193", desc: "Scroll messages" },
      { key: "PgUp/PgDn", desc: "Page scroll" },
      { key: "Esc \u00D72", desc: "Browse rooms" },
      { key: "Ctrl+C", desc: "Exit app" },
    ],
  },
];

export function HelpOverlay({ height }: HelpOverlayProps): React.JSX.Element {
  return (
    <Box flexDirection="column" height={height} paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={COLORS.primary}>
          {SYMBOLS.line}
          {SYMBOLS.line} HELP {SYMBOLS.line}
          {SYMBOLS.line}
        </Text>
      </Box>

      {HELP_SECTIONS.map((section) => (
        <Box key={section.title} flexDirection="column" marginBottom={1}>
          <Text bold color={COLORS.secondary}>
            {section.title}
          </Text>
          {section.items.map((item) => (
            <Box key={item.key} paddingLeft={1}>
              <Box width={20}>
                <Text color={COLORS.primary}>{item.key}</Text>
              </Box>
              <Text color={COLORS.muted}>{item.desc}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1} justifyContent="center">
        <Text dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
}
