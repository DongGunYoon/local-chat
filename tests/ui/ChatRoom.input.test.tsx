import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "../../src/network/client.js";
import type { LobbyPeer } from "../../src/network/lobby.js";
import { ChatRoom } from "../../src/ui/ChatRoom.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips SGR colour sequences
const SGR = /\u001B\[[0-9;]*m/g;
const ESC = "\u001B";
const BRACKETED_PASTE = `${ESC}[200~x\r\ny${ESC}[201~`;

/** Longer than keymap's FAST_RETURN_MS, so an Enter after a raw chunk still sends. */
const AFTER_CHUNK_MS = 60;
/** Shorter than the paste detector's 50 ms partial-marker window. */
const WITHIN_PASTE_MS = 5;
/** Ink flushes effects after the first commit, so the input subscription lands late. */
const MOUNT_MS = 20;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type RenderedApp = ReturnType<typeof render>;

/** Keyboard driver and frame readers shared by every harness below. */
async function driveApp(app: RenderedApp) {
  const type = async (chunk: string, ms = AFTER_CHUNK_MS): Promise<void> => {
    app.stdin.write(chunk);
    await wait(ms);
  };
  await wait(MOUNT_MS);

  const frame = (): string => (app.lastFrame() ?? "").replace(SGR, "");
  /** Lines of the bordered input box, without borders or padding. */
  const draftRows = (): string[] =>
    frame()
      .split("\n")
      .filter((line) => /^\u2502 (\u276F | {2})/.test(line))
      .map((line) => line.slice(2, -2).trimEnd());

  return { type, frame, draftRows };
}

async function renderRoom(options: { sendResult?: boolean } = {}) {
  const sendChatMessage = vi.fn(() => options.sendResult ?? true);
  const peer = Object.assign(new EventEmitter(), {
    getNickname: () => "me",
    getUsers: () => ["me"],
    getPeerId: () => "p",
    sendChatMessage,
  });
  const onExit = vi.fn();
  const onRequestRooms = vi.fn();

  const app = render(
    <ChatRoom
      roomType="lobby"
      roomName="Lobby"
      nickname="me"
      lobbyPeer={peer as unknown as LobbyPeer}
      onExit={onExit}
      onRequestRooms={onRequestRooms}
    />,
  );

  return { ...app, sendChatMessage, onExit, onRequestRooms, ...(await driveApp(app)) };
}

/** A private room joined as a client, where the socket can be closed mid-session. */
async function renderPrivateClientRoom(options: { sendResult?: boolean } = {}) {
  const sendMessage = vi.fn(() => options.sendResult ?? true);
  const client = Object.assign(new EventEmitter(), {
    getEncryptionKey: () => Buffer.alloc(32, 7),
    getNickname: () => "me",
    sendMessage,
    disconnect: vi.fn(),
  });
  const onExit = vi.fn();
  const onRequestRooms = vi.fn();

  const app = render(
    <ChatRoom
      roomType="private"
      roomName="Room"
      nickname="me"
      mode="client"
      client={client as unknown as ChatClient}
      onExit={onExit}
      onRequestRooms={onRequestRooms}
    />,
  );

  return { ...app, sendMessage, onExit, onRequestRooms, ...(await driveApp(app)) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatRoom input", () => {
  it("shows typed characters in the draft", async () => {
    const app = await renderRoom();

    for (const char of ["a", "b", "c"]) {
      await app.type(char, WITHIN_PASTE_MS);
    }

    expect(app.draftRows()).toEqual(["\u276F abc"]);
    app.unmount();
  });

  it("keeps a Ctrl+J newline in the draft as a second row", async () => {
    const app = await renderRoom();

    for (const char of ["a", "b", "c", "\n", "d"]) {
      await app.type(char, WITHIN_PASTE_MS);
    }

    expect(app.draftRows()).toEqual(["\u276F abc", "  d"]);
    app.unmount();
  });

  it("sends the whole multiline draft on Enter and clears it", async () => {
    const app = await renderRoom();

    for (const char of ["a", "b", "c", "\n", "d"]) {
      await app.type(char, WITHIN_PASTE_MS);
    }
    await app.type("\r");

    expect(app.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(app.sendChatMessage).toHaveBeenCalledWith("abc\nd");
    expect(app.frame()).toContain("Type a message");
    app.unmount();
  });

  it("sends every character when a key and Enter arrive in the same tick", async () => {
    const app = await renderRoom();

    for (const char of ["a", "b", "c"]) {
      await app.type(char, WITHIN_PASTE_MS);
    }
    // Ink drains every pending chunk before React re-renders, so the handler for "\r"
    // still sees the draft the render before "d" produced.
    app.stdin.write("d");
    app.stdin.write("\r");
    await wait(AFTER_CHUNK_MS);

    expect(app.sendChatMessage).toHaveBeenCalledWith("abcd");
    app.unmount();
  });

  it("inserts a bracketed paste as text instead of sending it", async () => {
    const app = await renderRoom();

    await app.type(BRACKETED_PASTE);

    expect(app.sendChatMessage).not.toHaveBeenCalled();
    expect(app.draftRows()).toEqual(["\u276F x", "  y"]);
    app.unmount();
  });

  // Offsets 1 and 2 would leave a lone ESC or a bare CSI introducer, which the detector
  // deliberately refuses to hold back (tests/input/pasteDetector.test.ts:108-112).
  it("reassembles a bracketed paste split across two chunks", async () => {
    for (let offset = 3; offset < BRACKETED_PASTE.length; offset++) {
      const app = await renderRoom();

      await app.type(BRACKETED_PASTE.slice(0, offset), WITHIN_PASTE_MS);
      await app.type(BRACKETED_PASTE.slice(offset), WITHIN_PASTE_MS);

      expect(app.sendChatMessage, `offset ${offset}`).not.toHaveBeenCalled();
      expect(app.draftRows(), `offset ${offset}`).toEqual(["\u276F x", "  y"]);
      app.unmount();
    }
  });

  it("refuses an over-long lobby message and keeps the draft", async () => {
    const app = await renderRoom();

    await app.type("a".repeat(900));
    await app.type("\r");

    expect(app.sendChatMessage).not.toHaveBeenCalled();
    expect(app.frame()).toContain("Too long for the lobby (900/800 B)");
    expect(app.draftRows()[0]).toContain("\u276F aaaa");
    app.unmount();
  });

  it("reports an unknown command and keeps the draft", async () => {
    const app = await renderRoom();

    await app.type("/usr/local/bin");
    await app.type("\r");

    expect(app.sendChatMessage).not.toHaveBeenCalled();
    expect(app.frame()).toContain("Unknown command: /usr/local/bin");
    expect(app.draftRows()).toEqual(["\u276F /usr/local/bin"]);
    app.unmount();
  });

  it("sends //x as literal /x", async () => {
    const app = await renderRoom();

    await app.type("//x");
    await app.type("\r");

    expect(app.sendChatMessage).toHaveBeenCalledWith("/x");
    app.unmount();
  });

  it("sends a multiline draft that starts with a slash as text", async () => {
    const app = await renderRoom();

    await app.type("/a");
    await app.type("\n", WITHIN_PASTE_MS);
    await app.type("b", WITHIN_PASTE_MS);
    await app.type("\r");

    expect(app.sendChatMessage).toHaveBeenCalledWith("/a\nb");
    app.unmount();
  });

  it("keeps the draft across boss mode", async () => {
    const app = await renderRoom();

    await app.type("h", WITHIN_PASTE_MS);
    await app.type("i", WITHIN_PASTE_MS);
    await app.type("\t", WITHIN_PASTE_MS);
    expect(app.draftRows()).toEqual([]);

    await app.type("z", WITHIN_PASTE_MS);

    expect(app.draftRows()).toEqual(["\u276F hi"]);
    app.unmount();
  });

  it("browses rooms after two Esc presses", async () => {
    const app = await renderRoom();

    await app.type(ESC, WITHIN_PASTE_MS);
    expect(app.onRequestRooms).not.toHaveBeenCalled();
    await app.type(ESC, WITHIN_PASTE_MS);

    expect(app.onRequestRooms).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it("browses rooms when both Esc bytes arrive in one chunk", async () => {
    const app = await renderRoom();

    await app.type(`${ESC}${ESC}`, WITHIN_PASTE_MS);

    expect(app.onRequestRooms).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it("keeps the draft when the lobby socket is down", async () => {
    const app = await renderRoom({ sendResult: false });

    await app.type("h", WITHIN_PASTE_MS);
    await app.type("i", WITHIN_PASTE_MS);
    await app.type("\r");

    expect(app.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(app.frame()).toContain("Not delivered");
    expect(app.draftRows()).toEqual(["\u276F hi"]);
    // Nothing left the machine, so there is no local echo either: "hi" exists
    // only inside the input box.
    const outsideDraft = app
      .frame()
      .split("\n")
      .filter((line) => !/^\u2502 (\u276F | {2})/.test(line))
      .join("\n");
    expect(outsideDraft).not.toContain("hi");
    app.unmount();
  });

  it("exits on Ctrl+C", async () => {
    const app = await renderRoom();

    await app.type("\u0003", WITHIN_PASTE_MS);

    expect(app.onExit).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});

describe("ChatRoom private client delivery", () => {
  it("sends and clears the draft while the socket is open", async () => {
    const app = await renderPrivateClientRoom();

    await app.type("h", WITHIN_PASTE_MS);
    await app.type("i", WITHIN_PASTE_MS);
    await app.type("\r");

    expect(app.sendMessage).toHaveBeenCalledTimes(1);
    expect(app.frame()).not.toContain("Not delivered");
    expect(app.frame()).toContain("Type a message");
    app.unmount();
  });

  it("keeps the draft and warns when the socket is not open", async () => {
    const app = await renderPrivateClientRoom({ sendResult: false });

    await app.type("h", WITHIN_PASTE_MS);
    await app.type("i", WITHIN_PASTE_MS);
    await app.type("\r");

    expect(app.sendMessage).toHaveBeenCalledTimes(1);
    expect(app.frame()).toContain("Not delivered");
    expect(app.draftRows()).toEqual(["\u276F hi"]);
    app.unmount();
  });
});
