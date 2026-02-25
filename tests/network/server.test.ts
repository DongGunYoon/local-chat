import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ChatServer } from "../../src/network/server.js";
import type { ServerMessage } from "../../src/network/types.js";

// --- Helpers ---

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function sendJSON(ws: WebSocket, data: unknown): void {
  ws.send(JSON.stringify(data));
}

function waitForMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

async function waitForMessages(ws: WebSocket, count: number): Promise<ServerMessage[]> {
  const messages: ServerMessage[] = [];
  return new Promise((resolve) => {
    const handler = (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        ws.off("message", handler);
        resolve(messages);
      }
    };
    ws.on("message", handler);
  });
}

// Keep track of servers to clean up
let servers: ChatServer[] = [];

async function createServer(
  roomName: string,
  hostNickname: string,
  password?: string,
): Promise<ChatServer> {
  const server = new ChatServer(roomName, hostNickname, password);
  servers.push(server);
  await server.start();
  return server;
}

afterEach(() => {
  for (const s of servers) {
    s.close();
  }
  servers = [];
});

describe("public room", () => {
  it("assigns a random port", async () => {
    const server = await createServer("room", "host");
    expect(server.getPort()).toBeGreaterThan(0);
  });

  it("returns auth_ok with a 64-char hex sessionKey", async () => {
    const server = await createServer("room", "host");
    const ws = await connectClient(server.getPort());

    const promise = waitForMessage(ws);
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "alice" });
    const msg = await promise;

    expect(msg.type).toBe("auth_ok");
    if (msg.type === "auth_ok") {
      expect(msg.sessionKey).toMatch(/^[0-9a-f]{64}$/);
    }
    ws.close();
  });

  it("broadcasts a system message on join", async () => {
    const server = await createServer("room", "host");
    const ws = await connectClient(server.getPort());

    const promise = waitForMessages(ws, 3); // auth_ok + system + user_list
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "alice" });
    const msgs = await promise;

    const systemMsg = msgs.find(
      (m) => m.type === "system" && "content" in m && m.content.includes("alice joined"),
    );
    expect(systemMsg).toBeDefined();
    ws.close();
  });

  it("broadcasts user_list on join", async () => {
    const server = await createServer("room", "host");
    const ws = await connectClient(server.getPort());

    const promise = waitForMessages(ws, 3);
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "alice" });
    const msgs = await promise;

    const userListMsg = msgs.find((m) => m.type === "user_list");
    expect(userListMsg).toBeDefined();
    if (userListMsg && userListMsg.type === "user_list") {
      expect(userListMsg.users).toContain("host");
      expect(userListMsg.users).toContain("alice");
    }
    ws.close();
  });

  it("resolves duplicate nicknames", async () => {
    const server = await createServer("room", "host");

    const ws1 = await connectClient(server.getPort());
    const p1 = waitForMessages(ws1, 3);
    sendJSON(ws1, { type: "auth", passwordHash: "", nickname: "alice" });
    await p1;

    const ws2 = await connectClient(server.getPort());
    // ws1 receives system + user_list for the second join
    const p1Msgs = waitForMessages(ws1, 2);
    const p2 = waitForMessages(ws2, 3);
    sendJSON(ws2, { type: "auth", passwordHash: "", nickname: "alice" });
    const [msgs1, _msgs2] = await Promise.all([p1Msgs, p2]);

    const userListMsg = msgs1.find((m) => m.type === "user_list");
    expect(userListMsg).toBeDefined();
    if (userListMsg && userListMsg.type === "user_list") {
      expect(userListMsg.users).toContain("alice");
      expect(userListMsg.users).toContain("alice-2");
    }
    ws1.close();
    ws2.close();
  });

  it("resolves nickname collision with host", async () => {
    const server = await createServer("room", "host");
    const ws = await connectClient(server.getPort());

    const promise = waitForMessages(ws, 3);
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "host" });
    const msgs = await promise;

    const userListMsg = msgs.find((m) => m.type === "user_list");
    expect(userListMsg).toBeDefined();
    if (userListMsg && userListMsg.type === "user_list") {
      expect(userListMsg.users).toContain("host");
      expect(userListMsg.users).toContain("host-2");
    }
    ws.close();
  });

  it("broadcasts chat messages", async () => {
    const server = await createServer("room", "host");

    const wsAlice = await connectClient(server.getPort());
    const pAlice = waitForMessages(wsAlice, 3);
    sendJSON(wsAlice, { type: "auth", passwordHash: "", nickname: "alice" });
    await pAlice;

    const wsBob = await connectClient(server.getPort());
    const pBob = waitForMessages(wsBob, 3);
    sendJSON(wsBob, { type: "auth", passwordHash: "", nickname: "bob" });
    await pBob;

    // alice sends a message, bob should receive it
    const bobReceive = waitForMessage(wsBob);
    // alice also receives her own broadcast
    const aliceReceive = waitForMessage(wsAlice);
    sendJSON(wsAlice, { type: "message", payload: "hello bob" });

    const bobMsg = await bobReceive;
    expect(bobMsg.type).toBe("message");
    if (bobMsg.type === "message") {
      expect(bobMsg.nickname).toBe("alice");
      expect(bobMsg.payload).toBe("hello bob");
    }
    await aliceReceive;
    wsAlice.close();
    wsBob.close();
  });

  it("getUserCount includes host", async () => {
    const server = await createServer("room", "host");
    expect(server.getUserCount()).toBe(1);

    const ws = await connectClient(server.getPort());
    const joined = new Promise<void>((resolve) => {
      server.once("userJoined", () => resolve());
    });
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "alice" });
    await joined;

    expect(server.getUserCount()).toBe(2);
    ws.close();
  });

  it("broadcastMessage sends with host nickname", async () => {
    const server = await createServer("room", "host");

    const ws = await connectClient(server.getPort());
    const p = waitForMessages(ws, 3);
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "alice" });
    await p;

    const msgPromise = waitForMessage(ws);
    server.broadcastMessage("hi from host");
    const msg = await msgPromise;

    expect(msg.type).toBe("message");
    if (msg.type === "message") {
      expect(msg.nickname).toBe("host");
      expect(msg.payload).toBe("hi from host");
    }
    ws.close();
  });
});

