/**
 * Asks the terminal to tell Shift/Ctrl/Alt+Enter apart from Enter, and translates what it
 * sends back into the legacy bytes Ink understands - before Ink ever reads the chunk.
 *
 * Two mechanisms are requested at once; a terminal honours whichever it knows and ignores
 * the other, and the decoder in keyEncoding.ts accepts both encodings:
 *   - kitty keyboard protocol, flag 1 only ("disambiguate escape codes")
 *   - xterm modifyOtherKeys mode 1 (mode 2 would re-encode shifted text keys too)
 * Both are undone on exit, and both queries are answered (or not) on stdin, which is how
 * the chat screen learns whether it can advertise Shift+Enter.
 *
 * The stdin proxy exists because Ink 5.2.1 throws on some of these sequences and inserts
 * the rest as text; only a read() that runs before Ink's parser can prevent that.
 */

import { type ModifiedEnterMode, type ProtocolReply, translateChunk } from "./keyEncoding.js";

const ESC = "\u001B";
const PUSH_KITTY = `${ESC}[>1u`;
const POP_KITTY = `${ESC}[<u`;
const QUERY_KITTY = `${ESC}[?u`;
const ENABLE_MODIFY_OTHER_KEYS = `${ESC}[>4;1m`;
/** Omitting the value restores the terminal's own default rather than forcing it off. */
const RESET_MODIFY_OTHER_KEYS = `${ESC}[>4m`;
const QUERY_MODIFY_OTHER_KEYS = `${ESC}[?4m`;

/** How long an incomplete escape sequence waits for its remaining bytes before it is released as-is. */
export const FLUSH_MS = 30;

/** Env values that turn the protocol requests off; anything else keeps them on. */
const OFF_VALUES = new Set(["0", "false", "off", "no"]);

type Listener = () => void;

/**
 * Stateful wrapper around translateChunk: carries an incomplete tail between reads, knows
 * what a modified Enter should become right now, and remembers whether the terminal has
 * answered a capability query.
 */
export class KeyTranslator {
  private held = "";
  private enterMode: ModifiedEnterMode = "return";
  private enhanced = false;
  private readonly listeners = new Set<Listener>();

  /** Translates one chunk; returns the bytes to hand on ("" when everything was consumed or held). */
  feed(chunk: string): string {
    const result = translateChunk(chunk, this.enterMode, this.held);
    this.held = result.held;
    for (const reply of result.replies) this.noteReply(reply);
    return result.output;
  }

  /** Releases the held tail unchanged: no more bytes came, so it was not a key sequence after all. */
  flush(): string {
    const held = this.held;
    this.held = "";
    return held;
  }

  hasHeld(): boolean {
    return this.held !== "";
  }

  setEnterMode(mode: ModifiedEnterMode): void {
    this.enterMode = mode;
  }

  getEnterMode(): ModifiedEnterMode {
    return this.enterMode;
  }

  /** True once the terminal has confirmed an encoding that distinguishes Shift+Enter. */
  isEnhanced(): boolean {
    return this.enhanced;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private noteReply(reply: ProtocolReply): void {
    const supported = reply.kind === "kitty" ? (reply.flags & 1) !== 0 : reply.value >= 1;
    if (!supported || this.enhanced) return;
    this.enhanced = true;
    for (const listener of this.listeners) listener();
  }
}

export type StdinProxyOptions = {
  flushMs?: number;
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

/**
 * Wraps a readable stdin so that read() returns translated text. Everything else is
 * forwarded to the real stream, bound to it, so Ink's setRawMode/ref/addListener calls
 * land where they always did.
 *
 * Two rules from measuring Ink 5.2.1 on a real pty: read() must return strings (App.js
 * compares chunks with ===), and the real stream must be drained to null on every call,
 * because a tty stream only resumes reading after a read() that returned null.
 */
export function createStdinProxy(
  real: NodeJS.ReadStream,
  translator: KeyTranslator,
  options: StdinProxyOptions = {},
): NodeJS.ReadStream {
  const flushMs = options.flushMs ?? FLUSH_MS;
  const schedule = options.setTimeoutFn ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));

