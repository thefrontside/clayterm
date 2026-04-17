import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function mockMeasureWidth(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    let cp = text.codePointAt(i)!;
    if (cp > 0xffff) { i++; w += 2; }
    else if (cp >= 0x4e00 && cp <= 0x9fff) w += 2;
    else if (cp < 0x20) w += 0;
    else w += 1;
  }
  return w;
}

describe("C.INV1 — monotonic identity", () => {
  it("C.INV1.monotonic-identity — each lineIndex strictly greater than previous", () => {
    let v = new Virtualizer({ measureWidth: mockMeasureWidth, columns: 80, rows: 24 });
    let indices: number[] = [];
    for (let i = 0; i < 10; i++) {
      indices.push(v.appendLine(`line ${i}`));
    }
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it("C.INV1.identity-survives-eviction — surviving lines keep their lineIndex", () => {
    let v = new Virtualizer({ measureWidth: mockMeasureWidth, columns: 80, rows: 24, maxLines: 3 });
    v.appendLine("A"); // 0
    v.appendLine("B"); // 1
    v.appendLine("C"); // 2
    v.appendLine("D"); // 3 — evicts A(0)
    expect(v.baseIndex).toBe(1);
    let vp = v.resolveViewport();
    let lineIndices = vp.entries.map((e) => e.lineIndex);
    expect(lineIndices).toContain(1);
    expect(lineIndices).toContain(2);
    expect(lineIndices).toContain(3);
  });

  it("C.INV1.identity-never-reused — each returned index is unique even with eviction", () => {
    let v = new Virtualizer({ measureWidth: mockMeasureWidth, columns: 80, rows: 24, maxLines: 1 });
    let indices = [
      v.appendLine("A"),
      v.appendLine("B"),
      v.appendLine("C"),
      v.appendLine("D"),
    ];
    expect(indices).toEqual([0, 1, 2, 3]);
    expect(new Set(indices).size).toBe(4);
  });
});
