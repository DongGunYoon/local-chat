import { useEffect } from "react";

/**
 * Makes the real terminal cursor visible while the input is active,
 * so that macOS Terminal.app's Korean IME can safely call setMarkedText
 * without crashing. Does NOT reposition the cursor — absolute positioning
 * (\x1B[row;colH) conflicts with Ink's relative cursor tracking and
 * corrupts Terminal.app's text buffer.
 */
export function useIMECursor(isActive: boolean): void {
  useEffect(() => {
    if (!process.stdout.isTTY) return;

    if (isActive) {
      process.stdout.write("\x1B[?25h");
    }

    return () => {
      if (process.stdout.isTTY) {
        process.stdout.write("\x1B[?25l");
      }
    };
  }, [isActive]);
}
