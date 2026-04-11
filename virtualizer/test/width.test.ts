import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

describe("C.WIDTH — width usage", () => {
  it("C.WIDTH.ansi-stripped-before-measure — measureWidth never sees ANSI bytes", () => {
    let recorded: string[] = [];
    let recordingMeasure = (text: string): number => {
      recorded.push(text);
      return 1;
    };
    let v = new Virtualizer({ measureWidth: recordingMeasure, columns: 80, rows: 24 });
    v.appendLine("\x1b[31mhello\x1b[0m");
    for (let arg of recorded) {
      expect(arg).not.toContain("\x1b");
      expect(arg).not.toContain("[");
      expect(arg).not.toContain("3");
      expect(arg).not.toContain("1");
      expect(arg).not.toContain("m");
    }
    // Only visible chars passed
    let joined = recorded.join("");
    expect(joined).toBe("hello");
  });

  it("C.WIDTH.displayWidth-matches-visible-content — cached width reflects visible chars only", () => {
    let measureWidth = (_text: string): number => 1;
    let v = new Virtualizer({ measureWidth, columns: 80, rows: 24 });
    let idx = v.appendLine("\x1b[31mhello\x1b[0m");
    expect(v.getLineDisplayWidth(idx)).toBe(5);
  });

  it("C.WIDTH.additivity-in-wrapping — each sub-row fits within columns", () => {
    let measureWidth = (text: string): number => {
      let cp = text.codePointAt(0)!;
      return cp >= 0x4e00 && cp <= 0x9fff ? 2 : 1;
    };
    let v = new Virtualizer({ measureWidth, columns: 10, rows: 24 });
    v.appendLine("abcdefghijklmnopqrstuvwxyz");
    let vp = v.resolveViewport();
    let entry = vp.entries[0];
    let slices = sliceAtWrapPoints(entry.text, entry.wrapPoints);
    for (let slice of slices) {
      let w = 0;
      for (let i = 0; i < slice.length; i++) {
        w += measureWidth(slice[i]);
      }
      expect(w).toBeLessThanOrEqual(10);
    }
  });
});

function sliceAtWrapPoints(text: string, wrapPoints: number[]): string[] {
  if (wrapPoints.length === 0) return [text];
  let slices: string[] = [];
  let prev = 0;
  for (let wp of wrapPoints) {
    slices.push(text.slice(prev, wp));
    prev = wp;
  }
  slices.push(text.slice(prev));
  return slices;
}