  /** Translated bytes released by the flush timer, waiting for Ink's next read(). */
  let queued = "";
  let timer: unknown = null;

  const read = (): string | null => {
    let raw = "";
    let chunk: unknown;
    while ((chunk = real.read()) !== null) {
      raw += String(chunk);
    }

    if (timer !== null) {
      cancel(timer);
      timer = null;
    }

    let output = queued;
    queued = "";
    if (raw !== "") {
      try {
        output += translator.feed(raw);
      } catch {
        // The translator must never take stdin down with it: pass the bytes through.
        output += translator.flush() + raw;
      }
    }

    if (translator.hasHeld()) {
      timer = schedule(() => {
        timer = null;
        const released = translator.flush();
        if (released === "") return;
        queued += released;
        // Re-enter Ink's read loop; its 'readable' listener is registered on the real stream.
        real.emit("readable");
      }, flushMs);
    }

    // Ink treats anything but null as input, so an empty result must be null.
    return output === "" ? null : output;
  };

  return new Proxy(real, {
    get(stream, property) {
      if (property === "read") return read;
      const value = Reflect.get(stream, property);
      return typeof value === "function" ? value.bind(stream) : value;
    },
  }) as NodeJS.ReadStream;
}

/** The one translator the app uses; the UI reaches it through the functions below. */
const translator = new KeyTranslator();
let proxied: NodeJS.ReadStream | null = null;
let protocolsEnabled = false;

/** Creates the stdin proxy on first call; later calls return the same stream. */
export function installKeyTranslator(real: NodeJS.ReadStream = process.stdin): NodeJS.ReadStream {
  proxied ??= createStdinProxy(real, translator);
  return proxied;
}

/** The chat editor turns modified Enter into a newline; every other screen keeps it as Enter. */
export function setModifiedEnterMode(mode: ModifiedEnterMode): void {
  translator.setEnterMode(mode);
}

export function isEnhancedKeysDetected(): boolean {
  return translator.isEnhanced();
}

export function subscribeEnhancedKeys(listener: Listener): () => void {
  return translator.subscribe(listener);
}

/** Test hook: the process-wide translator, so tests can feed it replies. */
export function getKeyTranslator(): KeyTranslator {
  return translator;
}

/**
 * On by default in a terminal. Off with `--no-key-protocol` or LOCAL_CHAT_KEY_PROTOCOL=0,
 * for a terminal whose implementation of either protocol misbehaves. The flag is read from
 * argv rather than meow because meow folds `--no-*` into a negated flag.
 */
export function shouldUseKeyProtocol(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
  isTTY: boolean = Boolean(process.stdout.isTTY),
): boolean {
  if (!isTTY) return false;
  if (argv.includes("--no-key-protocol")) return false;
  const value = env.LOCAL_CHAT_KEY_PROTOCOL?.trim().toLowerCase();
  return value === undefined || !OFF_VALUES.has(value);
}

type Writer = (text: string) => unknown;
const writeStdout: Writer = (text) => process.stdout.write(text);

/** Requests both encodings and asks which one the terminal speaks. Call after raw mode is on. */
export function enableKeyProtocols(write: Writer = writeStdout): void {
  if (protocolsEnabled) return;
  protocolsEnabled = true;
  write(PUSH_KITTY + ENABLE_MODIFY_OTHER_KEYS + QUERY_KITTY + QUERY_MODIFY_OTHER_KEYS);
}

/** Undoes enableKeyProtocols exactly once, so a pop never reaches an entry that is not ours. */
export function disableKeyProtocols(write: Writer = writeStdout): void {
  if (!protocolsEnabled) return;
  protocolsEnabled = false;
  write(POP_KITTY + RESET_MODIFY_OTHER_KEYS);
}

export function areKeyProtocolsEnabled(): boolean {
  return protocolsEnabled;
}
