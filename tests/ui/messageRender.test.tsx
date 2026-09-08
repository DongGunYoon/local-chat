import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatEntry } from "../../src/network/types.js";
import { MessageArea } from "../../src/ui/MessageArea.js";
import { layoutMessage, type MessageRow } from "../../src/ui/MessageList.js";
import { getDisplayWidth } from "../../src/utils/displayWidth.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips SGR colour sequences
const SGR = /\u001B\[[0-9;]*m/g;
const ELLIPSIS = "…";

/**
 * ink-testing-library's Stdout reports 100 columns, so Ink lays every frame out at that
 * width and MessageArea's paddingX={1} leaves 98 cells of content. Laying the rows out
 * against the same 98 makes Ink's own `truncate-end` observable: a row whose rendered
 * width exceeds the box does not merely lose its overflow, because cli-truncate spends
 * one cell of the budget on "…" and overwrites the last real grapheme with it.
 */
const INK_COLS = 100;
const LAYOUT_COLS = 98;
const HEIGHT = 10;
/** "HH:MM " (6) + "me" (2) + " › " (3). */
const FIRST_WIDTH = LAYOUT_COLS - 11;
/** WRAP_INDENT is 10 for chat rows. */
const WRAP_INDENT = 10;
const CONT_WIDTH = LAYOUT_COLS - WRAP_INDENT;

function chat(content: string): ChatEntry {
  return { id: "e1", type: "message", nickname: "me", content, timestamp: 0 };
}

function renderRows(rows: readonly MessageRow[]) {
  const app = render(
    <MessageArea
      rows={rows}
      height={HEIGHT}
      scrollOffset={0}
      hasMessages
      hostNickname="host"
      showHostBadge={false}
    />,
  );
  const frame = (): string => (app.lastFrame() ?? "").replace(SGR, "");
  return { ...app, frame, lines: (): string[] => frame().split("\n") };
}

function renderMessage(content: string) {
  return renderRows(layoutMessage(chat(content), LAYOUT_COLS, "host", false));
}

afterEach(() => {
  cleanup();
});

describe("MessageRowView rendering width", () => {
  it("keeps the last glyph of a first row closed by a boundary space", () => {
    // The row fills FIRST_WIDTH exactly, then the following space is kept on it by
    // wrapTextTwoWidth so the hanging indent stays aligned. Rendering that space would
    // push the line to 99 cells in a 98-cell box and cost the "s" of "worlds".
    const { frame } = renderMessage(`${"y".repeat(FIRST_WIDTH - 7)} worlds again`);

    expect(frame()).not.toContain(ELLIPSIS);
    expect(frame()).toContain("worlds");
    expect(frame()).toContain("again");
  });

  it("keeps the last glyph of a continuation row closed by a boundary space", () => {
    const { frame } = renderMessage(`a\n${"y".repeat(CONT_WIDTH - 7)} worlds again`);

    expect(frame()).not.toContain(ELLIPSIS);
    expect(frame()).toContain("worlds");
    expect(frame()).toContain("again");
  });

  it("renders a whitespace-only row as an empty line", () => {
    const { frame, lines } = renderMessage(`a\n${" ".repeat(120)}\nb`);

    expect(frame()).not.toContain(ELLIPSIS);
    // The 120-space paragraph is one row: the "a" row, the blank row, then the "b" row.
    // The leading space of the last two lines is MessageArea's paddingX.
    expect(lines()).toHaveLength(3);
    expect(lines().slice(-2)).toEqual(["", `${" ".repeat(WRAP_INDENT + 1)}b`]);
  });

  it("never renders a line wider than the terminal", () => {
    const tail = `${"z".repeat(CONT_WIDTH - 4)} tail`;
    const { lines } = renderMessage(`${"y".repeat(FIRST_WIDTH - 7)} worlds again and ${tail}`);

    for (const line of lines()) {
      expect(getDisplayWidth(line)).toBeLessThanOrEqual(INK_COLS);
    }
  });
});
