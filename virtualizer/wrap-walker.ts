import { skipAnsiSequence } from "./ansi-scanner.ts";

/**
 * Compute the display width of a line, skipping recognized ANSI sequences
 * and calling measureWidth only on visible characters.
 */
export function computeDisplayWidth(
  text: string,
  measureWidth: (text: string) => number,
): number {
  let width = 0;
  let i = 0;
  while (i < text.length) {
    let skip = skipAnsiSequence(text, i);
    if (skip > 0) {
      i += skip;
      continue;
    }
    // Handle surrogate pairs
    let cp = text.codePointAt(i)!;
    let charLen = cp > 0xffff ? 2 : 1;
    width += measureWidth(String.fromCodePoint(cp));
    i += charLen;
  }
  return width;
}

/**
 * Compute wrap points for a line at the given column width.
 * Returns strictly increasing UTF-16 offsets where wraps occur.
 *
 * - Wide chars (width 2) with only 1 column left → wrap before.
 * - Never splits surrogate pairs.
 * - Never splits inside recognized ANSI sequences.
 */
export function computeWrapPoints(
  text: string,
  columns: number,
  measureWidth: (text: string) => number,
): number[] {
  let wrapPoints: number[] = [];
  let col = 0;
  let i = 0;

  while (i < text.length) {
    let skip = skipAnsiSequence(text, i);
    if (skip > 0) {
      i += skip;
      continue;
    }

    let cp = text.codePointAt(i)!;
    let charLen = cp > 0xffff ? 2 : 1;
    let w = measureWidth(String.fromCodePoint(cp));

    if (col > 0 && col + w > columns) {
      wrapPoints.push(i);
      col = 0;
    }

    col += w;
    i += charLen;
  }

  return wrapPoints;
}
