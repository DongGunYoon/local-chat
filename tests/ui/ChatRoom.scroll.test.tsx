import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyPeer } from "../../src/network/lobby.js";
import { ChatRoom } from "../../src/ui/ChatRoom.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips SGR colour sequences
const SGR = /\u001B\[[0-9;]*m/g;
const ESC = "\u001B";
const SHIFT_UP = `${ESC}[1;2A`;
const SHIFT_DOWN = `${ESC}[1;2B`;
const PAGE_UP = `${ESC}[5~`;

/** Ink flushes effects after the first commit, so the input subscription lands late. */
const MOUNT_MS = 20;
/** Longer than keymap's FAST_RETURN_MS, so an Enter after a raw chunk still sends. */
const AFTER_CHUNK_MS = 60;

/** The two system messages ChatRoom posts on mount, one row each. */
const MOUNT_ROWS = 2;
const MESSAGE_COUNT = 30;
/** rows(24) - status(1) - header(3) - input box(3) */
const AREA_HEIGHT = 17;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const terminal = { columns: process.stdout.columns, rows: process.stdout.rows };

function setTerminal(columns: number, rows: number): void {
  Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true });
  Object.defineProperty(process.stdout, "rows", { value: rows, configurable: true });
}

beforeEach(() => {
  setTerminal(80, 24);
});

afterEach(() => {
  cleanup();
  setTerminal(terminal.columns, terminal.rows);
});

async function renderRoom() {
  const sendChatMessage = vi.fn(() => true);
  const peer = Object.assign(new EventEmitter(), {
    getNickname: () => "me",
    getUsers: () => ["me"],
    getPeerId: () => "p",
    sendChatMessage,
  });

  const app = render(
    <ChatRoom
      roomType="lobby"
      roomName="Lobby"
      nickname="me"
      lobbyPeer={peer as unknown as LobbyPeer}
      onExit={vi.fn()}
      onRequestRooms={vi.fn()}
    />,
  );
  await wait(MOUNT_MS);

  const frame = (): string => (app.lastFrame() ?? "").replace(SGR, "");
  const messageLines = (): string[] =>
    frame()
      .split("\n")
      .filter((line) => /msg-\d+-end/.test(line));

  const type = async (chunk: string, ms = AFTER_CHUNK_MS): Promise<void> => {
    app.stdin.write(chunk);
    await wait(ms);
  };

  const receive = async (content: string): Promise<void> => {
    peer.emit("message", "bob", content, Date.now());
    await wait(10);
  };

  for (let i = 0; i < MESSAGE_COUNT; i++) {
    peer.emit("message", "bob", `msg-${i}-end`, Date.now());
  }
  await wait(20);

  return { ...app, frame, messageLines, type, receive, sendChatMessage };
}

describe("ChatRoom row scrolling", () => {
  it("keeps the reader's place when a message arrives while scrolled up", async () => {
    const room = await renderRoom();
    expect(room.frame()).toContain("msg-29-end");

    await room.type(SHIFT_UP);
    await room.type(SHIFT_UP);
    expect(room.frame()).toContain("▼ 2 lines below");
    expect(room.frame()).not.toContain("msg-29-end");

    const before = room.messageLines();
    expect(before.length).toBeGreaterThan(0);

    await room.receive("late-arrival-end");

    expect(room.frame()).toContain("▼ 3 lines below");
    expect(room.frame()).not.toContain("late-arrival");
    expect(room.messageLines()).toEqual(before);
  });

  it("returns to the newest rows on Shift+Down", async () => {
    const room = await renderRoom();

    await room.type(SHIFT_UP);
    await room.type(SHIFT_UP);
    await room.type(SHIFT_DOWN);
    expect(room.frame()).toContain("▼ 1 lines below");

    await room.type(SHIFT_DOWN);
    expect(room.frame()).not.toContain("lines below");
    expect(room.frame()).toContain("msg-29-end");
  });

  it("pages up to the very first row and no further", async () => {
    const room = await renderRoom();
    const totalRows = MOUNT_ROWS + MESSAGE_COUNT;

    await room.type(PAGE_UP);
    // The clamp stops at totalRows - height + 1, the offset that puts row 0 on screen.
    expect(room.frame()).toContain(`▼ ${totalRows - AREA_HEIGHT + 1} lines below`);
    expect(room.frame()).toContain("Welcome to the lobby!");
    expect(room.frame()).not.toContain("lines above");

    await room.type(PAGE_UP);
    expect(room.frame()).toContain(`▼ ${totalRows - AREA_HEIGHT + 1} lines below`);
  });

  it("snaps back to the newest rows when I send a message", async () => {
    const room = await renderRoom();

    await room.type(SHIFT_UP);
    await room.type(SHIFT_UP);
    expect(room.frame()).toContain("▼ 2 lines below");

    await room.type("hi");
    await room.type("\r");

    expect(room.sendChatMessage).toHaveBeenCalledWith("hi");
    expect(room.frame()).not.toContain("lines below");
  });

  it("snaps to the newest rows when a local notice is posted while scrolled up", async () => {
    const room = await renderRoom();

    await room.type(SHIFT_UP);
    await room.type(SHIFT_UP);
    expect(room.frame()).toContain("▼ 2 lines below");

    await room.type("a".repeat(900));
    await room.type("\r");

    expect(room.sendChatMessage).not.toHaveBeenCalled();
    expect(room.frame()).toContain("Too long for the lobby");
    expect(room.frame()).not.toContain("lines below");
    expect(room.frame()).toContain("❯ aaa");
  });
});
