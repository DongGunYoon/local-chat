#!/usr/bin/env node

import { render } from "ink";
import meow from "meow";
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

// Ink 앱 렌더링
const { waitUntilExit } = render(<App />, {
  exitOnCtrlC: true,
});

waitUntilExit().then(() => {
  process.exit(0);
});
