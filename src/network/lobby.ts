import crypto from "node:crypto";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { sanitizeNickname } from "../utils/sanitize.js";
import { deobfuscate, obfuscate } from "./crypto.js";
import {
  LOBBY_PORT,
  LOBBY_PRESENCE_INTERVAL,
  LOBBY_PRESENCE_TIMEOUT,
  type LobbyChatMessage,
  type LobbyLeaveMessage,
  type LobbyMessage,
  type LobbyPresenceMessage,
} from "./types.js";

type PeerInfo = {
  nickname: string;
  lastSeen: number;
};

export class LobbyPeer extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private nickname: string;
  private peerId: string;
  private users: Map<string, PeerInfo> = new Map();
  private seenMessageIds: Set<string> = new Set();
  private presenceTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private messageCounter = 0;
  private active = false;

  constructor(nickname: string) {
    super();
    this.nickname = nickname;
    this.peerId = crypto.randomUUID();
  }

  startListening(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        // EventEmitter throws on an "error" event without a listener — never let that kill the process
        if (this.listenerCount("error") > 0) {
          this.emit("error", err);
        }
        reject(err);
      });

      this.socket.on("message", (data) => {
        this.handleMessage(data);
      });

      this.socket.bind(LOBBY_PORT, () => {
        if (!this.socket) return;
        this.socket.setBroadcast(true);

        this.cleanupTimer = setInterval(() => this.cleanupStaleUsers(), LOBBY_PRESENCE_INTERVAL);
        resolve();
      });
    });
  }

  activate(): void {
    if (this.active) return;
    this.active = true;

    this.sendPresence();
    this.presenceTimer = setInterval(() => this.sendPresence(), LOBBY_PRESENCE_INTERVAL);
  }

  /** Returns false when the peer is not running, so the caller can keep the draft. */
  sendChatMessage(content: string): boolean {
    if (!this.socket || !this.active) return false;

    this.messageCounter++;
    const msg: LobbyChatMessage = {
      type: "lobby-message",
      id: `${this.peerId}-${this.messageCounter}`,
      nickname: this.nickname,
      content: obfuscate(content),
      timestamp: Date.now(),
    };

    this.seenMessageIds.add(msg.id);
    this.trimSeenIds();

    const buffer = Buffer.from(JSON.stringify(msg));
    this.socket.send(buffer, 0, buffer.length, LOBBY_PORT, "255.255.255.255");
    return true;
  }

  getNickname(): string {
    return this.nickname;
  }

  getPeerId(): string {
    return this.peerId;
  }

  getUsers(): string[] {
    const others = Array.from(this.users.values()).map((u) => u.nickname);
    if (this.active) {
      return [this.nickname, ...others];
    }
    return others;
  }

  stop(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const wasActive = this.active;
    const peerId = this.peerId;

    // Close main socket synchronously
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore close errors
      }
      this.socket = null;
    }
    this.active = false;
    this.users.clear();
    this.seenMessageIds.clear();

    // Send leave notification from a temporary socket (fire-and-forget)
    if (wasActive) {
      try {
        const tmp = dgram.createSocket({ type: "udp4", reuseAddr: true });
        tmp.bind(0, () => {
          tmp.setBroadcast(true);
          const msg: LobbyLeaveMessage = { type: "lobby-leave", peerId };
          const buffer = Buffer.from(JSON.stringify(msg));
          tmp.send(buffer, 0, buffer.length, LOBBY_PORT, "255.255.255.255", () => {
            try {
              tmp.close();
            } catch {
              /* ignore */
            }
          });
        });
      } catch {
        // ignore errors during shutdown
      }
    }
  }

  private sendPresence(): void {
    if (!this.socket) return;

    const msg: LobbyPresenceMessage = {
      type: "lobby-presence",
      nickname: this.nickname,
      peerId: this.peerId,
    };

    const buffer = Buffer.from(JSON.stringify(msg));
    this.socket.send(buffer, 0, buffer.length, LOBBY_PORT, "255.255.255.255");
  }

  private handleMessage(data: Buffer): void {
    try {
      // The UDP lobby is unauthenticated: type-check every field before dispatching
      const raw: unknown = JSON.parse(data.toString());
      const msg = this.parseLobbyMessage(raw);
      if (!msg) return;

      if (msg.type === "lobby-presence") {
        this.handlePresence(msg);
      } else if (msg.type === "lobby-message") {
        if (!this.active) return;
        this.handleChatMessage(msg);
      } else if (msg.type === "lobby-leave") {
        this.handleLeave(msg);
      }
    } catch {
      // ignore malformed packets
    }
  }

  /** Validate an untrusted datagram; returns null for anything malformed. */
  private parseLobbyMessage(raw: unknown): LobbyMessage | null {
    if (typeof raw !== "object" || raw === null) return null;
    const msg = raw as Record<string, unknown>;

    if (msg.type === "lobby-presence") {
      if (typeof msg.peerId !== "string") return null;
      const nickname = sanitizeNickname(msg.nickname);
      if (nickname === null) return null;
      return { type: "lobby-presence", nickname, peerId: msg.peerId };
    }

    if (msg.type === "lobby-message") {
      if (typeof msg.id !== "string" || typeof msg.content !== "string") return null;
      const nickname = sanitizeNickname(msg.nickname);
      if (nickname === null) return null;
      return {
        type: "lobby-message",
        id: msg.id,
        nickname,
        content: msg.content,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      };
    }

    if (msg.type === "lobby-leave") {
      if (typeof msg.peerId !== "string") return null;
      return { type: "lobby-leave", peerId: msg.peerId };
    }

    return null;
  }

  private handlePresence(msg: LobbyPresenceMessage): void {
    if (msg.peerId === this.peerId) return;

    const existing = this.users.get(msg.peerId);
    const isNew = !existing;

    this.users.set(msg.peerId, {
      nickname: msg.nickname,
      lastSeen: Date.now(),
    });

    if (isNew) {
      if (this.active) {
        this.sendPresence();
      }
      this.emit("userJoined", msg.nickname);
      this.emit("userList", this.getUsers());
    } else if (existing && existing.nickname !== msg.nickname) {
      this.emit("userList", this.getUsers());
    }
  }

  private handleLeave(msg: LobbyLeaveMessage): void {
    if (msg.peerId === this.peerId) return;
    const info = this.users.get(msg.peerId);
    if (info) {
      this.users.delete(msg.peerId);
      this.emit("userLeft", info.nickname);
      this.emit("userList", this.getUsers());
    }
  }

  private handleChatMessage(msg: LobbyChatMessage): void {
    if (this.seenMessageIds.has(msg.id)) return;

    // ignore echo from self
    if (msg.id.startsWith(this.peerId)) return;

    this.seenMessageIds.add(msg.id);
    this.trimSeenIds();

    let content: string;
    try {
      content = deobfuscate(msg.content);
    } catch {
      // Fallback to raw content for backward compatibility
      content = msg.content;
    }

    this.emit("message", msg.nickname, content, msg.timestamp);
  }

  private cleanupStaleUsers(): void {
    const now = Date.now();
    for (const [peerId, info] of this.users) {
      if (now - info.lastSeen > LOBBY_PRESENCE_TIMEOUT) {
        this.users.delete(peerId);
        this.emit("userLeft", info.nickname);
        this.emit("userList", this.getUsers());
      }
    }
  }

  private trimSeenIds(): void {
    if (this.seenMessageIds.size > 1000) {
      const ids = Array.from(this.seenMessageIds);
      this.seenMessageIds = new Set(ids.slice(ids.length - 500));
    }
  }
}
