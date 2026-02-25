import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { getLocalIp } from "../utils/network.js";
import {
  BROADCAST_INTERVAL,
  DISCOVERY_PORT,
  ROOM_TIMEOUT,
  type RoomAnnounce,
  type RoomInfo,
} from "./types.js";

/**
 * UDP 브로드캐스트로 방을 광고한다 (방 생성자 전용)
 */
export class RoomBroadcaster extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private roomName: string;
  private port: number;
  private hasPassword: boolean;
  private getUserCount: () => number;

  constructor(roomName: string, port: number, hasPassword: boolean, getUserCount: () => number) {
    super();
    this.roomName = roomName;
    this.port = port;
    this.hasPassword = hasPassword;
    this.getUserCount = getUserCount;
  }

  start(): void {
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", (err) => {
      this.emit("error", err);
    });

    this.socket.bind(() => {
      if (!this.socket) return;
      this.socket.setBroadcast(true);
      this.announce();
      this.timer = setInterval(() => this.announce(), BROADCAST_INTERVAL);
    });
  }

  private announce(): void {
    if (!this.socket) return;

    const localIp = getLocalIp();
    const msg: RoomAnnounce = {
      type: "room-announce",
      name: this.roomName,
      host: localIp,
      port: this.port,
      hasPassword: this.hasPassword,
      userCount: this.getUserCount(),
    };

    const buffer = Buffer.from(JSON.stringify(msg));
    this.socket.send(buffer, 0, buffer.length, DISCOVERY_PORT, "255.255.255.255");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

/**
 * UDP로 네트워크 내 방을 탐색한다 (참여자 전용)
 */
export class RoomDiscovery extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private rooms: Map<string, RoomInfo> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        this.emit("error", err);
        this.socket?.close();
        this.socket = null;
        reject(err);
      });

      this.socket.on("message", (data) => {
        try {
          const msg: RoomAnnounce = JSON.parse(data.toString());
          if (msg.type !== "room-announce") return;

          const key = `${msg.host}:${msg.port}`;
          const room: RoomInfo = {
            name: msg.name,
            host: msg.host,
            port: msg.port,
            hasPassword: msg.hasPassword,
            userCount: msg.userCount,
            lastSeen: Date.now(),
          };

          const isNew = !this.rooms.has(key);
          this.rooms.set(key, room);

          if (isNew) {
            this.emit("roomFound", room);
          }
          this.emit("roomUpdated", room);
        } catch {
          // 잘못된 패킷은 무시한다
        }
      });

      this.socket.bind(DISCOVERY_PORT, () => {
        // 오래된 방 정보를 주기적으로 정리한다
        this.cleanupTimer = setInterval(() => this.cleanupStaleRooms(), ROOM_TIMEOUT);
        resolve();
      });
    });
  }

  private cleanupStaleRooms(): void {
    const now = Date.now();
    for (const [key, room] of this.rooms) {
      if (now - room.lastSeen > ROOM_TIMEOUT) {
        this.rooms.delete(key);
        this.emit("roomLost", room);
      }
    }
  }

  getRooms(): RoomInfo[] {
    return Array.from(this.rooms.values());
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
