import { useEffect } from "react";

const ENABLE = "\u001B[?2004h";
const DISABLE = "\u001B[?2004l";

/**
 * Turns on the terminal's bracketed paste mode while active, so a paste arrives wrapped
 * in ESC[200~ / ESC[201~ instead of looking like very fast typing. The mode is turned
 * off again on unmount, and only when this hook is what turned it on.
 */
export function useBracketedPaste(active: boolean): void {
  useEffect(() => {
    if (!active || !process.stdout.isTTY) return;

    process.stdout.write(ENABLE);

    return () => {
      process.stdout.write(DISABLE);
    };
  }, [active]);
}
