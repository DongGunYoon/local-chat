import { Box, Text } from "ink";
import type React from "react";
import type { ChatEntry } from "../network/types.js";
import { estimateMessageRows, MessageItem } from "./MessageList.js";
import { COLORS } from "./theme.js";

type MessageAreaProps = {
  messages: ChatEntry[];
  height: number;
  columns: number;
  scrollOffset: number;
  hostNickname: string;
  showHostBadge?: boolean;
};

export function MessageArea({
  messages,
  height,
  columns,
  scrollOffset,
  hostNickname,
  showHostBadge = true,
}: MessageAreaProps): React.JSX.Element {
  const totalMessages = messages.length;
  const endIndex = Math.max(0, totalMessages - scrollOffset);

  // paddingX={1} reduces available width by 2 columns
  const effectiveCols = Math.max(1, columns - 2);

  const isScrolledUp = scrollOffset > 0;

  // Reserve rows for scroll indicators and 1-row safety buffer
  let availableHeight = height;
  if (isScrolledUp) availableHeight -= 1;
  availableHeight = Math.max(1, availableHeight - 1);

  // 시각적 줄 수 기반으로 보여줄 메시지 범위를 계산한다.
  // 뒤에서부터 거꾸로 훑으며, availableHeight를 채울 때까지 메시지를 추가한다.
  let usedRows = 0;
  let startIndex = endIndex;
  for (let i = endIndex - 1; i >= 0; i--) {
    const msgRows = estimateMessageRows(messages[i], effectiveCols, hostNickname, showHostBadge);
    if (usedRows + msgRows > availableHeight) break;
    usedRows += msgRows;
    startIndex = i;
  }

  const visibleMessages = messages.slice(startIndex, endIndex);
  const hasOlderMessages = startIndex > 0;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {hasOlderMessages && (
        <Box justifyContent="center">
          <Text bold color={COLORS.system}>
            {"\u25B2"} {startIndex} older messages {"\u00B7"} Shift+{"\u2191\u2193"} {"\u25B2"}
          </Text>
        </Box>
      )}
      {visibleMessages.length === 0 ? (
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text color={COLORS.muted}>No messages yet. Say something!</Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexGrow={1} />
          {visibleMessages.map((msg) => (
            <MessageItem
              key={msg.id}
              entry={msg}
              hostNickname={hostNickname}
              showHostBadge={showHostBadge}
              columns={effectiveCols}
            />
          ))}
        </Box>
      )}
      {isScrolledUp && (
        <Box justifyContent="center">
          <Text bold color={COLORS.primary}>
            {"\u25BC"} {scrollOffset} newer below {"\u00B7"} Shift+{"\u2191\u2193"} {"\u25BC"}
          </Text>
        </Box>
      )}
    </Box>
  );
}
