import stringWidth from "string-width";

/**
 * 터미널에서의 표시 너비를 반환한다.
 * 한글/CJK = 2칸, 영문/숫자 = 1칸, 이모지 = 2칸
 */
export function getDisplayWidth(str: string): number {
  return stringWidth(str);
}

/**
 * 표시 너비 기준으로 문자열을 잘라낸다.
 * maxWidth를 초과하면 "…"을 붙인다.
 */
export function truncateToWidth(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) return str;

  let width = 0;
  let i = 0;
  const chars = [...str]; // surrogate pair 안전 분해

  for (; i < chars.length; i++) {
    const charWidth = stringWidth(chars[i]);
    if (width + charWidth + 1 > maxWidth) break; // +1 for "…"
    width += charWidth;
  }

  return `${chars.slice(0, i).join("")}\u2026`;
}

/**
 * 텍스트를 지정된 표시 너비로 수동 줄바꿈한다.
 * 터미널에서의 hanging indent 구현에 사용.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  return wrapTextTwoWidth(text, maxWidth, maxWidth);
}

/**
 * Wrap `text` with a first row of `firstWidth` cells and continuation rows of
 * `contWidth` cells, so a message can hang under its prefix. Graphemes are never
 * split, "\n" always breaks, and an empty paragraph yields an empty row. The rows of
 * one paragraph concatenate back to that paragraph: nothing is dropped or added.
 */
export function wrapTextTwoWidth(text: string, firstWidth: number, contWidth: number): string[] {
  const first = Math.max(1, firstWidth);
  const cont = Math.max(1, contWidth);
  const lines: string[] = [];
  let isFirstLine = true;

  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let row: string[] = [];
    let width = 0;

    for (const grapheme of segmentGraphemes(paragraph)) {
      const cells = graphemeWidth(grapheme);
      const maxWidth = isFirstLine ? first : cont;

      // A space that no longer fits stays on the row it closes: starting the next row
      // with it would jog the hanging indent, and the terminal truncates it anyway.
      const overflows = row.length > 0 && width + cells > maxWidth && grapheme !== " ";

      // A row always keeps at least one grapheme, so layout cannot stall on a wide one.
      if (overflows) {
        const breakAt = wordBreakIndex(row);
        lines.push((breakAt < 0 ? row : row.slice(0, breakAt + 1)).join(""));
        isFirstLine = false;
        row = breakAt < 0 ? [] : row.slice(breakAt + 1);
        width = rowWidth(row);
      }

      row.push(grapheme);
      width += cells;
    }

    lines.push(row.join(""));
    isFirstLine = false;
  }

  return lines;
}

function rowWidth(row: readonly string[]): number {
  let width = 0;
  for (const grapheme of row) width += graphemeWidth(grapheme);
  return width;
}

/**
 * Index of the space to break after when the full row ends mid-word, or -1 when the
 * row has to break at the grapheme (a CJK run, a URL, or a word longer than the row).
 * Only ever asked about a row the next grapheme overflows, and that grapheme is never
 * a space, so the text after the last space is always a partial word.
 */
function wordBreakIndex(row: readonly string[]): number {
  const space = row.lastIndexOf(" ");
  // Index 0 would leave an empty row; the last index means the word is already complete.
  if (space <= 0 || space === row.length - 1) return -1;
  return space;
}

/**
 * 입력값이 최대 표시 너비를 초과하지 않도록 자른다.
 * (입력 필드 onChange에서 사용)
 */
export function limitInputByWidth(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) return str;

  let width = 0;
  const chars = [...str];

  for (let i = 0; i < chars.length; i++) {
    const charWidth = stringWidth(chars[i]);
    if (width + charWidth > maxWidth) {
      return chars.slice(0, i).join("");
    }
    width += charWidth;
  }

  return str;
}

// Grapheme-cluster helpers used by the input engine. Intl.Segmenter is created once
// because constructing one per call is expensive on every keystroke.
let segmenterCache: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenterCache === undefined) {
    segmenterCache =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  return segmenterCache;
}

/**
 * Split a string into grapheme clusters (emoji ZWJ sequences, skin tones, combining
 * marks and flags each stay whole). Falls back to code points when Intl.Segmenter
 * is unavailable.
 */
export function segmentGraphemes(str: string): string[] {
  if (str === "") return [];

  const segmenter = getSegmenter();
  if (segmenter === null) return [...str];

  const graphemes: string[] = [];
  for (const { segment } of segmenter.segment(str)) {
    graphemes.push(segment);
  }
  return graphemes;
}

const graphemeWidthCache = new Map<string, number>();

/** Display width of a single grapheme cluster, memoised. A newline occupies no cells. */
export function graphemeWidth(g: string): number {
  if (g === "\n") return 0;

  const cached = graphemeWidthCache.get(g);
  if (cached !== undefined) return cached;

  const width = getDisplayWidth(g);
  graphemeWidthCache.set(g, width);
  return width;
}
