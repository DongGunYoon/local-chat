import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { RoomDiscovery } from "../network/discovery.js";
import type { JoinRoomData, RoomInfo } from "../network/types.js";
import { COLORS, SYMBOLS } from "./theme.js";

type RoomBrowserProps = {
  nickname: string;
  onCreateRoom: () => void;
  onJoinLobby: () => void;
  onJoinRoom: (data: JoinRoomData) => void;
  onExit: () => void;
  joinError?: string | null;
};

type BrowserItem = { kind: "lobby" } | { kind: "room"; room: RoomInfo };

// Card = border top(1) + content(1) + border bottom(1)
const CARD_BASE_HEIGHT = 3;

export function RoomBrowser({
  nickname,
  onCreateRoom,
  onJoinLobby,
  onJoinRoom,
  onExit,
  joinError,
}: RoomBrowserProps): React.JSX.Element {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [selected, setSelected] = useState(0);
  const [passwordTarget, setPasswordTarget] = useState<RoomInfo | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discovery] = useState(() => new RoomDiscovery());
  const scrollRef = useRef(0);
  const { rows, columns } = useTerminalSize();

  const items = useMemo<BrowserItem[]>(
    () => [{ kind: "lobby" }, ...rooms.map((room) => ({ kind: "room" as const, room }))],
    [rooms],
  );

  // joinError handling
  useEffect(() => {
    if (!joinError) return;
    if (passwordTarget) {
      setPasswordError(joinError);
      setPassword("");
    } else {
      setNotification(joinError);
    }
  }, [joinError, passwordTarget]);

  // Room discovery
  useEffect(() => {
    const startDiscovery = async (): Promise<void> => {
      try {
        await discovery.start();
        setScanning(true);
      } catch (_err) {
        setDiscoveryError("Failed to scan network. UDP port may be in use.");
        setScanning(false);
      }
    };

    startDiscovery();

    const handleRoomFound = (room: RoomInfo): void => {
      setRooms((prev) => {
        const key = `${room.host}:${room.port}`;
        const existing = prev.findIndex((r) => `${r.host}:${r.port}` === key);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = room;
          return updated;
        }
        return [...prev, room];
      });
    };

    const handleRoomUpdated = (room: RoomInfo): void => {
      setRooms((prev) => {
        const key = `${room.host}:${room.port}`;
        return prev.map((r) => (`${r.host}:${r.port}` === key ? room : r));
      });
    };

    const handleRoomLost = (room: RoomInfo): void => {
      const key = `${room.host}:${room.port}`;
      setRooms((prev) => prev.filter((r) => `${r.host}:${r.port}` !== key));
      setPasswordTarget((prev) => {
        if (prev && `${prev.host}:${prev.port}` === key) {
          setPassword("");
          setPasswordError(null);
          return null;
        }
        return prev;
      });
    };

    discovery.on("roomFound", handleRoomFound);
    discovery.on("roomUpdated", handleRoomUpdated);
    discovery.on("roomLost", handleRoomLost);

    return () => {
      discovery.stop();
    };
  }, [discovery]);

  // Clamp selected when items shrink
  useEffect(() => {
    setSelected((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Keyboard — single handler, no isActive flag
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onExit();
      return;
    }

    // Clear notification on any key press
    if (notification) setNotification(null);

    // Esc always works: cancel password or no-op at top level
    if (key.escape) {
      if (passwordTarget) {
        setPasswordTarget(null);
        setPassword("");
        setPasswordError(null);
      }
      return;
    }

    // In password mode, let TextInput handle everything else
    if (passwordTarget) return;

    if (key.upArrow) {
      setSelected((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((prev) => Math.min(items.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      const item = items[selected];
      if (item.kind === "lobby") {
        onJoinLobby();
      } else if (item.kind === "room") {
        if (item.room.hasPassword) {
          setPasswordTarget(item.room);
          setPassword("");
          setPasswordError(null);
        } else {
          onJoinRoom({
            roomName: item.room.name,
            host: item.room.host,
            port: item.room.port,
            password: "",
            nickname,
          });
        }
      }
      return;
    }
    if (input.toLowerCase() === "n") {
      onCreateRoom();
      return;
    }
    if (input.toLowerCase() === "q") {
      onExit();
    }
  });

  const handlePasswordSubmit = (value: string): void => {
    if (!passwordTarget) return;
    onJoinRoom({
      roomName: passwordTarget.name,
      host: passwordTarget.host,
      port: passwordTarget.port,
      password: value,
      nickname,
    });
  };

  // Layout
  const cardWidth = Math.min(50, columns - 6);

  const isPwTarget = (item: BrowserItem): boolean => {
    if (!passwordTarget || item.kind !== "room") return false;
    return (
      `${item.room.host}:${item.room.port}` === `${passwordTarget.host}:${passwordTarget.port}`
    );
  };

  // Height per card (for scroll calculation)
  const getItemHeight = (idx: number): number => {
    const item = items[idx];
    let h = CARD_BASE_HEIGHT;
    if (isPwTarget(item)) {
      h += 1; // password input row
      if (passwordError) h += 1; // error row
    }
    return h;
  };

  // Available space: total - title(2) - padding(2) - status(1) - action bar(2) = 7
  const availableForCards = Math.max(CARD_BASE_HEIGHT, rows - 1 - 7);

  // Scroll — ensure selected card is visible
  let viewStart = scrollRef.current;
  if (selected < viewStart) viewStart = selected;

  // Calculate viewEnd from viewStart
  let heightUsed = 0;
  let viewEnd = viewStart;
  for (let i = viewStart; i < items.length; i++) {
    const h = getItemHeight(i);
    if (heightUsed + h > availableForCards && i > viewStart) break;
    heightUsed += h;
    viewEnd = i + 1;
  }

  // If selected is not visible, scroll down to it
  if (selected >= viewEnd) {
    viewEnd = selected + 1;
    heightUsed = getItemHeight(selected);
    viewStart = selected;
    for (let i = selected - 1; i >= 0; i--) {
      const h = getItemHeight(i);
      if (heightUsed + h > availableForCards) break;
      heightUsed += h;
      viewStart = i;
    }
  }

  scrollRef.current = viewStart;

  const hasAbove = viewStart > 0;
  const hasBelow = viewEnd < items.length;

  return (
    <Box flexDirection="column" height={rows - 1} paddingX={2} paddingY={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          Rooms
        </Text>
      </Box>

      {/* Scroll up */}
      {hasAbove && (
        <Box justifyContent="flex-end" width={cardWidth}>
          <Text color={COLORS.muted}>
            {"\u25B2"} {viewStart} more
          </Text>
        </Box>
      )}

      {/* Room cards */}
      {items.slice(viewStart, viewEnd).map((item, i) => {
        const realIdx = viewStart + i;
        const isSel = realIdx === selected;
        const borderColor = isSel ? COLORS.primary : COLORS.muted;

        if (item.kind === "lobby") {
          return (
            <Box
              key="lobby"
              borderStyle="single"
              borderColor={isSel ? COLORS.primary : COLORS.system}
              width={cardWidth}
              paddingX={1}
            >
              <Box justifyContent="space-between">
                <Text color={isSel ? COLORS.primary : COLORS.system} bold={isSel}>
                  {isSel ? `${SYMBOLS.cursor} ` : "  "}Lobby
                </Text>
                <Text color={COLORS.system}> [public]</Text>
              </Box>
            </Box>
          );
        }

        const { room } = item;
        const key = `${room.host}:${room.port}`;
        const showPw = isPwTarget(item);

        return (
          <Box
            key={key}
            flexDirection="column"
            borderStyle="single"
            borderColor={borderColor}
            width={cardWidth}
            paddingX={1}
          >
            <Box justifyContent="space-between">
              <Text color={isSel ? COLORS.primary : COLORS.muted} bold={isSel}>
                {isSel ? `${SYMBOLS.cursor} ` : "  "}
                {room.name}
                {room.hasPassword ? " \uD83D\uDD12" : ""}
              </Text>
              <Text color={COLORS.muted}>{room.userCount} online</Text>
            </Box>
            {showPw && (
              <Box paddingLeft={2}>
                <Text color={COLORS.primary}>{SYMBOLS.prompt} </Text>
                <Text>Password: </Text>
                <TextInput
                  value={password}
                  onChange={setPassword}
                  onSubmit={handlePasswordSubmit}
                  mask="*"
                />
              </Box>
            )}
            {showPw && passwordError && (
              <Box paddingLeft={4}>
                <Text color={COLORS.error}>{passwordError}</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Scroll down */}
      {hasBelow && (
        <Box justifyContent="flex-end" width={cardWidth}>
          <Text color={COLORS.muted}>
            {"\u25BC"} {items.length - viewEnd} more
          </Text>
        </Box>
      )}

      <Box flexGrow={1} />

      {/* Notification */}
      {notification && (
        <Box justifyContent="center" marginBottom={1}>
          <Text color={COLORS.system}>{notification}</Text>
        </Box>
      )}

      {/* Status */}
      {discoveryError ? (
        <Box justifyContent="center">
          <Text color={COLORS.error}>{discoveryError}</Text>
        </Box>
      ) : (
        scanning && (
          <Box justifyContent="center">
            <Text color={COLORS.muted}>{SYMBOLS.system} Scanning local network...</Text>
          </Box>
        )
      )}

      {/* Action bar */}
      {passwordTarget ? (
        <Box justifyContent="center">
          <Text dimColor>Enter submit {SYMBOLS.dot} Esc cancel</Text>
        </Box>
      ) : (
        <Box flexDirection="column" alignItems="center">
          <Box>
            <Text bold color={COLORS.primary}>
              N
            </Text>
            <Text dimColor> New Room</Text>
            <Text dimColor>
              {"  "}
              {SYMBOLS.dot}
              {"  "}
            </Text>
            <Text bold color={COLORS.primary}>
              Q
            </Text>
            <Text dimColor> Quit</Text>
          </Box>
          <Text dimColor>
            {"\u2191\u2193"} Navigate {SYMBOLS.dot} Enter join
          </Text>
        </Box>
      )}
    </Box>
  );
}
