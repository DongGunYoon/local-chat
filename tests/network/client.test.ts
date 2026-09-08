import { describe, expect, it } from "vitest";
import { ChatClient } from "../../src/network/client.js";

describe("ChatClient.sendMessage", () => {
  it("returns false when there is no socket yet", () => {
    const client = new ChatClient("127.0.0.1", 1, "x");

    // Never connected: the payload is dropped, so the caller must keep the draft.
    expect(client.sendMessage("p")).toBe(false);
  });

  it("returns false after disconnect", () => {
    const client = new ChatClient("127.0.0.1", 1, "x");
    client.disconnect();

    expect(client.sendMessage("p")).toBe(false);
  });
});
