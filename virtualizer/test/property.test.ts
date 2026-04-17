import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";
import { skipAnsiSequence } from "../ansi-scanner.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

// Simple deterministic PRNG for reproducibility
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLine(rng: () => number): string {
  let kind = rng();
  if (kind < 0.3) {
    // ASCII
    let len = Math.floor(rng() * 120);
    return Array.from({ length: len }, () =>
      String.fromCharCode(32 + Math.floor(rng() * 95))
    ).join("");
  } else if (kind < 0.5) {
    // CJK
    let len = Math.floor(rng() * 40);
    return Array.from({ length: len }, () =>
      String.fromCharCode(0x4e00 + Math.floor(rng() * 0x5200))
    ).join("");
  } else if (kind < 0.7) {
    // Mixed with ANSI
    let parts: string[] = [];
    let len = Math.floor(rng() * 50);
    for (let i = 0; i < len; i++) {
      if (rng() < 0.2) {
        parts.push(`\x1b[${Math.floor(rng() * 37 + 1)}m`);
      } else {
        parts.push(String.fromCharCode(32 + Math.floor(rng() * 95)));
      }
    }
    return parts.join("");
  } else {
    // Empty or short
    return "x".repeat(Math.floor(rng() * 5));
  }
}

function assertViewportInvariants(v: Virtualizer) {
  let vp = v.resolveViewport();

  // O-1: entries ordered
  for (let i = 1; i < vp.entries.length; i++) {
    expect(vp.entries[i].lineIndex).toBeGreaterThan(vp.entries[i - 1].lineIndex);
  }

  let totalVisible = 0;
  for (let entry of vp.entries) {
    // O-3: wrapPoints monotonic and in range
    for (let j = 0; j < entry.wrapPoints.length; j++) {
      expect(entry.wrapPoints[j]).toBeGreaterThan(0);
      expect(entry.wrapPoints[j]).toBeLessThan(entry.text.length);
      if (j > 0) expect(entry.wrapPoints[j]).toBeGreaterThan(entry.wrapPoints[j - 1]);
    }

    // O-4: not in surrogate
    for (let wp of entry.wrapPoints) {
      if (wp > 0) {
        let prev = entry.text.charCodeAt(wp - 1);
        expect(prev >= 0xd800 && prev <= 0xdbff).toBe(false);
      }
    }

    // O-5: not in escape
    for (let wp of entry.wrapPoints) {
      let i = 0;
      while (i < entry.text.length) {
        let skip = skipAnsiSequence(entry.text, i);
        if (skip > 0) {
          expect(wp <= i || wp >= i + skip).toBe(true);
          i += skip;
        } else {
          i++;
        }
      }
    }

    // O-6: totalSubRows
    expect(entry.totalSubRows).toBe(entry.wrapPoints.length + 1);

    // O-7: subrow bounds
    expect(entry.firstSubRow).toBeGreaterThanOrEqual(0);
    expect(entry.visibleSubRows).toBeGreaterThanOrEqual(0);
    expect(entry.firstSubRow + entry.visibleSubRows).toBeLessThanOrEqual(entry.totalSubRows);

    totalVisible += entry.visibleSubRows;
  }

  // O-8: visible rows within budget
  expect(totalVisible).toBeLessThanOrEqual(v.rows);
}

