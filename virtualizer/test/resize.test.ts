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
    if (skip > 0) { i += skip; continue; }
    result += text[i];
    i++;
  }
  return result;
}

function visibleWidth(text: string): number {
  let stripped = stripAnsi(text);
  let w = 0;
  for (let i = 0; i < stripped.length; i++) {
    let cp = stripped.codePointAt(i)!;
    if (cp > 0xffff) { i++; w += 2; }
    else if (cp >= 0x4e00 && cp <= 0x9fff) w += 2;
    else if (cp < 0x20) w += 0;
    else w += 1;
  }
  return w;
}

describe("C.RESIZE — resize", () => {
  it("C.RESIZE.wrap-cache-invalidated — wrap points recomputed after column change", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("a".repeat(100));
    let vp1 = v.resolveViewport();
    expect(vp1.entries[0].totalSubRows).toBe(2); // ceil(100/80)=2

    v.resize(50, 24);
    let vp2 = v.resolveViewport();
    expect(vp2.entries[0].totalSubRows).toBe(2); // ceil(100/50)=2, but with exact wrapping
    // Verify wrap points are different from width-80
    expect(vp2.entries[0].wrapPoints).not.toEqual(vp1.entries[0].wrapPoints);
  });

  it("C.RESIZE.anchor-subrow-clamped — anchorSubRow clamped to new wrap count", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 20, rows: 24 });
    v.appendLine("a".repeat(100)); // 5 sub-rows at width 20
    v.scrollBy(4); // anchorSubRow=4
    expect(v.anchorSubRow).toBe(4);

    v.resize(50, 24); // now 2 sub-rows → clamp to 1
    expect(v.anchorSubRow).toBe(1);
  });

  it("C.RESIZE.anchor-subrow-clamped-exact — uses exact wrapping for clamp, not estimate", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 3, rows: 24 });
    // "文" is width 2. At columns=3: 1 fits per row (2+2=4 > 3) → 10 exact sub-rows
    // estimate = ceil(20/3) = 7
    v.appendLine("文".repeat(10));
    v.scrollBy(8); // anchorSubRow = 8 (valid in exact range 0-9)
    expect(v.anchorSubRow).toBe(8);

    // Resize to columns=5: 2 chars fit per row (2+2=4 ≤ 5) → 5 exact sub-rows
    // estimate = ceil(20/5) = 4
    // Should clamp to exact(5)-1 = 4, not estimate(4)-1 = 3
    v.resize(5, 24);
    expect(v.anchorSubRow).toBe(4);
  });

  it("C.RESIZE.bottom-follow-preserved — isAtBottom survives resize", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("hello");
    expect(v.isAtBottom).toBe(true);
    v.resize(40, 24);
    expect(v.isAtBottom).toBe(true);
  });

  it("C.RESIZE.row-only-no-invalidation — row-only change does not affect wrapping", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("a".repeat(100));
    let vp1 = v.resolveViewport();
    let total1 = v.totalEstimatedVisualRows;
    let anchor1 = v.anchorLineIndex;

    v.resize(80, 40);
    expect(v.totalEstimatedVisualRows).toBe(total1);
    expect(v.anchorLineIndex).toBe(anchor1);
  });

  it("C.RESIZE.viewport-correct-after-resize — all output invariants hold after resize", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("short");
    v.appendLine("a".repeat(100));
    v.appendLine("文字".repeat(20));

    v.resize(40, 24);
    let vp = v.resolveViewport();

    // O-1: entries ordered
    for (let i = 1; i < vp.entries.length; i++) {
      expect(vp.entries[i].lineIndex).toBeGreaterThan(vp.entries[i - 1].lineIndex);
    }

    for (let entry of vp.entries) {
      // O-6: totalSubRows
      expect(entry.totalSubRows).toBe(entry.wrapPoints.length + 1);
      // O-7: subrow bounds
      expect(entry.firstSubRow + entry.visibleSubRows).toBeLessThanOrEqual(entry.totalSubRows);
      // O-9: sliced width within columns
      let slices = sliceAtWrapPoints(entry.text, entry.wrapPoints);
      for (let slice of slices) {
        expect(visibleWidth(slice)).toBeLessThanOrEqual(40);
      }
    }

    // O-8: visible rows within budget
    let totalVisible = vp.entries.reduce((s, e) => s + e.visibleSubRows, 0);
    expect(totalVisible).toBeLessThanOrEqual(24);
  });

  it("C.RESIZE.estimation-fields-valid-after-resize — estimation constraints hold", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 100; i++) v.appendLine(`line ${i}`);

    v.resize(40, 24);
    expect(v.totalEstimatedVisualRows).toBeGreaterThan(0);
    expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
    expect(v.currentEstimatedVisualRow).toBeLessThan(v.totalEstimatedVisualRows);
  });

  it("C.RESIZE.displayWidth-unchanged — cached displayWidth unchanged across resize", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("hello");
    let before = v.getLineDisplayWidth(idx);
    v.resize(40, 24);
    expect(v.getLineDisplayWidth(idx)).toBe(before);
  });

  it("C.RESIZE.empty-buffer — resize on empty buffer does not error", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.resize(40, 24);
    let vp = v.resolveViewport();
    expect(vp.entries.length).toBe(0);
    expect(vp.totalEstimatedVisualRows).toBe(0);
  });
});

describe("G.RESIZE — resize golden fixtures", () => {
  it("G.RESIZE.narrow-to-wide — wrapping removed when columns increase", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 24 });
    v.appendLine("a".repeat(80));
    let vp1 = v.resolveViewport();
    expect(vp1.entries[0].totalSubRows).toBe(2);

    v.resize(80, 24);
    let vp2 = v.resolveViewport();
    expect(vp2.entries[0].totalSubRows).toBe(1);
    expect(vp2.entries[0].wrapPoints).toEqual([]);
  });

  it("G.RESIZE.wide-to-narrow — wrapping added when columns decrease", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("a".repeat(80));
    let vp1 = v.resolveViewport();
    expect(vp1.entries[0].totalSubRows).toBe(1);

    v.resize(20, 24);
    let vp2 = v.resolveViewport();
    expect(vp2.entries[0].totalSubRows).toBe(4);
    expect(vp2.entries[0].wrapPoints.length).toBe(3);
  });
});

describe("C.APPEND.caches-displayWidth (deferred from PR 2)", () => {
  it("C.APPEND.caches-displayWidth — displayWidth unchanged after resize", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("abc");
    expect(v.getLineDisplayWidth(idx)).toBe(3);
    v.resize(2, 24);
    expect(v.getLineDisplayWidth(idx)).toBe(3);
  });
});
