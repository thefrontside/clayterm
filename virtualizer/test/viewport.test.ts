import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";
import { skipAnsiSequence } from "../ansi-scanner.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

function sliceAtWrapPoints(text: string, wrapPoints: number[]): string[] {
  if (wrapPoints.length === 0) return [text];
  let slices: string[] = [];
  let prev = 0;
  for (let wp of wrapPoints) {
    slices.push(text.slice(prev, wp));
    prev = wp;
  }
  slices.push(text.slice(prev));
  return slices;
}

function stripAnsi(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    let skip = skipAnsiSequence(text, i);
    if (skip > 0) {
      i += skip;
      continue;
    }
    result += text[i];
    i++;
  }
  return result;
}

function visibleWidth(text: string, measureWidth: (t: string) => number): number {
  let stripped = stripAnsi(text);
  let w = 0;
  for (let i = 0; i < stripped.length; i++) {
    let cp = stripped.codePointAt(i)!;
    let charLen = cp > 0xffff ? 2 : 1;
    w += measureWidth(String.fromCodePoint(cp));
    if (charLen === 2) i++;
  }
  return w;
}

describe("C.VIEWPORT — resolveViewport output invariants", () => {
  function makeVirtualizer(columns = 20, rows = 5) {
    return new Virtualizer({ measureWidth: charMeasure, columns, rows });
  }

  it("C.VIEWPORT.entries-ordered — entries have strictly increasing lineIndex", () => {
    let v = makeVirtualizer();
    for (let i = 0; i < 10; i++) v.appendLine(`line ${i}`);
    let vp = v.resolveViewport();
    for (let i = 1; i < vp.entries.length; i++) {
      expect(vp.entries[i].lineIndex).toBeGreaterThan(vp.entries[i - 1].lineIndex);
    }
  });

  it("C.VIEWPORT.text-is-original — entry text is the original string", () => {
    let v = makeVirtualizer();
    let original = "hello world";
    v.appendLine(original);
    let vp = v.resolveViewport();
    expect(vp.entries[0].text).toBe(original);
  });

  it("C.VIEWPORT.wrapPoints-monotonic — wrapPoints are strictly increasing in (0, text.length)", () => {
    let v = makeVirtualizer(5);
    v.appendLine("abcdefghijklmno"); // 15 chars, wraps at 5, 10
    let vp = v.resolveViewport();
    let wp = vp.entries[0].wrapPoints;
    for (let i = 0; i < wp.length; i++) {
      expect(wp[i]).toBeGreaterThan(0);
      expect(wp[i]).toBeLessThan(15);
      if (i > 0) expect(wp[i]).toBeGreaterThan(wp[i - 1]);
    }
  });

  it("C.VIEWPORT.wrapPoints-not-in-surrogate — wrapPoints don't split surrogate pairs", () => {
    let v = makeVirtualizer(3);
    // Emoji are surrogate pairs in UTF-16: each is 2 code units
    v.appendLine("a😀b😀c");
    let vp = v.resolveViewport();
    let text = vp.entries[0].text;
    for (let wp of vp.entries[0].wrapPoints) {
      if (wp > 0) {
        let prev = text.charCodeAt(wp - 1);
        // prev should not be a high surrogate (0xD800–0xDBFF)
        expect(prev >= 0xd800 && prev <= 0xdbff).toBe(false);
      }
    }
  });

  it("C.VIEWPORT.wrapPoints-not-in-escape — wrapPoints don't fall inside ANSI sequences", () => {
    let v = makeVirtualizer(5);
    v.appendLine("abcde\x1b[31mfghij\x1b[0mklmno");
    let vp = v.resolveViewport();
    let text = vp.entries[0].text;
    for (let wp of vp.entries[0].wrapPoints) {
      // Check that wp is not inside an ANSI sequence
      let i = 0;
      while (i < text.length) {
        let skip = skipAnsiSequence(text, i);
        if (skip > 0) {
          // wp should not be in (i, i+skip)
          expect(wp <= i || wp >= i + skip).toBe(true);
          i += skip;
        } else {
          i++;
        }
      }
    }
  });

  it("C.VIEWPORT.totalSubRows-equals-wrapPoints-plus-one", () => {
    let v = makeVirtualizer(5);
    v.appendLine("abcdefghij"); // wraps once at 5 → 2 sub-rows
    let vp = v.resolveViewport();
    for (let entry of vp.entries) {
      expect(entry.totalSubRows).toBe(entry.wrapPoints.length + 1);
    }
  });

  it("C.VIEWPORT.subrow-bounds — firstSubRow and visibleSubRows are valid", () => {
    let v = makeVirtualizer(5);
    v.appendLine("abcdefghijklmno");
    let vp = v.resolveViewport();
    for (let entry of vp.entries) {
      expect(entry.firstSubRow).toBeGreaterThanOrEqual(0);
      expect(entry.visibleSubRows).toBeGreaterThanOrEqual(0);
      expect(entry.firstSubRow + entry.visibleSubRows).toBeLessThanOrEqual(entry.totalSubRows);
    }
  });

  it("C.VIEWPORT.visible-rows-within-budget — total visible sub-rows ≤ rows", () => {
    let v = makeVirtualizer(10, 5);
    for (let i = 0; i < 20; i++) v.appendLine(`line ${i} with some text`);
    let vp = v.resolveViewport();
    let totalVisible = vp.entries.reduce((s, e) => s + e.visibleSubRows, 0);
    expect(totalVisible).toBeLessThanOrEqual(5);
  });

  it("C.VIEWPORT.sliced-width-within-columns — each sub-row fits within columns (requires columns ≥ max glyph width)", () => {
    let v = makeVirtualizer(10, 24);
    v.appendLine("abcdefghijklmnopqrstuvwxyz");
    v.appendLine("abc文def字ghi"); // includes width-2 CJK glyphs
    let vp = v.resolveViewport();
    for (let entry of vp.entries) {
      let slices = sliceAtWrapPoints(entry.text, entry.wrapPoints);
      for (let slice of slices) {
        expect(visibleWidth(slice, charMeasure)).toBeLessThanOrEqual(10);
      }
    }
  });

  it("C.VIEWPORT.self-contained — viewport can be reconstructed from text + wrapPoints alone", () => {
    let v = makeVirtualizer(10, 24);
    v.appendLine("hello world, this is a long line of text");
    let vp = v.resolveViewport();
    for (let entry of vp.entries) {
      let slices = sliceAtWrapPoints(entry.text, entry.wrapPoints);
      expect(slices.length).toBe(entry.totalSubRows);
    }
  });

  it("C.VIEWPORT.estimation-fields-present — all estimation fields defined", () => {
    let v = makeVirtualizer();
    v.appendLine("test");
    let vp = v.resolveViewport();
    expect(vp.totalEstimatedVisualRows).not.toBe(undefined);
    expect(vp.currentEstimatedVisualRow).not.toBe(undefined);
    expect(vp.isAtBottom).not.toBe(undefined);
  });

  it("C.VIEWPORT.estimation-inequality — currentEstimatedVisualRow in valid range", () => {
    let v = makeVirtualizer();
    v.appendLine("test");
    let vp = v.resolveViewport();
    expect(vp.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
    expect(vp.currentEstimatedVisualRow).toBeLessThan(vp.totalEstimatedVisualRows);

    // Empty case
    let v2 = makeVirtualizer();
    let vp2 = v2.resolveViewport();
    expect(vp2.totalEstimatedVisualRows).toBe(0);
    expect(vp2.currentEstimatedVisualRow).toBe(0);
  });

  it("C.VIEWPORT.empty-buffer — empty resolves to empty entries", () => {
    let v = makeVirtualizer();
    let vp = v.resolveViewport();
    expect(vp.entries.length).toBe(0);
    expect(vp.totalEstimatedVisualRows).toBe(0);
    expect(vp.currentEstimatedVisualRow).toBe(0);
    expect(vp.isAtBottom).toBe(true);
  });
});
