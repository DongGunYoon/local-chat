import { Text, useStdout } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { useInsertionEffect, useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";

// The IME caret sync aims the cursor from an effect and Ink applies it on the *next* write,
// so the effect has to run before Ink writes the frame it belongs to. Ink renders from the
// reconciler's resetAfterCommit, which React calls after mutation effects but before layout
// effects - a layout effect would therefore always be one frame late. This pins that ordering
// so the assumption breaks loudly if a future Ink or React changes it.
const framesWhen: Record<string, number> = {};

function Probe(): React.JSX.Element {
  const { stdout } = useStdout();
  const frames = (stdout as unknown as { frames: string[] }).frames;

  useInsertionEffect(() => {
    framesWhen.insertion = frames.length;
  });

  useLayoutEffect(() => {
    framesWhen.layout = frames.length;
  });

  return <Text>probe</Text>;
}

describe("Ink commit ordering", () => {
  it("writes the frame between the insertion effect and the layout effect", () => {
    render(<Probe />);

    expect(framesWhen.insertion, "insertion effect ran after the first write").toBe(0);
    expect(framesWhen.layout, "layout effect ran before the first write").toBe(1);
  });
});
