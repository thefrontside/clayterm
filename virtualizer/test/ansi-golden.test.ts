import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

describe("G.ANSI — ANSI golden fixtures", () => {
  it("G.ANSI.simple-sgr — SGR sequence does not add sub-rows", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b[31mred\x1b[0m");
    let vp = v.resolveViewport();
    expect(vp.entries[0].totalSubRows).toBe(1);
    expect(v.getLineDisplayWidth(idx)).toBe(3);
  });

  it("G.ANSI.sgr-at-wrap-boundary — wrap occurs at visible char boundary, not inside SGR", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 5, rows: 24 });
    v.appendLine("abcde\x1b[31mfghij");
    let vp = v.resolveViewport();
    let entry = vp.entries[0];
    // Visible: "abcde" (5) then "fghij" (5). CSI "\x1b[31m" at indices 5–9 (5 chars).
    // Wrap after 5 visible chars → wrap point at index 10 (start of 'f', after CSI)
    expect(entry.wrapPoints).toEqual([10]);
    let slices = [entry.text.slice(0, 10), entry.text.slice(10)];
    expect(slices[0]).toBe("abcde\x1b[31m");
    expect(slices[1]).toBe("fghij");
  });

  it("G.ANSI.osc-with-bel — OSC with BEL terminator", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b]0;title\x07visible");
    let vp = v.resolveViewport();
    expect(vp.entries[0].totalSubRows).toBe(1);
    expect(v.getLineDisplayWidth(idx)).toBe(7);
  });

  it("G.ANSI.osc-with-st — OSC with ST terminator", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b]0;title\x1b\\visible");
    let vp = v.resolveViewport();
    expect(vp.entries[0].totalSubRows).toBe(1);
    expect(v.getLineDisplayWidth(idx)).toBe(7);
  });

  it("G.ANSI.nested-csi-in-wrapped-line — multiple CSI in wrapping line, no wrap inside CSI", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 3, rows: 24 });
    // "a\x1b[1mb\x1b[0mc\x1b[32md\x1b[0me" — 5 visible chars: a, b, c, d, e
    v.appendLine("a\x1b[1mb\x1b[0mc\x1b[32md\x1b[0me");
    let vp = v.resolveViewport();
    let entry = vp.entries[0];
    // 5 visible chars at columns 3 → 2 sub-rows
    expect(entry.totalSubRows).toBe(2);
    // No wrap point should fall inside any CSI sequence
    let text = entry.text;
    for (let wp of entry.wrapPoints) {
      expect(text.charCodeAt(wp)).not.toBe(0x5b); // not '['
      // wp should not be between ESC and final byte
      if (wp > 0 && text.charCodeAt(wp - 1) === 0x1b) {
        // wp right after ESC — that's inside the sequence
        expect(true).toBe(false);
      }
    }
  });
});
