import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = "local-chat-salt-v1";
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;

const LOBBY_OBFUSCATE_KEY = crypto.pbkdf2Sync(
  "local-chat-public-lobby",
  SALT,
  1000,
  KEY_LENGTH,
  "sha256",
);

/**
 * 비밀번호에서 AES-256 암호화 키를 파생한다 (PBKDF2)
 */
export function deriveKey(password: string): Buffer {
  return crypto.pbkdf2Sync(password, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * SHA-256 해시를 생성한다
 */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * 랜덤 세션 키를 생성한다 (비밀번호 없는 방용)
 */
export function generateSessionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * AES-256-GCM으로 암호화한다
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const tag = cipher.getAuthTag();

  // iv(12) + tag(16) + encrypted 를 합쳐서 base64로 반환
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString("base64");
}

/**
 * AES-256-GCM으로 복호화한다
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  const combined = Buffer.from(ciphertext, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * 로비 메시지를 난독화한다 (캐주얼 스니핑 방지 목적, 보안용 아님)
 */
export function obfuscate(plaintext: string): string {
  return encrypt(plaintext, LOBBY_OBFUSCATE_KEY);
}

/**
 * 난독화된 로비 메시지를 복원한다
 */
export function deobfuscate(ciphertext: string): string {
  return decrypt(ciphertext, LOBBY_OBFUSCATE_KEY);
}
