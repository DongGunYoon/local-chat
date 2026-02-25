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

  // \r 제거 후 \n 기준으로 분리
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const allLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (stringWidth(paragraph) === 0) {
      allLines.push("");
      continue;
    }

    const chars = [...paragraph];
    let currentLine = "";
    let currentWidth = 0;

    for (const char of chars) {
      const charWidth = stringWidth(char);
      if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
        allLines.push(currentLine);
        currentLine = char;
        currentWidth = charWidth;
      } else {
        currentLine += char;
        currentWidth += charWidth;
      }
    }

    if (currentLine) {
      allLines.push(currentLine);
    }
  }

  return allLines.length > 0 ? allLines : [""];
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
