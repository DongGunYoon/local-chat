import { EventEmitter } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { deriveKey, generateSessionKey, sha256 } from "./crypto.js";
import type {
  BroadcastChatMessage,
  ClientMessage,
  RoomClosedMessage,
  ServerMessage,
  UserListMessage,
} from "./types.js";

type AuthenticatedClient = {
  ws: WebSocket;
  nickname: string;
};

export type ServerEvents = {
  userJoined: (nickname: string, users: string[]) => void;
  userLeft: (nickname: string, users: string[]) => void;
  message: (nickname: string, content: string, timestamp: number) => void;
  error: (error: Error) => void;
  started: (port: number) => void;
};

export class ChatServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, AuthenticatedClient> = new Map();
  private passwordHash: string | null;
  private encryptionKey: Buffer;
  private sessionKey: string;
  private roomName: string;
  private hostNickname: string;
  private port: number = 0;

  constructor(roomName: string, hostNickname: string, password?: string) {
    super();
    this.roomName = roomName;
    this.hostNickname = hostNickname;

    if (password) {
      this.passwordHash = sha256(password);
      this.encryptionKey = deriveKey(password);
      this.sessionKey = "";
    } else {
      this.passwordHash = null;
      this.sessionKey = generateSessionKey();
      this.encryptionKey = deriveKey(this.sessionKey);
    }
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: 0 }, () => {
        const addr = this.wss!.address();
        if (typeof addr === "object" && addr !== null) {
          this.port = addr.port;
          this.emit("started", this.port);
          resolve(this.port);
        } else {
          reject(new Error("Failed to get server address"));
        }
      });

      this.wss.on("connection", (ws) => {
        this.handleConnection(ws);
      });

      this.wss.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    // 인증 타임아웃: 10초 이내 인증하지 않으면 연결 종료
    const authTimeout = setTimeout(() => {
      this.send(ws, { type: "auth_fail", reason: "Authentication timeout" });
      ws.close();
    }, 10000);

    ws.on("message", (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        const client = this.clients.get(ws);

        if (!client) {
          // 미인증 상태 — auth 메시지만 처리
          if (msg.type === "auth") {
            clearTimeout(authTimeout);
            this.handleAuth(ws, msg.passwordHash, msg.nickname);
          }
          return;
        }

        // 인증된 클라이언트의 메시지 처리
        if (msg.type === "message") {
          this.handleChatMessage(client, msg.payload);
        }
      } catch {
        // 잘못된 메시지는 무시한다
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      const client = this.clients.get(ws);
      if (client) {
        this.clients.delete(ws);
        const users = this.getAllUsers();
        this.broadcast({
          type: "system",
          content: `${client.nickname} left the room`,
        });
        this.broadcastUserList();
        this.emit("userLeft", client.nickname, users);
      }
    });

    ws.on("error", () => {
      // 에러 시 close 이벤트가 자동 발생하므로 추가 처리 불필요
    });
  }

  private handleAuth(ws: WebSocket, passwordHash: string, nickname: string): void {
    // 비밀번호 검증
    if (this.passwordHash && this.passwordHash !== passwordHash) {
      this.send(ws, { type: "auth_fail", reason: "Wrong password" });
      ws.close();
      return;
    }

    // 닉네임 중복 처리
    const resolvedNickname = this.resolveNickname(nickname);

    this.clients.set(ws, { ws, nickname: resolvedNickname });

    // 인증 성공 응답 (비밀번호 없는 방이면 세션키 전달)
    this.send(ws, {
      type: "auth_ok",
      sessionKey: this.sessionKey,
      nickname: resolvedNickname,
    });

    // 입장 알림 브로드캐스트
    this.broadcast({
      type: "system",
      content: `${resolvedNickname} joined the room`,
    });
    this.broadcastUserList();

    const users = this.getAllUsers();
    this.emit("userJoined", resolvedNickname, users);
  }

  private handleChatMessage(client: AuthenticatedClient, payload: string): void {
    const timestamp = Date.now();
    const broadcastMsg: BroadcastChatMessage = {
      type: "message",
      nickname: client.nickname,
      payload,
      timestamp,
    };
    this.broadcast(broadcastMsg);
    this.emit("message", client.nickname, payload, timestamp);
  }

  private resolveNickname(nickname: string): string {
    const existing = this.getUsers();
    // 방장 닉네임도 포함
    const allNicknames = [this.hostNickname, ...existing];

    if (!allNicknames.includes(nickname)) {
      return nickname;
    }

    let counter = 2;
    while (allNicknames.includes(`${nickname}-${counter}`)) {
      counter++;
    }
    return `${nickname}-${counter}`;
  }

  private getUsers(): string[] {
    return Array.from(this.clients.values()).map((c) => c.nickname);
  }

  getAllUsers(): string[] {
    return [this.hostNickname, ...this.getUsers()];
  }

  getUserCount(): number {
    return this.clients.size + 1; // +1 방장
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private broadcastUserList(): void {
    const msg: UserListMessage = {
      type: "user_list",
      users: this.getAllUsers(),
    };
    this.broadcast(msg);
  }

  /**
   * 방장으로서 암호화된 메시지를 전체 브로드캐스트한다
   */
  broadcastMessage(payload: string): void {
    const timestamp = Date.now();
    const msg: BroadcastChatMessage = {
      type: "message",
      nickname: this.hostNickname,
      payload,
      timestamp,
    };
    this.broadcast(msg);
    this.emit("message", this.hostNickname, payload, timestamp);
  }

  getEncryptionKey(): Buffer {
    return this.encryptionKey;
  }

  getPort(): number {
    return this.port;
  }

  getRoomName(): string {
    return this.roomName;
  }

  hasPassword(): boolean {
    return this.passwordHash !== null;
  }

  close(): void {
    // 방 종료 알림
    const msg: RoomClosedMessage = {
      type: "room_closed",
      reason: "Host left the room",
    };
    this.broadcast(msg);

    // 모든 연결 종료
    for (const [ws] of this.clients) {
      ws.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
