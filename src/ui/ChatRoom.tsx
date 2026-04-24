import { execSync } from "node:child_process";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { ChatClient } from "../network/client.js";
import { decrypt, encrypt } from "../network/crypto.js";
import type { RoomBroadcaster } from "../network/discovery.js";
import type { LobbyPeer } from "../network/lobby.js";
import type { ChatServer } from "../network/server.js";
import { type ChatEntry, LOBBY_MAX_MESSAGE_BYTES } from "../network/types.js";
import { VERSION } from "../version.js";
import { FakeOverlay } from "./FakeOverlay.js";
import { Header } from "./Header.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { InputBar } from "./InputBar.js";
import { MessageArea } from "./MessageArea.js";
import { COLORS, KAOMOJI_MAP } from "./theme.js";

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

function copyToClipboard(text: string): boolean {
  const commands = ["pbcopy", "xclip -selection clipboard", "xsel --clipboard --input"];
  for (const cmd of commands) {
    try {
      execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"] });
      return true;
    } catch {}
  }
  return false;
}

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

// Header(3행) + InputBar(3행) = 6행을 고정 UI가 차지한다
const FIXED_UI_ROWS = 6;

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

  const escWarningRows = escPending ? 1 : 0;
  const messageAreaHeight = showFake
    ? rows - 1
    : Math.max(1, rows - 1 - FIXED_UI_ROWS - escWarningRows);

  const addMessage = useCallback(
    (type: ChatEntry["type"], content: string, msgNickname?: string, isMe?: boolean) => {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          type,
          nickname: msgNickname,
          content,
          timestamp: Date.now(),
          isMe,
        },
      ]);
      setScrollOffset(0);
    },
    [],
  );

  // --- Lobby mode event handling ---
  useEffect(() => {
    if (!isLobby || !lobbyPeer) return;

    const handleMessage = (msgNickname: string, content: string, _timestamp: number): void => {
      addMessage("message", content, msgNickname);
    };

    const mountTime = Date.now();

    const handleUserJoined = (joinedNickname: string): void => {
      if (Date.now() - mountTime < 2000) return;
      addMessage("system", `${joinedNickname} joined`);
    };

    const handleUserLeft = (leftNickname: string): void => {
      addMessage("system", `${leftNickname} left`);
    };

    const handleUserList = (userList: string[]): void => {
      setUsers(userList);
    };

    // Initialize user list
    setUsers(lobbyPeer.getUsers());

    const currentUsers = lobbyPeer.getUsers();
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
      try {
        const decrypted = decrypt(payload, encryptionKey);
        addMessage("message", decrypted, msgNickname, msgNickname === nickname);
      } catch {
        addMessage("message", "[decryption failed]", msgNickname);
      }
    };

    const handleUserJoined = (joined: string, allUsers: string[]): void => {
      addMessage("system", `${joined} joined`);
      setUsers(allUsers);
    };

    const handleUserLeft = (left: string, allUsers: string[]): void => {
      addMessage("system", `${left} left`);
      setUsers(allUsers);
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
      try {
        const decrypted = decrypt(payload, encryptionKey);
        addMessage("message", decrypted, msgNickname, msgNickname === nickname);
      } catch {
        addMessage("message", "[decryption failed]", msgNickname);
      }
    };

    const handleSystem = (content: string): void => {
      addMessage("system", content);
    };

    const handleUserList = (userList: string[]): void => {
      setUsers(userList);
      if (!hasShownMemberList.current) {
        hasShownMemberList.current = true;
        addMessage("system", `Online: ${userList.join(", ")}`);
      }
    };

    const handleRoomClosed = (reason: string): void => {
      roomClosedRef.current = true;
      addMessage("system", `${reason} Returning to rooms...`);
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

  // 키보드 입력
  useInput((_input, key) => {
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
      if (escPending) {
        if (escTimerRef.current) clearTimeout(escTimerRef.current);
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
      setScrollOffset((prev) => Math.min(prev + 1, Math.max(0, messages.length - 1)));
      return;
    }

    // Shift+Down: 1줄 아래로 스크롤
    if (key.downArrow && key.shift) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.pageUp) {
      setScrollOffset((prev) =>
        Math.min(prev + messageAreaHeight, Math.max(0, messages.length - 1)),
      );
      return;
    }

    if (key.pageDown) {
      setScrollOffset((prev) => Math.max(0, prev - messageAreaHeight));
      return;
    }
  });

  const getEncryptionKey = (): Buffer | null => {
    if (mode === "host" && server) {
      return server.getEncryptionKey();
    }
    if (mode === "client" && client) {
      return client.getEncryptionKey();
    }
    return null;
  };

  const handleInput = (text: string): void => {
    if (text.startsWith("/")) {
      handleCommand(text);
      return;
    }

    sendMessage(text);
  };

  const sendMessage = (text: string): void => {
    if (isLobby && lobbyPeer) {
      const byteLength = Buffer.byteLength(text, "utf8");
      if (byteLength > LOBBY_MAX_MESSAGE_BYTES) {
        addMessage(
          "system",
          `Message too long for lobby (${byteLength}/${LOBBY_MAX_MESSAGE_BYTES} bytes). Try a shorter message.`,
        );
        return;
      }
      lobbyPeer.sendChatMessage(text);
      addMessage("message", text, lobbyPeer.getNickname(), true);
      return;
    }

    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return;

    const encrypted = encrypt(text, encryptionKey);

    if (mode === "host" && server) {
      server.broadcastMessage(encrypted);
    } else if (mode === "client" && client) {
      client.sendMessage(encrypted);
    }
  };

  const handleCommand = (text: string): void => {
    const parts = text.split(" ");
    let command = parts[0].toLowerCase();

    // alias 해소
    command = COMMAND_ALIASES[command] ?? command;

    // kaomoji 커맨드 확인
    const kaomoji = KAOMOJI_MAP[command];
    if (kaomoji) {
      sendMessage(kaomoji);
      return;
    }

    switch (command) {
      case "/help":
        setShowHelp(true);
        break;

      case "/users":
        addMessage("system", `Online (${users.length}): ${users.join(", ")}`);
        break;

      case "/erase":
        setMessages([]);
        setScrollOffset(0);
        break;

      case "/fake":
        setShowFake(true);
        break;

      case "/version":
        addMessage("system", `local-chat v${VERSION}`);
        break;

      case "/copy": {
        const n = Math.max(1, Number.parseInt(parts[1], 10) || 1);
        const chatMessages = messages.filter((m) => m.type === "message");
        const target = chatMessages[chatMessages.length - n];
        if (!target) {
          addMessage("system", "No message to copy");
        } else if (copyToClipboard(target.content)) {
          addMessage("system", "Copied to clipboard");
        } else {
          addMessage("system", "Clipboard not available");
        }
        break;
      }

      case "/quit":
        handleExit();
        break;

      default:
        addMessage("system", `Unknown command: ${command}. Type /help`);
    }
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

  const overlayActive = showHelp || showFake;

  const showHostBadge = isPrivate;

  return (
    <Box flexDirection="column" height={rows - 1}>
      {!showFake && (
        <Header
          roomName={roomName}
          users={users}
          hostNickname={hostNickname}
          myNickname={isLobby && lobbyPeer ? lobbyPeer.getNickname() : nickname}
          showHostBadge={showHostBadge}
          roomNameColor={isLobby ? COLORS.system : COLORS.primary}
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
          messages={messages}
          height={messageAreaHeight}
          columns={columns}
          scrollOffset={scrollOffset}
          hostNickname={hostNickname}
          showHostBadge={showHostBadge}
        />
      )}

      {escPending && !showFake && (
        <Box justifyContent="center">
          <Text color={COLORS.system}>Press Esc again to browse rooms</Text>
        </Box>
      )}

      {!showFake && <InputBar onSubmit={handleInput} focus={!overlayActive} />}
    </Box>
  );
}
