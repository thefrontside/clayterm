import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

describe("C.ANSI — ANSI handling", () => {
  it("C.ANSI.csi-skipped-in-width — CSI bytes do not contribute to displayWidth", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b[31mhello\x1b[0m");
    expect(v.getLineDisplayWidth(idx)).toBe(5);
  });

  it("C.ANSI.osc-skipped-in-width — OSC payload does not contribute to displayWidth", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b]0;title\x07visible");
    expect(v.getLineDisplayWidth(idx)).toBe(7);
  });

  it("C.ANSI.wrap-point-not-inside-csi — no wrapPoint falls inside a CSI sequence", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 5, rows: 24 });
    // "abcde\x1b[31mfghij" — 5 visible chars, then CSI at string index 5–9, then 5 more visible
    let text = "abcde\x1b[31mfghij";
    v.appendLine(text);
    let vp = v.resolveViewport();
    let entry = vp.entries[0];
    // CSI bytes are at string indices 5–9 — no wrap point should fall inside the CSI
    for (let wp of entry.wrapPoints) {
      expect(wp < 5 || wp >= 10).toBe(true);
    }
  });

  it("C.ANSI.wrap-point-not-inside-osc — no wrapPoint falls inside an OSC sequence", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 5, rows: 24 });
    // 5 visible chars, then OSC, then 5 more visible chars
    let text = "abcde\x1b]0;title\x07fghij";
    v.appendLine(text);
    let vp = v.resolveViewport();
    let entry = vp.entries[0];
    // OSC spans from index 5 to 14 (inclusive of BEL) — no wrap point inside
    for (let wp of entry.wrapPoints) {
      expect(wp < 5 || wp >= 15).toBe(true);
    }
  });

  it("C.ANSI.unrecognized-not-skipped — unrecognized ESC sequences are not skipped", () => {
    let recorded: string[] = [];
    let recordingMeasure = (text: string): number => {
      recorded.push(text);
      return 1;
    };
    let v = new Virtualizer({ measureWidth: recordingMeasure, columns: 80, rows: 24 });
    // SS3 (ESC O) is not CSI/OSC — should not be skipped
    v.appendLine("\x1bOA");
    let joined = recorded.join("");
    expect(joined).toContain("O");
    expect(joined).toContain("A");
  });

  it("C.ANSI.escapes-contribute-zero-width — multiple CSI sequences contribute zero width", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b[31m\x1b[42mhello\x1b[0m");
    expect(v.getLineDisplayWidth(idx)).toBe(5);
  });

  it("R.ANSI.call-discipline — measureWidth never receives ESC or CSI/OSC body bytes", () => {
    let recorded: string[] = [];
    let recordingMeasure = (text: string): number => {
      recorded.push(text);
      return 1;
    };
    let v = new Virtualizer({ measureWidth: recordingMeasure, columns: 40, rows: 24 });
    v.appendLine("\x1b[1m\x1b[31mhello\x1b[0m \x1b]0;title\x07world");
    v.resolveViewport();
    for (let arg of recorded) {
      expect(arg.includes("\x1b")).toBe(false);
    }
  });

  it("C.ANSI.no-style-state-across-lines — prior line SGR does not affect next line", () => {
    let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
    v.appendLine("\x1b[31mred");
    let idx2 = v.appendLine("plain");
    expect(v.getLineDisplayWidth(idx2)).toBe(5);
  });
});
