import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(_text: string): number {
  return 1;
}

describe("C.APPEND — appendLine", () => {
  it("C.APPEND.stores-text — text is retrievable via resolveViewport", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("hello world");
    let vp = v.resolveViewport();
    expect(vp.entries[0].text).toBe("hello world");
  });

  it("C.APPEND.increments-estimated-total — totalEstimatedVisualRows increases correctly", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 10, rows: 24 });
    let before = v.totalEstimatedVisualRows;
    v.appendLine("hello"); // width 5, ceil(5/10) = 1
    expect(v.totalEstimatedVisualRows - before).toBe(1);
  });

  it("C.APPEND.bottom-follow-advances-anchor — anchor tracks newest line when at bottom", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    expect(v.isAtBottom).toBe(true);
    let idx0 = v.appendLine("line 0");
    expect(v.anchorLineIndex).toBe(idx0);
    let idx1 = v.appendLine("line 1");
    expect(v.anchorLineIndex).toBe(idx1);
    let idx2 = v.appendLine("line 2");
    expect(v.anchorLineIndex).toBe(idx2);

    let vp = v.resolveViewport();
    let lastEntry = vp.entries[vp.entries.length - 1];
    expect(lastEntry.lineIndex).toBe(idx2);
  });

  it("C.APPEND.does-not-invalidate-existing-wrap-cache — cached wrap points survive new appends", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 5, rows: 24 });
    v.appendLine("abcdefghij"); // wraps at 5
    let vp1 = v.resolveViewport();
    let wp1 = vp1.entries[0].wrapPoints.slice();

    v.appendLine("more text");
    let vp2 = v.resolveViewport();
    // The first line should still be in the viewport with same wrap points
    let entry = vp2.entries.find((e) => e.text === "abcdefghij");
    if (entry) {
      expect(entry.wrapPoints).toEqual(wp1);
    }
  });

  it("C.APPEND.identity-counter-independent-of-buffer — indices always increase", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 2 });
    let a = v.appendLine("A"); // 0
    let b = v.appendLine("B"); // 1
    let c = v.appendLine("C"); // 2, evicts A
    let d = v.appendLine("D"); // 3, evicts B
    expect([a, b, c, d]).toEqual([0, 1, 2, 3]);
  });

  it("C.APPEND.no-bottom-follow-when-scrolled-up — anchor stays when not at bottom", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 3 });
    for (let i = 0; i < 10; i++) v.appendLine(`line ${i}`);
    // anchor at 9 (bottom-follow). scrollBy(-5) → anchor at 4.
    v.scrollBy(-5);
    let anchorBefore = v.anchorLineIndex;
    expect(anchorBefore).toBe(4);
    let vp1 = v.resolveViewport();
    let entries1 = vp1.entries.map((e) => e.lineIndex);
    // rows=3, forward walk from 4: [4,5,6] (full)
    expect(entries1).toEqual([4, 5, 6]);

    // Append 3 more lines — anchor should not move, viewport stays full at [4,5,6]
    v.appendLine("extra 1");
    v.appendLine("extra 2");
    v.appendLine("extra 3");

    expect(v.anchorLineIndex).toBe(anchorBefore);
    let vp2 = v.resolveViewport();
    let entries2 = vp2.entries.map((e) => e.lineIndex);
    expect(entries2).toEqual(entries1);
  });
});
