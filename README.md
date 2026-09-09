# local-chat

Private local network CLI chat. No server, no logs, just vibes.

Same WiFi, terminal-based, encrypted private rooms, completely volatile.

## Quick Start

```bash
npx local-chat
```

Enter a nickname and you're in the lobby — a global LAN chatroom where everyone on the same network can talk. From there, create or join private rooms.

## Features

- **Lobby** — Global chatroom for everyone on the network. No setup needed.
- **Private rooms** — Create encrypted rooms, optionally password-protected.
- **Auto discovery** — Rooms broadcast via UDP. No IP sharing needed.
- **Fully local** — No external server. Works on the same WiFi only.
- **Volatile** — Messages exist in memory only. Leave the room, they're gone.
- **Encrypted** — Private rooms use AES-256-GCM. The lobby is obfuscated only, not encrypted.
- **Boss mode** — Instant fake system monitor overlay. Press `Tab` to hide everything.
- **IME friendly** — Korean, Japanese and Chinese input methods work; wide characters and emoji are measured correctly.
- **Update check** — Notifies you on startup if a newer version is available.

## Flow

```
Nickname → Lobby (global chat) → Browse Rooms → Create / Join → Private Chat
                                      ↑                              │
                                      └──────── Esc ×2 ──────────────┘
```

## Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `/help` | | Show help overlay |
| `/users` | | List online users |
| `/erase` | `/e`, `/clear` | Clear all messages |
| `/copy [N]` | `/c` | Copy Nth recent message to clipboard |
| `/ㄹ`, `/ㄷ`, `/ㅊ` | | Korean-keyboard aliases for `/fake`, `/erase`, `/copy` (same physical keys as `/f`, `/e`, `/c`) |
| `/fake` | `/f` | Boss mode |
| `/version` | | Show current version |
| `/quit` | | Exit app |

**Kaomoji** — type to send as a message:

| Command | Output |
|---------|--------|
| `/shrug` | `¯\_(ツ)_/¯` |
| `/tableflip` | `(╯°□°)╯︵ ┻━┻` |
| `/unflip` | `┼─┼ノ( º _ ºノ)` |
| `/lenny` | `( ͡° ͜ʖ ͡°)` |
| `/disapproval` | `ಠ_ಠ` |
| `/sparkles` | `(ﾉ◕ヮ◕)ﾉ*:・ﾟ✧` |

## Messages

Paste multi-line text and code freely — bracketed paste keeps line breaks, and tabs show as four spaces. Long messages scroll; nothing is truncated. If you've scrolled up to read history, incoming messages keep your place instead of yanking you back down; sending your own message jumps you to the bottom.

A message that starts with `/` is treated as a command unless it spans several lines. To send a single-line message starting with `/` as text, prefix it with `//`.

Lobby messages are limited to 800 bytes because the lobby is one UDP packet per message (about 260 CJK characters or 800 ASCII characters). The header shows a byte counter as you approach the limit, and an over-limit message is refused with the draft kept. Private rooms have no message limit.

## Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send |
| `Ctrl+J` | New line (works in every terminal) |
| `Option+Enter` / `Alt+Enter` | New line (macOS: enable "Use Option as Meta key" in Terminal.app, or Option = Esc+ in iTerm2) |
| `\` then `Enter` | New line |
| `↑ ↓` | Move inside the draft |
| `Ctrl+A` / `Ctrl+E` / `Ctrl+U` | Line start / line end / clear draft |
| `Shift+↑↓` | Scroll one line |
| `PgUp / PgDn` | Page scroll |
| `Tab` | Boss mode |
| `Esc ×2` | Browse rooms |
| `Ctrl+C` | Exit |

Shift+Enter sends in most terminals (they cannot tell it apart from Enter); if your terminal is configured to send a CSI-u sequence for Shift+Enter, local-chat treats it as a new line.

## How It Works

```
Room Creator (Host)                    Participants
┌─────────────────────┐               ┌──────────────┐
│ WebSocket Server    │◄──────ws─────►│ WS Client    │
│ (message relay)     │               └──────────────┘
│                     │               ┌──────────────┐
│ UDP Broadcaster     │──broadcast───►│ UDP Listener  │
│ (room announce)     │  port 41568   └──────────────┘
└─────────────────────┘

Lobby (all peers)
┌──────────┐  UDP broadcast  ┌──────────┐
│  Peer A  │◄───port 41569──►│  Peer B  │
└──────────┘                 └──────────┘
```

- **Lobby**: All users exchange messages via UDP broadcast (port 41569). Obfuscated, not encrypted (the key is a constant in the source, so anyone running the app can read lobby traffic) — meant for casual chat before joining a room.
- **Private rooms**: The room creator runs a WebSocket server. All messages are encrypted with AES-256-GCM. Password rooms derive keys via PBKDF2; public rooms use a random session key.
- **Discovery**: Room info is broadcast via UDP every 3 seconds (port 41568). The room browser shows available rooms with 🔒 for password-protected ones.

## Security

- Private room messages are encrypted with AES-256-GCM (Node.js built-in `crypto`).
- Threat model: this protects against casual snooping by people on the same WiFi. It does not protect against an active attacker on your network — a public room's session key is handed to every joiner in plaintext over ws://, and a password room sends a SHA-256 of the password in plaintext, so a captured join lets an attacker read that room. Use a password room with a strong password for anything sensitive.
- Nothing is written to disk. Messages live in memory only.
- Chat traffic never leaves the LAN. The only outbound request is a startup version check to registry.npmjs.org — disable it with `--no-update-check` or `LOCAL_CHAT_NO_UPDATE_CHECK=1`.

## Troubleshooting

If your input method's composition preview appears at the bottom-left corner instead of inside the input box, try `LOCAL_CHAT_IME_CURSOR=1 npx local-chat` (experimental; relative cursor sync).

## Requirements

- Node.js >= 18
- Same WiFi/LAN network

## License

MIT
