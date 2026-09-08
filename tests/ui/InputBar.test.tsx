// Ink renders without ANSI styling when the process is not a TTY, so colours are forced
// on for this file only (the caret is an inverse-video sequence we assert on) and the
// environment is restored before any other test file runs in the same worker.
const previousForceColor = process.env.FORCE_COLOR;
process.env.FORCE_COLOR = "1";
const { Box } = await import("ink");
const { render } = await import("ink-testing-library");
const { InputBar } = await import("../../src/ui/InputBar.js");
const { layoutRows } = await import("../../src/input/layout.js");
const { segmentGraphemes } = await import("../../src/utils/displayWidth.js");
const { describe, expect, it } = await import("vitest");
if (previousForceColor === undefined) {
  delete process.env.FORCE_COLOR;
} else {
  process.env.FORCE_COLOR = previousForceColor;
}

const INVERSE_ON = "\u001B[7m";
const INVERSE_OFF = "\u001B[27m";
const PROMPT = "\u276F";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips SGR colour sequences
const SGR = /\u001B\[[0-9;]*m/g;

function plain(frame: string | undefined): string {
  return (frame ?? "").replace(SGR, "");
}

function rowsFor(text: string, width: number) {
  return layoutRows(segmentGraphemes(text), width);
}

describe("InputBar", () => {
  it("puts the prompt on the first row only and pads every row to the width", () => {
    // The parent constrains the bar in the app; border(2) + paddingX(2) + prompt(2) + 10.
    const { lastFrame } = render(
      <Box width={16}>
        <InputBar
          rows={rowsFor("ab\ncd", 10)}
          caret={null}
          width={10}
          placeholder="Type a message"
          focus
          isEmpty={false}
        />
      </Box>,
    );

    const lines = plain(lastFrame()).split("\n");
    // "❯ " + "ab" + 8 pad cells = width 10, then the box's own paddingX cell.
    expect(lines[1]).toBe(`│ ${PROMPT} ab${" ".repeat(8)} │`);
    expect(lines[2]).toBe(`│   cd${" ".repeat(8)} │`);
    expect(lines[1].length).toBe(lines[2].length);
  });

  it("renders the caret grapheme inverse", () => {
    const { lastFrame } = render(
      <InputBar
        rows={rowsFor("ab", 10)}
        caret={{ row: 0, col: 1 }}
        width={10}
        placeholder="Type a message"
        focus
        isEmpty={false}
      />,
    );

    expect(lastFrame() ?? "").toContain(`${INVERSE_ON}b${INVERSE_OFF}`);
  });

  it("renders the caret on the wide grapheme it sits on", () => {
    const { lastFrame } = render(
      <InputBar
        rows={rowsFor("한글", 10)}
        caret={{ row: 0, col: 2 }}
        width={10}
        placeholder="Type a message"
        focus
        isEmpty={false}
      />,
    );

    expect(lastFrame() ?? "").toContain(`${INVERSE_ON}글${INVERSE_OFF}`);
  });

  it("renders an inverse space when the caret is past the end of the row", () => {
    const { lastFrame } = render(
      <Box width={16}>
        <InputBar
          rows={rowsFor("ab", 10)}
          caret={{ row: 0, col: 2 }}
          width={10}
          placeholder="Type a message"
          focus
          isEmpty={false}
        />
      </Box>,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain(`ab${INVERSE_ON} ${INVERSE_OFF}`);
    expect(plain(frame).split("\n")[1]).toBe(`│ ${PROMPT} ab${" ".repeat(8)} │`);
  });

  it("shows the placeholder and the caret while the draft is empty", () => {
    const { lastFrame } = render(
      <InputBar
        rows={rowsFor("", 10)}
        caret={{ row: 0, col: 0 }}
        width={10}
        placeholder="Type a message"
        focus
        isEmpty
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain(`${INVERSE_ON} ${INVERSE_OFF}`);
    expect(plain(frame)).toContain("Type a message");
  });

  it("shows the placeholder without a caret while an overlay is open", () => {
    const { lastFrame } = render(
      <InputBar
        rows={rowsFor("", 10)}
        caret={null}
        width={10}
        placeholder="Type a message"
        focus={false}
        isEmpty
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).not.toContain(INVERSE_ON);
    expect(plain(frame)).toContain("Type a message");
  });
});
