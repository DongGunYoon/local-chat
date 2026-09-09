import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useKeyboardProtocol } from "../hooks/useKeyboardProtocol.js";
import { ChatClient } from "../network/client.js";
import { RoomBroadcaster } from "../network/discovery.js";
import { LobbyPeer } from "../network/lobby.js";
import { ChatServer } from "../network/server.js";
import type { JoinRoomData } from "../network/types.js";
import { ChatRoom } from "./ChatRoom.js";
import { CreateRoom, type CreateRoomData } from "./CreateRoom.js";
import { NicknameScreen } from "./NicknameScreen.js";
import { RoomBrowser } from "./RoomBrowser.js";
import { COLORS } from "./theme.js";

type Screen = "nickname" | "lobbyChat" | "browser" | "create" | "privateChat";

type PrivateChatState = {
  mode: "host" | "client";
  roomName: string;
  nickname: string;
  password: string;
  server?: ChatServer;
  broadcaster?: RoomBroadcaster;
  client?: ChatClient;
};

export function App(): React.JSX.Element {
  useKeyboardProtocol();
  const [screen, setScreen] = useState<Screen>("nickname");
  const [nickname, setNickname] = useState<string | null>(null);
  const [lobbyPeer, setLobbyPeer] = useState<LobbyPeer | null>(null);
  const [chatState, setChatState] = useState<PrivateChatState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const screenRef = useRef<Screen>("nickname");

  const handleNicknameSubmit = useCallback((nick: string, peer: LobbyPeer) => {
    setNickname(nick);
    setLobbyPeer(peer);
    screenRef.current = "lobbyChat";
    setScreen("lobbyChat");
  }, []);

  const returnToLobby = useCallback((nick: string) => {
    // Create a fresh LobbyPeer with preferred nickname
    const newPeer = new LobbyPeer(nick);
    newPeer
      .startListening()
      .then(() => {
        newPeer.activate();
        setLobbyPeer(newPeer);
        setChatState(null);
        setError(null);
        setJoinError(null);
        setJoining(false);
        screenRef.current = "lobbyChat";
        setScreen("lobbyChat");
      })
      .catch(() => {
        newPeer.activate();
        setLobbyPeer(newPeer);
        setChatState(null);
        setError(null);
        setJoinError(null);
        setJoining(false);
        screenRef.current = "lobbyChat";
        setScreen("lobbyChat");
      });
  }, []);

  const handleNavigateToBrowser = useCallback(() => {
    lobbyPeer?.stop();
    setLobbyPeer(null);
    if (chatState) {
      if (chatState.mode === "host") {
        chatState.broadcaster?.stop();
        chatState.server?.close();
      } else {
        chatState.client?.disconnect();
      }
      setChatState(null);
    }
    setError(null);
    setJoinError(null);
    setJoining(false);
    screenRef.current = "browser";
    setScreen("browser");
  }, [lobbyPeer, chatState]);

  const handleBrowserCreateRoom = useCallback(() => {
    setError(null);
    screenRef.current = "create";
    setScreen("create");
  }, []);

  const handleBrowserJoinLobby = useCallback(() => {
    if (!nickname) return;
    returnToLobby(nickname);
  }, [nickname, returnToLobby]);

  const handleExitApp = useCallback(() => {
    process.exit(0);
  }, []);

  const handleCreateRoom = useCallback(async (data: CreateRoomData) => {
    try {
      setError(null);
      const server = new ChatServer(data.roomName, data.nickname, data.password || undefined);
      const port = await server.start();

      const broadcaster = new RoomBroadcaster(data.roomName, port, !!data.password, () =>
        server.getUserCount(),
      );
      broadcaster.start();

      setChatState({
        mode: "host",
        roomName: data.roomName,
        nickname: data.nickname,
        password: data.password,
        server,
        broadcaster,
      });
      screenRef.current = "privateChat";
      setScreen("privateChat");
    } catch (err) {
      setError(`Failed to create room: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, []);

  const handleJoinRoom = useCallback(
    (data: JoinRoomData) => {
      if (joining) return;

      try {
        setJoining(true);
        setError(null);
        setJoinError(null);
        const client = new ChatClient(data.host, data.port, data.nickname, data.password);

        client.on("authOk", (_sessionKey: string, resolvedNickname: string) => {
          setChatState({
            mode: "client",
            roomName: data.roomName,
            nickname: resolvedNickname,
            password: data.password,
            client,
          });
          screenRef.current = "privateChat";
          setScreen("privateChat");
        });

        client.on("authFail", (_reason: string) => {
          setJoining(false);
          setJoinError("Wrong password. Please try again.");
        });

        client.on("error", (err: Error) => {
          setJoining(false);
          if (screenRef.current !== "privateChat") {
            if (
              err.message.includes("ECONNREFUSED") ||
              err.message.includes("Failed to reconnect")
            ) {
              setJoinError("Room is no longer available.");
            } else {
              setError(`Connection failed: ${err.message}`);
            }
          }
        });

        client.connect();
      } catch (err) {
        setJoining(false);
        setError(`Failed to join room: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [joining],
  );

  const handleBack = useCallback(() => {
    if (!nickname) return;
    setError(null);
    setJoinError(null);
    setJoining(false);
    screenRef.current = "browser";
    setScreen("browser");
  }, [nickname]);

  return (
    <Box flexDirection="column">
      {error && (
        <Box paddingX={1}>
          <Text color={COLORS.error}>{error}</Text>
        </Box>
      )}

      {screen === "nickname" && <NicknameScreen onSubmit={handleNicknameSubmit} />}

      {screen === "lobbyChat" && lobbyPeer && nickname && (
        <ChatRoom
          key={`lobby-${lobbyPeer.getPeerId()}`}
          roomType="lobby"
          roomName="Lobby"
          nickname={nickname}
          lobbyPeer={lobbyPeer}
          onExit={handleExitApp}
          onRequestRooms={handleNavigateToBrowser}
        />
      )}

      {screen === "browser" && nickname && (
        <RoomBrowser
          nickname={nickname}
          onCreateRoom={handleBrowserCreateRoom}
          onJoinLobby={handleBrowserJoinLobby}
          onJoinRoom={handleJoinRoom}
          onExit={handleExitApp}
          joinError={joinError}
        />
      )}

      {screen === "create" && nickname && (
        <CreateRoom nickname={nickname} onSubmit={handleCreateRoom} onBack={handleBack} />
      )}

      {screen === "privateChat" && chatState && (
        <ChatRoom
          key={`private-${chatState.roomName}-${chatState.mode}`}
          roomType="private"
          roomName={chatState.roomName}
          nickname={chatState.nickname}
          mode={chatState.mode}
          server={chatState.server}
          broadcaster={chatState.broadcaster}
          client={chatState.client}
          onExit={handleExitApp}
          onRequestRooms={handleNavigateToBrowser}
        />
      )}
    </Box>
  );
}
