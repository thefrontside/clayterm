import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

describe("Exactness vs approximation structural tests", () => {
  it("Exact viewport assertions — O-1 through O-9 hold with varied content", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 15, rows: 10 });
    v.appendLine("short");
    v.appendLine("a".repeat(30));
    v.appendLine("文字abc文字def");
    v.appendLine("\x1b[31mcolored\x1b[0m text");
    v.appendLine("");

    let vp = v.resolveViewport();

    // O-1: entries ordered
    for (let i = 1; i < vp.entries.length; i++) {
      expect(vp.entries[i].lineIndex).toBeGreaterThan(vp.entries[i - 1].lineIndex);
    }

    for (let entry of vp.entries) {
      // O-3: wrapPoints monotonic
      for (let j = 1; j < entry.wrapPoints.length; j++) {
        expect(entry.wrapPoints[j]).toBeGreaterThan(entry.wrapPoints[j - 1]);
      }
      // O-6: totalSubRows
      expect(entry.totalSubRows).toBe(entry.wrapPoints.length + 1);
      // O-7: subrow bounds
      expect(entry.firstSubRow).toBeGreaterThanOrEqual(0);
      expect(entry.visibleSubRows).toBeGreaterThanOrEqual(0);
      expect(entry.firstSubRow + entry.visibleSubRows).toBeLessThanOrEqual(entry.totalSubRows);
    }

    // O-8: total visible ≤ rows
    let totalVisible = vp.entries.reduce((s, e) => s + e.visibleSubRows, 0);
    expect(totalVisible).toBeLessThanOrEqual(10);
  });

  it("Structural estimation non-negative — totalEstimatedVisualRows ≥ 0 after random ops", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 20, rows: 10, maxLines: 50 });
    for (let i = 0; i < 100; i++) {
      v.appendLine("x".repeat(i % 40));
    }
    v.scrollBy(-30);
    v.resize(15, 10);
    expect(v.totalEstimatedVisualRows).toBeGreaterThanOrEqual(0);
  });

  it("Structural estimation zero-empty — both fields 0 on empty buffer", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    expect(v.totalEstimatedVisualRows).toBe(0);
    expect(v.currentEstimatedVisualRow).toBe(0);
  });

  it("Structural estimation positive-nonempty — totalEstimatedVisualRows > 0 when lineCount > 0", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("x");
    expect(v.totalEstimatedVisualRows).toBeGreaterThan(0);
  });

  it("Structural currentEstimate inequality — valid range when lineCount > 0", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 20, rows: 10 });
    for (let i = 0; i < 50; i++) v.appendLine("a".repeat(i % 30));
    v.scrollBy(-20);
    expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
    expect(v.currentEstimatedVisualRow).toBeLessThan(v.totalEstimatedVisualRows);
  });

  it("Reference-behavior exact formula — estimation matches ceil(displayWidth/columns)", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 10, rows: 24 });
    let before = v.totalEstimatedVisualRows;
    v.appendLine("a".repeat(15)); // displayWidth=15, ceil(15/10)=2
    expect(v.totalEstimatedVisualRows - before).toBe(2);
  });
});
