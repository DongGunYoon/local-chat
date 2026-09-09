import { useEffect, useSyncExternalStore } from "react";
import {
  disableKeyProtocols,
  enableKeyProtocols,
  isEnhancedKeysDetected,
  shouldUseKeyProtocol,
  subscribeEnhancedKeys,
} from "../terminal/keyboardProtocol.js";

/**
 * Asks the terminal for the enhanced key encodings while the app is mounted. Meant for the
 * root component: its effect runs after the children's, so the first screen's useInput has
 * already switched stdin to raw mode and the terminal's reply cannot be echoed or buffered
 * by the line discipline.
 */
export function useKeyboardProtocol(): void {
  useEffect(() => {
    if (!shouldUseKeyProtocol()) return;
    enableKeyProtocols();
    return () => disableKeyProtocols();
  }, []);
}

/** True once the terminal has confirmed it can tell Shift+Enter apart from Enter. */
export function useEnhancedKeys(): boolean {
  return useSyncExternalStore(subscribeEnhancedKeys, isEnhancedKeysDetected, () => false);
}
