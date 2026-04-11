import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(_text: string): number {
  return 1;
}

describe("C.FRACTION — scrollToFraction", () => {
  it("C.FRACTION.zero-scrolls-to-top", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 100; i++) v.appendLine(`line ${i}`);
    v.scrollToFraction(0);
    expect(v.anchorLineIndex).toBe(v.baseIndex);
    expect(v.anchorSubRow).toBe(0);
  });

  it("C.FRACTION.one-scrolls-to-bottom", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 100; i++) v.appendLine(`line ${i}`);
    v.scrollToFraction(1);
    expect(v.isAtBottom).toBe(true);
  });

  it("C.FRACTION.half-anchor-in-valid-range", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 100; i++) v.appendLine(`line ${i}`);
    v.scrollToFraction(0.5);
    expect(v.anchorLineIndex).toBeGreaterThanOrEqual(v.baseIndex);
    expect(v.anchorLineIndex).toBeLessThanOrEqual(v.baseIndex + v.lineCount - 1);
    expect(v.anchorSubRow).toBeGreaterThanOrEqual(0);
  });

  it("R.FRACTION.half-lands-near-middle — 100 equal-width lines, fraction 0.5 lands at line 50", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 100; i++) v.appendLine("x"); // each line width 1, 1 sub-row
    v.scrollToFraction(0.5);
    expect(v.anchorLineIndex).toBe(v.baseIndex + 50);
  });

  it("C.FRACTION.empty-buffer-noop", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.scrollToFraction(0.5);
    expect(v.lineCount).toBe(0);
    expect(v.isAtBottom).toBe(true);
  });

  it("C.FRACTION.subrow-clamped — anchorSubRow is in valid range", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 10, rows: 24 });
    // Mix of short and long lines
    for (let i = 0; i < 50; i++) {
      v.appendLine(i % 3 === 0 ? "a".repeat(25) : "short");
    }
    v.scrollToFraction(0.7);
    let entry = v.getLineDisplayWidth(v.anchorLineIndex);
    if (entry !== undefined) {
      let estimate = Math.max(1, Math.ceil(entry / 10));
      expect(v.anchorSubRow).toBeGreaterThanOrEqual(0);
      expect(v.anchorSubRow).toBeLessThan(estimate);
    }
  });

  it("C.FRACTION.currentEstimate-updated — currentEstimatedVisualRow reflects walk", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 50; i++) v.appendLine("x");
    v.scrollToFraction(0.5);
    // Manually verify: 50 lines each 1 sub-row, target = floor(0.5*50) = 25
    // Walk 25 lines → accumulated = 25, anchorSubRow = 0
    // currentEstimatedVisualRow = 25 + 0 = 25
    expect(v.currentEstimatedVisualRow).toBe(25);
  });

  it("C.FRACTION.zero-after-eviction — fraction 0 goes to baseIndex after eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 50 });
    for (let i = 0; i < 80; i++) v.appendLine(`line ${i}`);
    v.scrollToFraction(0);
    expect(v.anchorLineIndex).toBe(v.baseIndex); // 30, not 0
  });

  it("C.FRACTION.mid-after-eviction — fraction 0.5 in valid range after eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 50 });
    for (let i = 0; i < 80; i++) v.appendLine(`line ${i}`);
    v.scrollToFraction(0.5);
    expect(v.anchorLineIndex).toBeGreaterThanOrEqual(v.baseIndex);
    expect(v.anchorLineIndex).toBeLessThanOrEqual(v.baseIndex + v.lineCount - 1);
  });
});
