#!/usr/bin/env node

import { render } from "ink";
import meow from "meow";
import { installCursorSync, shouldSyncImeCursor } from "./terminal/imeCursor.js";
import { disableKeyProtocols, installKeyTranslator } from "./terminal/keyboardProtocol.js";
import { App } from "./ui/App.js";

meow(
  `
  Usage
    $ local-chat

  Options
    --no-update-check  Skip the npm version check on startup
    --no-ime-cursor    Leave the terminal cursor where Ink parks it (turns off IME caret sync)
    --no-key-protocol  Do not ask the terminal to report Shift+Enter (kitty keyboard protocol / modifyOtherKeys)
`,
  {
    importMeta: import.meta,
    flags: {
      noUpdateCheck: {
        type: "boolean",
        default: false,
      },
    },
  },
);

// Alternate screen buffer 진입 (vim처럼 별도 화면)
process.stdout.write("\x1B[?1049h");
process.stdout.write("\x1B[H");

// 종료 시 원래 터미널로 복원하는 함수
function restoreScreen(): void {
  // The keyboard protocols and bracketed paste are turned off first: they outlive the
  // alternate screen, and the shell would otherwise receive escape codes for Esc.
  disableKeyProtocols();
  process.stdout.write("\x1B[?2004l");
  process.stdout.write("\x1B[?1049l");
}

// 다양한 종료 시나리오에서 화면 복원을 보장한다
process.on("exit", restoreScreen);
process.on("SIGINT", () => {
  restoreScreen();
  process.exit(0);
});
process.on("SIGTERM", () => {
  restoreScreen();
  process.exit(0);
});

// Wrap stdout so the terminal cursor follows the caret, which is where an input method draws
// its composition preview. Off with --no-ime-cursor, LOCAL_CHAT_IME_CURSOR=0, or a non-TTY
// stdout; then Ink writes to process.stdout as before.
const stdout = shouldSyncImeCursor() ? installCursorSync() : undefined;

// Wrap stdin so Shift/Ctrl/Alt+Enter and the other enhanced key encodings reach Ink as the
// legacy bytes it understands; without this Ink 5.2.1 crashes on some of them.
const stdin = installKeyTranslator();

// Ink 앱 렌더링
// Ctrl+C is handled by each screen: Ink's own handler would exit on a \x03 byte that
// lands inside a paste.
const { waitUntilExit } = render(<App />, {
  exitOnCtrlC: false,
  stdin,
  ...(stdout ? { stdout } : {}),
});

waitUntilExit().then(() => {
  process.exit(0);
});
