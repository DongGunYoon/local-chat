import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import { useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { COLORS, SYMBOLS } from "./theme.js";

export type CreateRoomData = {
  roomName: string;
  password: string;
  nickname: string;
};

type CreateRoomProps = {
  nickname: string;
  onSubmit: (data: CreateRoomData) => void;
  onBack: () => void;
};

type Step = "roomName" | "password";

export function CreateRoom({ nickname, onSubmit, onBack }: CreateRoomProps): React.JSX.Element {
  const [step, setStep] = useState<Step>("roomName");
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const { rows } = useTerminalSize();

  useInput((_input, key) => {
    if (key.escape) {
      if (step === "roomName") {
        onBack();
      } else if (step === "password") {
        setPassword("");
        setStep("roomName");
      }
    }
  });

  const handleRoomNameSubmit = (value: string): void => {
    if (value.trim() === "") return;
    setRoomName(value.trim());
    setStep("password");
  };

  const handlePasswordSubmit = (value: string): void => {
    setPassword(value);
    onSubmit({ roomName, password: value, nickname });
  };

  return (
    <Box flexDirection="column" height={rows - 1} paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          {SYMBOLS.cursor} Create a Room
        </Text>
      </Box>
      <Text color={COLORS.muted}>Esc to go back</Text>

      <Box marginTop={1} flexDirection="column" gap={1}>
        <Box>
          <Text color={COLORS.muted}>
            {SYMBOLS.system} Nickname: {nickname}
          </Text>
        </Box>

        <Box>
          <Text color={step === "roomName" ? COLORS.primary : COLORS.muted}>
            {step !== "roomName" ? `${SYMBOLS.system} ` : `${SYMBOLS.prompt} `}
          </Text>
          <Text>Room name: </Text>
          {step === "roomName" ? (
            <TextInput
              value={roomName}
              onChange={setRoomName}
              onSubmit={handleRoomNameSubmit}
              placeholder="my-room"
            />
          ) : (
            <Text color={COLORS.nickname}>{roomName}</Text>
          )}
        </Box>

        {step === "password" && (
          <Box>
            <Text color={COLORS.primary}>{`${SYMBOLS.prompt} `}</Text>
            <Text>Password: </Text>
            <TextInput
              value={password}
              onChange={setPassword}
              onSubmit={handlePasswordSubmit}
              mask="*"
              placeholder="Enter to skip"
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
