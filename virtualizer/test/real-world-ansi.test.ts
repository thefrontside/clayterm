import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";
import { skipAnsiSequence } from "../ansi-scanner.ts";
import * as fixtures from "./fixtures/real-world-ansi.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

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

function stripAnsi(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    let skip = skipAnsiSequence(text, i);
    if (skip > 0) { i += skip; continue; }
    result += text[i];
    i++;
  }
  return result;
}

function visibleWidth(text: string): number {
  let stripped = stripAnsi(text);
  let w = 0;
  for (let i = 0; i < stripped.length; i++) {
    let cp = stripped.codePointAt(i)!;
    if (cp > 0xffff) { i++; w += 2; }
    else if (cp >= 0x4e00 && cp <= 0x9fff) w += 2;
    else if (cp < 0x20) w += 0;
    else w += 1;
  }
  return w;
}

function assertAllOutputInvariants(
  v: Virtualizer,
  columns: number,
) {
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
    for (let wp of entry.wrapPoints) {
      expect(wp).toBeGreaterThan(0);
      expect(wp).toBeLessThan(entry.text.length);

      // O-4: not in surrogate
      let prev = entry.text.charCodeAt(wp - 1);
      expect(prev >= 0xd800 && prev <= 0xdbff).toBe(false);

      // O-5: not in escape
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

    // O-6: totalSubRows = wrapPoints.length + 1
    expect(entry.totalSubRows).toBe(entry.wrapPoints.length + 1);

    // O-7: subrow bounds
    expect(entry.firstSubRow).toBeGreaterThanOrEqual(0);
    expect(entry.visibleSubRows).toBeGreaterThanOrEqual(0);
    expect(entry.firstSubRow + entry.visibleSubRows).toBeLessThanOrEqual(entry.totalSubRows);

    // O-9: sliced width within columns
    let slices = sliceAtWrapPoints(entry.text, entry.wrapPoints);
    for (let slice of slices) {
      expect(visibleWidth(slice)).toBeLessThanOrEqual(columns);
    }
  }

  // O-8: visible rows within budget
  let totalVisible = vp.entries.reduce((s, e) => s + e.visibleSubRows, 0);
  expect(totalVisible).toBeLessThanOrEqual(v.rows);
}

let allFixtures = Object.entries(fixtures);

describe("Real-world ANSI fixtures", () => {
  for (let [name, text] of allFixtures) {
    it(`${name} at columns 80`, () => {
      let v = new Virtualizer({ measureWidth: charMeasure, columns: 80, rows: 24 });
      v.appendLine(text);
      assertAllOutputInvariants(v, 80);
    });

    it(`${name} at columns 40`, () => {
      let v = new Virtualizer({ measureWidth: charMeasure, columns: 40, rows: 24 });
      v.appendLine(text);
      assertAllOutputInvariants(v, 40);
    });
  }
});
