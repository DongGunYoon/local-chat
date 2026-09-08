import { LOBBY_MAX_MESSAGE_BYTES } from "./types.js";

export { LOBBY_MAX_MESSAGE_BYTES };

/** Crash guard only (ws default is 100 MiB). Ordinary messages can never reach this. */
export const WS_MAX_PAYLOAD_BYTES = 1024 * 1024;

/** Layout-cost ceiling for the draft buffer; the only place text is ever truncated (with a notice). */
export const MAX_DRAFT_CHARS = 100_000;

export const LOBBY_WARN_RATIO = 0.7;

const LOBBY_WARN_BYTES = Math.round(LOBBY_WARN_RATIO * LOBBY_MAX_MESSAGE_BYTES); // 560

export type LobbyMeasure = { bytes: number; level: "ok" | "warn" | "over" };

/** bytes = Buffer.byteLength(text, "utf8"); over when > LOBBY_MAX_MESSAGE_BYTES; warn when >= LOBBY_WARN_RATIO * LOBBY_MAX_MESSAGE_BYTES (560). */
export function measureLobby(text: string): LobbyMeasure {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > LOBBY_MAX_MESSAGE_BYTES) return { bytes, level: "over" };
  if (bytes >= LOBBY_WARN_BYTES) return { bytes, level: "warn" };
  return { bytes, level: "ok" };
}
