import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(_text: string): number {
  return 1;
}

describe("C.EVICT — basic eviction (non-scroll subset)", () => {
  it("C.EVICT.triggers-at-capacity — lineCount stays at maxLines", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 3 });
    v.appendLine("A");
    v.appendLine("B");
    v.appendLine("C");
    v.appendLine("D");
    expect(v.lineCount).toBe(3);
  });

  it("C.EVICT.removes-oldest — oldest line is evicted", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 3 });
    v.appendLine("A"); // 0
    v.appendLine("B"); // 1
    v.appendLine("C"); // 2
    v.appendLine("D"); // 3, evicts A
    let vp = v.resolveViewport();
    let indices = vp.entries.map((e) => e.lineIndex);
    expect(indices).toEqual([1, 2, 3]);
  });

  it("C.EVICT.baseIndex-advances — baseIndex tracks eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 2 });
    v.appendLine("A"); expect(v.baseIndex).toBe(0);
    v.appendLine("B"); expect(v.baseIndex).toBe(0);
    v.appendLine("C"); expect(v.baseIndex).toBe(1);
    v.appendLine("D"); expect(v.baseIndex).toBe(2);
  });

  it("C.EVICT.estimation-decremented — total estimate accounts for eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 10, rows: 24, maxLines: 3 });
    v.appendLine("hello"); // 5 chars, 1 row
    v.appendLine("world"); // 5 chars, 1 row
    v.appendLine("three"); // 5 chars, 1 row
    expect(v.totalEstimatedVisualRows).toBe(3);
    v.appendLine("four!"); // evicts "hello", total stays 3
    expect(v.totalEstimatedVisualRows).toBe(3);
  });

  it("C.EVICT.maxLines-one — single-line buffer works correctly", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 1 });
    v.appendLine("A"); // 0
    v.appendLine("B"); // 1
    expect(v.lineCount).toBe(1);
    expect(v.baseIndex).toBe(1);
    let vp = v.resolveViewport();
    expect(vp.entries[0].lineIndex).toBe(1);
  });

  it("C.EVICT.anchor-survives-when-newer — anchor not affected by eviction of older line", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 5 });
    for (let i = 0; i < 5; i++) v.appendLine(`line ${i}`); // indices 0–4, anchor at 4
    v.scrollBy(-1); // anchor at 3, isAtBottom=false
    expect(v.anchorLineIndex).toBe(3);

    v.appendLine("line 5"); // evicts index 0
    expect(v.anchorLineIndex).toBe(3); // unchanged
    let vp = v.resolveViewport();
    expect(vp.entries[0].lineIndex).toBeGreaterThanOrEqual(1);
  });

  it("C.EVICT.viewport-stable-when-anchor-survives — viewport unchanged after eviction of older line", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 2, maxLines: 5 });
    for (let i = 0; i < 5; i++) v.appendLine(`line ${i}`);
    // anchor at 4 (bottom-follow). scrollBy(-1) → anchor at 3.
    v.scrollBy(-1);
    expect(v.anchorLineIndex).toBe(3);
    // rows=2, forward from 3: [3,4] (full)
    let vp1 = v.resolveViewport();
    let entries1 = vp1.entries.map((e) => ({ lineIndex: e.lineIndex, text: e.text }));
    expect(entries1).toEqual([
      { lineIndex: 3, text: "line 3" },
      { lineIndex: 4, text: "line 4" },
    ]);

    v.appendLine("line 5"); // evicts index 0, anchor still at 3
    let vp2 = v.resolveViewport();
    let entries2 = vp2.entries.map((e) => ({ lineIndex: e.lineIndex, text: e.text }));
    expect(entries2).toEqual(entries1);
  });

  it("C.EVICT.anchor-clamps-when-evicted — anchor clamped to next surviving line", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 3 });
    v.appendLine("A"); // 0
    v.appendLine("B"); // 1
    v.appendLine("C"); // 2, anchor at 2 via bottom-follow
    v.scrollBy(-2); // anchor at 0, isAtBottom=false
    expect(v.anchorLineIndex).toBe(0);

    v.appendLine("D"); // evicts A(0), anchor was at 0 → clamp to 1
    expect(v.anchorLineIndex).toBe(1);
    expect(v.anchorSubRow).toBe(0);
  });

  it("C.EVICT.currentEstimate-decremented-when-anchor-survives — currentEstimate adjusts for eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 5 });
    for (let i = 0; i < 5; i++) v.appendLine("x"); // each 1 row
    v.scrollBy(-1); // anchor at 3
    let before = v.currentEstimatedVisualRow;

    v.appendLine("y"); // evicts index 0 (1 row)
    // currentEstimate should decrease by 1 (evicted line's estimate)
    expect(v.currentEstimatedVisualRow).toBe(before - 1);
  });

  it("C.EVICT.currentEstimate-zero-when-anchor-evicted — currentEstimate resets to 0", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 3 });
    v.appendLine("A"); // 0
    v.appendLine("B"); // 1
    v.appendLine("C"); // 2
    v.scrollBy(-2); // anchor at 0
    v.appendLine("D"); // evicts A(0), anchor clamped to 1
    expect(v.currentEstimatedVisualRow).toBe(0);
  });

  it("R.EVICT.maxLines1-not-at-bottom — anchor clamps to surviving line when isAtBottom is false", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 1 });
    v.appendLine("A"); // lineIndex 0, anchor 0, isAtBottom true
    v.scrollBy(-1);    // isAtBottom false, anchor still 0
    expect(v.isAtBottom).toBe(false);

    v.appendLine("B"); // evicts A(0), inserts B(1)
    // Anchor must clamp to the surviving line (1), not stay on evicted (0)
    expect(v.anchorLineIndex).toBe(1);
    expect(v.anchorSubRow).toBe(0);
    expect(v.lineCount).toBe(1);

    // resolveViewport must return the surviving line, not empty
    let vp = v.resolveViewport();
    expect(vp.entries.length).toBe(1);
    expect(vp.entries[0].lineIndex).toBe(1);
    expect(vp.entries[0].text).toBe("B");
  });
});
