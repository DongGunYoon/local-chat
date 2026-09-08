import { Text } from "ink";
import type React from "react";
import type { ChatEntry } from "../network/types.js";
import {
  getDisplayWidth,
  truncateToWidth,
  wrapText,
  wrapTextTwoWidth,
} from "../utils/displayWidth.js";
import { COLORS, SYMBOLS } from "./theme.js";

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

const MAX_NICK_WIDTH = 16;
/** "HH:MM " (6) + 4: continuation rows of a chat message hang under its text. */
const WRAP_INDENT = 10;
/** "HH:MM " (6) + "● " (2). */
const SYSTEM_INDENT = 8;

/** One rendered terminal line of one entry. */
export type MessageRow = {
  key: string;
  entry: ChatEntry;
  kind: "first" | "cont";
  /** Content text of this row, without the prefix or the hanging indent. */
  text: string;
};

/** \r 등 제어문자 제거 (터미널 렌더링 교란 방지) */
function sanitize(text: string): string {
  return text.replace(/\r/g, "");
}

function displayNickname(entry: ChatEntry): string {
  return truncateToWidth(entry.nickname ?? "", MAX_NICK_WIDTH);
}

function isHostEntry(entry: ChatEntry, hostNickname: string, showHostBadge: boolean): boolean {
  return showHostBadge && entry.nickname === hostNickname;
}

/** The first row's leading text: "HH:MM [👑 ]nick[★] › ". Only its width is used for wrapping. */
function chatPrefix(entry: ChatEntry, hostNickname: string, showHostBadge: boolean): string {
  const hostBadge = isHostEntry(entry, hostNickname, showHostBadge) ? `${SYMBOLS.host} ` : "";
  const meSuffix = entry.isMe === true ? "\u2605" : "";
  const time = formatTime(entry.timestamp);
  return `${time} ${hostBadge}${displayNickname(entry)}${meSuffix} ${SYMBOLS.messageSep} `;
}

/** The ONLY source of rows for both counting and rendering. */
export function layoutMessage(
  entry: ChatEntry,
  cols: number,
  hostNickname: string,
  showHostBadge: boolean,
): MessageRow[] {
  const width = cols || 80;
  const content = sanitize(entry.content);

  const texts =
    entry.type === "system"
      ? wrapText(content, Math.max(1, width - SYSTEM_INDENT))
      : wrapTextTwoWidth(
          content,
          width - getDisplayWidth(chatPrefix(entry, hostNickname, showHostBadge)),
          width - WRAP_INDENT,
        );

  return texts.map((text, index) => ({
    key: `${entry.id}:${index}`,
    entry,
    kind: index === 0 ? "first" : "cont",
    text,
  }));
}

type MessageRowViewProps = {
  row: MessageRow;
  hostNickname: string;
  showHostBadge: boolean;
};

export function MessageRowView({
  row,
  hostNickname,
  showHostBadge,
}: MessageRowViewProps): React.JSX.Element {
  const { entry, kind, text } = row;
  const time = formatTime(entry.timestamp);

  if (entry.type === "system") {
    if (kind === "cont") {
      return (
        <Text
          wrap="truncate-end"
          color={COLORS.system}
        >{`${" ".repeat(SYSTEM_INDENT)}${text}`}</Text>
      );
    }

    return (
      <Text wrap="truncate-end">
        <Text color={COLORS.muted}>{`${time} `}</Text>
        <Text color={COLORS.system}>{`${SYMBOLS.system} ${text}`}</Text>
      </Text>
    );
  }

  if (kind === "cont") {
    return <Text wrap="truncate-end">{`${" ".repeat(WRAP_INDENT)}${text}`}</Text>;
  }

  const isHost = isHostEntry(entry, hostNickname, showHostBadge);
  const isMe = entry.isMe === true;

  return (
    <Text wrap="truncate-end">
      <Text color={COLORS.muted}>{`${time} `}</Text>
      {isHost && <Text>{SYMBOLS.host} </Text>}
      <Text bold color={isMe ? COLORS.primary : COLORS.nickname}>
        {displayNickname(entry)}
      </Text>
      {isMe && <Text color={COLORS.primary}>{"\u2605"}</Text>}
      <Text color={COLORS.muted}>{` ${SYMBOLS.messageSep} `}</Text>
      <Text>{text}</Text>
    </Text>
  );
}
