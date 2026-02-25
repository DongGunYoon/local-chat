# Changelog

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
