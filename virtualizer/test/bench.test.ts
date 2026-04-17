import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";
import { skipAnsiSequence } from "../ansi-scanner.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

function assertViewportInvariants(v: Virtualizer) {
  let vp = v.resolveViewport();
  for (let entry of vp.entries) {
    expect(entry.totalSubRows).toBe(entry.wrapPoints.length + 1);
    expect(entry.firstSubRow).toBeGreaterThanOrEqual(0);
    expect(entry.firstSubRow + entry.visibleSubRows).toBeLessThanOrEqual(entry.totalSubRows);
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
  }
}

// Generate ANSI-heavy lines like htop/npm output
function ansiHeavyLine(len: number): string {
  let parts: string[] = [];
  for (let i = 0; i < len; i++) {
    if (i % 5 === 0) parts.push(`\x1b[${(i % 7) + 30}m`);
    parts.push(String.fromCharCode(65 + (i % 26)));
  }
  parts.push("\x1b[0m");
  return parts.join("");
}

describe("Validation-gate benchmarks (informational)", () => {
  it("Gate 1: measureWidth overhead — appendLine with 10K lines", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 10_000 });
    let lines: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      lines.push("a".repeat(80));
    }

    let start = performance.now();
    for (let line of lines) {
      v.appendLine(line);
    }
    let elapsed = performance.now() - start;
    let perCall = (elapsed / 10_000) * 1000; // microseconds
    console.log(`  Gate 1: ${perCall.toFixed(2)}μs/appendLine (target ≤1μs, fail >5μs)`);
    // Informational — not a hard pass/fail
    expect(v.lineCount).toBe(10_000);
  });

  it("Gate 2: Extended ANSI corpus — invariants hold at multiple widths", () => {
    let corpus = [
      ansiHeavyLine(80),
      ansiHeavyLine(120),
      "\x1b[1m\x1b[31m" + "ERROR".repeat(20) + "\x1b[0m",
      "\x1b]0;npm install\x07\x1b[32m✓\x1b[0m packages installed",
      "plain text line with no escapes at all",
    ];

    for (let cols of [80, 40, 20]) {
      let v = new Virtualizer({ measureWidth: charMeasure, columns: cols, rows: 24 });
      for (let line of corpus) v.appendLine(line);
      assertViewportInvariants(v);
    }
  });

  it("Gate 3: Estimation accuracy — ceil(dw/cols) vs exact match rate", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 24, maxLines: 10_000 });
    let lines: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      let len = 10 + (i % 100);
      if (i % 3 === 0) {
        lines.push("文字".repeat(len / 2));
      } else {
        lines.push("a".repeat(len));
      }
    }
    for (let line of lines) v.appendLine(line);

    // Resolve to get exact wrap counts for visible lines
    let vp = v.resolveViewport();
    let matches = 0;
    let total = vp.entries.length;
    for (let entry of vp.entries) {
      let dw = v.getLineDisplayWidth(entry.lineIndex)!;
      let estimated = Math.max(1, Math.ceil(dw / 40));
      if (estimated === entry.totalSubRows) matches++;
    }
    let rate = total > 0 ? (matches / total) * 100 : 100;
    console.log(`  Gate 3: ${rate.toFixed(1)}% match rate (target >99%, fail <95%)`);
    expect(rate).toBeGreaterThan(90); // soft check
  });

  it("Gate 4: scrollToFraction performance — 100K lines", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 100_000 });
    for (let i = 0; i < 100_000; i++) {
      v.appendLine("a".repeat(40 + (i % 40)));
    }

    let start = performance.now();
    v.scrollToFraction(0.5);
    let elapsed = performance.now() - start;
    console.log(`  Gate 4: scrollToFraction(0.5) at 100K lines: ${elapsed.toFixed(2)}ms (target <5ms)`);
    expect(v.anchorLineIndex).toBeGreaterThan(0);
  });

  it("Gate 5: Skip optimization — frame time comparison", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 50 });
    for (let i = 0; i < 1000; i++) v.appendLine(`line ${i}`);
    v.scrollBy(-500); // scroll to middle

    // Append while scrolled up — should not need to resolve new lines
    let start = performance.now();
    for (let i = 0; i < 100; i++) {
      v.appendLine(`new line ${i}`);
      v.resolveViewport();
    }
    let withSkip = performance.now() - start;

    // At bottom — appends change viewport
    let v2 = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 50 });
    for (let i = 0; i < 1000; i++) v2.appendLine(`line ${i}`);

    start = performance.now();
    for (let i = 0; i < 100; i++) {
      v2.appendLine(`new line ${i}`);
      v2.resolveViewport();
    }
    let withoutSkip = performance.now() - start;

    console.log(`  Gate 5: scrolled-up=${withSkip.toFixed(2)}ms, at-bottom=${withoutSkip.toFixed(2)}ms`);
    // Just verify both complete without error
    expect(v.lineCount).toBeGreaterThan(0);
  });

  it("Gate 6: resolveViewport ANSI-heavy vs plain — ratio", () => {
    let v1 = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 50 });
    let v2 = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 50 });

    for (let i = 0; i < 200; i++) {
      v1.appendLine("a".repeat(80));
      v2.appendLine(ansiHeavyLine(80));
    }

    let start = performance.now();
    for (let i = 0; i < 100; i++) v1.resolveViewport();
    let plain = performance.now() - start;

    start = performance.now();
    for (let i = 0; i < 100; i++) v2.resolveViewport();
    let ansi = performance.now() - start;

    let ratio = plain > 0 ? ansi / plain : 1;
    console.log(`  Gate 6: plain=${plain.toFixed(2)}ms, ANSI=${ansi.toFixed(2)}ms, ratio=${ratio.toFixed(2)}x (target <2x)`);
    expect(ratio).toBeLessThan(10); // soft bound
  });

  it("Gate 7: resize performance — 100K lines", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24, maxLines: 100_000 });
    for (let i = 0; i < 100_000; i++) {
      v.appendLine("a".repeat(40 + (i % 40)));
    }

    let start = performance.now();
    v.resize(40, 24);
    let elapsed = performance.now() - start;
    console.log(`  Gate 7: resize(40, 24) at 100K lines: ${elapsed.toFixed(2)}ms (target <4ms, fail >8ms)`);
    expect(v.columns).toBe(40);
  });
});
