import { execSync } from "node:child_process";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import { useBracketedPaste } from "../hooks/useBracketedPaste.js";
import { useMessageInput } from "../hooks/useMessageInput.js";
import { useMessageRows } from "../hooks/useMessageRows.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { isEmpty } from "../input/textBuffer.js";
import type { ChatClient } from "../network/client.js";
import { decrypt, encrypt } from "../network/crypto.js";
import type { RoomBroadcaster } from "../network/discovery.js";
import { LOBBY_MAX_MESSAGE_BYTES, measureLobby } from "../network/limits.js";
import type { LobbyPeer } from "../network/lobby.js";
import type { ChatServer } from "../network/server.js";
import type { ChatEntry } from "../network/types.js";
import { setImeCursorTarget } from "../terminal/imeCursor.js";
import {
  isSlashCommand,
  sanitizeIncoming,
  sanitizeNickname,
  unescapeLeadingSlash,
} from "../utils/sanitize.js";
import { VERSION } from "../version.js";
import { FakeOverlay } from "./FakeOverlay.js";
import { Header } from "./Header.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { InputBar } from "./InputBar.js";
import { MessageArea } from "./MessageArea.js";
import { layoutMessage } from "./MessageList.js";
import { COLORS, KAOMOJI_MAP, SYMBOLS } from "./theme.js";

type ChatRoomProps = {
  roomType: "lobby" | "private";
  roomName: string;
  nickname: string;
  // lobby mode
  lobbyPeer?: LobbyPeer;
  // private mode
  mode?: "host" | "client";
  server?: ChatServer;
  broadcaster?: RoomBroadcaster;
  client?: ChatClient;
  onExit: () => void;
  onRequestRooms: () => void;
};

const COMMAND_ALIASES: Record<string, string> = {
  "/f": "/fake",
  "/\u3139": "/fake",
  "/e": "/erase",
  "/\u3137": "/erase",
  "/clear": "/erase",
  "/c": "/copy",
  "/\u314A": "/copy",
};

const ESC = "\u001B";
const PLACEHOLDER = "Type a message\u2026 (Ctrl+J for a new line)";

/** The header box: top border, one line, bottom border. */
const HEADER_ROWS = 3;
/** The input box's top and bottom border. */
const INPUT_BORDER_ROWS = 2;
/** Cells the input box spends around the text: border(2) + paddingX(2) + prompt(2). */
const INPUT_SIDE_CELLS = 6;
const MAX_INPUT_ROWS = 5;
/** MessageArea's paddingX={1} on both sides. */
const MESSAGE_AREA_PADDING = 2;
/** 1-based terminal column of the input text: border(1) + paddingX(1) + prompt(2). */
const INPUT_TEXT_COLUMN = 5;

function copyToClipboard(text: string): boolean {
  const commands = [
    "pbcopy",
    "clip",
    "wl-copy",
    "xclip -selection clipboard",
    "xsel --clipboard --input",
  ];
  for (const cmd of commands) {
    try {
      execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"] });
      return true;
    } catch {}
  }
  return false;
}

/** Nicknames and user lists arrive from the network, so they are cleaned before display. */
function safeNickname(value: unknown): string {
  return sanitizeNickname(value) ?? "?";
}

function safeUserList(users: string[]): string[] {
  return users.map(safeNickname);
}

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

