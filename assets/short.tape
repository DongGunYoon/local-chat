# Short autoplay cut for social feeds (about 8 s): the last message, then Tab for boss mode.
#   npm run build && vhs assets/short.tape   (run scripted lobby peers first)
Output assets/demo-short.gif

Set Shell zsh
Set FontSize 15
Set Width 960
Set Height 470
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set Framerate 20

Hide
Type "node dist/index.js --no-update-check"
Enter
Sleep 1500ms
Type "sam"
Enter
Sleep 2000ms
Type "anyone at the hackathon table still awake?"
Enter
Sleep 3600ms
Type "same here, coffee run in 5?"
Enter
Sleep 3400ms
Show

Sleep 600ms
Type "wait, the prof is walking over"
Sleep 200ms
Enter
Sleep 900ms
Tab
Sleep 3000ms
Space
Sleep 1400ms

Hide
Ctrl+C
Sleep 400ms
