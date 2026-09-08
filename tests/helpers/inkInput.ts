// Test-only bridge to Ink's key parsing: turns one raw stdin chunk into the exact
// (input, key) pair the app's useInput handler receives, so keymap tests exercise
// real terminal bytes instead of hand-made Key objects.

import type { Key } from "ink";
// parse-keypress is not part of Ink's public exports, so it is imported by path.
import parseKeypress, { nonAlphanumericKeys } from "../../node_modules/ink/build/parse-keypress.js";

const ESC = "\u001B";

/** Replicates Ink 5.2.1's use-input.js mapping (build/hooks/use-input.js lines 46-79). */
export function toInkEvent(raw: string): { input: string; key: Key } {
  const keypress = parseKeypress(raw);

  const key: Key = {
    upArrow: keypress.name === "up",
    downArrow: keypress.name === "down",
    leftArrow: keypress.name === "left",
    rightArrow: keypress.name === "right",
    pageDown: keypress.name === "pagedown",
    pageUp: keypress.name === "pageup",
    return: keypress.name === "return",
    escape: keypress.name === "escape",
    ctrl: keypress.ctrl,
    shift: keypress.shift,
    tab: keypress.name === "tab",
    backspace: keypress.name === "backspace",
    delete: keypress.name === "delete",
    // Ink keeps meta true for Esc and for Option-prefixed sequences parsed as option.
    meta: keypress.meta || keypress.name === "escape" || keypress.option,
  };

  let input = keypress.ctrl ? keypress.name : keypress.sequence;

  if (nonAlphanumericKeys.includes(keypress.name)) {
    input = "";
  }

  // Ink strips exactly one leading ESC that parseKeypress left in place.
  if (input.startsWith(ESC)) {
    input = input.slice(1);
  }

  if (input.length === 1 && typeof input[0] === "string" && /[A-Z]/.test(input[0])) {
    key.shift = true;
  }

  return { input, key };
}
