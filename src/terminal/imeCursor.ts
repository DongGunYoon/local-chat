import { type CursorSync, type CursorTarget, createCursorSync } from "./cursorSync.js";

/**
 * Process-wide handle on the cursor sync, so the UI can aim the caret without threading a
 * stream through every component. Only the entry point installs it (on by default, see
 * `shouldSyncImeCursor`); tests and non-terminal runs never touch the proxy.
 */
let sync: CursorSync | null = null;

/** Env values that switch the sync off; anything else, including the historical "1", keeps it on. */
const OFF_VALUES = new Set(["0", "false", "off", "no"]);

/**
 * The sync is on by default: it is what puts an input method's composition preview inside
 * the chat input box (only ChatRoom sets a target; the nickname and room-creation prompts
 * leave it null). It stays off when stdout is not a terminal (nothing to position), or when
 * the user opts out with `--no-ime-cursor` or `LOCAL_CHAT_IME_CURSOR=0`. The flag is read
 * from argv rather than meow because meow folds `--no-*` into a negated flag.
 */
export function shouldSyncImeCursor(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
  isTTY: boolean = Boolean(process.stdout.isTTY),
): boolean {
  if (!isTTY) return false;
  if (argv.includes("--no-ime-cursor")) return false;
  const value = env.LOCAL_CHAT_IME_CURSOR?.trim().toLowerCase();
  return value === undefined || !OFF_VALUES.has(value);
}

/** Creates the sync on first call; later calls return the same proxied stream. */
export function installCursorSync(): NodeJS.WriteStream {
  sync ??= createCursorSync();
  return sync.stdout;
}

/** No-op while the sync is not installed, so callers never have to check. */
export function setImeCursorTarget(target: CursorTarget | null): void {
  sync?.setTarget(target);
}

export function isCursorSyncInstalled(): boolean {
  return sync !== null;
}
