import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(_text: string): number {
  return 1;
}

describe("C.EMPTY — empty buffer", () => {
  it("C.EMPTY.construction-state — initial state is empty and at bottom", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    expect(v.lineCount).toBe(0);
    expect(v.totalEstimatedVisualRows).toBe(0);
    expect(v.currentEstimatedVisualRow).toBe(0);
    expect(v.isAtBottom).toBe(true);
  });

  it("C.EMPTY.resolve-returns-empty — resolveViewport on empty buffer returns empty entries", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let vp = v.resolveViewport();
    expect(vp.entries.length).toBe(0);
    expect(vp.totalEstimatedVisualRows).toBe(0);
    expect(vp.currentEstimatedVisualRow).toBe(0);
    expect(vp.isAtBottom).toBe(true);
  });

  it("C.EMPTY.first-append-uses-counter — first appendLine returns 0", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    expect(v.appendLine("first")).toBe(0);
  });

  it("C.EMPTY.identity-counter-not-reset-after-eviction — counter continues after eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 1 });
    v.appendLine("A"); // 0
    v.appendLine("B"); // 1
    v.appendLine("C"); // 2
    expect(v.baseIndex).toBe(2);
  });

  it("C.EMPTY.scrollBy-noop — scrollBy on empty buffer is a no-op", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.scrollBy(5);
    expect(v.isAtBottom).toBe(true);
    expect(v.lineCount).toBe(0);
  });

  it("C.EMPTY.scrollToFraction-noop — scrollToFraction on empty buffer is a no-op", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.scrollToFraction(0.5);
    expect(v.isAtBottom).toBe(true);
    expect(v.lineCount).toBe(0);
  });
});
