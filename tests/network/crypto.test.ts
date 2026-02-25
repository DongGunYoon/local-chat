import { describe, expect, it } from "vitest";
import {
  decrypt,
  deobfuscate,
  deriveKey,
  encrypt,
  generateSessionKey,
  obfuscate,
  sha256,
} from "../../src/network/crypto.js";

describe("sha256", () => {
  it("produces the same output for the same input", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("returns a 64-char hex string", () => {
    expect(sha256("hello")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different output for different input", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});

describe("deriveKey", () => {
  it("returns a 32-byte Buffer", () => {
    const key = deriveKey("password");
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it("is deterministic (same password → same key)", () => {
    const key1 = deriveKey("secret");
    const key2 = deriveKey("secret");
    expect(key1.equals(key2)).toBe(true);
  });

  it("produces different keys for different passwords", () => {
    const key1 = deriveKey("password1");
    const key2 = deriveKey("password2");
    expect(key1.equals(key2)).toBe(false);
  });
});

describe("generateSessionKey", () => {
  it("returns a 64-char hex string", () => {
    expect(generateSessionKey()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a unique value each time", () => {
    expect(generateSessionKey()).not.toBe(generateSessionKey());
  });
});

describe("encrypt/decrypt", () => {
  const key = deriveKey("test-password");

  it("round-trips plaintext", () => {
    const text = "Hello, world!";
    expect(decrypt(encrypt(text, key), key)).toBe(text);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt("", key), key)).toBe("");
  });

  it("round-trips unicode", () => {
    const text = "안녕하세요 🎉";
    expect(decrypt(encrypt(text, key), key)).toBe(text);
  });

  it("produces base64 output", () => {
    expect(encrypt("test", key)).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const text = "same input";
    expect(encrypt(text, key)).not.toBe(encrypt(text, key));
  });

  it("throws on wrong key", () => {
    const ciphertext = encrypt("secret", key);
    const wrongKey = deriveKey("wrong-password");
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it("throws on corrupted ciphertext", () => {
    const ciphertext = encrypt("secret", key);
    const corrupted = `${ciphertext.slice(0, -4)}XXXX`;
    expect(() => decrypt(corrupted, key)).toThrow();
  });
});

describe("obfuscate/deobfuscate", () => {
  it("round-trips plaintext", () => {
    const text = "Hello lobby!";
    expect(deobfuscate(obfuscate(text))).toBe(text);
  });

  it("round-trips unicode", () => {
    const text = "안녕하세요 🎉";
    expect(deobfuscate(obfuscate(text))).toBe(text);
  });

  it("round-trips an empty string", () => {
    expect(deobfuscate(obfuscate(""))).toBe("");
  });

  it("produces different ciphertext each time (random IV)", () => {
    const text = "same message";
    expect(obfuscate(text)).not.toBe(obfuscate(text));
  });

  it("produces base64 output", () => {
    expect(obfuscate("test")).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
