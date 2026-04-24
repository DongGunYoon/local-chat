# local-chat

Private local network CLI chat. No server, no logs, just vibes.

Same WiFi, terminal-based, fully encrypted, completely volatile.

<!-- Screenshots: place images in assets/ and uncomment the lines below -->
<!-- <p align="center">
  <img src="assets/lobby.png" width="700" alt="Lobby chat" />
</p> -->

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
- **Encrypted** — AES-256-GCM on all private room messages.
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
| `/fake` | `/f` | Boss mode |
| `/version` | | Show current version |
| `/quit` | | Leave room |

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

## Screenshots

> Add your own screenshots to `assets/` and uncomment the image tags.

### Lobby Chat
<!-- <img src="assets/lobby.png" width="700" alt="Lobby — global LAN chatroom" /> -->
`npx local-chat` → enter nickname → lobby. Capture the header, chat messages, and input bar.

### Room Browser
<!-- <img src="assets/rooms.png" width="700" alt="Room browser — create or join" /> -->
Press `Esc×2` in lobby → room list with available rooms and Create Room option.

### Boss Mode
<!-- <img src="assets/boss-mode.png" width="700" alt="Boss mode — fake system monitor" /> -->
Press `Tab` anywhere → instant fake system monitor overlay. Press any key to return.

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

- **Lobby**: All users exchange messages via UDP broadcast (port 41569). Obfuscated, not encrypted — meant for casual chat before joining a room.
- **Private rooms**: The room creator runs a WebSocket server. All messages are encrypted with AES-256-GCM. Password rooms derive keys via PBKDF2; public rooms use a random session key.
- **Discovery**: Room info is broadcast via UDP every 3 seconds (port 41568). The room browser shows available rooms with 🔒 for password-protected ones.

## Security

- Messages encrypted with AES-256-GCM (Node.js built-in `crypto`)
- Passwords hashed with SHA-256, keys derived with PBKDF2 (100k iterations)
- Nothing written to disk. Ever.
- Network-local only — no internet traffic

## Requirements

- Node.js >= 18
- Same WiFi/LAN network

## License

MIT
