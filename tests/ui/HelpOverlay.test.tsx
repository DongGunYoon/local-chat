import { Box } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import { HelpOverlay } from "../../src/ui/HelpOverlay.js";

// The overlay gets the message area's height: 24 terminal rows minus the status line,
// the header and a one-row input box with its border.
const HEIGHT = 17;

function frameOf(node: React.JSX.Element): string {
  return render(node).lastFrame() ?? "";
}

describe("HelpOverlay", () => {
  it("fits in the height it is given", () => {
    expect(frameOf(<HelpOverlay height={HEIGHT} />).split("\n").length).toBeLessThanOrEqual(HEIGHT);
  });

  it("still fits in an 80 column terminal", () => {
    const frame = frameOf(
      <Box width={80}>
        <HelpOverlay height={HEIGHT} />
      </Box>,
    );
    expect(frame.split("\n").length).toBeLessThanOrEqual(HEIGHT);
  });

  it("lists every command, kaomoji, input and shortcut key", () => {
    const frame = frameOf(
      <Box width={80}>
        <HelpOverlay height={HEIGHT} />
      </Box>,
    );

    for (const key of [
      "/users",
      "/copy N",
      "/shrug",
      "Ctrl+J",
      "Esc \u00D72",
      "Tab",
      "//text",
      "Enter",
      "Ctrl+U",
    ]) {
      expect(frame, `missing "${key}"`).toContain(key);
    }
    expect(frame).toContain("Press any key to close");
  });

  it("promises Shift+Enter only once the terminal has confirmed it", () => {
    const legacy = frameOf(<HelpOverlay height={HEIGHT} />);
    expect(legacy).toContain("Shift+Enter");
    expect(legacy).toContain("Unsupported here");

    const enhanced = frameOf(<HelpOverlay height={HEIGHT} enhancedKeys />);
    expect(enhanced).not.toContain("Unsupported here");
    expect(enhanced).toMatch(/Shift\+Enter\s+New line/);
  });
});
