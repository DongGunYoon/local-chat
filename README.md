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
- **Korean input** — Full IME support with proper display width handling.
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

## Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Boss mode (instant!) |
| `Shift+↑↓` | Scroll messages |
| `PgUp / PgDn` | Page scroll |
| `Esc ×2` | Browse rooms |
| `Ctrl+C` | Exit |

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

## Requirements

- Node.js >= 18
- Same WiFi/LAN network

## License

MIT
