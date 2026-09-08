import { describe, expect, it } from "vitest";
import { obfuscate } from "../../src/network/crypto.js";
import {
  LOBBY_MAX_MESSAGE_BYTES,
  LOBBY_WARN_RATIO,
  MAX_DRAFT_CHARS,
  measureLobby,
  WS_MAX_PAYLOAD_BYTES,
} from "../../src/network/limits.js";
import type { LobbyChatMessage } from "../../src/network/types.js";

// IPv4/UDP payload that fits in a single 1500-byte MTU datagram
const MTU_PAYLOAD_BYTES = 1472;

describe("limit constants", () => {
  it("re-exports the lobby datagram cap", () => {
    expect(LOBBY_MAX_MESSAGE_BYTES).toBe(800);
  });

  it("exposes the crash-guard ws payload cap", () => {
    expect(WS_MAX_PAYLOAD_BYTES).toBe(1024 * 1024);
  });

  it("exposes the draft layout ceiling", () => {
    expect(MAX_DRAFT_CHARS).toBe(100_000);
  });

  it("exposes the lobby warn ratio", () => {
    expect(LOBBY_WARN_RATIO).toBe(0.7);
  });
});

describe("measureLobby", () => {
  it("reports ok just below the warn threshold", () => {
    const m = measureLobby("a".repeat(559));
    expect(m).toEqual({ bytes: 559, level: "ok" });
  });

  it("reports warn at the warn threshold", () => {
    const m = measureLobby("a".repeat(560));
    expect(m).toEqual({ bytes: 560, level: "warn" });
  });

  it("reports warn at exactly the cap", () => {
    const m = measureLobby("a".repeat(800));
    expect(m).toEqual({ bytes: 800, level: "warn" });
  });

  it("reports over one byte past the cap", () => {
    const m = measureLobby("a".repeat(801));
    expect(m).toEqual({ bytes: 801, level: "over" });
  });

  it("measures UTF-8 bytes, not characters", () => {
    const korean = "가".repeat(300); // 3 bytes per syllable
    const m = measureLobby(korean);
    expect(m.bytes).toBe(900);
    expect(m.level).toBe("over");
  });

  it("reports ok for an empty draft", () => {
    expect(measureLobby("")).toEqual({ bytes: 0, level: "ok" });
  });
});

describe("lobby datagram size", () => {
  it("keeps a max-size chat message inside a single 1500-byte MTU datagram", () => {
    const content = "a".repeat(LOBBY_MAX_MESSAGE_BYTES);
    const msg: LobbyChatMessage = {
      type: "lobby-message",
      id: `${crypto.randomUUID()}-1`,
      nickname: "가나다라마바사아", // 8 syllables = the 16-cell nickname budget
      content: obfuscate(content),
      timestamp: Date.now(),
    };

    const json = JSON.stringify(msg);
    expect(Buffer.byteLength(json, "utf8")).toBeLessThanOrEqual(MTU_PAYLOAD_BYTES);
  });
});
