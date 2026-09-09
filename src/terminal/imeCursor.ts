import { type CursorSync, type CursorTarget, createCursorSync } from "./cursorSync.js";

/**
 * Process-wide handle on the cursor sync, so the UI can aim the caret without threading a
 * stream through every component. Nothing is installed unless the entry point asks for it,
 * which keeps the default runtime path free of the proxy.
 */
let sync: CursorSync | null = null;

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
