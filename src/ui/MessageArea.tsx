import { Box, Text } from "ink";
import type React from "react";
import { type MessageRow, MessageRowView } from "./MessageList.js";
import { COLORS } from "./theme.js";

type MessageAreaProps = {
  rows: readonly MessageRow[];
  height: number;
  /** Rows hidden below the bottom of the view. */
  scrollOffset: number;
  hasMessages: boolean;
  hostNickname: string;
  showHostBadge?: boolean;
};

export function MessageArea({
  rows,
  height,
  scrollOffset,
  hasMessages,
  hostNickname,
  showHostBadge = true,
}: MessageAreaProps): React.JSX.Element {
  const total = rows.length;
  const offset = Math.min(Math.max(0, scrollOffset), total);
  const end = total - offset;

  // The bottom indicator, and then the top one, each cost a row of the view.
  let avail = Math.max(1, height - (offset > 0 ? 1 : 0));
  let start = Math.max(0, end - avail);
  if (start > 0) {
    avail = Math.max(1, avail - 1);
    start = Math.max(0, end - avail);
  }

  const visible = rows.slice(start, end);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {start > 0 && (
        <Box justifyContent="center">
          <Text bold color={COLORS.system}>
            {"\u25B2"} {start} lines above {"\u00B7"} Shift+{"\u2191\u2193"}
          </Text>
        </Box>
      )}
      {hasMessages ? (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexGrow={1} />
          {visible.map((row) => (
            <MessageRowView
              key={row.key}
              row={row}
              hostNickname={hostNickname}
              showHostBadge={showHostBadge}
            />
          ))}
        </Box>
      ) : (
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text color={COLORS.muted}>No messages yet. Say something!</Text>
        </Box>
      )}
      {offset > 0 && (
        <Box justifyContent="center">
          <Text bold color={COLORS.primary}>
            {"\u25BC"} {offset} lines below {"\u00B7"} Shift+{"\u2191\u2193"}
          </Text>
        </Box>
      )}
    </Box>
  );
}
