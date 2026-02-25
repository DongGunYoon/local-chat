import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useVersionCheck } from "../hooks/useVersionCheck.js";
import { LobbyPeer } from "../network/lobby.js";
import { getDisplayWidth, limitInputByWidth } from "../utils/displayWidth.js";
import { COLORS, SYMBOLS } from "./theme.js";

const MAX_NICK_WIDTH = 16; // 터미널 칸 수: 영문 16자 / 한글 8자

type NicknameScreenProps = {
  onSubmit: (nickname: string, lobbyPeer: LobbyPeer) => void;
};

const LOGO = [
  " _                 _        _         _   ",
  "| | ___   ___ __ _| |   ___| |__   _ _| |_ ",
  "| |/ _ \\ / __/ _` | |  / __| '_ \\ / _` | __|",
  "| | (_) | (_| (_| | | | (__| | | | (_| | |_ ",
  "|_|\\___/ \\___\\__,_|_|  \\___|_| |_|\\__,_|\\__|",
];

export function NicknameScreen({ onSubmit }: NicknameScreenProps): React.JSX.Element {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const joinPeerRef = useRef<LobbyPeer | null>(null);
  const { rows } = useTerminalSize();
  const { updateAvailable, latestVersion, currentVersion } = useVersionCheck();

  useEffect(() => {
    return () => {
      if (joinPeerRef.current) joinPeerRef.current.stop();
    };
  }, []);

  useInput((_input, key) => {
    if (key.escape) {
      process.exit(0);
    }
  });

  const handleSubmit = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || getDisplayWidth(trimmed) > MAX_NICK_WIDTH) return;
    if (joining) return;

    setError(null);
    setJoining(true);

    const peer = new LobbyPeer(trimmed);
    joinPeerRef.current = peer;

    peer
      .startListening()
      .then(() => {
        peer.activate();
        joinPeerRef.current = null;
        onSubmit(trimmed, peer);
      })
      .catch(() => {
        peer.stop();
        joinPeerRef.current = null;
        setJoining(false);
        setError("Network error. Please try again.");
      });
  };

  return (
    <Box flexDirection="column" height={rows - 1} alignItems="center" justifyContent="center">
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        {LOGO.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: LOGO is a static constant array
          <Text key={index} color={COLORS.primary}>
            {line}
          </Text>
        ))}
      </Box>

      <Text color={COLORS.muted}>private local network chat v{currentVersion}</Text>
      <Text color={COLORS.muted}>{SYMBOLS.line.repeat(30)}</Text>

      {updateAvailable && latestVersion && (
        <Box marginTop={1}>
          <Text color="yellow">
            {"\u25CF"} Update available: {currentVersion} {"\u2192"} {latestVersion} {"\u2014"} run
            npx local-chat@latest
          </Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text color={COLORS.muted}>What should we call you?</Text>
        <Box
          marginTop={1}
          width={26}
          borderStyle="single"
          borderColor={error ? COLORS.error : joining ? COLORS.system : COLORS.primary}
          paddingX={1}
        >
          <Text color={COLORS.primary}>{SYMBOLS.prompt} </Text>
          <TextInput
            value={nickname}
            onChange={(val) => {
              const filtered = val.replace(/[^\p{L}\p{M}\p{N}\s]/gu, "");
              setNickname(limitInputByWidth(filtered, MAX_NICK_WIDTH));
              setError(null);
            }}
            onSubmit={handleSubmit}
            placeholder="nickname"
            focus={!joining}
          />
        </Box>
        {error ? (
          <Text color={COLORS.error}>
            {"\u2717"} {error}
          </Text>
        ) : joining ? (
          <Text color={COLORS.system}>Joining...</Text>
        ) : (
          <Text color={COLORS.muted}>
            {getDisplayWidth(nickname)}/{MAX_NICK_WIDTH}
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={COLORS.muted}>Enter to join {SYMBOLS.dot} Esc to quit</Text>
      </Box>
    </Box>
  );
}
