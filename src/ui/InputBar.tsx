import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import { useState } from "react";
import { useIMECursor } from "../hooks/useIMECursor.js";
import { COLORS, SYMBOLS } from "./theme.js";

type InputBarProps = {
  onSubmit: (text: string) => void;
  focus?: boolean;
};

export function InputBar({ onSubmit, focus = true }: InputBarProps): React.JSX.Element {
  const [value, setValue] = useState("");
  useIMECursor(focus);

  const handleSubmit = (text: string): void => {
    if (text.trim() === "") return;
    onSubmit(text.trim());
    setValue("");
  };

  return (
    <Box borderStyle="single" borderColor={COLORS.inputBorder} paddingX={1}>
      <Text color={COLORS.primary}>{SYMBOLS.prompt} </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        focus={focus}
        placeholder="Type a message..."
      />
    </Box>
  );
}
