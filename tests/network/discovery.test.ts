import dgram from "node:dgram";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomDiscovery } from "../../src/network/discovery.js";
import { DISCOVERY_PORT, type RoomInfo } from "../../src/network/types.js";

const discoveries: RoomDiscovery[] = [];
const sockets: dgram.Socket[] = [];

function createDiscovery(): RoomDiscovery {
  const discovery = new RoomDiscovery();
  discoveries.push(discovery);
  return discovery;
}

function closeSocket(socket: dgram.Socket): Promise<void> {
  return new Promise((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

/** Send one datagram from an explicit loopback source so rinfo.address is deterministic. */
async function sendFromLoopback(payload: unknown): Promise<void> {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  sockets.push(socket);
  const buffer = Buffer.from(JSON.stringify(payload));
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.send(buffer, 0, buffer.length, DISCOVERY_PORT, "127.0.0.1", (err) =>
        err ? reject(err) : resolve(),
      );
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve with the first roomFound whose name matches, so LAN traffic cannot win the race. */
function waitForRoom(discovery: RoomDiscovery, name: string, timeout = 3000): Promise<RoomInfo> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      discovery.off("roomFound", handler);
      reject(new Error(`Timeout waiting for room "${name}"`));
    }, timeout);
    const handler = (room: RoomInfo) => {
      if (room.name !== name) return;
      clearTimeout(timer);
      discovery.off("roomFound", handler);
      resolve(room);
    };
    discovery.on("roomFound", handler);
  });
}

afterEach(async () => {
  for (const discovery of discoveries) {
    discovery.stop();
  }
  discoveries.length = 0;
  for (const socket of sockets) {
    await closeSocket(socket);
  }
  sockets.length = 0;
  // dgram frees the descriptor asynchronously; give the port back before the next bind
  await delay(100);
});

describe("RoomDiscovery", () => {
  it("uses the sender's real address instead of the self-reported host", async () => {
    const discovery = createDiscovery();
    await discovery.start();

    const name = `rinfo-room-${Date.now()}`;
    const found = waitForRoom(discovery, name);
    await sendFromLoopback({
      type: "room-announce",
      name,
      host: "10.99.0.1", // a lie: a VPN/virtual adapter address
      port: 4242,
      hasPassword: false,
      userCount: 1,
    });

    const room = await found;
    expect(room.host).toBe("127.0.0.1");
    expect(room.port).toBe(4242);
    expect(discovery.getRooms().some((r) => r.name === name && r.host === "127.0.0.1")).toBe(true);
  });

  it("ignores an announce with a non-string name", async () => {
    const discovery = createDiscovery();
    await discovery.start();

    const before = discovery.getRooms().length;
    await sendFromLoopback({
      type: "room-announce",
      name: 5,
      host: "10.99.0.1",
      port: 4242,
      hasPassword: false,
      userCount: 1,
    });

    await delay(300);
    expect(discovery.getRooms().length).toBe(before);
  });

  it("ignores announces with malformed fields", async () => {
    const discovery = createDiscovery();
    await discovery.start();

    const before = discovery.getRooms().length;
    const base = {
      type: "room-announce",
      host: "10.99.0.1",
      port: 4242,
      hasPassword: false,
      userCount: 1,
    };

    await sendFromLoopback({ ...base, name: "bad-port", port: "4242" });
    await sendFromLoopback({ ...base, name: "bad-port-range", port: 70000 });
    await sendFromLoopback({ ...base, name: "bad-port-float", port: 42.5 });
    await sendFromLoopback({ ...base, name: "bad-password", hasPassword: "no" });
    await sendFromLoopback({ ...base, name: "bad-count", userCount: "1" });
    await sendFromLoopback({ ...base, name: "\x1b[2J" });
    await sendFromLoopback({ ...base, type: "something-else", name: "wrong-type" });

    await delay(300);
    expect(discovery.getRooms().length).toBe(before);
  });

  it("sanitizes the announced room name", async () => {
    const discovery = createDiscovery();
    await discovery.start();

    const name = `sanitized-${Date.now()}`;
    const found = waitForRoom(discovery, name);
    await sendFromLoopback({
      type: "room-announce",
      name: `  ${name}\n `,
      host: "10.99.0.1",
      port: 4242,
      hasPassword: false,
      userCount: 1,
    });

    const room = await found;
    expect(room.name).toBe(name);
  });

  it("rejects start() without an uncaught exception when the port is taken", async (ctx) => {
    // Bind WITHOUT reuseAddr so RoomDiscovery's reuseAddr bind still collides
    const blocker = dgram.createSocket("udp4");
    sockets.push(blocker);
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.bind(DISCOVERY_PORT, () => resolve());
    });

    const uncaught = vi.fn();
    process.on("uncaughtException", uncaught);

    const discovery = createDiscovery();
    let rejection: unknown;
    let outcome: "resolved" | "rejected" | "pending";
    try {
      outcome = await Promise.race([
        discovery.start().then(
          () => "resolved" as const,
          (err) => {
            rejection = err;
            return "rejected" as const;
          },
        ),
        delay(2000).then(() => "pending" as const),
      ]);
      // Let a stray throw from the socket callback surface before we stop listening
      await delay(50);
    } finally {
      process.removeListener("uncaughtException", uncaught);
    }

    expect(uncaught).not.toHaveBeenCalled();

    if (outcome === "resolved") {
      // The OS allowed the second bind despite the blocker; there is no error to observe.
      ctx.skip();
      return;
    }

    expect(outcome).toBe("rejected");
    expect(rejection).toBeInstanceOf(Error);
  });
});
