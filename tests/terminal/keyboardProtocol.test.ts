import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { type Key, render, Text, useInput } from "ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  areKeyProtocolsEnabled,
  createStdinProxy,
  disableKeyProtocols,
  enableKeyProtocols,
  KeyTranslator,
  shouldUseKeyProtocol,
} from "../../src/terminal/keyboardProtocol.js";

const ESC = "\u001B";
const CSI = `${ESC}[`;

/** A readable that looks enough like a tty for Ink: raw mode, ref/unref and isTTY. */
function createFakeStdin(): PassThrough & NodeJS.ReadStream {
  const stream = new PassThrough();
  Object.assign(stream, {
    isTTY: true,
    setRawMode: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
  });
  return stream as PassThrough & NodeJS.ReadStream;
}

/** The parts of a write stream Ink touches in debug mode. */
class FakeStdout extends EventEmitter {
  columns = 80;
  rows = 24;
  isTTY = true;
  frames: string[] = [];
  write = (chunk: string): boolean => {
    this.frames.push(chunk);
    return true;
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 15));

describe("KeyTranslator", () => {
  it("carries an incomplete tail between feeds", () => {
    const translator = new KeyTranslator();
    translator.setEnterMode("newline");
    expect(translator.feed(`ab${CSI}13`)).toBe("ab");
    expect(translator.hasHeld()).toBe(true);
    expect(translator.feed(";2u")).toBe("\n");
    expect(translator.hasHeld()).toBe(false);
  });

  it("releases the tail unchanged on flush", () => {
    const translator = new KeyTranslator();
    translator.feed(`${CSI}1;`);
    expect(translator.flush()).toBe(`${CSI}1;`);
    expect(translator.hasHeld()).toBe(false);
    expect(translator.flush()).toBe("");
  });

  it("turns a modified Enter into Enter until the chat editor asks for newlines", () => {
    const translator = new KeyTranslator();
    expect(translator.getEnterMode()).toBe("return");
    expect(translator.feed(`${CSI}13;2u`)).toBe("\r");
    translator.setEnterMode("newline");
    expect(translator.feed(`${CSI}13;2u`)).toBe("\n");
  });

  it("reports enhanced keys once a query reply confirms them, and notifies once", () => {
    const translator = new KeyTranslator();
    const listener = vi.fn();
    translator.subscribe(listener);

    expect(translator.feed(`${CSI}?0u`)).toBe("");
    expect(translator.isEnhanced()).toBe(false);
    expect(translator.feed(`${CSI}>4;0m`)).toBe("");
    expect(translator.isEnhanced()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    expect(translator.feed(`${CSI}?1u`)).toBe("");
    expect(translator.isEnhanced()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    translator.feed(`${CSI}>4;1m`);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("accepts a modifyOtherKeys reply as confirmation too", () => {
    const translator = new KeyTranslator();
    translator.feed(`${CSI}>4;1m`);
    expect(translator.isEnhanced()).toBe(true);
  });

  it("lets a listener unsubscribe", () => {
    const translator = new KeyTranslator();
    const listener = vi.fn();
    translator.subscribe(listener)();
    translator.feed(`${CSI}?1u`);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("createStdinProxy", () => {
  it("forwards everything but read() to the real stream, bound to it", () => {
    const real = createFakeStdin();
    const proxy = createStdinProxy(real, new KeyTranslator());
    expect(proxy.isTTY).toBe(true);
    proxy.setRawMode(true);
    expect(real.setRawMode).toHaveBeenCalledWith(true);
    const listener = (): void => {};
    proxy.addListener("readable", listener);
    expect(real.listeners("readable")).toContain(listener);
    proxy.removeListener("readable", listener);
  });

  it("drains every buffered chunk in one read and returns a string", async () => {
    const real = createFakeStdin();
    const proxy = createStdinProxy(real, new KeyTranslator());
    proxy.setEncoding("utf8");
    real.write("a");
    real.write("b");
    await tick();
    expect(proxy.read()).toBe("ab");
    expect(proxy.read()).toBeNull();
  });

  it("returns null, never an empty string, when a chunk is consumed whole", async () => {
    const real = createFakeStdin();
    const translator = new KeyTranslator();
    const proxy = createStdinProxy(real, translator);
    proxy.setEncoding("utf8");
    real.write(`${CSI}?1u`);
    await tick();
    expect(proxy.read()).toBeNull();
    expect(translator.isEnhanced()).toBe(true);
  });

  it("translates a modified Enter before Ink can see it", async () => {
    const real = createFakeStdin();
    const translator = new KeyTranslator();
    translator.setEnterMode("newline");
    const proxy = createStdinProxy(real, translator);
    proxy.setEncoding("utf8");
    real.write(`hi${CSI}13;2u`);
    await tick();
    expect(proxy.read()).toBe("hi\n");
  });

  it("holds an incomplete sequence, then releases it through a readable event when nothing follows", async () => {
    const real = createFakeStdin();
    const translator = new KeyTranslator();
    const scheduled: Array<() => void> = [];
    const clearTimeoutFn = vi.fn();
    const proxy = createStdinProxy(real, translator, {
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearTimeoutFn,
    });
    proxy.setEncoding("utf8");
    let readableEvents = 0;
    proxy.on("readable", () => {
      readableEvents += 1;
    });

    real.write(`${CSI}1;`);
    await tick();
    readableEvents = 0;
    expect(proxy.read()).toBeNull();
    expect(translator.hasHeld()).toBe(true);
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();
    expect(readableEvents).toBe(1);
    expect(proxy.read()).toBe(`${CSI}1;`);
    expect(proxy.read()).toBeNull();
  });

  it("joins a sequence split across two reads instead of flushing it", async () => {
    const real = createFakeStdin();
    const translator = new KeyTranslator();
    translator.setEnterMode("newline");
    const scheduled: Array<() => void> = [];
    const clearTimeoutFn = vi.fn();
    const proxy = createStdinProxy(real, translator, {
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearTimeoutFn,
    });
    proxy.setEncoding("utf8");

    real.write(`${CSI}13`);
    await tick();
    expect(proxy.read()).toBeNull();
    real.write(";2u");
    await tick();
    expect(proxy.read()).toBe("\n");
    expect(clearTimeoutFn).toHaveBeenCalledTimes(1);
  });

  it("passes the raw bytes through if the translator throws", async () => {
    const real = createFakeStdin();
    const translator = new KeyTranslator();
    vi.spyOn(translator, "feed").mockImplementation(() => {
      throw new Error("boom");
    });
    const proxy = createStdinProxy(real, translator);
    proxy.setEncoding("utf8");
    real.write("abc");
    await tick();
    expect(proxy.read()).toBe("abc");
  });
});

describe("createStdinProxy with Ink", () => {
  type Event = { input: string; key: Key };

  function Probe({ onKey }: { onKey: (input: string, key: Key) => void }): React.JSX.Element {
    useInput((input, key) => onKey(input, key));
    return React.createElement(Text, null, "probe");
  }

  async function mount(translator: KeyTranslator) {
    const real = createFakeStdin();
    const proxy = createStdinProxy(real, translator);
    const events: Event[] = [];
    const stdout = new FakeStdout();
    const stderr = new FakeStdout();
    const instance = render(
      React.createElement(Probe, { onKey: (input, key) => events.push({ input, key }) }),
      {
        stdin: proxy,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false,
      },
    );
    await tick();
    return { real, events, unmount: instance.unmount };
  }

  it("delivers Shift+Enter as a Ctrl+J style newline, not as Enter", async () => {
    const translator = new KeyTranslator();
    translator.setEnterMode("newline");
    const { real, events, unmount } = await mount(translator);
    real.write(`${CSI}13;2u`);
    await tick();
    unmount();
    expect(events).toHaveLength(1);
    expect(events[0]?.input).toBe("\n");
    expect(events[0]?.key.return).toBe(false);
  });

  it("survives a keypad key that crashes Ink 5.2.1 when it reaches the parser", async () => {
    const { real, events, unmount } = await mount(new KeyTranslator());
    real.write(`${CSI}57399u`);
    await tick();
    real.write("x");
    await tick();
    unmount();
    expect(events.map((event) => event.input)).toEqual(["x"]);
  });

  it("delivers the kitty encodings of Ctrl+C and Esc as the keys Ink knows", async () => {
    const { real, events, unmount } = await mount(new KeyTranslator());
    real.write(`${CSI}99;5u`);
    await tick();
    real.write(`${CSI}27u`);
    await tick();
    unmount();
    expect(events).toHaveLength(2);
    expect(events[0]?.input).toBe("c");
    expect(events[0]?.key.ctrl).toBe(true);
    expect(events[1]?.key.escape).toBe(true);
  });
});

describe("enableKeyProtocols / disableKeyProtocols", () => {
  it("writes the requests once and undoes them once", () => {
    const writes: string[] = [];
    const write = (text: string): void => {
      writes.push(text);
    };

    disableKeyProtocols(write);
    expect(writes).toEqual([]);
    expect(areKeyProtocolsEnabled()).toBe(false);

    enableKeyProtocols(write);
    enableKeyProtocols(write);
    expect(areKeyProtocolsEnabled()).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(`${CSI}>1u${CSI}>4;1m${CSI}?u${CSI}?4m`);

    disableKeyProtocols(write);
    disableKeyProtocols(write);
    expect(areKeyProtocolsEnabled()).toBe(false);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toBe(`${CSI}<u${CSI}>4m`);
  });
});

describe("shouldUseKeyProtocol", () => {
  const argv = ["node", "dist/index.js"];

  it("is on by default in a terminal", () => {
    expect(shouldUseKeyProtocol({}, argv, true)).toBe(true);
  });

  it.each(["0", "false", "off", "no", " OFF "])("turns off for %j", (value) => {
    expect(shouldUseKeyProtocol({ LOCAL_CHAT_KEY_PROTOCOL: value }, argv, true)).toBe(false);
  });

  it("turns off with --no-key-protocol", () => {
    expect(shouldUseKeyProtocol({}, [...argv, "--no-key-protocol"], true)).toBe(false);
  });

  it("stays off when stdout is not a terminal", () => {
    expect(shouldUseKeyProtocol({}, argv, false)).toBe(false);
  });
});
