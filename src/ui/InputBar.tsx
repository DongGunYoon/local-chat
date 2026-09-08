import { Box, Text } from "ink";
import type React from "react";
import { useIMECursor } from "../hooks/useIMECursor.js";
import type { VisualRow } from "../input/layout.js";
import { getDisplayWidth, graphemeWidth, segmentGraphemes } from "../utils/displayWidth.js";
import { COLORS, SYMBOLS } from "./theme.js";

type InputBarProps = {
  /** Visual rows to display; the caller decides how many of them fit. */
  rows: readonly VisualRow[];
  /** Caret position relative to `rows`, or null while the input is not driving the caret. */
  caret: { row: number; col: number } | null;
  /** Cells available for the text itself (terminal columns minus border, padding and prompt). */
  width: number;
  placeholder: string;
  focus: boolean;
  isEmpty: boolean;
};

const CONTINUATION = "  ";

/** Pad to exactly `width` cells so every row has the same height cost. */
function padToWidth(text: string, width: number): string {
  const missing = width - getDisplayWidth(text);
  return missing > 0 ? text + " ".repeat(missing) : text;
}

/**
 * Split a row at a cell column into the text before the caret, the grapheme under it and
 * the text after it. The caret grapheme is "" when the column is past the end of the row.
 */
function splitAtColumn(text: string, column: number): [string, string, string] {
  const graphemes = segmentGraphemes(text);
  let cells = 0;
  for (let i = 0; i < graphemes.length; i++) {
    cells += graphemeWidth(graphemes[i]);
    if (column < cells) {
      return [graphemes.slice(0, i).join(""), graphemes[i], graphemes.slice(i + 1).join("")];
    }
  }
  return [text, "", ""];
}

export function InputBar({
  rows,
  caret,
  width,
  placeholder,
  focus,
  isEmpty,
}: InputBarProps): React.JSX.Element {
  useIMECursor(focus);

  return (
    <Box borderStyle="single" borderColor={COLORS.inputBorder} paddingX={1} flexDirection="column">
      {isEmpty ? (
        <Text wrap="truncate-end">
          <Text color={COLORS.primary}>{`${SYMBOLS.prompt} `}</Text>
          {caret !== null && <Text inverse> </Text>}
          <Text color={COLORS.muted}>{placeholder}</Text>
        </Text>
      ) : (
        rows.map((row, index) => {
          const caretColumn = caret !== null && caret.row === index ? caret.col : null;
          const padded = padToWidth(row.text, width);
          const [before, atCaret, after] =
            caretColumn === null ? [padded, "", ""] : splitAtColumn(padded, caretColumn);

          return (
            <Text key={row.start} wrap="truncate-end">
              {index === 0 ? (
                <Text color={COLORS.primary}>{`${SYMBOLS.prompt} `}</Text>
              ) : (
                CONTINUATION
              )}
              {before}
              {atCaret !== "" && <Text inverse>{atCaret}</Text>}
              {after}
            </Text>
          );
        })
      )}
    </Box>
  );
}
