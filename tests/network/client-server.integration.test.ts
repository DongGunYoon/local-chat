import type { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { ChatClient } from "../../src/network/client.js";
import { decrypt, encrypt } from "../../src/network/crypto.js";
import { ChatServer } from "../../src/network/server.js";

// --- Helpers ---

function waitForEvent(emitter: EventEmitter, event: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    emitter.once(event, (...args: unknown[]) => resolve(args));
  });
}

let servers: ChatServer[] = [];
let clients: ChatClient[] = [];

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

function createClient(port: number, nickname: string, password?: string): ChatClient {
  const client = new ChatClient("127.0.0.1", port, nickname, password || "");
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const c of clients) {
    c.disconnect();
  }
  clients = [];
  for (const s of servers) {
    s.close();
  }
  servers = [];
});

describe("public room", () => {
  it("client authenticates and receives sessionKey", async () => {
    const server = await createServer("room", "host");
    const client = createClient(server.getPort(), "alice");

    const authPromise = waitForEvent(client, "authOk");
    client.connect();
    const [sessionKey] = await authPromise;

    expect(sessionKey).toMatch(/^[0-9a-f]{64}$/);
    expect(client.getEncryptionKey()).not.toBeNull();
  });

  it("exchanges E2E encrypted messages between clients", async () => {
    const server = await createServer("room", "host");

    const alice = createClient(server.getPort(), "alice");
    const authAlice = waitForEvent(alice, "authOk");
    alice.connect();
    await authAlice;

    const bob = createClient(server.getPort(), "bob");
    const authBob = waitForEvent(bob, "authOk");
    bob.connect();
    await authBob;

    const aliceKey = alice.getEncryptionKey()!;
    const bobKey = bob.getEncryptionKey()!;

    // Keys should be the same (derived from same session key)
    expect(aliceKey.equals(bobKey)).toBe(true);

    // alice sends encrypted message
    const plaintext = "Hello, Bob!";
    const ciphertext = encrypt(plaintext, aliceKey);

    const bobReceive = waitForEvent(bob, "message");
    expect(alice.sendMessage(ciphertext)).toBe(true);
    const [nickname, payload] = bobReceive.then ? await bobReceive : await bobReceive;

    // bob decrypts
    expect(nickname).toBe("alice");
    expect(decrypt(payload as string, bobKey)).toBe(plaintext);
  });

  it("host broadcasts encrypted messages to clients", async () => {
    const server = await createServer("room", "host");
    const serverKey = server.getEncryptionKey();

    const alice = createClient(server.getPort(), "alice");
    const authAlice = waitForEvent(alice, "authOk");
    alice.connect();
    await authAlice;

    const aliceKey = alice.getEncryptionKey()!;
    expect(aliceKey.equals(serverKey)).toBe(true);

    // Host sends an encrypted message
    const plaintext = "Hello from host!";
    const ciphertext = encrypt(plaintext, serverKey);

    const aliceReceive = waitForEvent(alice, "message");
    server.broadcastMessage(ciphertext);
    const [nickname, payload] = await aliceReceive;

    expect(nickname).toBe("host");
    expect(decrypt(payload as string, aliceKey)).toBe(plaintext);
  });
});

describe("password room", () => {
  it("authenticates with correct password and shares encryption key", async () => {
    const server = await createServer("room", "host", "secret123");
    const client = createClient(server.getPort(), "alice", "secret123");

    const authPromise = waitForEvent(client, "authOk");
    client.connect();
    const [sessionKey] = await authPromise;

    // Password rooms return empty sessionKey
    expect(sessionKey).toBe("");

    // Both should derive the same key from the password
    const clientKey = client.getEncryptionKey()!;
    const serverKey = server.getEncryptionKey();
    expect(clientKey.equals(serverKey)).toBe(true);
  });

  it("rejects wrong password with authFail", async () => {
    const server = await createServer("room", "host", "secret123");
    const client = createClient(server.getPort(), "alice", "wrong");

    const failPromise = waitForEvent(client, "authFail");
    client.connect();
    const [reason] = await failPromise;

    expect(reason).toBe("Wrong password");
  });
});

describe("room lifecycle", () => {
  it("emits roomClosed when server closes", async () => {
    const server = await createServer("room", "host");
    const client = createClient(server.getPort(), "alice");

    const authPromise = waitForEvent(client, "authOk");
    client.connect();
    await authPromise;

    const closedPromise = waitForEvent(client, "roomClosed");
    // Remove from tracked list since we close manually
    servers = servers.filter((s) => s !== server);
    server.close();
    const [reason] = await closedPromise;

    expect(reason).toBe("Host left the room");
  });

  it("updates userList when a second client joins", async () => {
    const server = await createServer("room", "host");

    const alice = createClient(server.getPort(), "alice");
    const authAlice = waitForEvent(alice, "authOk");
    alice.connect();
    await authAlice;

    // Wait for a userList from alice that includes bob (may take multiple events)
    const aliceUserListWithBob = new Promise<string[]>((resolve) => {
      alice.on("userList", (users: string[]) => {
        if (users.includes("bob")) resolve(users);
      });
    });

    const bob = createClient(server.getPort(), "bob");
    const authBob = waitForEvent(bob, "authOk");
    bob.connect();
    await authBob;

    const users = await aliceUserListWithBob;
    expect(users).toContain("host");
    expect(users).toContain("alice");
    expect(users).toContain("bob");
  });
});
