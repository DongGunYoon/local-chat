import dgram from "node:dgram";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyPeer } from "../../src/network/lobby.js";
import { LOBBY_PORT, type LobbyMessage } from "../../src/network/types.js";

// Helper to wait for an event with generous timeout for UDP
function waitForEvent(emitter: LobbyPeer, event: string, timeout = 5000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
    emitter.once(event, (...args: unknown[]) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll until condition is met
async function waitUntil(fn: () => boolean, timeout = 5000, interval = 100): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return;
    await delay(interval);
  }
  throw new Error("waitUntil timed out");
}

describe("LobbyPeer", () => {
  const peers: LobbyPeer[] = [];

  afterEach(async () => {
    for (const peer of peers) {
      peer.stop();
    }
    peers.length = 0;
    // Drain stale UDP messages between tests
    await delay(100);
  });

  function createPeer(nickname: string): LobbyPeer {
    const peer = new LobbyPeer(nickname);
    peers.push(peer);
    return peer;
  }

  it("should generate a unique peerId", () => {
    const peer1 = createPeer("alice");
    const peer2 = createPeer("bob");
    expect(peer1.getPeerId()).not.toBe(peer2.getPeerId());
  });

  it("should return nickname before activation", () => {
    const peer = createPeer("alice");
    expect(peer.getNickname()).toBe("alice");
  });

  it("should start listening and bind to the lobby port", async () => {
    const peer = createPeer("alice");
    await peer.startListening();
    expect(peer.getUsers()).toEqual([]);
  });

  it("should include self in user list after activation", async () => {
    const peer = createPeer("alice");
    await peer.startListening();
    peer.activate();
    expect(peer.getUsers()).toContain("alice");
  });

  it("should detect another peer's presence", async () => {
    const peer1 = createPeer("alice");
    const peer2 = createPeer("bob");

    await peer1.startListening();
    peer1.activate();

    // Register listener BEFORE activating peer2 so we don't miss the event
    const joinPromise = waitForEvent(peer1, "userJoined");

    await peer2.startListening();
    peer2.activate();

    const [joinedNickname] = await joinPromise;
    expect(joinedNickname).toBe("bob");

    // Use polling for user list since presence takes time
    await waitUntil(() => {
      const users1 = peer1.getUsers();
      const users2 = peer2.getUsers();
      return users1.includes("bob") && users2.includes("alice");
    });

    expect(peer1.getUsers()).toContain("alice");
    expect(peer1.getUsers()).toContain("bob");
    expect(peer2.getUsers()).toContain("alice");
    expect(peer2.getUsers()).toContain("bob");
  });

  it("should exchange chat messages", async () => {
    const peer1 = createPeer("alice");
    const peer2 = createPeer("bob");

    await peer1.startListening();
    peer1.activate();

    // Register listener BEFORE activating peer2
    const joinPromise = waitForEvent(peer1, "userJoined");

    await peer2.startListening();
    peer2.activate();

    await joinPromise;

    // Peer1 sends a message, peer2 should receive it
    const messagePromise = waitForEvent(peer2, "message");
    peer1.sendChatMessage("hello from alice");

    const [nickname, content] = await messagePromise;
    expect(nickname).toBe("alice");
    expect(content).toBe("hello from alice");
  });

  it("should not receive own messages (echo prevention)", async () => {
    const peer = createPeer("alice");
    await peer.startListening();
    peer.activate();

    const messageSpy = vi.fn();
    peer.on("message", messageSpy);

    peer.sendChatMessage("echo test");

    await delay(500);
    expect(messageSpy).not.toHaveBeenCalled();
  });

  it("should deduplicate messages", async () => {
    const peer1 = createPeer("alice");
    const peer2 = createPeer("bob");

    await peer1.startListening();
    peer1.activate();

    const joinPromise = waitForEvent(peer1, "userJoined");
    await peer2.startListening();
    peer2.activate();
    await joinPromise;

    const messageSpy = vi.fn();
    peer2.on("message", messageSpy);

    // Manually send duplicate message via raw UDP
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const msg: LobbyMessage = {
      type: "lobby-message",
      id: `${peer1.getPeerId()}-999`,
      nickname: "alice",
      content: "duplicate test",
      timestamp: Date.now(),
    };

    const buffer = Buffer.from(JSON.stringify(msg));

    // Send the same message twice to broadcast
    await new Promise<void>((resolve) => {
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(buffer, 0, buffer.length, LOBBY_PORT, "255.255.255.255", () => {
          socket.send(buffer, 0, buffer.length, LOBBY_PORT, "255.255.255.255", () => {
            resolve();
          });
        });
      });
    });

    await delay(500);
    socket.close();

    // Should only have received it once
    expect(messageSpy).toHaveBeenCalledTimes(1);
  });

  it("should detect user leave after presence timeout", async () => {
    const peer1 = createPeer("alice");
    const peer2 = createPeer("bob");

    await peer1.startListening();
    peer1.activate();

    const joinPromise = waitForEvent(peer1, "userJoined");
    await peer2.startListening();
    peer2.activate();
    await joinPromise;

    expect(peer1.getUsers()).toContain("bob");

    // Stop peer2 (simulates leaving)
    peer2.stop();
    // Remove from tracked list so afterEach doesn't double-stop
    const idx = peers.indexOf(peer2);
    if (idx >= 0) peers.splice(idx, 1);

    // Wait for presence timeout (5s) + cleanup interval (1s)
    const [leftNickname] = await waitForEvent(peer1, "userLeft", 8000);
    expect(leftNickname).toBe("bob");
    expect(peer1.getUsers()).not.toContain("bob");
  });

  it("should stop cleanly", async () => {
    const peer = createPeer("alice");
    await peer.startListening();
    peer.activate();
    peer.stop();

    expect(peer.getUsers()).toEqual([]);
  });

  it("pre-listening (inactive) peer should detect active users", async () => {
    const active = createPeer("alice");
    await active.startListening();
    active.activate();

    const preListening = createPeer("");
    await preListening.startListening();

    await waitUntil(() => preListening.getUsers().length > 0, 3000);

    expect(preListening.getUsers()).toContain("alice");
  });

  it("pre-listening peer should detect duplicate nickname for blocking", async () => {
    // 시나리오: User A가 "dong"으로 로비에 있고, User B가 "dong"으로 입장 시도
    const userA = createPeer("dong");
    await userA.startListening();
    userA.activate();

    // NicknameScreen의 pre-listening peer 시뮬레이션
    const preListening = createPeer("");
    await preListening.startListening();

    // presence 수신 대기
    await waitUntil(() => preListening.getUsers().length > 0, 3000);

    // "dong"이 이미 사용 중임을 감지해야 함
    expect(preListening.getUsers()).toContain("dong");

    // NicknameScreen의 handleSubmit 로직: 즉시 차단
    const attemptedNickname = "dong";
    const isTaken = preListening.getUsers().includes(attemptedNickname);
    expect(isTaken).toBe(true);
  });

  it("should allow duplicate nicknames without renaming", async () => {
    const peer1 = createPeer("alice");
    const peer2 = createPeer("alice");

    await peer1.startListening();
    peer1.activate();

    await peer2.startListening();
    peer2.activate();

    // Wait for both to discover each other
    await waitUntil(() => {
      return peer1.getUsers().length >= 2 && peer2.getUsers().length >= 2;
    });

    // Both should keep "alice" — no suffix
    expect(peer1.getNickname()).toBe("alice");
    expect(peer2.getNickname()).toBe("alice");
  });
});