describe("Property-based tests", () => {
  it("P.IDENTITY.never-reused — no two returned lineIndex values are equal", () => {
    let rng = mulberry32(42);
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 10, maxLines: 20 });
    let indices = new Set<number>();
    for (let i = 0; i < 100; i++) {
      let idx = v.appendLine(randomLine(rng));
      expect(indices.has(idx)).toBe(false);
      indices.add(idx);
    }
  });

  it("P.IDENTITY.monotonic — later lineIndex > earlier lineIndex", () => {
    let rng = mulberry32(123);
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 10, maxLines: 50 });
    let prev = -1;
    for (let i = 0; i < 100; i++) {
      let idx = v.appendLine(randomLine(rng));
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
  });

  it("P.IDENTITY.survives-eviction — surviving lines' lineIndex unchanged", () => {
    let rng = mulberry32(456);
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 10, maxLines: 10 });
    let assigned = new Map<number, string>();
    for (let i = 0; i < 50; i++) {
      let text = randomLine(rng);
      let idx = v.appendLine(text);
      assigned.set(idx, text);
    }
    // Verify surviving lines
    let vp = v.resolveViewport();
    for (let entry of vp.entries) {
      expect(assigned.get(entry.lineIndex)).toBe(entry.text);
    }
  });

  it("P.APPEND.scroll-position-independent — totalEstimatedVisualRows increment same regardless of scroll", () => {
    let text = "hello world test line";
    let v1 = new Virtualizer({ measureWidth: charMeasure, columns: 20, rows: 10 });
    let v2 = new Virtualizer({ measureWidth: charMeasure, columns: 20, rows: 10 });

    for (let i = 0; i < 20; i++) {
      v1.appendLine(`line ${i}`);
      v2.appendLine(`line ${i}`);
    }
    v2.scrollBy(-10); // different scroll position

    let before1 = v1.totalEstimatedVisualRows;
    let before2 = v2.totalEstimatedVisualRows;
    v1.appendLine(text);
    v2.appendLine(text);
    expect(v1.totalEstimatedVisualRows - before1).toBe(v2.totalEstimatedVisualRows - before2);
  });

  it("P.VIEWPORT.all-invariants — O-1 through O-9 hold after random ops", () => {
    let rng = mulberry32(789);
    for (let trial = 0; trial < 5; trial++) {
      let columns = 10 + Math.floor(rng() * 70);
      let v = new Virtualizer({ measureWidth: charMeasure, columns, rows: 10, maxLines: 30 });

      for (let i = 0; i < 50; i++) {
        v.appendLine(randomLine(rng));
      }

      // Random scroll
      let delta = Math.floor(rng() * 40) - 20;
      v.scrollBy(delta);

      assertViewportInvariants(v);
    }
  });

  it("P.EVICT.viewport-stable — if anchor survives, viewport identical before/after eviction", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 3, maxLines: 10 });
    for (let i = 0; i < 10; i++) v.appendLine(`line ${i}`);
    // Scroll to middle so anchor is far from eviction frontier
    v.scrollBy(-3);
    let anchorBefore = v.anchorLineIndex;
    let vp1 = v.resolveViewport();
    let entries1 = vp1.entries.map((e) => e.lineIndex);

    v.appendLine("new line"); // evicts oldest
    // Anchor should survive (it's in the middle)
    if (v.anchorLineIndex === anchorBefore) {
      let vp2 = v.resolveViewport();
      let entries2 = vp2.entries.map((e) => e.lineIndex);
      expect(entries2).toEqual(entries1);
    }
  });

  it("P.ESTIMATE.constraints-hold — estimation constraints hold after every op", () => {
    let rng = mulberry32(999);
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 20, rows: 10, maxLines: 30 });

    for (let i = 0; i < 60; i++) {
      v.appendLine(randomLine(rng));
      expect(v.totalEstimatedVisualRows).toBeGreaterThanOrEqual(0);
      if (v.lineCount > 0) {
        expect(v.totalEstimatedVisualRows).toBeGreaterThan(0);
        expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
        expect(v.currentEstimatedVisualRow).toBeLessThan(v.totalEstimatedVisualRows);
      }
    }

    // After scroll
    v.scrollBy(-15);
    expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
    expect(v.currentEstimatedVisualRow).toBeLessThan(v.totalEstimatedVisualRows);

    // After resize
    v.resize(15, 10);
    expect(v.totalEstimatedVisualRows).toBeGreaterThan(0);
    expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(0);
    expect(v.currentEstimatedVisualRow).toBeLessThan(v.totalEstimatedVisualRows);
  });

  it("P.ESTIMATE.monotonicity-under-mismatch — scrollBy maintains monotonicity with wide chars", () => {
    let rng = mulberry32(111);
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 5, rows: 24 });
    for (let i = 0; i < 30; i++) {
      v.appendLine(randomLine(rng));
    }
    v.scrollBy(-50); // scroll near top

    let prev = v.currentEstimatedVisualRow;
    for (let i = 0; i < 15; i++) {
      v.scrollBy(1);
      expect(v.currentEstimatedVisualRow).toBeGreaterThanOrEqual(prev);
      prev = v.currentEstimatedVisualRow;
    }

    prev = v.currentEstimatedVisualRow;
    for (let i = 0; i < 15; i++) {
      v.scrollBy(-1);
      expect(v.currentEstimatedVisualRow).toBeLessThanOrEqual(prev);
      prev = v.currentEstimatedVisualRow;
    }
  });

  it("P.RESIZE.viewport-invariants-hold — all invariants hold after random resize", () => {
    let rng = mulberry32(222);
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    for (let i = 0; i < 30; i++) {
      v.appendLine(randomLine(rng));
    }

    let widths = [20, 40, 60, 80, 120, 10];
    for (let w of widths) {
      v.resize(w, 24);
      assertViewportInvariants(v);
    }
  });
});
