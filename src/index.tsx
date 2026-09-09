#!/usr/bin/env node

import { render } from "ink";
import meow from "meow";
import { installCursorSync } from "./terminal/imeCursor.js";
import { App } from "./ui/App.js";

meow(
  `
  Usage
    $ local-chat

  Options
    --no-update-check  Skip the npm version check on startup
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
  // Bracketed paste mode is turned off first: it outlives the alternate screen.
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

// Experimental, opt-in: wrap stdout so the terminal cursor follows the caret, which is
// where an IME draws its composition preview. Unset, Ink writes to process.stdout as before.
const stdout = process.env.LOCAL_CHAT_IME_CURSOR === "1" ? installCursorSync() : undefined;

// Ink 앱 렌더링
// Ctrl+C is handled by each screen: Ink's own handler would exit on a \x03 byte that
// lands inside a paste.
const { waitUntilExit } = render(<App />, {
  exitOnCtrlC: false,
  ...(stdout ? { stdout } : {}),
});

waitUntilExit().then(() => {
  process.exit(0);
});
