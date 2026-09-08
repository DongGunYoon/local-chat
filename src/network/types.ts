// 메시지 프로토콜 타입 정의

// --- 클라이언트 → 서버 ---

export type AuthMessage = {
  type: "auth";
  passwordHash: string;
  nickname: string;
};

export type ChatMessage = {
  type: "message";
  payload: string; // 암호화된 메시지
};

export type ClientMessage = AuthMessage | ChatMessage;

// --- 서버 → 클라이언트 ---

export type AuthOkMessage = {
  type: "auth_ok";
  sessionKey: string; // 비밀번호 없는 방일 때 세션 키 전달
  nickname: string; // 서버가 확정한 닉네임 (중복 시 suffix 포함)
};

export type AuthFailMessage = {
  type: "auth_fail";
  reason: string;
};

export type BroadcastChatMessage = {
  type: "message";
  nickname: string;
  payload: string; // 암호화된 메시지
  timestamp: number;
};

export type SystemMessage = {
  type: "system";
  content: string;
};

export type UserListMessage = {
  type: "user_list";
  users: string[];
};

export type RoomClosedMessage = {
  type: "room_closed";
  reason: string;
};

export type ServerMessage =
  | AuthOkMessage
  | AuthFailMessage
  | BroadcastChatMessage
  | SystemMessage
  | UserListMessage
  | RoomClosedMessage;

// --- UDP 브로드캐스트 ---

export type RoomAnnounce = {
  type: "room-announce";
  name: string;
  host: string;
  port: number;
  hasPassword: boolean;
  userCount: number;
};

// --- 내부 타입 ---

export type RoomInfo = {
  name: string;
  host: string;
  port: number;
  hasPassword: boolean;
  userCount: number;
  lastSeen: number;
};

export type ChatEntry = {
  id: string;
  type: "message" | "system";
  nickname?: string;
  content: string;
  timestamp: number;
  isMe?: boolean;
};

export const DISCOVERY_PORT = 41568;
export const BROADCAST_INTERVAL = 3000;
export const ROOM_TIMEOUT = 10000; // 방 탐색 시 10초 이상 응답 없으면 제거

// --- UDP 로비 ---

export const LOBBY_PORT = 41569;
export const LOBBY_PRESENCE_INTERVAL = 500;
export const LOBBY_PRESENCE_TIMEOUT = 5000;
// Measured datagram math (lobby-message JSON, 16-cell nickname, AES-GCM + base64 content):
//   800 B plaintext  -> ~1255 B UDP payload  (fits)
//  1000 B plaintext  -> ~1523 B UDP payload  (exceeds the 1472 B IPv4/UDP payload of a 1500-byte MTU)
export const LOBBY_MAX_MESSAGE_BYTES = 800; // UDP MTU 제한: 한글 ~260자, 영문 ~800자

export type LobbyPresenceMessage = {
  type: "lobby-presence";
  nickname: string;
  peerId: string;
};

export type LobbyChatMessage = {
  type: "lobby-message";
  id: string;
  nickname: string;
  content: string;
  timestamp: number;
};

export type LobbyLeaveMessage = {
  type: "lobby-leave";
  peerId: string;
};

export type LobbyMessage = LobbyPresenceMessage | LobbyChatMessage | LobbyLeaveMessage;

// --- Room join ---

export type JoinRoomData = {
  roomName: string;
  host: string;
  port: number;
  password: string;
  nickname: string;
};
