import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

describe("C.SCROLL — scrollBy", () => {
  it("C.SCROLL.down-one-row — scrolling down shifts viewport", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 3 });
    for (let i = 0; i < 5; i++) v.appendLine(`line ${i}`);
    // After 5 appends with bottom-follow, anchor at line 4.
    // scrollBy(-4) to move anchor to line 0.
    v.scrollBy(-4);
    expect(v.anchorLineIndex).toBe(0);
    let vp1 = v.resolveViewport();
    expect(vp1.entries.map((e) => e.lineIndex)).toEqual([0, 1, 2]);

    v.scrollBy(1);
    let vp2 = v.resolveViewport();
    expect(vp2.entries.map((e) => e.lineIndex)).toEqual([1, 2, 3]);
  });

  it("C.SCROLL.up-past-top-clamps — scrolling past top clamps to baseIndex", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 5; i++) v.appendLine(`line ${i}`);
    v.scrollBy(-100);
    expect(v.anchorLineIndex).toBe(v.baseIndex);
    expect(v.anchorSubRow).toBe(0);
  });

  it("C.SCROLL.down-past-bottom-clamps-and-sets-isAtBottom", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 5; i++) v.appendLine(`line ${i}`);
    // anchor at 4 (bottom-follow), isAtBottom=true
    v.scrollBy(-3); // anchor at line 1
    expect(v.isAtBottom).toBe(false);
    v.scrollBy(100);
    expect(v.isAtBottom).toBe(true);
  });

  it("C.SCROLL.up-clears-isAtBottom — scrolling up clears isAtBottom", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 5; i++) v.appendLine(`line ${i}`);
    expect(v.isAtBottom).toBe(true);
    v.scrollBy(-1);
    expect(v.isAtBottom).toBe(false);
  });

  it("C.SCROLL.empty-buffer-noop — scrollBy on empty buffer is a no-op", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.scrollBy(5);
    expect(v.isAtBottom).toBe(true);
    expect(v.lineCount).toBe(0);
  });

  it("C.SCROLL.wrapping-lines-counted — sub-rows are counted when scrolling", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 10, rows: 24 });
    v.appendLine("abcdefghijklmnopqrstuvwxy"); // 25 chars, 3 sub-rows (index 0)
    v.appendLine("hello"); // 5 chars, 1 sub-row (index 1)
    // After append, anchor at line 1 (bottom-follow).
    // scrollBy(-3) to go back 3 visual rows:
    // from line 1 sub-row 0 → back 1 to line 0 sub-row 2 → back 1 to sub-row 1 → back 1 to sub-row 0
    v.scrollBy(-3);
    expect(v.anchorLineIndex).toBe(0);
    expect(v.anchorSubRow).toBe(0);

    // scrollBy(2) → sub-row 0 → 1 → 2
    v.scrollBy(2);
    expect(v.anchorLineIndex).toBe(0);
    expect(v.anchorSubRow).toBe(2);
  });

  it("C.SCROLL.currentEstimate-nondecreasing-on-scroll-down", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 20; i++) v.appendLine(`line ${i}`);
    v.scrollBy(-10);
    let prev = v.currentEstimatedVisualRow;
    v.scrollBy(1);
    expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(prev);
  });

  it("C.SCROLL.nonincreasing-on-scroll-up", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 20; i++) v.appendLine(`line ${i}`);
    v.scrollBy(-10);
    let prev = v.currentEstimatedVisualRow;
    v.scrollBy(-1);
    expect(v.currentEstimatedVisualRow).toBeLessThanOrEqual(prev);
  });

  it("C.SCROLL.monotonicity-under-exact-estimate-mismatch — wide chars maintain monotonicity", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 5, rows: 24 });
    for (let i = 0; i < 20; i++) {
      v.appendLine("文字abc文d"); // mixed wide/narrow
    }
    v.scrollBy(-50); // scroll near top

    // Forward: each step >= previous
    let prev = v.currentEstimatedVisualRow;
    for (let i = 0; i < 10; i++) {
      v.scrollBy(1);
      expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(prev);
      prev = v.currentEstimatedVisualRow;
    }

    // Backward: each step <= previous
    prev = v.currentEstimatedVisualRow;
    for (let i = 0; i < 10; i++) {
      v.scrollBy(-1);
      expect(v.currentEstimatedVisualRow).toBeLessThanOrEqual(prev);
      prev = v.currentEstimatedVisualRow;
    }
  });

  it("C.ESTIMATE.current-within-total — holds when exact wraps exceed estimate", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 3, rows: 24 });
    // "文" is width 2. At columns=3: 1 per row → 10 exact sub-rows
    // estimate = ceil(20/3) = 7
    v.appendLine("文".repeat(10));
    v.scrollBy(9); // scroll to last exact sub-row
    expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
    expect(v.currentEstimatedVisualRow).toBeLessThan(v.totalEstimatedVisualRows);
  });
});
