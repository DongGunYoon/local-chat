# Changelog

## Unreleased

- Reject malformed WebSocket/UDP packets instead of crashing every participant (non-string nickname/content, oversized frames)
- Socket errors no longer crash the process when the UDP ports are busy
- Room discovery now uses the announcer's real source address, fixing joins on VPN/multi-adapter hosts
- `--no-update-check` / `LOCAL_CHAT_NO_UPDATE_CHECK=1` skip the startup npm version check
- README: honest wording for encryption scope and the version check; removed template placeholders
- Multiline chat input: Ctrl+J / Option+Enter / `\`+Enter insert a line break; Enter sends
- Bracketed paste: multi-line pastes keep their line breaks and never send by accident
- Emoji and combining characters edit as single units (no more broken half-characters)
- The draft is never cleared unless the message was actually sent; unknown commands and over-limit lobby messages keep it
- Lobby byte counter in the header; `//` escape for messages starting with `/`
- Messages are no longer truncated at 5 lines; scrolling is line-based and keeps your place when new messages arrive
- Terminal control sequences in pasted or received text are stripped; tabs expand to spaces
- `/copy` works on Windows (`clip`) and Wayland (`wl-copy`)
- Private rooms: a message sent while reconnecting now shows "Not delivered" instead of vanishing

## 0.1.2

- Show `HH:MM` timestamp on every message (muted color, same line as nick)
- Adjust wrap indent to 10 cols so wrapped lines align past the timestamp
- Relabel `Esc×2` action from "leave room" to "browse rooms" across header, help overlay, and in-room hint
- Add lobby welcome hint pointing users to `Esc×2` for private rooms
- Expand README with a Screenshots section (placeholders for `assets/`)

## 0.1.1

- Switch message layout to inline `nick › content` format with fixed 4-col indent wrapping
- Remove message grouping — every message now shows its nickname
- Remove timestamps from user messages (system messages only)
- Fix stale closure in ChatRoom useEffect dependencies
- Remove unused `myNickname` prop from MessageItem/MessageArea
- Update README with lobby chat, kaomoji commands, full shortcut list, and architecture diagram
- Fix all linting and formatting issues

## 0.1.0

Initial release.

- Create and join chat rooms on local network
- AES-256-GCM message encryption
- UDP room auto-discovery
- Password-protected rooms
- Boss mode (fake overlay)
- Korean input support
