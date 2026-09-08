import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatEntry } from "../../src/network/types.js";
import { MessageArea } from "../../src/ui/MessageArea.js";
import { layoutMessage, type MessageRow } from "../../src/ui/MessageList.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips SGR colour sequences
const SGR = /\u001B\[[0-9;]*m/g;

const HEIGHT = 11;
const COLS = 78;

/** One entry whose content is 40 short paragraphs, so it lays out as exactly 40 rows. */
function tallMessage(): ChatEntry {
  const content = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
  return { id: "tall", type: "message", nickname: "bob", content, timestamp: 0 };
}

function tallRows(): MessageRow[] {
  return layoutMessage(tallMessage(), COLS, "host", false);
}

function renderArea(rows: readonly MessageRow[], scrollOffset: number, hasMessages = true) {
  const app = render(
    <MessageArea
      rows={rows}
      height={HEIGHT}
      scrollOffset={scrollOffset}
      hasMessages={hasMessages}
      hostNickname="host"
      showHostBadge={false}
    />,
  );
  const frame = (): string => (app.lastFrame() ?? "").replace(SGR, "");
  return { ...app, frame, lines: (): string[] => frame().split("\n") };
}

afterEach(() => {
  cleanup();
});

describe("MessageArea", () => {
  it("shows the tail of a message taller than the area", () => {
    const rows = tallRows();
    expect(rows).toHaveLength(40);

    const { frame, lines } = renderArea(rows, 0);

    expect(frame()).toContain("line 39");
    expect(frame()).toContain("line 30");
    expect(frame()).not.toContain("line 29");
    expect(frame()).not.toContain("No messages yet");
    expect(frame()).toContain("▲ 30 lines above · Shift+↑↓");
    expect(frame()).not.toContain("lines below");
    expect(lines()).toHaveLength(HEIGHT);
  });

  it("shifts the slice and shows both indicators when scrolled up", () => {
    const { frame, lines } = renderArea(tallRows(), 5);

    expect(frame()).toContain("▼ 5 lines below · Shift+↑↓");
    expect(frame()).toContain("▲ 26 lines above · Shift+↑↓");
    expect(frame()).toContain("line 26");
    expect(frame()).toContain("line 34");
    expect(frame()).not.toContain("line 25");
    expect(frame()).not.toContain("line 35");
    expect(lines()).toHaveLength(HEIGHT);
  });

  it("reaches the very first row at the highest reachable offset", () => {
    // rows(40) - height(11) + 1: one extra row of offset pays for the bottom indicator.
    const { frame } = renderArea(tallRows(), 30);

    expect(frame()).toContain("line 0");
    expect(frame()).not.toContain("lines above");
    expect(frame()).toContain("▼ 30 lines below");
  });

  it("shows the placeholder only when there are no messages", () => {
    const { frame } = renderArea([], 0, false);

    expect(frame()).toContain("No messages yet. Say something!");
  });

  it("never shows the placeholder while messages exist", () => {
    const { frame } = renderArea(tallRows(), 0, true);

    expect(frame()).not.toContain("No messages yet");
  });
});
