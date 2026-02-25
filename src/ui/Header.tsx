import { Box, Text } from "ink";
import React from "react";
import { getDisplayWidth } from "../utils/displayWidth.js";
import { COLORS, SYMBOLS } from "./theme.js";

type HeaderProps = {
  roomName: string;
  users: string[];
  hostNickname: string;
  myNickname: string;
  showHostBadge?: boolean;
  roomNameColor?: string;
  hintText?: string;
  isLobby?: boolean;
  columns: number;
};

function buildUserEntries(
  users: string[],
  myNickname: string,
  hostNickname: string,
  showHostBadge: boolean,
): string[] {
  let meShown = false;
  return users.map((user) => {
    const isHost = showHostBadge && user === hostNickname;
    const isMe = !meShown && user === myNickname;
    if (isMe) meShown = true;
    const prefix = isHost ? `${SYMBOLS.host} ` : "";
    const suffix = isMe ? " (me)" : "";
    return `${prefix}${user}${suffix}`;
  });
}

export function Header({
  roomName,
  users,
  hostNickname,
  myNickname,
  showHostBadge = true,
  roomNameColor = COLORS.primary,
  hintText,
  columns,
}: HeaderProps): React.JSX.Element {
  const hint = hintText ?? `Tab on EMERGENCY ${SYMBOLS.dot} /help ${SYMBOLS.dot} Esc\u00D72 leave`;

  // border(2) + paddingX(2) = 4
  const availableWidth = columns - 4;

  const hintWidth = getDisplayWidth(hint);
  const gap = 4; // 최소 좌우 간격

  // 왼쪽 고정 부분: "RoomName (N) ── "
  const leftFixed = `${roomName} (${users.length}) ${SYMBOLS.line}${SYMBOLS.line} `;
  const leftFixedWidth = getDisplayWidth(leftFixed);

  // 유저 목록에 할당 가능한 폭
  const userBudget = availableWidth - leftFixedWidth - hintWidth - gap;

  // 유저 표시 문자열 계산
  const userEntries = buildUserEntries(users, myNickname, hostNickname, showHostBadge);
  const fullListStr = userEntries.join(", ");
  const fullListWidth = getDisplayWidth(fullListStr);

  // 축소 단계 결정
  let visibleCount: number;
  if (userBudget >= fullListWidth) {
    // 단계 0: 전부 표시
    visibleCount = userEntries.length;
  } else {
    // 단계 1: 앞에서부터 들어가는 만큼 + "…"
    visibleCount = 0;
    let accWidth = 0;
    for (const entry of userEntries) {
      const entryWidth = getDisplayWidth(entry) + (visibleCount > 0 ? 2 : 0); // ", " 포함
      const ellipsisWidth = 2; // ", …" or " …"
      if (accWidth + entryWidth + ellipsisWidth > userBudget) break;
      accWidth += entryWidth;
      visibleCount++;
    }
    // visibleCount === 0이면 단계 2 ("N online")로 fallback
  }

  // 유저 목록 렌더링
  let meShown = false;
  const renderUsers = (): React.ReactNode => {
    if (visibleCount === 0) {
      // 단계 2: count only
      return <Text color={COLORS.muted}>{users.length} online</Text>;
    }

    const isFullList = visibleCount === userEntries.length;
    const visibleEntries = userEntries.slice(0, visibleCount);

    return (
      <>
        {visibleEntries.map((_, i) => {
          const user = users[i];
          const isHost = showHostBadge && user === hostNickname;
          const isMe = !meShown && user === myNickname;
          if (isMe) meShown = true;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: users can have duplicate nicknames
            <React.Fragment key={`${user}-${i}`}>
              {i > 0 && <Text color={COLORS.muted}>, </Text>}
              <Text color={isMe ? COLORS.primary : COLORS.muted}>
                {isHost ? `${SYMBOLS.host} ` : ""}
                {user}
                {isMe ? " (me)" : ""}
              </Text>
            </React.Fragment>
          );
        })}
        {!isFullList && <Text color={COLORS.muted}>, {"\u2026"}</Text>}
      </>
    );
  };

  return (
    <Box
      borderStyle="single"
      borderColor={COLORS.primary}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold color={roomNameColor}>
          {roomName}
        </Text>
        <Text color={COLORS.muted}> ({users.length})</Text>
        <Text color={COLORS.muted}>
          {" "}
          {SYMBOLS.line}
          {SYMBOLS.line}{" "}
        </Text>
        {renderUsers()}
      </Box>
      <Text color={COLORS.muted}>{hint}</Text>
    </Box>
  );
}