export function ChatRoom({
  roomType,
  roomName,
  nickname,
  lobbyPeer,
  mode,
  server,
  broadcaster,
  client,
  onExit,
  onRequestRooms,
}: ChatRoomProps): React.JSX.Element {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [users, setUsers] = useState<string[]>([nickname]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showFake, setShowFake] = useState(false);
  const [escPending, setEscPending] = useState(false);
  const escTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownMemberList = useRef(false);
  const roomClosedRef = useRef(false);
  const { rows, columns } = useTerminalSize();

  const isLobby = roomType === "lobby";
  const isPrivate = roomType === "private";

  // 방장 닉네임: 유저 목록의 첫 번째 (서버가 항상 방장을 첫 번째로 보낸다)
  const hostNickname = isPrivate ? users[0] || nickname : "";
  const showHostBadge = isPrivate;
  const effectiveCols = Math.max(1, columns - MESSAGE_AREA_PADDING);
  const rowsAll = useMessageRows(messages, effectiveCols, hostNickname, showHostBadge);

  // addMessage keeps empty deps so the network effects never re-subscribe (and re-announce)
  // when the terminal is resized; it reads the current layout through this ref instead.
  const layoutParamsRef = useRef({ cols: effectiveCols, hostNickname, showHostBadge });
  layoutParamsRef.current = { cols: effectiveCols, hostNickname, showHostBadge };

  const addMessage = useCallback(
    (type: ChatEntry["type"], content: string, msgNickname?: string, isMe?: boolean) => {
      const entry: ChatEntry = {
        id: nextMessageId(),
        type,
        nickname: msgNickname,
        content,
        timestamp: Date.now(),
        isMe,
      };
      setMessages((prev) => [...prev, entry]);

      if (isMe === true) {
        setScrollOffset(0);
        return;
      }

      // While reading history, hold the view still: the new rows land below the viewport.
      const params = layoutParamsRef.current;
      const added = layoutMessage(
        entry,
        params.cols,
        params.hostNickname,
        params.showHostBadge,
      ).length;
      setScrollOffset((prev) => (prev > 0 ? prev + added : 0));
    },
    [],
  );

  /**
   * Post a locally triggered notice. Unlike an incoming message it always snaps the view to
   * the bottom, so an answer to something the user just did can never land below the viewport.
   */
  const notify = useCallback(
    (content: string) => {
      addMessage("system", content);
      setScrollOffset(0);
    },
    [addMessage],
  );

  // --- Lobby mode event handling ---
  useEffect(() => {
    if (!isLobby || !lobbyPeer) return;

    const handleMessage = (msgNickname: string, content: string, _timestamp: number): void => {
      addMessage("message", sanitizeIncoming(content), safeNickname(msgNickname));
    };

    const mountTime = Date.now();

    const handleUserJoined = (joinedNickname: string): void => {
      if (Date.now() - mountTime < 2000) return;
      addMessage("system", `${safeNickname(joinedNickname)} joined`);
    };

    const handleUserLeft = (leftNickname: string): void => {
      addMessage("system", `${safeNickname(leftNickname)} left`);
    };

    const handleUserList = (userList: string[]): void => {
      setUsers(safeUserList(userList));
    };

    // Initialize user list
    const currentUsers = safeUserList(lobbyPeer.getUsers());
    setUsers(currentUsers);

    if (currentUsers.length <= 1) {
      addMessage("system", "Welcome to the lobby! Waiting for others...");
    } else {
      addMessage(
        "system",
        `Welcome! ${currentUsers.length} users online: ${currentUsers.join(", ")}`,
      );
    }
    addMessage("system", "Esc\u00D72 to create or join private rooms");

    lobbyPeer.on("message", handleMessage);
    lobbyPeer.on("userJoined", handleUserJoined);
    lobbyPeer.on("userLeft", handleUserLeft);
    lobbyPeer.on("userList", handleUserList);

    return () => {
      lobbyPeer.off("message", handleMessage);
      lobbyPeer.off("userJoined", handleUserJoined);
      lobbyPeer.off("userLeft", handleUserLeft);
      lobbyPeer.off("userList", handleUserList);
    };
  }, [isLobby, lobbyPeer, addMessage]);

  // --- Private host mode event handling ---
  useEffect(() => {
    if (!isPrivate || mode !== "host" || !server) return;

    // 프로세스 종료 시 서버 정리 (best-effort)
    const handleProcessExit = (): void => {
      try {
        broadcaster?.stop();
        server.close();
      } catch {
        // 종료 중 에러 무시
      }
    };

    process.on("exit", handleProcessExit);
    process.on("SIGINT", handleProcessExit);
    process.on("SIGTERM", handleProcessExit);

    const encryptionKey = server.getEncryptionKey();

    const handleMessage = (msgNickname: string, payload: string, _timestamp: number): void => {
      const who = safeNickname(msgNickname);
      try {
        const decrypted = decrypt(payload, encryptionKey);
        addMessage("message", sanitizeIncoming(decrypted), who, who === nickname);
      } catch {
        addMessage("message", "[decryption failed]", who);
      }
    };

    const handleUserJoined = (joined: string, allUsers: string[]): void => {
      addMessage("system", `${safeNickname(joined)} joined`);
      setUsers(safeUserList(allUsers));
    };

    const handleUserLeft = (left: string, allUsers: string[]): void => {
      addMessage("system", `${safeNickname(left)} left`);
      setUsers(safeUserList(allUsers));
    };

    addMessage("system", `Room "${roomName}" created`);

    server.on("message", handleMessage);
    server.on("userJoined", handleUserJoined);
    server.on("userLeft", handleUserLeft);

    return () => {
      process.off("exit", handleProcessExit);
      process.off("SIGINT", handleProcessExit);
      process.off("SIGTERM", handleProcessExit);
      server.off("message", handleMessage);
      server.off("userJoined", handleUserJoined);
      server.off("userLeft", handleUserLeft);
    };
  }, [isPrivate, mode, server, broadcaster, addMessage, roomName, nickname]);

  // --- Private client mode event handling ---
  useEffect(() => {
    if (!isPrivate || mode !== "client" || !client) return;

    const handleMessage = (msgNickname: string, payload: string, _timestamp: number): void => {
      const encryptionKey = client.getEncryptionKey();
      if (!encryptionKey) return;
      const who = safeNickname(msgNickname);
      try {
        const decrypted = decrypt(payload, encryptionKey);
        addMessage("message", sanitizeIncoming(decrypted), who, who === nickname);
      } catch {
        addMessage("message", "[decryption failed]", who);
      }
    };

    const handleSystem = (content: string): void => {
      addMessage("system", sanitizeIncoming(content));
    };

    const handleUserList = (userList: string[]): void => {
      const safeUsers = safeUserList(userList);
      setUsers(safeUsers);
      if (!hasShownMemberList.current) {
        hasShownMemberList.current = true;
        addMessage("system", `Online: ${safeUsers.join(", ")}`);
      }
    };

    const handleRoomClosed = (reason: string): void => {
      roomClosedRef.current = true;
      addMessage("system", `${sanitizeIncoming(reason)} Returning to rooms...`);
      exitTimerRef.current = setTimeout(() => {
        client?.disconnect();
        onRequestRooms();
      }, 3000);
    };

    const handleDisconnected = (): void => {
      if (roomClosedRef.current) return;
      addMessage("system", "Connection lost. Reconnecting...");
    };

    const handleError = (err: Error): void => {
      if (err.message.includes("Failed to reconnect")) {
        addMessage("system", "Room is no longer available. Returning to rooms...");
        exitTimerRef.current = setTimeout(() => onRequestRooms(), 3000);
      }
    };

    addMessage("system", "Connected!");

    client.on("message", handleMessage);
    client.on("system", handleSystem);
    client.on("userList", handleUserList);
    client.on("roomClosed", handleRoomClosed);
    client.on("disconnected", handleDisconnected);
    client.on("error", handleError);

    return () => {
      client.off("message", handleMessage);
      client.off("system", handleSystem);
      client.off("userList", handleUserList);
      client.off("roomClosed", handleRoomClosed);
      client.off("disconnected", handleDisconnected);
      client.off("error", handleError);
    };
  }, [isPrivate, mode, client, addMessage, onRequestRooms, nickname]);

  // 타이머 정리
  useEffect(() => {
    return () => {
      if (escTimerRef.current) {
        clearTimeout(escTimerRef.current);
      }
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const getEncryptionKey = (): Buffer | null => {
    if (mode === "host" && server) {
      return server.getEncryptionKey();
    }
    if (mode === "client" && client) {
      return client.getEncryptionKey();
    }
    return null;
  };

  const handleExit = (): void => {
    if (isPrivate) {
      if (mode === "host") {
        broadcaster?.stop();
        server?.close();
      } else {
        client?.disconnect();
      }
    }
    onExit();
  };

  /** Returns true when the text left the app, which is what clears the draft. */
  const sendMessage = (text: string): boolean => {
    if (isLobby && lobbyPeer) {
      const measure = measureLobby(text);
      if (measure.level === "over") {
        notify(
          `Too long for the lobby (${measure.bytes}/${LOBBY_MAX_MESSAGE_BYTES} B) \u2014 open a private room (Esc\u00D72) for long messages`,
        );
        return false;
      }
      if (!lobbyPeer.sendChatMessage(text)) {
        notify("Not delivered \u2014 the lobby is offline");
        return false;
      }
      addMessage("message", text, safeNickname(lobbyPeer.getNickname()), true);
      return true;
    }

    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return false;

    const encrypted = encrypt(text, encryptionKey);

    if (mode === "host" && server) {
      server.broadcastMessage(encrypted);
      return true;
    }
    if (mode === "client" && client) {
      if (!client.sendMessage(encrypted)) {
        notify("Not delivered \u2014 reconnecting\u2026");
        return false;
      }
      return true;
    }
    return false;
  };

  const handleCommand = (text: string): boolean => {
    const parts = text.split(" ");
    let command = parts[0].toLowerCase();

    // alias 해소
    command = COMMAND_ALIASES[command] ?? command;

    // kaomoji 커맨드 확인
    const kaomoji = KAOMOJI_MAP[command];
    if (kaomoji) {
      return sendMessage(kaomoji);
    }

    switch (command) {
      case "/help":
        setShowHelp(true);
        return true;

      case "/users":
        notify(`Online (${users.length}): ${users.join(", ")}`);
        return true;

      case "/erase":
        setMessages([]);
        setScrollOffset(0);
        return true;

      case "/fake":
        setShowFake(true);
        return true;

      case "/version":
        notify(`local-chat v${VERSION}`);
        return true;

      case "/copy": {
        const n = Math.max(1, Number.parseInt(parts[1], 10) || 1);
        const chatMessages = messages.filter((m) => m.type === "message");
        const target = chatMessages[chatMessages.length - n];
        if (!target) {
          notify("No message to copy");
        } else if (copyToClipboard(target.content)) {
          notify("Copied to clipboard");
        } else {
          notify("Clipboard not available");
        }
        return true;
      }

      case "/quit":
        handleExit();
        return true;

      default:
        notify(`Unknown command: ${command}. Type /help, or start with // to send it as text`);
        return false;
    }
  };

  const handleSubmit = (text: string): boolean =>
    isSlashCommand(text) ? handleCommand(text) : sendMessage(unescapeLeadingSlash(text));

  const overlayActive = showHelp || showFake;

  const innerWidth = Math.max(1, columns - INPUT_SIDE_CELLS);
  // Never let the draft eat more than a third of the screen.
  const maxInputRows = Math.min(
    Math.max(Math.floor((rows - 1 - HEADER_ROWS - INPUT_BORDER_ROWS - 2) / 3), 1),
    MAX_INPUT_ROWS,
  );

  useBracketedPaste(true);
  const input = useMessageInput({
    width: innerWidth,
    maxVisibleRows: maxInputRows,
    focus: !overlayActive,
    onSubmit: handleSubmit,
    onNotice: notify,
  });

  // IME caret sync: a no-op when the entry point did not install the proxy (--no-ime-cursor,
  // LOCAL_CHAT_IME_CURSOR=0, or stdout is not a terminal).
  // The frame is rows - 1 lines tall and the InputBar's bottom border is its last line, so the
  // caret sits visibleCount - caretVisible.row lines above that border, and Ink parks the real
  // cursor one line below the frame. Runs on every render because any of those can move.
  //
  // Insertion, not layout: Ink writes the frame from the reconciler's resetAfterCommit, which
  // React runs after mutation effects but before layout effects. The proxy applies the target
  // on its next write, so a layout effect would aim the cursor one frame behind the caret.
  // tests/terminal/commitOrder.test.tsx pins that ordering.
  useInsertionEffect(() => {
    setImeCursorTarget(
      overlayActive
        ? null
        : {
            rowsFromBottom: 1 + input.visibleCount - input.caretVisible.row,
            col: INPUT_TEXT_COLUMN + input.caretVisible.col,
          },
    );
    return () => setImeCursorTarget(null);
  });

  const escWarningRows = escPending ? 1 : 0;
  const inputRows = input.visibleCount;
  const messageAreaHeight = showFake
    ? rows - 1
    : Math.max(1, rows - 1 - HEADER_ROWS - (inputRows + INPUT_BORDER_ROWS) - escWarningRows);

  // The top of the transcript needs one extra row of offset, which pays for the
  // "N lines below" indicator MessageArea renders as soon as the view is scrolled.
  const maxScroll = rowsAll.length > messageAreaHeight ? rowsAll.length - messageAreaHeight + 1 : 0;
  const effectiveOffset = Math.min(scrollOffset, maxScroll);
  const pageRows = Math.max(1, messageAreaHeight - 1);

  // Keep the stored offset inside the clamp: a stale larger value would resurface through
  // addMessage's `prev + added` and push a reader who is pinned to the bottom back up.
  // Boss mode is skipped because its full-height viewport only borrows the screen.
  useEffect(() => {
    if (showFake) return;
    setScrollOffset((prev) => Math.min(prev, maxScroll));
  }, [showFake, maxScroll]);

  // 키보드 입력: 이 화면의 유일한 useInput
  useInput((inputStr, key) => {
    if (input.consumeChunkFlag()) return;

    if (key.ctrl && inputStr === "c") {
      // A stray \x03 inside a paste must not kill the app.
      if (!input.isPasting()) handleExit();
      return;
    }

    if (showHelp) {
      setShowHelp(false);
      return;
    }

    if (showFake) {
      setShowFake(false);
      return;
    }

    if (key.tab) {
      setShowFake(true);
      return;
    }

    if (key.escape) {
      // Ink strips one ESC, so a single chunk holding both bytes arrives as "\x1B".
      const isDouble = escPending || inputStr === ESC;
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
      if (isDouble) {
        setEscPending(false);
        onRequestRooms();
      } else {
        setEscPending(true);
        escTimerRef.current = setTimeout(() => {
          setEscPending(false);
        }, 1500);
      }
      return;
    }

    // Shift+Up: 1줄 위로 스크롤
    if (key.upArrow && key.shift) {
      setScrollOffset((prev) => Math.min(prev + 1, maxScroll));
      return;
    }

    // Shift+Down: 1줄 아래로 스크롤
    if (key.downArrow && key.shift) {
      setScrollOffset((prev) => Math.max(0, Math.min(prev, maxScroll) - 1));
      return;
    }

    if (key.pageUp) {
      setScrollOffset((prev) => Math.min(prev + pageRows, maxScroll));
      return;
    }

    if (key.pageDown) {
      setScrollOffset((prev) => Math.max(0, Math.min(prev, maxScroll) - pageRows));
      return;
    }

    input.handleKey(inputStr, key);
  });

  const hintParts: string[] = [];
  let hintColor: string | undefined;
  if (isLobby) {
    const measure = measureLobby(input.text);
    if (measure.level !== "ok") {
      const suffix = measure.level === "over" ? ` ${SYMBOLS.dot} too long for lobby` : "";
      hintParts.push(`${measure.bytes}/${LOBBY_MAX_MESSAGE_BYTES} B${suffix}`);
      hintColor = measure.level === "over" ? COLORS.error : "yellow";
    }
  }
  if (input.rows.length > input.visibleCount) {
    hintParts.push(`\u2195 ${input.caret.row + 1}/${input.rows.length}`);
  }
  const hintText = hintParts.length > 0 ? hintParts.join(` ${SYMBOLS.dot} `) : undefined;

  return (
    <Box flexDirection="column" height={rows - 1}>
      {!showFake && (
        <Header
          roomName={roomName}
          users={users}
          hostNickname={hostNickname}
          myNickname={isLobby && lobbyPeer ? safeNickname(lobbyPeer.getNickname()) : nickname}
          showHostBadge={showHostBadge}
          roomNameColor={isLobby ? COLORS.system : COLORS.primary}
          hintText={hintText}
          hintColor={hintColor}
          isLobby={isLobby}
          columns={columns}
        />
      )}

      {showHelp ? (
        <HelpOverlay height={messageAreaHeight} />
      ) : showFake ? (
        <FakeOverlay height={messageAreaHeight} />
      ) : (
        <MessageArea
          rows={rowsAll}
          height={messageAreaHeight}
          scrollOffset={effectiveOffset}
          hasMessages={messages.length > 0}
          hostNickname={hostNickname}
          showHostBadge={showHostBadge}
        />
      )}

      {escPending && !showFake && (
        <Box justifyContent="center">
          <Text color={COLORS.system}>Press Esc again to browse rooms</Text>
        </Box>
      )}

      {!showFake && (
        <InputBar
          rows={input.visibleRows}
          caret={overlayActive ? null : input.caretVisible}
          width={innerWidth}
          placeholder={PLACEHOLDER}
          focus={!overlayActive}
          isEmpty={isEmpty(input.state)}
        />
      )}
    </Box>
  );
}