describe("password room", () => {
  it("rejects wrong password", async () => {
    const server = await createServer("room", "host", "secret");
    const ws = await connectClient(server.getPort());

    const promise = waitForMessage(ws);
    sendJSON(ws, { type: "auth", passwordHash: "wrong-hash", nickname: "alice" });
    const msg = await promise;

    expect(msg.type).toBe("auth_fail");
    ws.close();
  });

  it("accepts correct password", async () => {
    const server = await createServer("room", "host", "secret");
    const ws = await connectClient(server.getPort());

    const { sha256 } = await import("../../src/network/crypto.js");
    const promise = waitForMessage(ws);
    sendJSON(ws, {
      type: "auth",
      passwordHash: sha256("secret"),
      nickname: "alice",
    });
    const msg = await promise;

    expect(msg.type).toBe("auth_ok");
    if (msg.type === "auth_ok") {
      expect(msg.sessionKey).toBe("");
    }
    ws.close();
  });
});

describe("disconnection", () => {
  it("broadcasts system + user_list on leave", async () => {
    const server = await createServer("room", "host");

    const wsAlice = await connectClient(server.getPort());
    const pAlice = waitForMessages(wsAlice, 3);
    sendJSON(wsAlice, { type: "auth", passwordHash: "", nickname: "alice" });
    await pAlice;

    const wsBob = await connectClient(server.getPort());
    // Wait for alice to receive bob's join messages
    const pAliceJoin = waitForMessages(wsAlice, 2);
    const pBob = waitForMessages(wsBob, 3);
    sendJSON(wsBob, { type: "auth", passwordHash: "", nickname: "bob" });
    await Promise.all([pAliceJoin, pBob]);

    // alice leaves — bob should get system + user_list
    const bobLeaveMessages = waitForMessages(wsBob, 2);
    wsAlice.close();
    const msgs = await bobLeaveMessages;

    const systemMsg = msgs.find(
      (m) => m.type === "system" && "content" in m && m.content.includes("alice left"),
    );
    expect(systemMsg).toBeDefined();

    const userListMsg = msgs.find((m) => m.type === "user_list");
    expect(userListMsg).toBeDefined();
    if (userListMsg && userListMsg.type === "user_list") {
      expect(userListMsg.users).not.toContain("alice");
    }
    wsBob.close();
  });

  it("sends room_closed when server closes", async () => {
    const server = await createServer("room", "host");
    const ws = await connectClient(server.getPort());

    const p = waitForMessages(ws, 3);
    sendJSON(ws, { type: "auth", passwordHash: "", nickname: "alice" });
    await p;

    const closedPromise = waitForMessage(ws);
    // Remove from tracked servers since we're closing manually
    servers = servers.filter((s) => s !== server);
    server.close();
    const msg = await closedPromise;

    expect(msg.type).toBe("room_closed");
    if (msg.type === "room_closed") {
      expect(msg.reason).toBe("Host left the room");
    }
    ws.close();
  });
});
