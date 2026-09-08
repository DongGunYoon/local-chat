import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { deriveKey, sha256 } from "./crypto.js";
import type { ChatMessage, ServerMessage } from "./types.js";

export type ClientEvents = {
  connected: () => void;
  authOk: (sessionKey: string, nickname: string) => void;
  authFail: (reason: string) => void;
  message: (nickname: string, payload: string, timestamp: number) => void;
  system: (content: string) => void;
  userList: (users: string[]) => void;
  roomClosed: (reason: string) => void;
  disconnected: () => void;
  error: (error: Error) => void;
};

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_INTERVAL = 5000;

export class ChatClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private host: string;
  private port: number;
  private nickname: string;
  private password: string;
  private encryptionKey: Buffer | null = null;
  private reconnectAttempts: number = 0;
  private shouldReconnect: boolean = true;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(host: string, port: number, nickname: string, password: string = "") {
    super();
    this.host = host;
    this.port = port;
    this.nickname = nickname;
    this.password = password;

    if (password) {
      this.encryptionKey = deriveKey(password);
    }
  }

  connect(): void {
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect(): void {
    const url = `ws://${this.host}:${this.port}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.emit("connected");

      // 인증 메시지 전송
      this.ws!.send(
        JSON.stringify({
          type: "auth",
          passwordHash: this.password ? sha256(this.password) : "",
          nickname: this.nickname,
        }),
      );
    });

    this.ws.on("message", (data) => {
      try {
        const msg: ServerMessage = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // 잘못된 메시지는 무시한다
      }
    });

    this.ws.on("close", () => {
      this.emit("disconnected");
      this.attemptReconnect();
    });

    this.ws.on("error", (err) => {
      this.emit("error", err);
    });
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "auth_ok":
        // 비밀번호 없는 방이면 세션 키로 암호화 키를 파생한다
        if (!this.encryptionKey && msg.sessionKey) {
          this.encryptionKey = deriveKey(msg.sessionKey);
        }
        this.nickname = msg.nickname;
        this.emit("authOk", msg.sessionKey, msg.nickname);
        break;

      case "auth_fail":
        this.shouldReconnect = false;
        this.emit("authFail", msg.reason);
        break;

      case "message":
        this.emit("message", msg.nickname, msg.payload, msg.timestamp);
        break;

      case "system":
        this.emit("system", msg.content);
        break;

      case "user_list":
        this.emit("userList", msg.users);
        break;

      case "room_closed":
        this.shouldReconnect = false;
        this.emit("roomClosed", msg.reason);
        break;
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit("error", new Error("Failed to reconnect after maximum attempts"));
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, RECONNECT_INTERVAL);
  }

  /** Returns false when the socket is not open, so the caller can keep the draft. */
  sendMessage(payload: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    const msg: ChatMessage = {
      type: "message",
      payload,
    };
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  getEncryptionKey(): Buffer | null {
    return this.encryptionKey;
  }

  getNickname(): string {
    return this.nickname;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
