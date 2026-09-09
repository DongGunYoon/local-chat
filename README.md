# local-chat

**Terminal chat for everyone on the same WiFi. One command, no accounts, no server.**

[![npm version](https://img.shields.io/npm/v/local-chat.svg)](https://www.npmjs.com/package/local-chat)
[![license](https://img.shields.io/npm/l/local-chat.svg)](LICENSE)
[![node](https://img.shields.io/node/v/local-chat.svg)](#requirements)

```bash
npx local-chat
```

That is it.

Type a nickname and you are in the **lobby**, a chat room shared by everyone running local-chat on the network. Press `Esc` twice to browse **private rooms**, and create or join one. Nothing is installed globally, nothing is written to disk, and messages live in memory only: close the terminal and they are gone.

<!-- demo gif goes here -->

## Good for

- A dorm floor or a campus lab
- The table you are sitting at during a hackathon
- An office or a coworking space
- A classroom or a workshop: the host opens a room, everyone joins from the terminal they already have open
- Café and conference WiFi
- LAN parties
- Two machines at home that need to talk to each other

Anywhere people share a network and everyone already has a terminal open. The conversation is bounded by the network you are on, and it disappears when you close the terminal.

## Boss mode

> **Press `Tab` and the screen becomes a system monitor.**
>
> The header says `Tab on EMERGENCY` so you never have to remember it. `/fake` and `/f` do the same thing. Any key brings the chat straight back, with your half-typed message still in the input box.

```
──── SYSTEM MONITOR / ────

  HOSTNAME  prod-api-03.internal
  UPTIME    42d 7h 19m
  LOAD AVG  0.62 0.48 0.31

  CPU  ████████░░░░░░░ 54.8%

  MEM  ██████████░░░░░ 68.2% 14.9G / 21.8G

  SWAP ██░░░░░░░░░░░░░ 12.4% 0.5G / 4.0G

  DISK ████████████░░░ 81.4% 302.6G / 371.7G

  CONTAINER         CPU    MEM     STATUS
  api-server        2.4%   1.3G    running
  worker-01         9.1%   0.8G    running
  redis             0.2%   0.3G    running
  postgres          1.7%   2.2G    restarting
  nginx             0.1%   0.1G    running

  NET I/O ↓ 12.4 MB/s ↑ 3.1 MB/s

                     Last refresh: 14:02:17 | q to quit
```

Yes, something is usually restarting. It looks busier that way.

## Flow

```
Nickname → Lobby (everyone on the network) → Browse Rooms → Create / Join → Private Room
                                                  ↑                              │
                                                  └──────── Esc ×2 ──────────────┘
```

The lobby needs no setup: everyone running `npx local-chat` on the network is in it. `Esc` twice opens the room browser, where you create a room or join one. Password-protected rooms show a lock icon.

## Messages

Multi-line input. Paste text and code freely: bracketed paste keeps line breaks, tabs become four spaces, and terminal control sequences are stripped. Long messages are never truncated.

Scrolling is line-based: `Shift+↑` / `Shift+↓` for one line, `PgUp` / `PgDn` for a page. While you are scrolled up, incoming messages keep your place and a "N lines below" indicator appears; sending your own message jumps you back to the bottom.

A message starting with `/` is treated as a command unless it spans several lines. To send a single-line message that starts with `/`, prefix it with `//`.

Lobby messages are limited to 800 bytes, because a lobby message is a single UDP packet (about 260 CJK characters or 800 ASCII characters). The header shows a byte counter from 70% of the limit, and an over-limit message is refused with your draft kept. Private rooms have no byte or line limit.

Your draft survives everything: unknown commands, refused messages and boss mode all leave it intact.

## Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send |
| `Shift+Enter` | New line |
| `Ctrl+Enter`, `Option+Enter` / `Alt+Enter`, `Ctrl+J`, `\` then `Enter` | New line |
| `↑` / `↓` | Move inside the draft |
| `Ctrl+A` / `Ctrl+E` | Line start / line end |
| `Ctrl+U` | Clear the draft |
| `Shift+↑` / `Shift+↓` | Scroll one line |
| `PgUp` / `PgDn` | Page scroll |
| `Tab` | Boss mode |
| `Esc ×2` | Browse rooms |
| `Ctrl+C` | Exit |

### Shift+Enter in your terminal

A terminal can only report Shift+Enter, Ctrl+Enter and Option+Enter as something other than Enter if it speaks the [kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) or xterm's `modifyOtherKeys`. local-chat asks for both at startup, and the input box says `Shift+Enter for a new line` once the terminal has confirmed one of them.

| Terminal | Shift+Enter |
|----------|-------------|
| iTerm2 3.5+, Ghostty, kitty, WezTerm, foot, Rio, Alacritty 0.16+, Warp, Konsole 26.08+, Zellij | Works out of the box |
| VS Code 1.110+ | Works out of the box (`terminal.integrated.enableKittyKeyboardProtocol` is on by default) |
| Windows Terminal | Preview 1.25+ works out of the box. On the stable release add `{ "command": { "action": "sendInput", "input": "\u001b[13;2u" }, "keys": "shift+enter" }` to `actions` in settings.json |
| VS Code before 1.110 | Add `{ "key": "shift+enter", "command": "workbench.action.terminal.sendSequence", "args": { "text": "\u001b[13;2u" }, "when": "terminalFocus" }` to keybindings.json |
| tmux | `set -s extended-keys always` in `.tmux.conf`; the outer terminal must support modified keys |
| macOS Terminal.app | Not possible: Terminal.app cannot rebind Return and speaks neither protocol. Turn on "Use Option as Meta key" (Settings → Profiles → Keyboard) and use `Option+Enter`, or use `Ctrl+J` |
| GNOME Terminal and other VTE terminals, Hyper | Not supported. Use `Ctrl+J` or `\` then `Enter` |

`Ctrl+J` and `\` then `Enter` insert a new line in every terminal with no setup. If a terminal misbehaves after the protocol requests, start with `--no-key-protocol` or `LOCAL_CHAT_KEY_PROTOCOL=0`.

## Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `/help` | | Show the help overlay |
| `/users` | | List online users |
| `/erase` | `/e`, `/clear` | Clear all messages |
| `/copy [N]` | `/c` | Copy the Nth most recent message to the clipboard |
| `/fake` | `/f` | Boss mode |
| `/version` | | Show the current version |
| `/quit` | | Exit |

`/copy` uses whichever of `pbcopy`, `clip`, `wl-copy`, `xclip` or `xsel` your system has. `/ㄹ`, `/ㄷ`, `/ㅊ` work as `/f`, `/e`, `/c`: the same physical keys on a Korean keyboard, so you do not have to switch input mode.

Kaomoji, sent as a message: `/shrug` `/tableflip` `/unflip` `/lenny` `/disapproval` `/sparkles`

## How It Works

```
Room Creator (Host)                    Participants
┌─────────────────────┐               ┌──────────────┐
│ WebSocket Server    │◄──────ws─────►│ WS Client    │
│ (message relay)     │               └──────────────┘
│                     │               ┌──────────────┐
│ UDP Broadcaster     │──broadcast───►│ UDP Listener │
│ (room announce)     │  port 41568   └──────────────┘
└─────────────────────┘

Lobby (all peers)
┌──────────┐  UDP broadcast  ┌──────────┐
│  Peer A  │◄───port 41569──►│  Peer B  │
└──────────┘                 └──────────┘
```

- **Lobby**: all users exchange messages via UDP broadcast on port 41569. Obfuscated, not encrypted: the key is a constant in the source, so anyone running the app can read lobby traffic. Treat it as the open channel it is.
- **Private rooms**: the room creator runs a WebSocket server on their own machine. Messages are encrypted with AES-256-GCM. Password rooms derive keys via PBKDF2; public rooms use a random session key.
- **Discovery**: room info is broadcast via UDP every 3 seconds on port 41568. The room browser lists what it hears, with 🔒 for password-protected rooms.

Written in TypeScript with [Ink](https://github.com/vadimdemedes/ink) (React for terminals) and [`ws`](https://github.com/websockets/ws).

## Security

Read this before using local-chat for anything you would not say out loud in the room.

- Private-room messages are encrypted with AES-256-GCM (Node.js built-in `crypto`). Password rooms derive the key with PBKDF2; public rooms use a random session key.
- **The lobby is obfuscated, not encrypted.** The key is a constant in the source, so anyone running the app can read lobby traffic.
- **Threat model:** this protects against casual snooping by people on the same WiFi. It does not protect against an active attacker on your network. A public room's session key is handed to every joiner in plaintext over `ws://`, and a password room sends a SHA-256 of the password in plaintext, so a captured join lets an attacker read that room. Use a password room with a strong password for anything sensitive.
- Nothing is written to disk. Messages live in memory only.
- Chat traffic never leaves the LAN. The only outbound request is the startup version check to `registry.npmjs.org`. Disable it with `--no-update-check` or `LOCAL_CHAT_NO_UPDATE_CHECK=1`.

## Input methods (IME)

Korean, Japanese and Chinese input methods work. In the lobby and in private rooms, local-chat keeps the terminal cursor on the input caret so the composition preview appears inside the chat input box. Wide characters and emoji are measured correctly, and emoji and combining characters are edited as single units.

The nickname and room-creation prompts are not covered yet: a composition preview there appears wherever the terminal parks the cursor, and the text is still entered correctly.

## Troubleshooting

- **The cursor lands in the wrong place.** Turn the cursor sync off with `npx local-chat --no-ime-cursor` or `LOCAL_CHAT_IME_CURSOR=0`. Known limitation: console output or Node warnings printed during a session can misplace the caret until the next redraw.
- **`Shift+Enter` sends instead of inserting a line.** Your terminal cannot report it yet; see [Shift+Enter in your terminal](#shiftenter-in-your-terminal), or use `Ctrl+J`.
- **Keys behave strangely after startup.** A terminal may mishandle the keyboard-protocol requests; start with `--no-key-protocol` or `LOCAL_CHAT_KEY_PROTOCOL=0`.
- **No rooms in the browser.** Rooms are found by UDP broadcast on port 41568, so the host and you must be on the same network segment. Guest WiFi that isolates clients from each other blocks the broadcast.

## Requirements

- Node.js >= 18
- Same WiFi / LAN network

## License

MIT. Source at [github.com/DongGunYoon/local-chat](https://github.com/DongGunYoon/local-chat).
