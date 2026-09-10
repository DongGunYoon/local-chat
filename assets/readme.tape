# README recording, made with VHS (https://github.com/charmbracelet/vhs).
#
#   npm run build
#   vhs assets/readme.tape
#
# Produces assets/demo.gif plus the two screenshots the README embeds. Run a couple of
# other local-chat instances (or any scripted lobby peers) first so the lobby has company.

Output assets/demo.gif

Set Shell zsh
Set FontSize 15
Set Width 960
Set Height 470
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms
Set Framerate 20

Hide
Type "node dist/index.js --no-update-check"
Enter
Sleep 1500ms
Show

Sleep 800ms
Type "sam"
Sleep 400ms
Enter
Sleep 2200ms

Type "anyone at the hackathon table still awake?"
Sleep 300ms
Enter
Sleep 3600ms

Type "same here, coffee run in 5?"
Sleep 300ms
Enter
Sleep 3400ms

Type "wait, the prof is walking over"
Sleep 300ms
Enter
Sleep 2400ms
Screenshot assets/lobby.png
Sleep 1200ms

# Boss mode: Tab turns the screen into a fake system monitor, any key brings the chat back.
Tab
Sleep 3200ms
Screenshot assets/boss-mode.png
Sleep 800ms
Space
Sleep 1800ms

Hide
Ctrl+C
Sleep 500ms
