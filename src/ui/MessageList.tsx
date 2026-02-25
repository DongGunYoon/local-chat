import { Box, Text } from "ink";
import type React from "react";
import type { ChatEntry } from "../network/types.js";
import { getDisplayWidth, truncateToWidth, wrapText } from "../utils/displayWidth.js";
import { COLORS, SYMBOLS } from "./theme.js";

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

const MAX_NICK_WIDTH = 16;
const MAX_CONTENT_LINES = 5;
const WRAP_INDENT = 4;

/** \r 등 제어문자 제거 (터미널 렌더링 교란 방지) */
function sanitize(text: string): string {
  return text.replace(/\r/g, "");
}

/**
 * Two-width wrapping: 첫 줄은 firstWidth, 이후 줄은 contWidth로 wrap.
 * 닉네임 길이에 따라 첫 줄 사용 가능 너비가 달라지고,
 * 연속 줄은 고정 indent를 사용하기 때문에 필요.
 */
function wrapChatContent(content: string, firstWidth: number, contWidth: number): string[] {
  const paragraphs = content.replace(/\r/g, "").split("\n");
  const allLines: string[] = [];
  let isFirstLine = true;

  for (const paragraph of paragraphs) {
    if (getDisplayWidth(paragraph) === 0) {
      allLines.push("");
      isFirstLine = false;
      continue;
    }

    const chars = [...paragraph];
    let currentLine = "";
    let currentWidth = 0;

    for (const char of chars) {
      const charWidth = getDisplayWidth(char);
      const maxW = isFirstLine ? firstWidth : contWidth;

      if (currentWidth + charWidth > maxW && currentLine.length > 0) {
        allLines.push(currentLine);
        isFirstLine = false;
        currentLine = char;
        currentWidth = charWidth;
      } else {
        currentLine += char;
        currentWidth += charWidth;
      }
    }

    if (currentLine) {
      allLines.push(currentLine);
      isFirstLine = false;
    }
  }

  return allLines.length > 0 ? allLines : [""];
}

type MessageItemProps = {
  entry: ChatEntry;
  hostNickname: string;
  showHostBadge?: boolean;
  columns: number;
};

export function MessageItem({
  entry,
  hostNickname,
  showHostBadge = true,
  columns,
}: MessageItemProps): React.JSX.Element {
  const time = formatTime(entry.timestamp);
  const cols = columns || 80;
  const content = sanitize(entry.content);

  if (entry.type === "system") {
    const sysPrefixWidth = 8;
    const contentPerLine = Math.max(1, cols - sysPrefixWidth);
    const allLines = wrapText(content, contentPerLine);
    const isTruncated = allLines.length > MAX_CONTENT_LINES;
    const lines = isTruncated ? allLines.slice(0, MAX_CONTENT_LINES - 1) : allLines;
    const indent = " ".repeat(sysPrefixWidth);

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={COLORS.muted}>{`${time} `}</Text>
          <Text color={COLORS.system}>{`${SYMBOLS.system} ${lines[0]}`}</Text>
        </Text>
        {lines.slice(1).map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static wrapped lines
          <Text key={i} wrap="truncate-end" color={COLORS.system}>{`${indent}${line}`}</Text>
        ))}
        {isTruncated && (
          <Text wrap="truncate-end" color={COLORS.muted}>{`${indent}\u2026 /copy`}</Text>
        )}
      </Box>
    );
  }

  const isHost = showHostBadge && entry.nickname === hostNickname;
  const isMe = entry.isMe === true;
  const nameColor = isMe ? COLORS.primary : COLORS.nickname;
  const displayNick = truncateToWidth(entry.nickname ?? "", MAX_NICK_WIDTH);

  // Build prefix string to calculate its display width
  const hostBadge = isHost ? `${SYMBOLS.host} ` : "";
  const meSuffix = isMe ? "\u2605" : "";
  const prefixStr = `${hostBadge}${displayNick}${meSuffix} ${SYMBOLS.messageSep} `;
  const prefixWidth = getDisplayWidth(prefixStr);
  const firstWidth = Math.max(1, cols - prefixWidth);
  const contWidth = Math.max(1, cols - WRAP_INDENT);

  const allLines = wrapChatContent(content, firstWidth, contWidth);
  const isTruncated = allLines.length > MAX_CONTENT_LINES;
  const lines = isTruncated ? allLines.slice(0, MAX_CONTENT_LINES - 1) : allLines;
  const indent = " ".repeat(WRAP_INDENT);

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        {isHost && <Text>{SYMBOLS.host} </Text>}
        <Text bold color={nameColor}>
          {displayNick}
        </Text>
        {isMe && <Text color={COLORS.primary}>{"\u2605"}</Text>}
        <Text color={COLORS.muted}>{` ${SYMBOLS.messageSep} `}</Text>
        <Text>{lines[0]}</Text>
      </Text>
      {lines.slice(1).map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static wrapped lines
        <Text key={i} wrap="truncate-end">
          {indent}
          {line}
        </Text>
      ))}
      {isTruncated && (
        <Text wrap="truncate-end" color={COLORS.muted}>
          {indent}
          {"\u2026 /copy"}
        </Text>
      )}
    </Box>
  );
}

/**
 * 메시지가 차지하는 예상 줄 수 (MessageArea에서 사용)
 */
function countTwoWidthLines(content: string, firstWidth: number, contWidth: number): number {
  const paragraphs = content.split("\n");
  let totalRows = 0;
  let isFirstLine = true;

  for (const p of paragraphs) {
    const w = getDisplayWidth(p);
    if (w === 0) {
      totalRows += 1;
      isFirstLine = false;
      continue;
    }

    if (isFirstLine) {
      if (w <= firstWidth) {
        totalRows += 1;
        isFirstLine = false;
      } else {
        // First line uses firstWidth, remainder uses contWidth
        totalRows += 1;
        isFirstLine = false;
        const remaining = w - firstWidth;
        totalRows += Math.ceil(remaining / contWidth);
      }
    } else {
      totalRows += Math.ceil(w / contWidth);
    }
  }

  return Math.max(1, totalRows);
}

export function estimateMessageRows(
  entry: ChatEntry,
  columns: number,
  hostNickname: string,
  showHostBadge: boolean,
): number {
  const cols = columns || 80;
  const content = sanitize(entry.content);

  if (entry.type === "system") {
    const contentPerLine = Math.max(1, cols - 8);
    const paragraphs = content.split("\n");
    let totalRows = 0;
    for (const p of paragraphs) {
      const w = getDisplayWidth(p);
      totalRows += w === 0 ? 1 : Math.ceil(w / contentPerLine);
    }
    return Math.min(MAX_CONTENT_LINES, Math.max(1, totalRows));
  }

  const isHost = showHostBadge && entry.nickname === hostNickname;
  const isMe = entry.isMe === true;
  const displayNick = truncateToWidth(entry.nickname ?? "", MAX_NICK_WIDTH);

  const hostBadge = isHost ? `${SYMBOLS.host} ` : "";
  const meSuffix = isMe ? "\u2605" : "";
  const prefixStr = `${hostBadge}${displayNick}${meSuffix} ${SYMBOLS.messageSep} `;
  const prefixWidth = getDisplayWidth(prefixStr);
  const firstWidth = Math.max(1, cols - prefixWidth);
  const contWidth = Math.max(1, cols - WRAP_INDENT);

  const rawLines = countTwoWidthLines(content, firstWidth, contWidth);

  if (rawLines > MAX_CONTENT_LINES) {
    return MAX_CONTENT_LINES;
  }
  return rawLines;
}
